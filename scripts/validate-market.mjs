#!/usr/bin/env node
/*
 * Market data validator.
 *
 *   node scripts/validate-market.mjs src/markets/data/charlotte.json
 *   npm run validate-market -- src/markets/data/charlotte.json
 *
 * Checks a market JSON against austin.json's shape PLUS the "silent failure"
 * invariants that otherwise render fine but show wrong/empty data:
 *   - every required top-level key present, with the right container type
 *   - submarket names line up across SUBS / SUB_TS / SUB_NARRATIVES / PROPS.sb /
 *     ZIPS.sb / URBAN_SUBS
 *   - SUB_TS series arrays are the same length as SUB_TS.q
 *   - unit conventions: cap is a DECIMAL (0.0568), vac/erg are PERCENT (5.68),
 *     Q_OCC is a decimal
 *   - _market.asOfQuarter actually exists in SUB_TS.q (else reconciliation skips)
 *
 * Exit code 1 if any ERRORS; warnings do not fail the build.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REF_PATH = path.join(__dirname, '..', 'src', 'markets', 'data', 'austin.json');

const target = process.argv[2];
if (!target) {
  console.error('Usage: node scripts/validate-market.mjs <path-to-market.json>');
  process.exit(2);
}

const errors = [];
const warns = [];
const E = (m) => errors.push(m);
const W = (m) => warns.push(m);

function load(p, label) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.error(`Could not read/parse ${label} (${p}): ${e.message}`);
    process.exit(2);
  }
}

const ref = load(REF_PATH, 'reference austin.json');
const d = load(path.resolve(target), 'market file');

const containerType = (v) => (Array.isArray(v) ? 'array' : v && typeof v === 'object' ? 'object' : typeof v);

// 1) Top-level keys present + same container type as the reference.
for (const k of Object.keys(ref)) {
  if (!(k in d)) { E(`Missing required top-level key: "${k}"`); continue; }
  const rt = containerType(ref[k]);
  const dt = containerType(d[k]);
  if (rt !== dt) E(`Key "${k}" should be ${rt} but is ${dt}`);
}
for (const k of Object.keys(d)) {
  if (!(k in ref)) W(`Extra top-level key not in reference: "${k}" (ignored by the app)`);
}

// 2) _market block.
const m = d._market || {};
for (const f of ['asOfQuarter', 'todayQuarter', 'todayLabel', 'propTaxRate']) {
  if (m[f] == null) W(`_market.${f} missing — will fall back to the Austin default`);
}

// Helpers
const arr = (k) => (Array.isArray(d[k]) ? d[k] : []);
const subList = arr('SUBS').map((s) => s && s.s).filter(Boolean);
const subSet = new Set(subList);
const empty = subList.length === 0;

if (empty) {
  W('SUBS is empty — treating this as a blank/scaffold market; skipping cross-reference checks.');
} else {
  // 3) Unique submarket names.
  if (subSet.size !== subList.length) E('SUBS has duplicate "s" (submarket name) values — names must be unique.');

  // 4) SUB_TS alignment.
  const ts = d.SUB_TS || {};
  const q = Array.isArray(ts.q) ? ts.q : null;
  if (!q) E('SUB_TS.q is missing or not an array.');
  if (q) {
    if (Array.isArray(ts.fc) && ts.fc.length !== q.length) E(`SUB_TS.fc length ${ts.fc.length} != q length ${q.length}`);
    const dser = ts.d || {};
    const tsKeys = Object.keys(dser);
    for (const s of subSet) if (!tsKeys.includes(s)) E(`SUB_TS.d is missing submarket "${s}" (rows will be blank).`);
    for (const k of tsKeys) if (!subSet.has(k)) W(`SUB_TS.d has "${k}" which is not a SUBS submarket.`);
    for (const [k, series] of Object.entries(dser)) {
      for (const f of ['r', 'v', 'uc', 'a', 'd']) {
        if (series && Array.isArray(series[f]) && series[f].length !== q.length) {
          E(`SUB_TS.d["${k}"].${f} length ${series[f].length} != q length ${q.length}`);
        }
      }
    }
    // 5) Reconciliation anchor must exist in q.
    if (m.asOfQuarter && !q.includes(m.asOfQuarter)) {
      E(`_market.asOfQuarter "${m.asOfQuarter}" is not in SUB_TS.q — source-of-truth reconciliation will be skipped.`);
    }
  }

  // 6) Name matching across the other structures.
  const checkSubset = (vals, where) => {
    for (const v of new Set(vals)) if (v && !subSet.has(v)) W(`${where}: "${v}" is not a known submarket.`);
  };
  checkSubset(arr('PROPS').map((p) => p && p.sb), 'PROPS[].sb');
  checkSubset(arr('ZIPS').map((z) => z && z.sb), 'ZIPS[].sb');
  checkSubset(arr('URBAN_SUBS'), 'URBAN_SUBS');
  for (const s of subSet) {
    if (d.SUB_NARRATIVES && !(s in d.SUB_NARRATIVES)) W(`SUB_NARRATIVES has no entry for "${s}".`);
  }

  // 7) Unit-convention sanity.
  const caps = arr('SUBS').map((s) => s && s.cap).filter((x) => typeof x === 'number');
  if (caps.some((c) => c > 1)) E('SUBS[].cap has values > 1 — cap rate must be a DECIMAL (e.g. 0.0568, not 5.68).');
  const vacs = arr('SUBS').map((s) => s && s.vac).filter((x) => typeof x === 'number');
  if (vacs.length && vacs.every((v) => v <= 1)) W('SUBS[].vac all <= 1 — vacancy should be PERCENT (e.g. 5.68), did you forget ×100?');
  const occ = arr('Q_OCC').map((x) => x && x.v).filter((x) => typeof x === 'number');
  if (occ.some((o) => o > 1.5)) W('Q_OCC.v has values > 1.5 — occupancy should be a DECIMAL (0.94, not 94).');

  // 8) MS coverage for zips.
  const ms = d.MS || {};
  for (const z of arr('ZIPS')) {
    if (z && z.z != null && !(String(z.z) in ms)) W(`MS has no entry for zip ${z.z} — zip factor scores will be blank.`);
  }
}

// Report
const file = path.basename(target);
console.log(`\nValidating ${file} against austin.json shape\n${'='.repeat(48)}`);
if (errors.length) {
  console.log(`\n❌ ${errors.length} ERROR(S):`);
  errors.forEach((e) => console.log('  - ' + e));
}
if (warns.length) {
  console.log(`\n⚠️  ${warns.length} WARNING(S):`);
  warns.forEach((w) => console.log('  - ' + w));
}
if (!errors.length && !warns.length) console.log('\n✅ Clean — no issues found.');
else if (!errors.length) console.log('\n✅ No blocking errors (warnings above are advisory).');

console.log('');
process.exit(errors.length ? 1 : 0);
