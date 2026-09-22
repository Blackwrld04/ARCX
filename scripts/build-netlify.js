import fs from 'node:fs';
import path from 'node:path';

const distDir = path.resolve('dist');
const publicDir = path.resolve('server/public');
const dashboardDir = path.resolve('server/dashboard');

// Ensure dist directory exists
fs.mkdirSync(distDir, { recursive: true });
fs.mkdirSync(path.join(distDir, 'dashboard'), { recursive: true });

// Copy public assets to dist
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyDir(publicDir, distDir);
copyDir(dashboardDir, path.join(distDir, 'dashboard'));

// Determine backend URL for Netlify proxy rewrite
const backendUrl = (process.env.BACKEND_URL || process.env.API_URL || 'https://arcx.onrender.com').replace(/\/$/, '');

// Generate Netlify _redirects file
const redirectsContent = `# Route rewrites for Netlify Edge CDN
/dashboard    /dashboard/index.html   200
/dashboard/*  /dashboard/:splat       200
/stats        /stats/index.html       200
/stats/*      /stats/:splat           200

# API and health proxy to Render backend service
/api/*        ${backendUrl}/api/:splat    200!
/health       ${backendUrl}/health        200!
`;

fs.writeFileSync(path.join(distDir, '_redirects'), redirectsContent);
console.log(`[build:netlify] Build complete. Proxy configured for backend: ${backendUrl}`);
