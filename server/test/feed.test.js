import assert from 'node:assert';
import { initDatabase } from '../src/db/init.js';
import { lookupCve, syncCisaKev, getRandomInsight, getFeedStats } from '../src/services/threatFeedService.js';

console.log('🧪 Starting ArcX External Feeds & Synthesis test suite...\n');

initDatabase(':memory:');

async function runTests() {
  console.log('Test 1: Curated CVE lookup (CVE-2024-3094)');
  const curated = await lookupCve('CVE-2024-3094');
  assert(curated, 'Curated threat must be found');
  assert.strictEqual(curated.cve, 'CVE-2024-3094');
  assert(curated.cvss === 10.0, 'CVSS score must be 10.0');
  assert(curated.remediation.length > 10, 'Remediation must be populated');
  console.log('  ✓ Curated threat retrieved with complete intelligence\n');

  console.log('Test 2: CISA KEV catalog sync & exploit verification');
  const count = await syncCisaKev();
  assert(count > 0, 'CISA KEV count must be greater than 0');
  console.log(`  ✓ Synced ${count} actively exploited zero-days from CISA KEV catalog\n`);

  console.log('Test 3: Live external fetch for non-curated CVE (CVE-2024-38063)');
  const t0 = Date.now();
  const external = await lookupCve('CVE-2024-38063');
  const duration1 = Date.now() - t0;
  assert(external, 'External CVE must be resolved from live feed');
  assert.strictEqual(external.cve, 'CVE-2024-38063');
  assert(external.cvss >= 7.0, 'CVSS must be high/critical');
  assert(external.source.includes('NVD') || external.source.includes('OSV'), 'Source must indicate external feed');
  console.log(`  ✓ Live external lookup succeeded in ${duration1}ms (Severity: ${external.severity}, CVSS: ${external.cvss})\n`);

  console.log('Test 4: SQLite cache hit for previously fetched CVE');
  const t2 = Date.now();
  const cached = await lookupCve('CVE-2024-38063');
  const duration2 = Date.now() - t2;
  assert.strictEqual(cached.cve, external.cve);
  assert(duration2 < 50, `Cached response must be fast (got ${duration2}ms)`);
  console.log(`  ✓ Cached response served in ${duration2}ms from SQLite cve_cache\n`);

  console.log('Test 5: Dynamic random insight generation');
  const insight = await getRandomInsight();
  assert(insight && insight.cve, 'Insight must contain a valid CVE');
  assert(insight.remediation, 'Insight must contain remediation guidance');
  console.log(`  ✓ Generated dynamic threat dossier for ${insight.cve} (${insight.title})\n`);

  console.log('Test 6: Feed telemetry stats');
  const stats = getFeedStats();
  assert(stats.cisaKevCount > 0, 'CISA KEV count must be > 0');
  assert(stats.cachedExternalCvesCount > 0, 'Cached CVE count must be > 0');
  assert(stats.supportedSources.length >= 3, 'Must list supported sources');
  console.log('  ✓ Feed telemetry verified:', stats);

  console.log('\n🎉 ALL EXTERNAL FEED TEST SUITES PASSED CLEANLY!\n');
}

runTests().catch((err) => {
  console.error('❌ Feed test failed:', err);
  process.exit(1);
});
