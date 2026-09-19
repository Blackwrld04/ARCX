import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getDb } from '../db/init.js';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load local baseline curated threats
let curatedThreats = [];
try {
  curatedThreats = JSON.parse(readFileSync(join(__dirname, '../data/threats.json'), 'utf-8'));
} catch (err) {
  logger.warn('Failed to load local threats.json, using empty array');
}

const curatedIndex = new Map();
for (const entry of curatedThreats) {
  if (entry.cve) {
    curatedIndex.set(entry.cve.toUpperCase(), entry);
  }
}

// In-memory cache of CISA KEV CVE IDs for O(1) checks
const cisaKevSet = new Set();
let lastCisaSync = null;

/**
 * Categorize a vulnerability based on CWE ID and text descriptions.
 */
function deduceCategory(cwe, text = '') {
  const t = (text + ' ' + (cwe || '')).toLowerCase();
  if (t.includes('remote code') || t.includes('rce') || t.includes('execute arbitrary code') || cwe === 'CWE-94') {
    return 'rce';
  }
  if (t.includes('sql injection') || t.includes('sqli') || cwe === 'CWE-89') {
    return 'sqli';
  }
  if (t.includes('supply chain') || t.includes('backdoor') || t.includes('trojan') || cwe === 'CWE-506') {
    return 'supply-chain';
  }
  if (t.includes('buffer overflow') || t.includes('memory corruption') || cwe === 'CWE-119' || cwe === 'CWE-120' || cwe === 'CWE-787') {
    return 'buffer-overflow';
  }
  if (t.includes('session') || t.includes('authentication') || t.includes('privilege escalation') || cwe === 'CWE-287' || cwe === 'CWE-269') {
    return 'access-control';
  }
  if (t.includes('information disclosure') || t.includes('sensitive data') || cwe === 'CWE-200') {
    return 'info-disclosure';
  }
  if (t.includes('denial of service') || t.includes('dos') || cwe === 'CWE-400') {
    return 'dos';
  }
  if (t.includes('cross-site scripting') || t.includes('xss') || cwe === 'CWE-79') {
    return 'xss';
  }
  return 'general-vulnerability';
}

/**
 * Deduce MITRE ATT&CK techniques based on category.
 */
function deduceMitreAttack(category) {
  switch (category) {
    case 'rce':
      return ['T1190', 'T1059'];
    case 'sqli':
      return ['T1190', 'T1041'];
    case 'supply-chain':
      return ['T1195.002', 'T1059'];
    case 'buffer-overflow':
      return ['T1190', 'T1068'];
    case 'access-control':
      return ['T1078', 'T1548'];
    case 'info-disclosure':
      return ['T1005', 'T1552'];
    case 'dos':
      return ['T1499', 'T1498'];
    default:
      return ['T1190'];
  }
}

/**
 * Synthesize concrete actionable remediation steps based on CVE details.
 */
function synthesizeRemediation(cveId, category, isKev, kevAction, text = '') {
  const parts = [];
  if (isKev && kevAction) {
    parts.push(`CISA MANDATE: ${kevAction}.`);
  }
  
  if (category === 'rce') {
    parts.push(`Apply the official vendor security patch for ${cveId} immediately. Restrict public network ingress to affected ports and deploy Web Application Firewall (WAF) virtual patching rules.`);
  } else if (category === 'sqli') {
    parts.push(`Update software to patched version. Implement parameterized queries and disable unnecessary database administrative procedures.`);
  } else if (category === 'supply-chain') {
    parts.push(`Audit build pipelines and dependencies against known malicious checksums. Pin dependencies to verified upstream hashes.`);
  } else if (category === 'buffer-overflow') {
    parts.push(`Upgrade affected binary or firmware to latest release. Enable ASLR, DEP/NX, and stack canary protections if running compiled components.`);
  } else if (category === 'access-control') {
    parts.push(`Enforce strict multi-factor authentication (MFA). Invalidate existing active session tokens and audit administrator account creations.`);
  } else {
    parts.push(`Update affected software to latest version. Restrict network access to trusted hosts and monitor telemetry for suspicious activity.`);
  }

  return parts.join(' ');
}

/**
 * Fetch and sync the CISA KEV (Known Exploited Vulnerabilities) catalog.
 */
export async function syncCisaKev() {
  const db = getDb();
  logger.info('Syncing CISA KEV catalog...');
  try {
    const res = await fetch(config.cisaKevUrl, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'ArcX-Security-Intel/1.0' }
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from CISA KEV feed`);
    }

    const data = await res.json();
    const vulnerabilities = data.vulnerabilities || [];

    const upsertStmt = db.prepare(`
      INSERT INTO cisa_kev (cve_id, vendor_project, product, vulnerability_name, date_added, short_description, required_action, due_date, notes, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(cve_id) DO UPDATE SET
        vendor_project = excluded.vendor_project,
        product = excluded.product,
        vulnerability_name = excluded.vulnerability_name,
        short_description = excluded.short_description,
        required_action = excluded.required_action,
        due_date = excluded.due_date,
        notes = excluded.notes,
        synced_at = datetime('now')
    `);

    const syncTransaction = db.transaction((vulns) => {
      for (const v of vulns) {
        if (!v.cveID) continue;
        const cveId = v.cveID.toUpperCase().trim();
        cisaKevSet.add(cveId);
        upsertStmt.run(
          cveId,
          v.vendorProject || null,
          v.product || null,
          v.vulnerabilityName || null,
          v.dateAdded || null,
          v.shortDescription || null,
          v.requiredAction || null,
          v.dueDate || null,
          v.notes || null
        );
      }
    });

    syncTransaction(vulnerabilities);
    lastCisaSync = new Date().toISOString();
    logger.info({ count: vulnerabilities.length }, 'CISA KEV catalog sync complete');
    return vulnerabilities.length;
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to sync CISA KEV catalog');
    // Load existing CISA KEV IDs from database into memory
    try {
      const rows = db.prepare('SELECT cve_id FROM cisa_kev').all();
      for (const row of rows) {
        cisaKevSet.add(row.cve_id);
      }
      logger.info({ count: cisaKevSet.size }, 'Loaded CISA KEV IDs from local database cache');
    } catch (dbErr) {
      logger.error({ err: dbErr.message }, 'Failed to load CISA KEV from DB');
    }
    return cisaKevSet.size;
  }
}

/**
 * Fetch external vulnerability details from NIST NVD 2.0 API.
 */
async function fetchFromNvd(cveId) {
  const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=${encodeURIComponent(cveId)}`;
  const headers = {
    'User-Agent': 'ArcX-Security-Research/1.0 (https://arc.io)'
  };
  if (config.nvdApiKey) {
    headers['apiKey'] = config.nvdApiKey;
  }

  const res = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers
  });

  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`NVD API returned HTTP ${res.status}`);
  }

  const data = await res.json();
  const cveItem = data.vulnerabilities?.[0]?.cve;
  if (!cveItem) return null;

  // Extract English description
  const enDesc = cveItem.descriptions?.find(d => d.lang === 'en')?.value || 'No description available.';

  // Extract CVSS metrics
  let cvssScore = 7.5;
  let severity = 'high';

  const cvss31 = cveItem.metrics?.cvssMetricV31?.[0]?.cvssData;
  const cvss30 = cveItem.metrics?.cvssMetricV30?.[0]?.cvssData;
  const cvss2 = cveItem.metrics?.cvssMetricV2?.[0]?.cvssData;

  if (cvss31) {
    cvssScore = cvss31.baseScore || 7.5;
    severity = (cvss31.baseSeverity || 'high').toLowerCase();
  } else if (cvss30) {
    cvssScore = cvss30.baseScore || 7.5;
    severity = (cvss30.baseSeverity || 'high').toLowerCase();
  } else if (cvss2) {
    cvssScore = cvss2.baseScore || 7.0;
    severity = cvssScore >= 9.0 ? 'critical' : cvssScore >= 7.0 ? 'high' : cvssScore >= 4.0 ? 'medium' : 'low';
  }

  // Extract CWE
  const cwe = cveItem.weaknesses?.[0]?.description?.[0]?.value || '';
  const category = deduceCategory(cwe, enDesc);
  const mitreAttack = deduceMitreAttack(category);

  // Extract vendor/product or title
  const sourceId = cveItem.sourceIdentifier || 'NIST NVD';
  const title = `${cveId} — ${category.replace('-', ' ').toUpperCase()} (${sourceId})`;

  return {
    cve: cveId,
    title,
    category,
    severity,
    cvss: cvssScore,
    mitre_attack: mitreAttack,
    description: enDesc,
    cwe,
    source: 'NIST NVD 2.0 API'
  };
}

/**
 * Fallback to OSV.dev (Google Open Source Vulnerabilities)
 */
async function fetchFromOsv(cveId) {
  const url = `https://api.osv.dev/v1/vulns/${encodeURIComponent(cveId)}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(5000),
    headers: { 'User-Agent': 'ArcX-Security-Research/1.0' }
  });

  if (!res.ok) return null;
  const data = await res.json();
  if (!data || !data.id) return null;

  const desc = data.details || data.summary || 'Open source vulnerability advisory.';
  const category = deduceCategory('', desc);
  const mitreAttack = deduceMitreAttack(category);

  return {
    cve: cveId,
    title: data.summary ? `${cveId} — ${data.summary}` : `${cveId} — Open Source Security Advisory`,
    category,
    severity: 'high',
    cvss: 8.0,
    mitre_attack: mitreAttack,
    description: desc,
    source: 'OSV.dev (Open Source Vulnerabilities)'
  };
}

/**
 * Check and retrieve from SQLite cve_cache table.
 */
function getFromCache(cveId) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM cve_cache WHERE cve_id = ?').get(cveId);
  if (!row) return null;

  return {
    id: `EXT-${row.cve_id}`,
    cve: row.cve_id,
    title: row.title,
    category: row.category,
    severity: row.severity,
    cvss: row.cvss,
    mitre_attack: JSON.parse(row.mitre_attack || '[]'),
    description: row.description,
    remediation: row.remediation,
    ioc_indicators: JSON.parse(row.ioc_indicators || '[]'),
    is_actively_exploited: Boolean(row.is_actively_exploited),
    source: row.source
  };
}

/**
 * Save synthesized entry into SQLite cve_cache table.
 */
function saveToCache(entry) {
  const db = getDb();
  try {
    db.prepare(`
      INSERT INTO cve_cache (
        cve_id, title, category, severity, cvss, description, remediation, mitre_attack, ioc_indicators, source, is_actively_exploited, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(cve_id) DO UPDATE SET
        title = excluded.title,
        category = excluded.category,
        severity = excluded.severity,
        cvss = excluded.cvss,
        description = excluded.description,
        remediation = excluded.remediation,
        mitre_attack = excluded.mitre_attack,
        ioc_indicators = excluded.ioc_indicators,
        source = excluded.source,
        is_actively_exploited = excluded.is_actively_exploited,
        updated_at = datetime('now')
    `).run(
      entry.cve,
      entry.title,
      entry.category,
      entry.severity,
      entry.cvss,
      entry.description,
      entry.remediation,
      JSON.stringify(entry.mitre_attack || []),
      JSON.stringify(entry.ioc_indicators || []),
      entry.source,
      entry.is_actively_exploited ? 1 : 0
    );
  } catch (err) {
    logger.error({ err: err.message, cve: entry.cve }, 'Failed to save to cve_cache');
  }
}

/**
 * Primary lookup function:
 * 1. Curated baseline (threats.json)
 * 2. SQLite local cache
 * 3. Live external feeds (NVD 2.0 -> OSV.dev)
 */
export async function lookupCve(cveId) {
  const id = cveId.toUpperCase().trim();

  // Check CISA KEV state
  const db = getDb();
  let kevRecord = null;
  try {
    kevRecord = db.prepare('SELECT * FROM cisa_kev WHERE cve_id = ?').get(id);
  } catch (e) {}
  const isKev = Boolean(kevRecord || cisaKevSet.has(id));

  // Tier 1: Local curated threats.json
  const curated = curatedIndex.get(id);
  if (curated) {
    return {
      ...curated,
      is_actively_exploited: isKev,
      cisa_kev: kevRecord ? {
        vendorProject: kevRecord.vendor_project,
        product: kevRecord.product,
        dateAdded: kevRecord.date_added,
        requiredAction: kevRecord.required_action,
        dueDate: kevRecord.due_date
      } : null
    };
  }

  // Tier 2: Local SQLite cache
  const cached = getFromCache(id);
  if (cached) {
    if (isKev && !cached.is_actively_exploited) {
      cached.is_actively_exploited = true;
    }
    return cached;
  }

  // Tier 3: Fetch from Live External Feeds
  let external = null;
  try {
    external = await fetchFromNvd(id);
  } catch (err) {
    logger.warn({ cve: id, err: err.message }, 'NVD API fetch failed, trying OSV fallback');
  }

  if (!external) {
    try {
      external = await fetchFromOsv(id);
    } catch (err) {
      logger.warn({ cve: id, err: err.message }, 'OSV.dev fetch failed');
    }
  }

  if (!external) {
    // If not found in NVD or OSV, check if it's listed in CISA KEV
    if (kevRecord) {
      external = {
        cve: id,
        title: `${id} — ${kevRecord.vulnerability_name || 'Exploited Zero-Day Vulnerability'}`,
        category: deduceCategory('', kevRecord.short_description),
        severity: 'critical',
        cvss: 9.8,
        mitre_attack: ['T1190', 'T1059'],
        description: kevRecord.short_description || 'Active zero-day vulnerability exploited in the wild.',
        source: 'CISA Known Exploited Vulnerabilities Catalog'
      };
    } else {
      return null;
    }
  }

  // Synthesize remediation and IoCs
  const remediation = synthesizeRemediation(
    id,
    external.category,
    isKev,
    kevRecord?.required_action,
    external.description
  );

  const iocIndicators = [
    `Network traffic anomaly monitoring for ${id}`,
    `System logs matching ${external.category} signatures`
  ];
  if (isKev) {
    iocIndicators.unshift('Confirmed active in-the-wild exploitation by advanced threat actors');
  }

  const enrichedDossier = {
    id: `EXT-${id}`,
    cve: id,
    title: external.title,
    category: external.category,
    severity: external.severity,
    cvss: external.cvss,
    mitre_attack: external.mitre_attack,
    description: external.description,
    remediation,
    ioc_indicators: iocIndicators,
    is_actively_exploited: isKev,
    cisa_kev: kevRecord ? {
      vendorProject: kevRecord.vendor_project,
      product: kevRecord.product,
      dateAdded: kevRecord.date_added,
      requiredAction: kevRecord.required_action,
      dueDate: kevRecord.due_date
    } : null,
    source: `${external.source} + ArcX Synthesis`
  };

  // Cache in SQLite
  saveToCache(enrichedDossier);

  return enrichedDossier;
}

/**
 * Return random threat intelligence entry (curated or CISA KEV zero-day).
 */
export async function getRandomInsight() {
  const db = getDb();
  // 50% chance to return a curated entry, 50% chance to return an actively exploited CISA KEV entry
  const useCurated = Math.random() < 0.5 || cisaKevSet.size === 0;

  if (useCurated && curatedThreats.length > 0) {
    const entry = curatedThreats[Math.floor(Math.random() * curatedThreats.length)];
    const isKev = entry.cve ? cisaKevSet.has(entry.cve.toUpperCase()) : false;
    return {
      ...entry,
      is_actively_exploited: isKev
    };
  }

  // Sample a random CISA KEV entry
  try {
    const row = db.prepare('SELECT * FROM cisa_kev ORDER BY RANDOM() LIMIT 1').get();
    if (row && row.cve_id) {
      const result = await lookupCve(row.cve_id);
      if (result && result.cve) {
        return result;
      }
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to sample random CISA KEV entry');
  }

  // Fallback to curated baseline
  const fallback = curatedThreats.find(t => t.cve) || curatedThreats[0];
  return {
    ...fallback,
    is_actively_exploited: fallback?.cve ? cisaKevSet.has(fallback.cve.toUpperCase()) : false
  };
}

/**
 * Get feed statistics for /api/v1/stats.
 */
export function getFeedStats() {
  const db = getDb();
  let cachedCount = 0;
  let cisaKevCount = 0;

  try {
    const r1 = db.prepare('SELECT COUNT(*) AS count FROM cve_cache').get();
    cachedCount = r1 ? r1.count : 0;
    const r2 = db.prepare('SELECT COUNT(*) AS count FROM cisa_kev').get();
    cisaKevCount = r2 ? r2.count : 0;
  } catch (err) {}

  return {
    curatedThreatsCount: curatedThreats.length,
    cachedExternalCvesCount: cachedCount,
    cisaKevCount: cisaKevCount || cisaKevSet.size,
    lastCisaSync,
    supportedSources: [
      'NIST NVD 2.0 Live API',
      'CISA Known Exploited Vulnerabilities Catalog',
      'OSV.dev Open Source Vulnerabilities',
      'ArcX Curated Threat Intelligence Baseline'
    ]
  };
}

/**
 * Initialize threat feeds service on server startup.
 */
export function initThreatFeedService() {
  // Sync CISA KEV catalog on startup in background
  syncCisaKev().catch((err) => {
    logger.warn({ err: err.message }, 'Initial CISA KEV sync failed');
  });

  // Schedule periodic CISA KEV refresh
  const refreshIntervalMs = (config.cisaKevRefreshHours || 12) * 60 * 60 * 1000;
  setInterval(() => {
    syncCisaKev().catch((err) => {
      logger.warn({ err: err.message }, 'Periodic CISA KEV sync failed');
    });
  }, refreshIntervalMs);
}
