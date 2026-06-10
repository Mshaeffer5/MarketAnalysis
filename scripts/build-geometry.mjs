#!/usr/bin/env node
/*
 * Map-geometry generator: Census county boundaries -> COAST / COUNTY_LINES /
 * MAP_VIEW / MAP_LABELS (the formerly hand-built part of a market's map data).
 *
 * Online (fetches from Census TIGERweb, nothing to download):
 *   npm run build-geometry -- --counties "Mecklenburg NC, Union NC, York SC" --out clt-geom.json
 * Offline (saved Esri-JSON or GeoJSON county files):
 *   npm run build-geometry -- --in <dir-or-file> --out clt-geom.json
 * Options:
 *   --labels "CHARLOTTE@35.227,-80.843; CONCORD@35.409,-80.581"  (MAP_LABELS, k:"city")
 *   --width 500             viewBox width; height derived from lat/lng aspect
 *   --merge <market.json>   write the four keys directly into the market file
 *   --eps 0.015             border-match tolerance, degrees
 *
 * Method: every county-ring segment whose midpoint lies within EPS of another
 * county's boundary is INTERIOR (-> COUNTY_LINES, attributed to the pair);
 * the rest are OUTER (-> stitched into the closed COAST outline). Douglas-
 * Peucker simplification after stitching. No GIS dependencies.
 */
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const opt = (name, dflt = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] != null ? args[i + 1] : dflt;
};
const IN = opt('in');
const COUNTIES = opt('counties');
const OUT = opt('out');
const LABELS = opt('labels', '');
const WIDTH = Number(opt('width', 500));
const MERGE = opt('merge');
const EPS = Number(opt('eps', 0.015));

if (!IN && !COUNTIES) { console.error('Need --counties or --in'); process.exit(2); }

const STATE_FIPS = { AL:'01',AK:'02',AZ:'04',AR:'05',CA:'06',CO:'08',CT:'09',DE:'10',DC:'11',FL:'12',GA:'13',HI:'15',ID:'16',IL:'17',IN:'18',IA:'19',KS:'20',KY:'21',LA:'22',ME:'23',MD:'24',MA:'25',MI:'26',MN:'27',MS:'28',MO:'29',MT:'30',NE:'31',NV:'32',NH:'33',NJ:'34',NM:'35',NY:'36',NC:'37',ND:'38',OH:'39',OK:'40',OR:'41',PA:'42',RI:'44',SC:'45',SD:'46',TN:'47',TX:'48',UT:'49',VT:'50',VA:'51',WA:'53',WV:'54',WI:'55',WY:'56' };
const TIGERWEB = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1/query';

function featuresFrom(json) {
  const feats = json.features || [];
  return feats.map((f) => {
    const name = (f.attributes?.NAME || f.attributes?.BASENAME || f.properties?.NAME || f.properties?.BASENAME || 'County').replace(/ County$/i, '');
    let rings;
    if (f.geometry?.rings) rings = f.geometry.rings;
    else if (f.geometry?.type === 'Polygon') rings = f.geometry.coordinates;
    else if (f.geometry?.type === 'MultiPolygon') rings = f.geometry.coordinates.flat();
    else rings = [];
    return { name, rings };
  });
}

async function fetchCounty(name, st) {
  const fips = STATE_FIPS[st.toUpperCase()];
  if (!fips) throw new Error(`Unknown state "${st}"`);
  const where = encodeURIComponent(`STATE='${fips}' AND BASENAME='${name}'`);
  const url = `${TIGERWEB}?where=${where}&outSR=4326&maxAllowableOffset=.004&geometryPrecision=3&f=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TIGERweb ${res.status} for ${name} ${st}`);
  const json = await res.json();
  const feats = featuresFrom(json);
  if (!feats.length) throw new Error(`No county found for "${name} ${st}"`);
  return feats[0];
}

async function loadCounties() {
  if (IN) {
    const p = path.resolve(IN);
    const files = fs.statSync(p).isDirectory()
      ? fs.readdirSync(p).filter((f) => f.endsWith('.json')).map((f) => path.join(p, f))
      : [p];
    return files.flatMap((f) => featuresFrom(JSON.parse(fs.readFileSync(f, 'utf8'))));
  }
  const list = COUNTIES.split(',').map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const item of list) {
    const m = item.match(/^(.+?)\s+([A-Za-z]{2})$/);
    if (!m) throw new Error(`Bad county spec "${item}"`);
    process.stderr.write(`Fetching ${m[1]} ${m[2]}...\n`);
    out.push(await fetchCounty(m[1], m[2]));
  }
  return out;
}

const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
function distToSeg(p, a, b) {
  const l2 = d2(a, b);
  if (!l2) return Math.sqrt(d2(p, a));
  let t = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.sqrt(d2(p, [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]));
}
function distToRing(p, ring) {
  let best = Infinity;
  for (let i = 0; i < ring.length - 1; i++) best = Math.min(best, distToSeg(p, ring[i], ring[i + 1]));
  return best;
}
function distToCounty(p, county) {
  let best = Infinity;
  for (const r of county.rings) best = Math.min(best, distToRing(p, r));
  return best;
}
function simplify(pts, tol) {
  if (pts.length <= 2) return pts;
  let maxD = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = distToSeg(pts[i], pts[0], pts[pts.length - 1]);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= tol) return [pts[0], pts[pts.length - 1]];
  return [...simplify(pts.slice(0, idx + 1), tol).slice(0, -1), ...simplify(pts.slice(idx), tol)];
}

const counties = await loadCounties();
if (counties.length < 1) { console.error('No counties loaded.'); process.exit(2); }
process.stderr.write(`Loaded ${counties.length} counties: ${counties.map((c) => c.name).join(', ')}\n`);

function neighborOf(county, mid) {
  let best = null, bestD = EPS;
  for (const o of counties) {
    if (o === county) continue;
    const d = distToCounty(mid, o);
    if (d < bestD) { bestD = d; best = o; }
  }
  return best;
}

const outerRuns = [];
const pairRuns = new Map();
for (const c of counties) {
  for (const ring of c.rings) {
    const segN = [];
    for (let i = 0; i < ring.length - 1; i++) {
      const mid = [(ring[i][0] + ring[i + 1][0]) / 2, (ring[i][1] + ring[i + 1][1]) / 2];
      segN.push(neighborOf(c, mid));
    }
    let s = 0;
    while (s < segN.length) {
      let e = s;
      while (e + 1 < segN.length && segN[e + 1] === segN[s]) e++;
      const run = ring.slice(s, e + 2);
      const nb = segN[s];
      if (!nb) outerRuns.push(run);
      else if (c.name < nb.name) {
        const key = `${c.name}|${nb.name}`;
        if (!pairRuns.has(key)) pairRuns.set(key, []);
        pairRuns.get(key).push(run);
      }
      s = e + 1;
    }
  }
}

function stitch(runs) {
  if (!runs.length) return [];
  const pool = runs.map((r) => [...r]).sort((a, b) => b.length - a.length);
  let chain = pool.shift();
  while (pool.length) {
    const head = chain[0], tail = chain[chain.length - 1];
    let best = { d: Infinity, i: -1, mode: '' };
    for (let i = 0; i < pool.length; i++) {
      const r = pool[i], rh = r[0], rt = r[r.length - 1];
      const cand = [
        { d: d2(tail, rh), mode: 'append' },
        { d: d2(tail, rt), mode: 'append-rev' },
        { d: d2(head, rt), mode: 'prepend' },
        { d: d2(head, rh), mode: 'prepend-rev' },
      ];
      for (const c of cand) if (c.d < best.d) best = { d: c.d, i, mode: c.mode };
    }
    const next = pool.splice(best.i, 1)[0];
    if (best.mode.endsWith('rev')) next.reverse();
    if (best.mode.startsWith('append')) chain = chain.concat(next.slice(d2(tail, next[0]) < 1e-12 ? 1 : 0));
    else chain = next.concat(chain.slice(d2(next[next.length - 1], head) < 1e-12 ? 1 : 0));
  }
  if (d2(chain[0], chain[chain.length - 1]) > 1e-12) chain.push(chain[0]);
  return chain;
}
function mergeRuns(runs) {
  const pool = runs.map((r) => [...r]);
  const lines = [];
  while (pool.length) {
    let chain = pool.shift();
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < pool.length; i++) {
        const r = pool[i];
        const join = (p, q) => Math.sqrt(d2(p, q)) < EPS * 2;
        if (join(chain[chain.length - 1], r[0])) { chain = chain.concat(r.slice(1)); }
        else if (join(chain[chain.length - 1], r[r.length - 1])) { chain = chain.concat([...r].reverse().slice(1)); }
        else if (join(chain[0], r[r.length - 1])) { chain = r.slice(0, -1).concat(chain); }
        else if (join(chain[0], r[0])) { chain = [...r].reverse().slice(0, -1).concat(chain); }
        else continue;
        pool.splice(i, 1); grew = true; break;
      }
    }
    lines.push(chain);
  }
  return lines;
}

const SIMP = 0.002;
const toLatLng = (pts) => pts.map(([lng, lat]) => [Number(lat.toFixed(3)), Number(lng.toFixed(3))]);

const outline = simplify(stitch(outerRuns), SIMP);
const COAST = toLatLng(outline.slice(0, -1));

const COUNTY_LINES = [];
for (const [key, runs] of pairRuns) {
  const [a, b] = key.split('|');
  for (const line of mergeRuns(runs)) {
    COUNTY_LINES.push({ a, b, pts: toLatLng(simplify(line, SIMP)) });
  }
}

const lats = COAST.map((p) => p[0]), lngs = COAST.map((p) => p[1]);
const pad = 0.04;
const latSpan = Math.max(...lats) - Math.min(...lats), lngSpan = Math.max(...lngs) - Math.min(...lngs);
const LAT0 = +(Math.min(...lats) - pad * latSpan).toFixed(2), LAT1 = +(Math.max(...lats) + pad * latSpan).toFixed(2);
const LNG0 = +(Math.min(...lngs) - pad * lngSpan).toFixed(2), LNG1 = +(Math.max(...lngs) + pad * lngSpan).toFixed(2);
const midLat = (LAT0 + LAT1) / 2;
const H = Math.round(WIDTH * ((LAT1 - LAT0) / ((LNG1 - LNG0) * Math.cos((midLat * Math.PI) / 180))));
const MAP_VIEW = { W: WIDTH, H, LNG0, LNG1, LAT0, LAT1 };

const MAP_LABELS = LABELS.split(';').map((s) => s.trim()).filter(Boolean).map((s) => {
  const m = s.match(/^(.+?)@\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)$/);
  if (!m) throw new Error(`Bad label "${s}"`);
  return { t: m[1].trim(), lat: Number(m[2]), lng: Number(m[3]), k: 'city' };
});

const result = { COAST, COUNTY_LINES, MAP_VIEW, MAP_LABELS };
process.stderr.write(`COAST: ${COAST.length} pts; COUNTY_LINES: ${COUNTY_LINES.length} line(s) (${COUNTY_LINES.map((l) => `${l.a}/${l.b}:${l.pts.length}`).join(', ')}); MAP_VIEW ${JSON.stringify(MAP_VIEW)}\n`);

if (MERGE) {
  const mp = path.resolve(MERGE);
  const market = JSON.parse(fs.readFileSync(mp, 'utf8'));
  Object.assign(market, result);
  fs.writeFileSync(mp, JSON.stringify(market));
  process.stderr.write(`Merged into ${MERGE}\n`);
} else {
  const text = JSON.stringify(result, null, 1);
  if (OUT) { fs.writeFileSync(path.resolve(OUT), text); process.stderr.write(`Wrote ${OUT}\n`); }
  else console.log(text);
}
