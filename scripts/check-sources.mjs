#!/usr/bin/env node
/*
 * New-market source-file scanner.
 *
 *   npm run check-sources -- "C:\\path\\to\\Charlotte_Source_Data"
 *   node scripts/check-sources.mjs ./Charlotte_Source_Data
 *
 * Scans a folder (recursively) and reports which required source documents are
 * present vs missing for building a new market, matching on filename keywords
 * (so market-specific names like "..._CLT.xlsx" are recognized). Exits 1 if any
 * BLOCKER is missing.
 */
import fs from 'fs';
import path from 'path';

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: node scripts/check-sources.mjs <path-to-source-data-folder>');
  process.exit(2);
}
if (!fs.existsSync(dir)) {
  console.error(`Folder not found: ${dir}`);
  process.exit(2);
}

// Recursively collect file names (lowercased).
function walk(d, acc = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, acc);
    else acc.push(e.name.toLowerCase());
  }
  return acc;
}
const files = walk(dir);

// match = true if ANY alias matches; an alias matches if ALL its tokens appear.
const has = (aliases) =>
  files.some((f) => aliases.some((tokens) => tokens.every((t) => f.includes(t))));

const SEV = { blocker: '🔴 Blocker', degrade: '🟠 Degrades', narr: '🟣 Narrative', opt: '⚪ Optional' };

const ITEMS = [
  { sev: 'blocker', label: 'CoStar property-level export', feeds: 'PROPS (+ submarket crosswalk)',
    aliases: [['property', 'level'], ['property_level'], ['property', 'dump']] },
  { sev: 'blocker', label: 'CoStar market & submarket workbook (3 sheets)', feeds: 'SUBS, Q_* metro, SUB_TS',
    aliases: [['market', 'submarket'], ['submarket', 'data'], ['source', 'truth']] },
  { sev: 'blocker', label: 'Zip-code data dump (CSV)', feeds: 'ZIPS + MS',
    aliases: [['zip', 'code'], ['zip_code'], ['zipcode']] },
  { sev: 'degrade', label: 'CoStar sales since 1/2020', feeds: 'SALES / Capital Markets tab',
    aliases: [['sales']] },
  { sev: 'degrade', label: 'Major employers', feeds: 'EMPLOYERS panel',
    aliases: [['employer'], ['employ']] },
  { sev: 'degrade', label: 'Monthly property time series (2022+)', feeds: 'lease-up velocity',
    aliases: [['monthly'], ['timeseries'], ['time', 'series']] },
  { sev: 'degrade', label: 'Submarket boundary geometry (map)', feeds: 'GEO / MAP_VIEW (map tab)',
    aliases: [['kml'], ['shapefile'], ['shp'], ['geojson'], ['boundar']] },
  { sev: 'narr', label: 'Consolidated PDF extracts workbook', feeds: 'RP/AT/NM/CS_CAP/GS narrative',
    aliases: [['pdf', 'extract'], ['extracts']] },
  { sev: 'narr', label: 'Newmark "Why <Market>"', feeds: 'NM commentary',
    aliases: [['newmark'], ['why_']] },
  { sev: 'narr', label: 'RealPage market report', feeds: 'RP commentary',
    aliases: [['realpage']] },
  { sev: 'narr', label: 'Green Street snapshot', feeds: 'GS commentary',
    aliases: [['greenstreet'], ['green', 'street']] },
  { sev: 'narr', label: 'Apartment Trends / Investor Interests', feeds: 'AT commentary',
    aliases: [['apartmenttrends'], ['trends', 'report'], ['trend']] },
];

console.log(`\nScanning: ${dir}`);
console.log(`Found ${files.length} files.\n${'='.repeat(60)}`);

const missingByCat = { blocker: [], degrade: [], narr: [] };
const order = ['blocker', 'degrade', 'narr'];
for (const sev of order) {
  console.log(`\n${SEV[sev]}`);
  for (const it of ITEMS.filter((i) => i.sev === sev)) {
    const ok = has(it.aliases);
    if (!ok) missingByCat[sev].push(it);
    console.log(`  ${ok ? '✅' : '❌'} ${it.label}  ·  → ${it.feeds}`);
  }
}

console.log(`\n${'='.repeat(60)}`);
const b = missingByCat.blocker.length, d = missingByCat.degrade.length, n = missingByCat.narr.length;
if (b) {
  console.log(`\n⛔ CANNOT BUILD YET — missing ${b} blocker(s):`);
  missingByCat.blocker.forEach((i) => console.log(`   - ${i.label}`));
}
if (d) {
  console.log(`\n⚠️  ${d} item(s) missing that will leave a tab/panel empty:`);
  missingByCat.degrade.forEach((i) => console.log(`   - ${i.label} (${i.feeds})`));
}
if (n) {
  console.log(`\nℹ️  ${n} narrative source(s) missing — commentary will be generic:`);
  missingByCat.narr.forEach((i) => console.log(`   - ${i.label}`));
}
if (!b && !d && !n) console.log('\n✅ All required and recommended sources are present. Ready to build.');
else if (!b) console.log('\n✅ All blockers present — you can build the core dashboard.');

console.log('');
process.exit(b ? 1 : 0);
