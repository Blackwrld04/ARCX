import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const rootDistDir = path.resolve(projectRoot, 'dist');
const clientDistDir = path.resolve(projectRoot, 'client', 'dist');
const publicDir = path.resolve(projectRoot, 'server', 'public');
const dashboardDir = path.resolve(projectRoot, 'server', 'dashboard');

// Copy directory recursively
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

const backendUrl = (process.env.BACKEND_URL || process.env.API_URL || 'https://arcx-v2fs.onrender.com').replace(/\/$/, '');

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

// Populate both root dist and client dist to guarantee Netlify succeeds regardless of Base directory setting
for (const targetDist of [rootDistDir, clientDistDir]) {
  fs.mkdirSync(targetDist, { recursive: true });
  fs.mkdirSync(path.join(targetDist, 'dashboard'), { recursive: true });
  copyDir(publicDir, targetDist);
  copyDir(dashboardDir, path.join(targetDist, 'dashboard'));
  fs.writeFileSync(path.join(targetDist, '_redirects'), redirectsContent);
}

console.log(`[build:netlify] Build complete. Proxy configured for backend: ${backendUrl}`);

