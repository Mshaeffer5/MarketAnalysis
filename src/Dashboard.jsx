
import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Home, Building2, TrendingUp, DollarSign, MapPin, BarChart3, Target,
  Landmark, LineChart as LineChartIcon, Info, X, ChevronRight, AlertCircle,
  ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar as ReBar, AreaChart, Area, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, Legend,
  ResponsiveContainer, ReferenceLine, ReferenceArea, Cell
} from 'recharts';


/* ===== Market data layer (injected) =====
   Data constants below are populated by hydrate() before the dashboard renders.
   This keeps every existing reference in the component code working unchanged,
   while allowing per-market data to be lazy-loaded and swapped at runtime. */
let PROPS, GEO, ZIPS, MS, Q_OCC, Q_RENT, Q_RENTSF, Q_ERG, Q_UC, Q_CAP, Q_AVPU, Q_CVI, Q_NOI, Q_ABS, Q_STARTS, Q_SVOL, Q_SPU, Q_POP, Q_EMP, ANN, SUBS, SUB_PROPS, SUB_STATS, SUB_VAC, SUB_TS, SUB_DESIRE, SUB_AFFORD, SALES, RP, GS, NM, CS_CAP, AT, THESIS, COAST, COUNTY_LINES, MAP_LABELS, MAP_VIEW, LEASEUP_PROPS, LEASEUP_SUBS, LEASEUP_ZIPS, LEASEUP_MATCH, UC_DEALS, EXEC_NARRATIVE, RISK_FACTORS, EMPLOYERS, SUB_NARRATIVES, DV, DATA_VINTAGE, LEASEUP_BY_MAIN, METRO_REF;

// Per-market behavioral values, also populated by hydrate() from market data
// (with Austin-compatible fallbacks). RECON_Q = the latest ACTUAL quarter used
// to splice source-of-truth into the time series and anchor forward growth.
let URBAN_SUBS = new Set();
let RECON_Q = '26Q1';

function reconcileSubTs() {
  if (!SUB_TS || !SUB_TS.q) return; // guard: missing or malformed data
  const idx = SUB_TS.q.indexOf(RECON_Q);
  if (idx < 0) return;

  for (const sub of SUBS) {
    const ts = SUB_TS.d[sub.s];
    if (!ts) continue;
    if (ts.r  && sub.rent != null) ts.r[idx]  = sub.rent;
    if (ts.v  && sub.vac  != null) ts.v[idx]  = sub.vac;
    if (ts.uc && sub.uc   != null) ts.uc[idx] = sub.uc;
    if (ts.a  && sub.t4a  != null) ts.a[idx]  = sub.t4a;
    if (ts.d  && sub.t4d  != null) ts.d[idx]  = sub.t4d;
  }
  SUB_TS.fc[idx] = 0;

  let totalInv = 0, rentSum = 0, occSum = 0;
  for (const sub of SUBS) {
    if (!sub.inv || sub.rent == null) continue;
    totalInv += sub.inv;
    rentSum += sub.rent * sub.inv;
    if (sub.vac != null) occSum += (100 - sub.vac) * sub.inv / 100;
  }
  if (totalInv > 0) {
    if (Q_RENT && Q_RENT[idx]) { Q_RENT[idx].v = Math.round(rentSum / totalInv); Q_RENT[idx].fc = 0; }
    if (Q_OCC  && Q_OCC[idx])  { Q_OCC[idx].v  = occSum / totalInv;              Q_OCC[idx].fc = 0; }
  }
}

export function hydrate(d) {
  ({ PROPS, GEO, ZIPS, MS, Q_OCC, Q_RENT, Q_RENTSF, Q_ERG, Q_UC, Q_CAP, Q_AVPU, Q_CVI, Q_NOI, Q_ABS, Q_STARTS, Q_SVOL, Q_SPU, Q_POP, Q_EMP, ANN, SUBS, SUB_PROPS, SUB_STATS, SUB_VAC, SUB_TS, SUB_DESIRE, SUB_AFFORD, SALES, RP, GS, NM, CS_CAP, AT, THESIS, COAST, COUNTY_LINES, MAP_LABELS, MAP_VIEW, LEASEUP_PROPS, LEASEUP_SUBS, LEASEUP_ZIPS, LEASEUP_MATCH, UC_DEALS, EXEC_NARRATIVE, RISK_FACTORS, EMPLOYERS, SUB_NARRATIVES, DV, DATA_VINTAGE } = d);
  // Per-market behavioral config (all optional; fall back to Austin defaults).
  URBAN_SUBS = new Set(d.URBAN_SUBS || []);
  const _m = d._market || {};
  RECON_Q = _m.asOfQuarter || RECON_Q;
  TODAY_Q = _m.todayQuarter || TODAY_Q;
  TODAY_LABEL = _m.todayLabel || TODAY_LABEL;
  if (_m.propTaxRate != null) DEFAULT_PROP_TAX_RATE = _m.propTaxRate;
  reconcileSubTs();
  LEASEUP_BY_MAIN = (() => {
    const out = {};
    for (const lu of LEASEUP_PROPS) {
      const mainName = LEASEUP_MATCH[lu.n];
      if (mainName) out[mainName] = lu;
    }
    return out;
  })();
  METRO_REF = (() => {
    const totalInv = SUBS.reduce((a, s) => a + (s.inv || 0), 0) || 1;
    const wtdSum = (key) => SUBS.reduce((a, s) => a + (s[key] || 0) * (s.inv || 0), 0) / totalInv;
    return {
      vac:  wtdSum('vac'),
      erg:  wtdSum('erg'),
      rent: wtdSum('rent'),
      inv:  totalInv,
    };
  })();
}
/* ===== end injected layer ===== */















function subSeries(sub) {
  const dat = SUB_TS.d[sub];
  if (!dat) return [];
  return SUB_TS.q.map((q, i) => ({
    q, fc: SUB_TS.fc[i],
    r:  dat.r  ? dat.r[i]  : null,
    v:  dat.v  ? dat.v[i]  : null,
    sv: dat.sv ? dat.sv[i] : null,
    a:  dat.a  ? dat.a[i]  : null,
    d:  dat.d  ? dat.d[i]  : null,
    uc: dat.uc ? dat.uc[i] : null,
    st: dat.st ? dat.st[i] : null,
    mr: Q_RENT[i] ? Q_RENT[i].v : null,
    mv: Q_OCC[i] != null ? (1 - Q_OCC[i].v) * 100 : null,
  }));
}

function forwardRentGrowth(sub) {
  const dat = SUB_TS.d[sub];
  if (!dat || !dat.r) return null;
  const idxNow = SUB_TS.q.indexOf(RECON_Q);
  const idx1Y  = idxNow + 4;
  const idx3Y  = idxNow + 12;
  const idx5Y  = idxNow + 20;
  const now  = dat.r[idxNow];
  const r1   = dat.r[idx1Y];
  const r3   = dat.r[idx3Y];
  const r5   = dat.r[idx5Y];
  if (now == null || now <= 0) return null;
  const cagr = (target, years) => target == null ? null : Math.pow(target / now, 1 / years) - 1;
  return {
    now,
    y1: r1 != null ? { pct: cagr(r1, 1) * 100, end: r1 } : null,
    y3: r3 != null ? { pct: cagr(r3, 3) * 100, end: r3 } : null,
    y5: r5 != null ? { pct: cagr(r5, 5) * 100, end: r5 } : null,
  };
}












function lerp(v, lo, hi, inv) {
  if (v == null || isNaN(v)) return null;
  let t = (v - lo) / (hi - lo);
  t = Math.max(0, Math.min(1, t));
  return inv ? Math.round((1 - t) * 100) : Math.round(t * 100);
}

function cat(k, map, dflt) {
  return (k != null && map[k] != null) ? map[k] : dflt;
}

function wavg(pairs) {
  let num = 0, den = 0;
  for (const [w, s] of pairs) {
    if (s != null) { num += s * w; den += w; }
  }
  return den > 0 ? Math.round(num / den) : 50;
}

const DEFAULT_ZIP_W = {
  ht: 14, pg: 12, rp: 12, cp: 12, sf: 10, i2: 10, ct: 10, rt: 10,
  fs: 8,  wk: 8,  tc: 8,  jo: 6,  ns: 6,  sc: 6,  mf: 6,  p2: 6
};

const ZIP_FACTORS = [
  { key: 'ht', label: 'HiTech Workers %',      info: 'Percentage of zip workforce in high-technology sectors. Austin\'s prime renter demographic.' },
  { key: 'pg', label: 'Pop Growth (4Y)',       info: '4-year population growth rate. Core demand driver for a long-hold thesis.' },
  { key: 'rp', label: 'Renter HH %',           info: 'Percentage of households that rent rather than own. Higher = deeper multifamily demand pool.' },
  { key: 'cp', label: 'Pipeline (inv)',        info: '2-year new-construction pipeline as % of existing inventory. Inverted: less pipeline = better for existing asset.' },
  { key: 'sf', label: 'Six-Figure HH %',       info: 'Percentage of households earning $100,000 or more annually. Wealth/capacity indicator.' },
  { key: 'i2', label: 'Income Age 25-44',      info: 'Median household income of the 25-44 age cohort — Atlas\'s core renter demographic.' },
  { key: 'ct', label: 'Commute (inv)',         info: 'Average commute time in minutes. Inverted: shorter commute = better job access. Proxy for employer proximity in suburban zips.' },
  { key: 'rt', label: 'Retail Score',          info: 'Market Stadium retail quality score 0-80. Measures shopping, dining, convenience amenities.' },
  { key: 'fs', label: 'Forecast Score',        info: 'Market Stadium forward-looking composite 0-100. The only forward-looking factor in zip scoring.' },
  { key: 'wk', label: 'Walkability',           info: 'Walk Score index for the zip area. Higher = more walkable urban environment.' },
  { key: 'tc', label: 'Crime/1K (inv)',        info: 'Total crime incidents per 1K residents. Inverted: lower = safer = better.' },
  { key: 'jo', label: 'Jobs/1K Pop',           info: 'Jobs located within the zip per 1K residents. Less meaningful for bedroom-community suburbs.' },
  { key: 'ns', label: 'New Supply % (inv)',    info: 'New multifamily supply as % of zip housing stock. Inverted: less new supply = less competition.' },
  { key: 'sc', label: 'School Rating',         info: 'K-12 school quality rating on 2-9 scale. Relevant for family-renter demand.' },
  { key: 'mf', label: 'MF Density %',          info: 'Multifamily share of zip housing stock. Higher = more established rental market.' },
  { key: 'p2', label: 'Pre-2000 Stock %',      info: 'Share of housing stock built before 2000. Indicator of neighborhood maturity vs. new-suburb character.' },
];







function calcStabilization(curOcc, units, leasesPerMo, stabThresh) {
  if (curOcc >= stabThresh) return { quarter: 'Stable', months: 0, stabilizes: true, alreadyStable: true };
  if (leasesPerMo <= 0) return { quarter: '—', months: null, stabilizes: false };
  const targetUnitsLeased = units * stabThresh;
  const curUnitsLeased = units * curOcc;
  const gap = targetUnitsLeased - curUnitsLeased;
  const months = gap / leasesPerMo;
  const quartersOut = Math.ceil(months / 3);
  const baseY = 26, baseQ = 2;
  let totalQ = baseQ + quartersOut;
  let y = baseY + Math.floor((totalQ - 1) / 4);
  let q = ((totalQ - 1) % 4) + 1;
  return { quarter: y + 'Q' + q, months: Math.round(months), stabilizes: true };
}

const MARKET_VEL_ASSUMPTION = 8;
const THIN_SAMPLE_THRESHOLD = 3;
const DEFAULT_PRELEASED_UC = 0.15;

const DEFAULT_MORTGAGE_RATE = 6.75;
const DEFAULT_DOWN_PCT = 20;
let DEFAULT_PROP_TAX_RATE = 2.10; // per-market: overridden by _market.propTaxRate in hydrate()
const COST_TO_OWN_INSURANCE_PCT = 0.40;
const COST_TO_OWN_MAINT_PCT = 1.00;

function costToOwn(homeVal, monthlyRent, ratePct, downPct, propTaxPct,
                   insPct = COST_TO_OWN_INSURANCE_PCT, maintPct = COST_TO_OWN_MAINT_PCT) {
  if (!homeVal || !monthlyRent || homeVal <= 0 || monthlyRent <= 0) return null;

  const loanAmt = homeVal * (1 - downPct / 100);
  const r = (ratePct / 100) / 12;
  const n = 360;
  const pi = r === 0 ? loanAmt / n : loanAmt * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);

  const tax = (homeVal * (propTaxPct / 100)) / 12;
  const ins = (homeVal * (insPct / 100)) / 12;
  const maint = (homeVal * (maintPct / 100)) / 12;

  const totalOwn = pi + tax + ins + maint;
  const gapMo = totalOwn - monthlyRent;
  const premiumPct = (gapMo / monthlyRent) * 100;
  const p2r = homeVal / (monthlyRent * 12);

  return { pi, tax, ins, maint, totalOwn, rent: monthlyRent, gapMo, premiumPct, p2r };
}

function effectiveVelocity(observedMean, sampleN) {
  const thin = sampleN <= THIN_SAMPLE_THRESHOLD;
  if (thin && observedMean < MARKET_VEL_ASSUMPTION) {
    return { v: MARKET_VEL_ASSUMPTION, assumed: true, thin: true, observed: observedMean };
  }
  return { v: observedMean, assumed: false, thin, observed: observedMean };
}

function quarterOffset(fromQ, toQ) {
  const strip = s => s.replace('TD', '');
  const parse = s => ({ y: parseInt(s.slice(0, 2)), q: parseInt(s[3]) });
  const f = parse(strip(fromQ));
  const t = parse(strip(toQ));
  return (t.y - f.y) * 4 + (t.q - f.q);
}

function quarterFromOffset(offset) {
  if (offset === 0) return '26Q2TD';
  let totalQ = 2 + offset;
  let y = 26 + Math.floor((totalQ - 1) / 4);
  let q = ((totalQ - 1) % 4) + 1;
  return y + 'Q' + q;
}

function computeAbsorptionStab(luProps, ucDeals, leasesPerMo, preLeasedUC, stabThresh) {
  if (luProps.length === 0 && ucDeals.length === 0) return null;

  const ucByOffset = {};
  for (const uc of ucDeals) {
    const offset = Math.max(0, quarterOffset('26Q2TD', uc.cq));
    if (!ucByOffset[offset]) ucByOffset[offset] = [];
    ucByOffset[offset].push(uc);
  }

  const active = luProps.map(p => ({ occ: p.curOcc, u: p.u }));
  const totalExpected = luProps.length + ucDeals.length;
  const maxQ = 80;

  for (let t = 0; t <= maxQ; t++) {
    if (t > 0 && leasesPerMo > 0) {
      for (const s of active) {
        if (s.occ < stabThresh) {
          s.occ = Math.min(stabThresh, s.occ + (leasesPerMo * 3) / s.u);
        }
      }
    }
    if (ucByOffset[t]) {
      for (const uc of ucByOffset[t]) active.push({ occ: preLeasedUC, u: uc.u });
    }
    const allDelivered = active.length === totalExpected;
    if (allDelivered) {
      let totalU = 0, leasedU = 0;
      for (const s of active) { totalU += s.u; leasedU += s.u * s.occ; }
      const wtdOcc = totalU > 0 ? leasedU / totalU : 0;
      if (wtdOcc >= stabThresh - 1e-9) {
        return { quarter: quarterFromOffset(t), months: t * 3, wtdOcc };
      }
    }
  }
  return { quarter: '30Q2+', months: null, wtdOcc: null };
}

function computeAbsorptionMilestones(luProps, ucDeals, leasesPerMo, preLeasedUC, thresholds, stabThresh) {
  if (luProps.length === 0 && ucDeals.length === 0) return null;
  const sortedThr = [...thresholds].sort((a, b) => a - b);
  const effStab = stabThresh != null ? stabThresh : sortedThr[sortedThr.length - 1];
  const hits = {};

  const ucByOffset = {};
  for (const uc of ucDeals) {
    const offset = Math.max(0, quarterOffset('26Q2TD', uc.cq));
    if (!ucByOffset[offset]) ucByOffset[offset] = [];
    ucByOffset[offset].push(uc);
  }

  const active = luProps.map(p => ({ occ: p.curOcc, u: p.u }));
  const totalExpected = luProps.length + ucDeals.length;

  for (let t = 0; t <= 80; t++) {
    if (t > 0 && leasesPerMo > 0) {
      for (const s of active) {
        if (s.occ < effStab) s.occ = Math.min(effStab, s.occ + (leasesPerMo * 3) / s.u);
      }
    }
    if (ucByOffset[t]) for (const uc of ucByOffset[t]) active.push({ occ: preLeasedUC, u: uc.u });

    let totalU = 0, leasedU = 0;
    for (const s of active) { totalU += s.u; leasedU += s.u * s.occ; }
    const wtdOcc = totalU > 0 ? leasedU / totalU : 0;
    const allDelivered = active.length === totalExpected;

    for (const thr of sortedThr) {
      if (hits[thr]) continue;
      const need = thr >= effStab - 1e-9 ? allDelivered : true;
      if (wtdOcc >= thr - 1e-9 && need) {
        hits[thr] = { quarter: quarterFromOffset(t), months: t * 3, wtdOcc };
      }
    }
    if (Object.keys(hits).length === sortedThr.length) break;
  }
  return hits;
}

function computeBottleneckProps(luProps, ucDeals, leasesPerMo, preLeasedUC, stabThresh, topN) {
  const all = [
    ...luProps.map(p => ({ ...p, isLU: true, deliveryOffset: 0, startOcc: p.curOcc })),
    ...ucDeals.map(d => ({ ...d, isLU: false, deliveryOffset: Math.max(0, quarterOffset('26Q2TD', d.cq)), startOcc: preLeasedUC }))
  ];
  all.forEach(p => {
    const gap = Math.max(0, stabThresh - p.startOcc);
    const unitsToLease = gap * p.u;
    const monthsFromDelivery = leasesPerMo > 0 ? unitsToLease / leasesPerMo : 0;
    const quartersFromDelivery = Math.ceil(monthsFromDelivery / 3);
    p.stabOffset = p.deliveryOffset + quartersFromDelivery;
    p.stabQ = quarterFromOffset(p.stabOffset);
    p.monthsFromDelivery = monthsFromDelivery;
    p.totalMonths = (p.deliveryOffset * 3) + monthsFromDelivery;
  });
  all.sort((a, b) => b.stabOffset - a.stabOffset);
  return all.slice(0, topN || 5);
}

function impliedVelocity(lu, subScore) {
  if (!lu) return null;
  const actual = lu.vel || 0;
  const subData = LEASEUP_SUBS[lu.sb] || {};
  const subMedian = subData.medVel || 0;
  let base = Math.max(actual, subMedian);
  const mult = subScore != null ? Math.max(0.5, Math.min(1.5, 1 + (subScore - 50) / 100)) : 1;
  return Math.round(base * mult * 10) / 10;
}

function computeAbsorptionTrajectory(luProps, ucDeals, leasesPerMo, preLeasedUC, stabThresh, maxQuarters = 24) {
  if (luProps.length === 0 && ucDeals.length === 0) return [];

  const ucByOffset = {};
  for (const uc of ucDeals) {
    const offset = Math.max(0, quarterOffset('26Q2TD', uc.cq));
    if (!ucByOffset[offset]) ucByOffset[offset] = [];
    ucByOffset[offset].push(uc);
  }

  const active = luProps.map(p => ({ occ: p.curOcc, u: p.u }));
  const totalExpected = luProps.length + ucDeals.length;
  const cap = stabThresh || 0.95;
  const trajectory = [];

  for (let t = 0; t <= maxQuarters; t++) {
    if (t > 0 && leasesPerMo > 0) {
      for (const s of active) {
        if (s.occ < cap) {
          s.occ = Math.min(cap, s.occ + (leasesPerMo * 3) / s.u);
        }
      }
    }
    if (ucByOffset[t]) {
      for (const uc of ucByOffset[t]) active.push({ occ: preLeasedUC, u: uc.u });
    }
    let totalU = 0, leasedU = 0;
    for (const s of active) { totalU += s.u; leasedU += s.u * s.occ; }
    const wtdOcc = totalU > 0 ? leasedU / totalU : 0;
    trajectory.push({
      q: quarterFromOffset(t),
      offset: t,
      months: t * 3,
      occ: wtdOcc,
      delivered: active.length === totalExpected,
    });
  }
  return trajectory;
}

function subLeaseUpSummary(subName, leasesPerMoOverride, preLeasedUC, stabThresh) {
  const luProps = LEASEUP_PROPS.filter(p => p.sb === subName);
  const ucDeals = UC_DEALS.filter(d => d.sb === subName);
  if (luProps.length === 0 && ucDeals.length === 0) return null;

  const luUnits = luProps.reduce((a, p) => a + p.u, 0);
  const ucUnits = ucDeals.reduce((a, d) => a + d.u, 0);
  const totalUnits = luUnits + ucUnits;
  const luLeased = luProps.reduce((a, p) => a + p.u * p.curOcc, 0);
  const deliveredOcc = luUnits > 0 ? luLeased / luUnits : null;

  const vels = luProps.map(p => p.vel || 0);
  const observedMean = vels.length > 0 ? vels.reduce((a, b) => a + b, 0) / vels.length : 0;
  const velInfo = effectiveVelocity(observedMean, luProps.length);
  const leases = leasesPerMoOverride != null ? leasesPerMoOverride : velInfo.v;
  const preLease = preLeasedUC != null ? preLeasedUC : DEFAULT_PRELEASED_UC;

  const stab = computeAbsorptionStab(luProps, ucDeals, leases, preLease, stabThresh || 0.95);

  return {
    luProps: luProps.length,
    ucDeals: ucDeals.length,
    totalProps: luProps.length + ucDeals.length,
    luUnits, ucUnits, totalUnits,
    deliveredOcc,
    meanVel: Math.round(observedMean * 10) / 10,
    effectiveVel: velInfo.v,
    assumedVel: velInfo.assumed,
    thinSample: velInfo.thin,
    stabQuarter: stab ? stab.quarter : '—',
    stabMonths: stab ? stab.months : null,
    stabWtdOcc: stab ? stab.wtdOcc : null,
    n: luProps.length,
    units: luUnits,
    wtdOcc: deliveredOcc || 0,
    props: luProps,
  };
}

function zipLeaseUpSummary(zip, leasesPerMoOverride, preLeasedUC, stabThresh) {
  const zipStr = String(zip);
  const luProps = LEASEUP_PROPS.filter(p => p.z === zipStr);
  const ucDeals = UC_DEALS.filter(d => d.z === zipStr);
  if (luProps.length === 0 && ucDeals.length === 0) return null;

  const luUnits = luProps.reduce((a, p) => a + p.u, 0);
  const ucUnits = ucDeals.reduce((a, d) => a + d.u, 0);
  const totalUnits = luUnits + ucUnits;
  const luLeased = luProps.reduce((a, p) => a + p.u * p.curOcc, 0);
  const deliveredOcc = luUnits > 0 ? luLeased / luUnits : null;

  const vels = luProps.map(p => p.vel || 0);
  const observedMean = vels.length > 0 ? vels.reduce((a, b) => a + b, 0) / vels.length : 0;
  const velInfo = effectiveVelocity(observedMean, luProps.length);
  const leases = leasesPerMoOverride != null ? leasesPerMoOverride : velInfo.v;
  const preLease = preLeasedUC != null ? preLeasedUC : DEFAULT_PRELEASED_UC;

  const stab = computeAbsorptionStab(luProps, ucDeals, leases, preLease, stabThresh || 0.95);

  return {
    luProps: luProps.length,
    ucDeals: ucDeals.length,
    totalProps: luProps.length + ucDeals.length,
    luUnits, ucUnits, totalUnits,
    deliveredOcc,
    meanVel: Math.round(observedMean * 10) / 10,
    effectiveVel: velInfo.v,
    assumedVel: velInfo.assumed,
    thinSample: velInfo.thin,
    stabQuarter: stab ? stab.quarter : '—',
    stabMonths: stab ? stab.months : null,
    stabWtdOcc: stab ? stab.wtdOcc : null,
    n: luProps.length,
    units: luUnits,
    wtdOcc: deliveredOcc || 0,
  };
}

function scoreZip(z, ms, zW) {
  const w = zW || DEFAULT_ZIP_W;
  const m = ms[z.z] || {};
  const f = [
    [w.ht, lerp(m.ht, 2, 15)],
    [w.pg, lerp(z.pg, -5, 30)],
    [w.rp, lerp(z.rp, 10, 75)],
    [w.cp, lerp(m.cp, 0, 30, true)],
    [w.ns, lerp(z.ns, 0, 20, true)],
    [w.sf, lerp(m.sf, 20, 70)],
    [w.i2, lerp(z.i2, 60000, 180000)],
    [w.ct, lerp(m.ct, 18, 35, true)],
    [w.jo, lerp(m.jo, 50, 1500)],
    [w.rt, lerp(m.rt, 0, 80)],
    [w.wk, lerp(m.wk, 0, 80)],
    [w.fs, lerp(m.fs, 30, 90)],
    [w.tc, lerp(m.tc, 50, 500, true)],
    [w.sc, lerp(m.sc, 2, 9)],
    [w.mf, lerp(z.mf, 5, 60)],
    [w.p2, lerp(z.p2, 10, 80)],
  ];
  return wavg(f);
}

const DEFAULT_PROP_W = {
  u: 20, yb: 15, sf: 12, v: 18, cn: 12, cl: 13, rsf: 10
};

const PROP_FACTORS = [
  { key: 'u',   label: 'Units',         info: 'Property unit count. Atlas buy-box target 150+. Scale indicator. Scored 50 units → 0pts, 400 units → 100pts linearly.' },
  { key: 'yb',  label: 'Vintage',       info: 'Year built. Atlas buy-box target 2000+. Newer stock requires less capex. Scored 1995 → 0pts, 2025 → 100pts linearly.' },
  { key: 'sf',  label: 'Avg Unit SF',   info: 'Average unit square footage. Atlas buy-box target 900+. Larger units command premium rents and family demand. Scored 700 SF → 0pts, 1200 SF → 100pts linearly.' },
  { key: 'v',   label: 'Vacancy (inv)', info: 'Current vacancy rate (inverted — lower is better). Operating health signal. Scored 0% → 100pts, 30% → 0pts linearly.' },
  { key: 'cn',  label: 'Conc (inv)',    info: 'Concessions as % of asking rent (inverted — lower is better). Signal of pricing pressure. Scored 0% → 100pts, 20% → 0pts linearly.' },
  { key: 'cl',  label: 'Class',         info: 'CoStar property class. Austin scoring: A=85, B=72, C=55. Properties without class assignment are skipped (null-safe).' },
  { key: 'rsf', label: 'Rent/SF',       info: 'Effective rent divided by average unit SF. Productivity metric. Scored $0.90/SF → 0pts, $2.20/SF → 100pts linearly. Skipped if either input missing.' },
];

function scorePropQ(p, pW) {
  const w = pW || DEFAULT_PROP_W;
  const rsfVal = (p.er != null && p.sf != null && p.sf > 0) ? p.er / p.sf : null;
  const clScore = cat(p.cl, {A: 85, B: 72, C: 55}, null);
  const f = [
    [w.u,   lerp(p.u,  50, 400)],
    [w.yb,  lerp(p.yb, 1995, 2025)],
    [w.sf,  lerp(p.sf, 700, 1200)],
    [w.v,   lerp(p.v,  0, 30, true)],
    [w.cn,  lerp(p.cn, 0, 20, true)],
    [w.cl,  clScore],
    [w.rsf, lerp(rsfVal, 0.9, 2.2)],
  ];
  return wavg(f);
}

const DEFAULT_SUB_W = {
  vac: 25, erg: 25, uc: 20, ad: 15, lv: 15
};

const SUB_FACTORS = [
  { key: 'vac', label: 'Vacancy (inv)',  info: 'Submarket vacancy rate (inverted — lower is better). CoStar submarket-level average. Scored 0% → 100pts, 40% → 0pts linearly.' },
  { key: 'erg', label: 'Rent Growth',    info: 'Effective rent growth YoY %. CoStar submarket-level. Scored -15% → 0pts, +5% → 100pts linearly.' },
  { key: 'uc',  label: 'UC / Inventory', info: 'Units under construction as percent of existing inventory (inverted — less pipeline is better for holders). Scored 0% → 100pts, 20% → 0pts linearly.' },
  { key: 'ad',  label: 'Absorption/Delivery', info: 'Units absorbed divided by units delivered in the submarket. Ratio >1 means demand outpacing supply. Scored 0x → 0pts, 3x → 100pts linearly.' },
  { key: 'lv',  label: 'Lease-Up Velocity', info: 'Demand-depth signal from active lease-ups. Takes the better of: (a) mean leases/mo across lease-up properties in the sub (scored 0 → 15), or (b) weighted occupancy of the lease-up cohort (scored 40% → 95%). Subs where lease-ups are already near-stabilized get credit for absorption already done. Subs with no lease-up activity pass neutrally.' },
];

function scoreSub(s, sW) {
  const w = sW || DEFAULT_SUB_W;
  const ucRatio = (s.inv && s.inv > 0) ? (s.uc / s.inv * 100) : null;
  const adNormalized = (s.uc === 0 || s.ad == null) ? null : lerp(s.ad, 0, 3);
  const luInfo = LEASEUP_SUBS[s.s];
  let lvNormalized = null;
  if (luInfo && luInfo.n > 0) {
    const velScore = lerp(luInfo.meanVel, 0, 15);
    const occScore = lerp(luInfo.wtdOcc, 0.4, 0.95);
    lvNormalized = Math.max(velScore || 0, occScore || 0);
  }
  const f = [
    [w.vac, lerp(s.vac,  0, 40, true)],
    [w.erg, lerp(s.erg, -15, 5)],
    [w.uc,  lerp(ucRatio,  0, 20, true)],
    [w.ad,  adNormalized],
    [w.lv,  lvNormalized],
  ];
  return wavg(f);
}

function buildScoredProps(layerW, opMode, zW, pW, sW) {
  const wS = layerW[0] / 100, wZ = layerW[1] / 100, wP = layerW[2] / 100;

  const zipScores = {};
  for (const z of ZIPS) zipScores[z.z] = scoreZip(z, MS, zW);

  const subScores = {};
  for (const s of SUBS) subScores[s.s] = scoreSub(s, sW);

  const subAvgRent = {};
  for (const s of SUBS) { if (s.s && s.rent) subAvgRent[s.s] = s.rent; }
  const CORE = ['yb', 'u', 'sf', 'v', 'cn', 'cl', 'er', 'o', 'z', 'sb'];

  return PROPS.map((p, i) => {
    const geo = GEO[i] || {};
    const zs = zipScores[p.z] != null ? zipScores[p.z] : 50;
    const ss = subScores[p.sb] != null ? subScores[p.sb] : 50;
    const pq = scorePropQ(p, pW);

    const distress100 = (p.ds != null ? p.ds : 0) * 10;
    const propFinal = opMode
      ? Math.round(distress100 * 0.55 + pq * 0.45)
      : pq;

    const cs = Math.round(ss * wS + zs * wZ + propFinal * wP);

    const sg = cs >= 65 ? "BUY" : cs >= 50 ? "WATCH" : "AVOID";

    const sweet = opMode && (p.ds != null && p.ds >= 5) && pq >= 55;

    const dp = Math.round(CORE.filter(f => p[f] != null && p[f] !== '').length / CORE.length * 100);
    const rg = (p.er && subAvgRent[p.sb]) ? ((p.er / subAvgRent[p.sb]) - 1) * 100 : null;

    return { ...p, ...geo, cs, sg, pq, zs, ss, sweet,
             dataPct: dp, rentGap: rg,
             matYr: p.mt ? parseInt(String(p.mt).slice(-4)) || null : null };
  });
}

function buildScoredZips(layerW, zW) {
  return ZIPS.map(z => {
    const cs = scoreZip(z, MS, zW);
    const sg = cs >= 65 ? "BUY" : cs >= 50 ? "WATCH" : "AVOID";
    return { ...z, cs, sg };
  });
}

function buildScoredSubs(sW) {
  return SUBS.map(s => ({ ...s, cs: scoreSub(s, sW) }));
}


function generateSubBullets({ sub, xtra, desire, afford, lu, leasesPerMo, rank, totalSubs }) {
  const cands = [];
  const push = (type, text, priority) => cands.push({ type, text, priority });

  if (rank != null && totalSubs != null) {
    if (rank <= 3) push('good', `Ranked #${rank} of ${totalSubs} by composite score under current weights`, 100 - rank * 4);
    else if (rank >= totalSubs - 2) push('bad', `Ranked #${rank} of ${totalSubs} — bottom of the pack at current weights`, 70);
  }

  if (xtra && xtra.ptotPct != null) {
    if (xtra.ptotPct <= -20) push('good', `${xtra.ptotPct.toFixed(1)}% peak-to-trough rent decline — meaningful arithmetic upside if demand returns`, 95 + Math.abs(xtra.ptotPct + 20));
    else if (xtra.ptotPct <= -12) push('good', `${xtra.ptotPct.toFixed(1)}% peak-to-trough rent decline — material setup`, 80);
    else if (xtra.ptotPct >= -3) push('neutral', `Only ${xtra.ptotPct.toFixed(1)}% rent decline — minimal arithmetic upside, thesis hinges on growth`, 55);
  }

  if (sub.uc === 0) push('good', 'Zero UC pipeline — no new supply pressuring rents through 2027', 88);
  else if (xtra && xtra.ucPct != null) {
    if (xtra.ucPct < 3 && sub.uc < 800) push('good', `Light UC pipeline — ${fmtN(sub.uc)}u under construction (${xtra.ucPct.toFixed(1)}% of inventory)`, 72);
    else if (xtra.ucPct >= 8) push('bad', `Heavy UC pipeline — ${fmtN(sub.uc)}u under construction (${xtra.ucPct.toFixed(1)}% of inventory) ahead of deliveries`, 90);
    else if (xtra.ucPct >= 5) push('bad', `Elevated UC pipeline (${xtra.ucPct.toFixed(1)}% of inventory)`, 68);
  }

  if (xtra && xtra.t12StPct != null && xtra.t12StPct >= 4) {
    push('bad', `Construction starts running ${xtra.t12StPct.toFixed(1)}% of inventory (T12) — forward supply still arriving`, 75);
  } else if (xtra && xtra.t12St != null && xtra.t12St === 0) {
    push('good', 'No construction starts in the past 12 months — forward supply fully exhausted', 70);
  }

  if (sub.erg != null && METRO_REF.erg != null) {
    const ergDiff = sub.erg - METRO_REF.erg;
    if (sub.erg > 0) push('good', `Rents already turning positive (${sub.erg > 0 ? '+' : ''}${sub.erg.toFixed(1)}% YoY) — ahead of metro at ${METRO_REF.erg.toFixed(1)}%`, 92);
    else if (ergDiff > 4) push('good', `Rent decline shallower than metro (${sub.erg.toFixed(1)}% vs ${METRO_REF.erg.toFixed(1)}%) — recovering earlier`, 78);
    else if (sub.erg < -10) push('bad', `Rents still declining sharply (${sub.erg.toFixed(1)}% YoY) — well below metro at ${METRO_REF.erg.toFixed(1)}%`, 75);
  }

  if (sub.vac != null && METRO_REF.vac != null) {
    const vacDiff = sub.vac - METRO_REF.vac;
    if (vacDiff <= -2) push('good', `Vacancy ${sub.vac.toFixed(1)}% — ${Math.abs(vacDiff).toFixed(1)}pp tighter than metro (${METRO_REF.vac.toFixed(1)}%)`, 78);
    else if (vacDiff >= 4) push('bad', `Vacancy ${sub.vac.toFixed(1)}% — ${vacDiff.toFixed(1)}pp wider than metro (${METRO_REF.vac.toFixed(1)}%)`, 80);
  }

  if (xtra && xtra.vacGap != null && xtra.vacGap >= 3) {
    push('neutral', `Stabilized vacancy ${xtra.stabVac.toFixed(1)}% vs total ${sub.vac.toFixed(1)}% — ${xtra.vacGap.toFixed(1)}pp lease-up drag still absorbing`, 65);
  }

  if (lu) {
    if (lu.stabMonths != null && lu.stabMonths <= 12) push('good', `Lease-up + UC pool stabilizes in ${lu.stabMonths} mo at ${leasesPerMo.toFixed(1)}/mo velocity (${lu.stabQuarter})`, 85);
    else if (lu.stabMonths != null && lu.stabMonths <= 24) push('neutral', `Pool stabilization in ${lu.stabMonths} mo at ${leasesPerMo.toFixed(1)}/mo velocity (${lu.stabQuarter})`, 60);
    else if (lu.stabMonths != null) push('bad', `Slow recovery — pool stabilizes in ${lu.stabMonths} mo at current velocity (${lu.stabQuarter})`, 78);
  } else {
    push('good', 'Clean absorption profile — no active lease-up or UC overhang', 75);
  }

  if (afford && afford.ri != null) {
    if (afford.ri < 27) push('good', `Rent-to-income ${afford.ri.toFixed(1)}% — affordability headroom for rent growth`, 50);
    else if (afford.ri >= 32) push('bad', `Rent-to-income ${afford.ri.toFixed(1)}% — affordability ceiling pressing`, 58);
  }

  if (afford && afford.priceToRent != null && afford.priceToRent >= 30) {
    push('good', `Price-to-rent ${afford.priceToRent.toFixed(1)}x — owning is expensive vs renting, supports rental demand`, 48);
  }

  cands.sort((a, b) => b.priority - a.priority);
  return cands.slice(0, 5);
}

function generatePropBullets({ prop, subData }) {
  const cands = [];
  const push = (type, text, priority) => cands.push({ type, text, priority });

  if (prop.sweet) {
    push('good', `Sweet Spot — distress score ${prop.ds != null ? prop.ds.toFixed(1) : '—'}/10 meets quality score ${Math.round(prop.pq)}/100`, 95);
  }

  if (prop.ds != null && prop.ds >= 7 && !prop.sweet) {
    push('good', `High distress score ${prop.ds.toFixed(1)}/10 — refi pressure, lease-up overhang, or both`, 88);
  } else if (prop.ds != null && prop.ds >= 5 && !prop.sweet) {
    push('good', `Distress flag (${prop.ds.toFixed(1)}/10) — motivated seller potential`, 72);
  }

  try {
    const rp = refiPressure(prop);
    if (rp && rp.score >= 5.5) {
      const matY = matYear(prop.mt);
      const matText = matY != null ? `loan matures ${matY}` : 'maturity unknown';
      push('good', `Refi pressure ${rp.score.toFixed(1)}/10 — ${matText}${prop.it === 'Floating' || prop.it === 'Variable' ? ', floating rate' : ''}`, 80);
    }
  } catch (e) { /* refiPressure not yet defined at module load — falls through */ }

  if (prop.u >= 150 && prop.yb >= 2000 && (prop.sf == null || prop.sf >= 900)) {
    push('good', `Hits Atlas buy-box — ${prop.u}u, vintage ${prop.yb}${prop.sf ? `, ${prop.sf}sf avg` : ''}`, 65);
  }

  if (prop.rentGap != null) {
    if (prop.rentGap <= -5) push('good', `Rent ${Math.abs(prop.rentGap).toFixed(1)}% below submarket — value-add lift potential`, 78);
    else if (prop.rentGap >= 10) push('bad', `Rent ${prop.rentGap.toFixed(1)}% above submarket — limited room to push`, 60);
  }

  if (prop.v != null) {
    if (prop.v >= 20) push('good', `Vacancy ${prop.v.toFixed(1)}% — significant lease-up runway under new ownership`, 72);
    else if (prop.v < 5 && prop.cs >= 60) push('neutral', `Already stabilized at ${prop.v.toFixed(1)}% vacancy — limited operational lift, thesis is yield`, 50);
  }

  if (prop.cn != null && prop.cn >= 15) {
    push('good', `Concessions ${prop.cn.toFixed(1)}% — operator burn-off opportunity, pricing power on lease renewals`, 62);
  }

  if (subData) {
    if (subData.cs >= 70) push('good', `${subData.s} submarket scores ${subData.cs} — strong tailwind`, 60);
    else if (subData.cs < 50) push('bad', `${subData.s} submarket scores ${subData.cs} — fundamental headwind`, 65);
  }

  if (prop.sd) {
    const saleYr = parseInt(String(prop.sd).slice(0, 4), 10);
    if (saleYr >= 2021 && saleYr <= 2022 && (prop.it === 'Floating' || prop.it === 'Variable')) {
      push('good', `Bought at peak (${saleYr}) on floating-rate debt — likely distress at refi`, 86);
    } else if (saleYr >= 2021 && saleYr <= 2022) {
      push('neutral', `Bought at peak (${saleYr}) — basis pressure on owner`, 55);
    }
  }

  cands.sort((a, b) => b.priority - a.priority);
  return cands.slice(0, 5);
}

function buildSubConviction(sub, xtra, propCounts, buyCount, fwd, metroRef) {
  if (!sub) return null;
  const signals = [];

  if (fwd && fwd.y3) {
    const pct = fwd.y3.pct;
    const status = pct >= 1.5 ? 'good' : pct >= 0 ? 'neutral' : 'bad';
    const oneY = fwd.y1 ? `${fwd.y1.pct >= 0 ? '+' : ''}${fwd.y1.pct.toFixed(1)}% YoY` : null;
    const fiveY = fwd.y5 ? `${fwd.y5.pct.toFixed(1)}% 5Y CAGR` : null;
    signals.push({
      label: 'Growth',
      status,
      headline: `Forward 3Y rent CAGR projected at ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`,
      detail: [oneY, fiveY].filter(Boolean).join(' · ') + (pct >= 1.5 ? ' — meaningful upside' : pct >= 0 ? ' — modest growth' : ' — projected decline'),
    });
  } else {
    signals.push({ label: 'Growth', status: 'neutral', headline: 'Forward forecast unavailable for this submarket', detail: '' });
  }

  const vacGap = (metroRef && metroRef.vac != null && sub.vac != null) ? sub.vac - metroRef.vac : null;
  const ucPct = (sub.inv && sub.uc != null) ? sub.uc / sub.inv * 100 : null;
  let csStatus = 'neutral', csHead, csDetail;
  if (vacGap != null && vacGap < -2 && (ucPct == null || ucPct < 3)) {
    csStatus = 'good';
    csHead = `Vacancy ${Math.abs(vacGap).toFixed(1)}pp tighter than metro · pipeline ${ucPct != null && ucPct < 1 ? 'cleared' : 'modest'}`;
    csDetail = `${sub.vac.toFixed(1)}% vacancy vs ${metroRef.vac.toFixed(1)}% metro${ucPct != null ? ` · ${fmtN(sub.uc)} UC (${ucPct.toFixed(1)}% of inv)` : ''}`;
  } else if (vacGap != null && vacGap > 3) {
    csStatus = 'bad';
    csHead = `Vacancy ${vacGap.toFixed(1)}pp wider than metro · still working through supply`;
    csDetail = `${sub.vac.toFixed(1)}% vacancy vs ${metroRef.vac.toFixed(1)}% metro${ucPct != null && ucPct >= 3 ? ` · ${fmtN(sub.uc)} UC (${ucPct.toFixed(1)}% of inv) still arriving` : ''}`;
  } else {
    csHead = vacGap != null ? `Vacancy in line with metro (${sub.vac.toFixed(1)}% vs ${metroRef.vac.toFixed(1)}%)` : `Vacancy ${sub.vac != null ? sub.vac.toFixed(1) + '%' : '—'}`;
    csDetail = ucPct != null ? `Pipeline: ${fmtN(sub.uc)}u UC (${ucPct.toFixed(1)}% of inv)` : '';
  }
  if (sub.t4a != null && sub.t4d != null) {
    const ratioStr = sub.t4d > 0 ? ` · ${(sub.t4a/sub.t4d).toFixed(2)}x A/D` : sub.t4a > 0 ? ' · absorbing without new supply' : '';
    csDetail += `${csDetail ? ' · ' : ''}T12 ${sub.t4a > 0 ? '+' : ''}${fmtN(sub.t4a)} absorbed against ${fmtN(sub.t4d)} delivered${ratioStr}`;
  }
  signals.push({ label: 'Current State', status: csStatus, headline: csHead, detail: csDetail });

  const sg = sub.cs >= 65 ? 'BUY' : sub.cs >= 50 ? 'WATCH' : 'AVOID';
  const convStatus = sg === 'BUY' ? 'good' : sg === 'WATCH' ? 'neutral' : 'bad';
  const propTotal = propCounts ? propCounts.p : 0;
  signals.push({
    label: 'Conviction',
    status: convStatus,
    headline: `Composite ${sub.cs} · ${sg} signal${buyCount > 0 ? ` · ${buyCount} of ${propTotal} properties screen as BUY` : propTotal > 0 ? ` · ${propTotal} screened properties` : ''}`,
    detail: sg === 'BUY' ? 'Atlas model favors this submarket under current weights' :
            sg === 'WATCH' ? 'Mixed signals — worth watching as fundamentals develop' :
            'Below conviction threshold — fundamentals weak under current weights',
  });

  return { signals, footer: 'Drill into Top Zips below to identify which neighborhoods anchor the conviction.' };
}

function buildZipConviction(zip, parentSubScore, allZipsInSub) {
  if (!zip) return null;
  const signals = [];

  if (zip.pg != null) {
    const status = zip.pg >= 10 ? 'good' : zip.pg >= 0 ? 'neutral' : 'bad';
    signals.push({
      label: 'Growth',
      status,
      headline: `Population grew ${zip.pg >= 0 ? '+' : ''}${zip.pg.toFixed(1)}% over 4 years (2020-2024)`,
      detail: zip.ms?.ht != null ? `HiTech employment ${zip.ms.ht}% · jobs/1k ${zip.ms.jo != null ? Math.round(zip.ms.jo) : '—'}` : '',
    });
  }

  const renterPct = zip.rp;
  const mi = zip.mi;
  let csStatus = 'neutral', csHead, csDetail;
  if (renterPct != null && mi != null) {
    if (renterPct >= 50 && mi >= 90000) {
      csStatus = 'good';
      csHead = `Renter-heavy zip (${renterPct.toFixed(0)}% renters) with strong income (${fmt$(mi)})`;
    } else if (renterPct < 25) {
      csStatus = 'bad';
      csHead = `Owner-dominant zip (${renterPct.toFixed(0)}% renters) — thin renter pool`;
    } else {
      csHead = `${renterPct.toFixed(0)}% renters · median income ${fmt$(mi)}`;
    }
    csDetail = zip.ms?.rb != null ? `Rent-burdened: ${zip.ms.rb}% of HH spend 30%+ on rent` : '';
  } else {
    csHead = 'Demographics partially available';
    csDetail = '';
  }
  signals.push({ label: 'Current State', status: csStatus, headline: csHead, detail: csDetail });

  const sg = zip.cs >= 65 ? 'BUY' : zip.cs >= 50 ? 'WATCH' : 'AVOID';
  const convStatus = sg === 'BUY' ? 'good' : sg === 'WATCH' ? 'neutral' : 'bad';
  let rankNote = '';
  if (allZipsInSub && allZipsInSub.length > 1) {
    const rank = allZipsInSub.findIndex(z => z.z === zip.z) + 1;
    if (rank > 0) rankNote = ` · #${rank} of ${allZipsInSub.length} in ${zip.sb}`;
  }
  signals.push({
    label: 'Conviction',
    status: convStatus,
    headline: `Composite ${zip.cs} · ${sg}${rankNote}`,
    detail: `${zip.p} Atlas ${zip.p === 1 ? 'property' : 'properties'} (${fmtN(zip.u)} units) sit in this zip${parentSubScore != null ? ` · parent submarket score ${parentSubScore}` : ''}`,
  });

  return { signals, footer: 'Drill into the property roster below to evaluate specific deals in this zip.' };
}

function buildPropsConviction(filteredProps, contextLabel) {
  if (!filteredProps || filteredProps.length === 0) return null;
  const buyCount = filteredProps.filter(p => p.sg === 'BUY').length;
  const watchCount = filteredProps.filter(p => p.sg === 'WATCH').length;
  const distressCount = filteredProps.filter(p => (p.ds || 0) >= 5).length;
  const sweetCount = filteredProps.filter(p => p.sweet).length;
  const totalUnits = filteredProps.reduce((s, p) => s + (p.u || 0), 0);
  const avgComp = filteredProps.reduce((s, p) => s + (p.cs || 0), 0) / filteredProps.length;

  const signals = [];

  signals.push({
    label: 'Universe',
    status: filteredProps.length >= 10 ? 'good' : filteredProps.length >= 3 ? 'neutral' : 'bad',
    headline: `${filteredProps.length} ${filteredProps.length === 1 ? 'property' : 'properties'} · ${fmtN(totalUnits)} units${contextLabel ? ` in ${contextLabel}` : ''}`,
    detail: `Average composite ${avgComp.toFixed(0)} across the filtered set`,
  });

  const buyPct = (buyCount / filteredProps.length) * 100;
  const status = buyPct >= 30 ? 'good' : buyPct >= 10 ? 'neutral' : 'bad';
  signals.push({
    label: 'Signal Mix',
    status,
    headline: `${buyCount} BUY · ${watchCount} WATCH · ${filteredProps.length - buyCount - watchCount} below threshold`,
    detail: distressCount > 0 || sweetCount > 0
      ? `${distressCount > 0 ? `${distressCount} distress-flagged` : ''}${distressCount > 0 && sweetCount > 0 ? ' · ' : ''}${sweetCount > 0 ? `${sweetCount} Sweet Spot${sweetCount === 1 ? '' : 's'}` : ''}`
      : 'No distress or sweet-spot flags in this set',
  });

  const topProp = filteredProps[0];
  if (topProp) {
    signals.push({
      label: 'Lead Candidate',
      status: topProp.sg === 'BUY' ? 'good' : topProp.sg === 'WATCH' ? 'neutral' : 'bad',
      headline: `${topProp.n} · composite ${topProp.cs} · ${topProp.sg}`,
      detail: `${topProp.u} units · ${topProp.cl ? `Class ${topProp.cl}` : ''}${topProp.yb ? ` · YOC ${topProp.yb}` : ''}${topProp.er ? ` · ${fmtRent(topProp.er)} avg rent` : ''}`,
    });
  }

  return { signals, footer: 'Click any property below to open the full screening card with refi pressure, cost-to-own gap, and value-add thesis.' };
}





const METHODOLOGY={composite:"Composite score blends three layers with default weights 25/40/35 (submarket/zip/property). BUY at composite ≥65, WATCH 50-64, AVOID <50. Thresholds calibrated to Austin's distribution — tighter than SWFL (which used 75/55) because Austin's scoring range concentrates 40-75 rather than spreading wider. The thesis here is best pockets of a premium market, not timing a distressed trough.",submarket:"Submarket score weights Vacancy 30%, ERG 30%, UC/Inventory ratio 25%, Absorption/Delivery ratio 15%. Purely operational diagnostic — captures current health and forward supply pressure.",zip:"Zip score weights 16 factors led by HiTech% (14), PopGrowth (12), Pipeline (12, inverted), Renter% (12). Added Market Stadium Forecast Score (8) as the only forward-looking factor. Dropped four factors during collinearity audit (Education, HomeValueGrowth, GrossRent, MedianIncome — all redundant with retained factors).",property:"Property quality weights Units (20), Vacancy (18, inv), Vintage (15), Class (13), UnitSF (12), Concessions (12, inv), Rent/SF (10). Calibrated to Atlas buy-box: 150+ units, 2000+ vintage, 900+ SF.",distress:"Distress score (ds, 0-10 scale) from CoStar loan data: variable rate + maturity ≤2027 (+20), maturity ≤2026 (+10), vacancy >20% (+10), concessions >15% (+10), 2021-22 peak purchase (+15). Normalized to 0-10. Austin has limited distress pool (only 8 properties at ds≥5) — reflects structural health of owner base.",opportunistic:"Opportunistic Mode blends distress (55%) with property quality (45%) for the property score layer. Sweet Spots flag properties where ds≥5 meets pq≥55 — surfaces Dylan's 'suburban zero-supply with motivated seller' thesis targets. Austin yields 7 sweet spots, 5 in core suburban thesis zones."};

const T = {
  bg: '#EDF0F8',
  bg2: '#FFFFFF',
  bg3: '#F5F7FC',
  bgDark: '#090E41',
  bgDark2: '#0F176D',

  tx: '#090E41',
  tx2: '#4A5280',
  tx3: '#8B92A8',
  txLt: '#FFFFFF',

  bd: '#D4DFF1',
  bd2: '#E7EDF7',
  bdStrong: '#AFCBFF',

  accent: '#AFCBFF',
  accent2: '#7BA9FF',
  accentDk: '#0F176D',

  buyBg: '#E8F3EC',   buyTx: '#1A5A3A',   buyBd: '#B5D4C0',
  watchBg: '#FDF4E3', watchTx: '#8B5A1A', watchBd: '#EED9A8',
  avoidBg: '#FAEBEB', avoidTx: '#8B2F2F', avoidBd: '#E5B6B6',

  chart1: '#090E41',
  chart2: '#AFCBFF',
  chart3: '#7BA9FF',
  chart4: '#0F176D',
  chartPos: '#1A5A3A',
  chartNeg: '#8B2F2F',
  chartGrid: '#D4DFF1',

  radius: 2,
  radiusLg: 4,
  shadow: '0 1px 2px 0 rgba(9, 14, 65, 0.05), 0 1px 3px 0 rgba(9, 14, 65, 0.04)',
  shadowHv: '0 2px 4px 0 rgba(9, 14, 65, 0.08), 0 4px 8px 0 rgba(9, 14, 65, 0.06)',

  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif',
};

let TODAY_Q = '26Q2';        // per-market: overridden by _market.todayQuarter in hydrate()
let TODAY_LABEL = 'May 2026'; // per-market: overridden by _market.todayLabel in hydrate()



const fmt$ = n => n == null ? '—' : n >= 1e9 ? `$${(n/1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n/1e3).toFixed(0)}K` : `$${n.toFixed(0)}`;
const fmtRent = n => n == null ? '—' : n >= 1e3 ? `$${(n/1e3).toFixed(1)}K` : `$${n.toFixed(0)}`;
const fmt$u = n => n == null ? '—' : n >= 1e6 ? `$${(n/1e6).toFixed(2)}M` : `$${Math.round(n/1e3)}K`;
const fmtPct = (n, d = 1) => n == null ? '—' : `${n.toFixed(d)}%`;
const fmtPctD = n => n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
const fmtK = n => n == null ? '—' : n >= 1e6 ? `${(n/1e6).toFixed(2)}M` : n >= 1e3 ? `${(n/1e3).toFixed(n >= 10e3 ? 0 : 1)}K` : String(Math.round(n));
const fmtN = n => n == null ? '—' : n.toLocaleString('en-US');
const fmtBps = n => n == null ? '—' : `${n > 0 ? '+' : ''}${Math.round(n * 100)}bps`;

const Card = ({ title, subtitle, right, children, padding = 20, style = {}, titleInfo }) => (
  <div style={{
    background: T.bg2,
    border: `1px solid ${T.bd}`,
    borderRadius: T.radius,
    boxShadow: T.shadow,
    ...style,
  }}>
    {(title || right) && (
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        padding: `${padding * 0.75}px ${padding}px`,
        borderBottom: `1px solid ${T.bd2}`,
      }}>
        <div>
          {title && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.tx, lineHeight: 1.2 }}>{title}</div>
              {titleInfo && <InfoTip text={titleInfo} />}
            </div>
          )}
          {subtitle && <div style={{ fontSize: 11, color: T.tx2, marginTop: 2, lineHeight: 1.35 }}>{subtitle}</div>}
        </div>
        {right}
      </div>
    )}
    <div style={{ padding }}>{children}</div>
  </div>
);

const Metric = ({ label, value, delta, subValue, size = 'md', info, spark }) => {
  const vSize = size === 'lg' ? 24 : size === 'sm' ? 15 : 19;
  const lSize = size === 'lg' ? 11 : 10;
  return (
    <div>
      <div style={{
        fontSize: lSize, fontWeight: 600, color: T.tx2, textTransform: 'uppercase',
        letterSpacing: 0.5, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4,
      }}>
        {label}
        {info && <InfoTip text={info} />}
      </div>
      <div style={{ fontSize: vSize, fontWeight: 600, color: T.tx, lineHeight: 1.1 }}>{value}</div>
      {(delta != null || subValue) && (
        <div style={{ fontSize: 11, color: T.tx2, marginTop: 3 }}>
          {delta != null && (
            <span style={{
              color: delta > 0 ? T.chartPos : delta < 0 ? T.chartNeg : T.tx2,
              fontWeight: 600, marginRight: subValue ? 6 : 0,
            }}>
              {delta > 0 ? '↑' : delta < 0 ? '↓' : ''} {Math.abs(delta).toFixed(1)}%
            </span>
          )}
          {subValue}
        </div>
      )}
      {spark && spark.data && (
        <div style={{ marginTop: 6 }}>
          <Sparkline data={spark.data} width={spark.width || 88} height={spark.height || 20} color={spark.color || 'auto'} />
        </div>
      )}
    </div>
  );
};

const Pill = ({ signal, size = 'md' }) => {
  const sigMap = {
    BUY:    { bg: T.buyBg,   tx: T.buyTx,   bd: T.buyBd },
    WATCH:  { bg: T.watchBg, tx: T.watchTx, bd: T.watchBd },
    AVOID:  { bg: T.avoidBg, tx: T.avoidTx, bd: T.avoidBd },
  };
  const s = sigMap[signal] || sigMap.WATCH;
  const pad = size === 'sm' ? '1px 6px' : '2px 8px';
  const fs = size === 'sm' ? 10 : 11;
  return (
    <span style={{
      display: 'inline-block', padding: pad, borderRadius: T.radius,
      background: s.bg, color: s.tx, border: `1px solid ${s.bd}`,
      fontSize: fs, fontWeight: 700, letterSpacing: 0.3,
    }}>{signal}</span>
  );
};

const SweetBadge = () => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 3,
    padding: '1px 6px', borderRadius: T.radius,
    background: T.bgDark, color: T.accent,
    fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
  }}>
    <Target size={10} /> SWEET
  </span>
);

const InfoTip = ({ text }) => {
  const [open, setOpen] = useState(false);
  return (
    <span
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      style={{ display: 'inline-block', position: 'relative', cursor: 'help' }}
    >
      <Info size={12} style={{ color: T.tx3, verticalAlign: 'middle' }} />
      {open && (
        <span style={{
          position: 'absolute', zIndex: 50, bottom: '100%', left: '50%',
          transform: 'translateX(-50%) translateY(-4px)',
          background: T.bgDark, color: T.txLt,
          padding: '8px 10px', borderRadius: T.radius,
          fontSize: 11, lineHeight: 1.45, fontWeight: 400,
          width: 280, boxShadow: T.shadowHv,
          textTransform: 'none', letterSpacing: 0,
          pointerEvents: 'none',
        }}>{text}</span>
      )}
    </span>
  );
};

const ScoringHelp = ({ scope = 'composite' }) => {
  const [open, setOpen] = useState(false);
  const copy = {
    composite: {
      title: 'How layer weights work',
      lines: [
        'These three sliders set the relative pull of each scoring layer (Submarket, Zip, Property). They are NOT percentages and they do NOT sum to 100.',
        'Increasing one slider does not lower the others. The composite is a weighted average where every slider value contributes against the running total of all sliders.',
        'Example: weights of 25 / 40 / 35 give the same blend as 50 / 80 / 70. What matters is the ratio between sliders, not the absolute numbers.',
        'To test sensitivity, move ONE slider at a time. To zero out a layer, drag it to 0 — the other two will fully share the composite.',
      ],
    },
    factor: {
      title: 'How factor weights work',
      lines: [
        'Each slider sets the relative pull of a single factor inside its scoring layer. Sliders are NOT percentages and they do NOT need to sum to anything.',
        'Increasing one slider does not lower the others. The score is a weighted average — every slider contributes against the running total of all sliders in the layer.',
        'Bigger ratio between two sliders = bigger gap in their influence. A factor at 15 has 3× the pull of a factor at 5, regardless of what the other sliders read.',
        'To isolate the effect of one factor, move it alone and watch the rankings shift. To remove a factor entirely, drag it to 0.',
        'Properties with missing data on a given factor are skipped, so weighting up a factor with sparse data won\'t penalize properties that lack it.',
      ],
    },
  };
  const c = copy[scope] || copy.composite;
  return (
    <span
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, position: 'relative', cursor: 'help' }}
    >
      <Info size={13} style={{ color: T.accent }} />
      <span style={{ fontSize: 11, color: T.accent, fontWeight: 600, textTransform: 'none', letterSpacing: 0.2, textDecoration: 'underline dotted', textUnderlineOffset: 2 }}>
        How weights work
      </span>
      {open && (
        <span style={{
          position: 'absolute', zIndex: 60, top: '100%', left: 0,
          transform: 'translateY(6px)',
          background: T.bg2, color: T.tx,
          border: `1px solid ${T.bd}`,
          padding: '14px 16px', borderRadius: T.radius,
          fontSize: 11.5, lineHeight: 1.55, fontWeight: 400,
          width: 420, boxShadow: T.shadowHv,
          textTransform: 'none', letterSpacing: 0,
          pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 10, color: T.accentDk, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 }}>{c.title}</div>
          {c.lines.map((line, i) => (
            <div key={i} style={{ marginBottom: i < c.lines.length - 1 ? 8 : 0, color: T.tx }}>{line}</div>
          ))}
        </span>
      )}
    </span>
  );
};

const SparkLine = ({ data, color = T.chart1, h = 24, w = 60 }) => {
  if (!data || data.length < 2) return null;
  const vals = data.filter(v => v != null && !isNaN(v));
  if (!vals.length) return null;
  const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1;
  const pts = data.map((v, i) => {
    if (v == null || isNaN(v)) return null;
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).filter(Boolean).join(' ');
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
};

const Bar = ({ value, max, color = T.chart1, h = 6, label, labelRight }) => {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div>
      {(label || labelRight) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.tx2, marginBottom: 3 }}>
          <span>{label}</span>
          <span style={{ color: T.tx, fontWeight: 600 }}>{labelRight}</span>
        </div>
      )}
      <div style={{ background: T.bd2, borderRadius: h/2, height: h, overflow: 'hidden' }}>
        <div style={{ background: color, height: '100%', width: `${pct}%`, borderRadius: h/2 }} />
      </div>
    </div>
  );
};

const SectionHeader = ({ title, subtitle, right }) => (
  <div style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
    <div>
      <div style={{ fontSize: 20, fontWeight: 600, color: T.tx, letterSpacing: -0.2, lineHeight: 1.15 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 13, color: T.tx2, marginTop: 4 }}>{subtitle}</div>}
    </div>
    {right}
  </div>
);

const Grid = ({ cols = 3, gap = 16, children, style = {} }) => (
  <div style={{
    display: 'grid',
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
    gap,
    ...style,
  }}>{children}</div>
);

const Sparkline = ({ data, width = 88, height = 22, color = T.accentDk, fill = true, threshold = null }) => {
  if (!data || data.length < 2) return null;
  const clean = data.map(v => (v == null || isNaN(v)) ? null : Number(v));
  const valid = clean.filter(v => v != null);
  if (valid.length < 2) return null;
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;
  const fc = color === 'auto'
    ? (valid[valid.length - 1] >= valid[0] ? T.buyTx : T.chartNeg)
    : color;
  const pts = clean.map((v, i) => {
    if (v == null) return null;
    const x = (i / (clean.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return { x, y };
  });
  let d = '';
  let prev = null;
  for (const p of pts) {
    if (p == null) { prev = null; continue; }
    d += (prev == null ? `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}` : ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
    prev = p;
  }
  const lastIdx = pts.map((p, i) => p ? i : -1).reduce((a, b) => Math.max(a, b), -1);
  const last = lastIdx >= 0 ? pts[lastIdx] : null;
  const firstIdx = pts.findIndex(p => p);
  const first = firstIdx >= 0 ? pts[firstIdx] : null;
  return (
    <svg width={width} height={height} style={{ display: 'block' }} viewBox={`0 0 ${width} ${height}`}>
      {fill && first && last && (
        <path d={`${d} L ${last.x.toFixed(1)} ${height} L ${first.x.toFixed(1)} ${height} Z`} fill={fc} fillOpacity={0.12} />
      )}
      {threshold != null && (
        <line
          x1={0} x2={width}
          y1={height - ((threshold - min) / range) * (height - 2) - 1}
          y2={height - ((threshold - min) / range) * (height - 2) - 1}
          stroke={T.tx3} strokeWidth={0.6} strokeDasharray="2 2"
        />
      )}
      <path d={d} fill="none" stroke={fc} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
      {last && <circle cx={last.x} cy={last.y} r={1.7} fill={fc} />}
    </svg>
  );
};

const QuickRead = ({ bullets, title = 'Quick Read', subtitle, asOf }) => {
  if (!bullets || bullets.length === 0) return null;
  const iconFor = (type) => {
    if (type === 'good')    return { ch: '✓', color: T.buyTx };
    if (type === 'bad')     return { ch: '✗', color: T.chartNeg };
    return { ch: '→', color: T.accentDk };
  };
  return (
    <Card padding={0} style={{ background: T.bg2, borderLeft: `3px solid ${T.accentDk}` }}>
      <div style={{ padding: '10px 18px 8px 18px', borderBottom: `1px solid ${T.bd2}`, background: T.bg3 }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, color: T.accentDk, letterSpacing: 1, textTransform: 'uppercase' }}>
          {title}
          {asOf && <span style={{ color: T.tx3, fontWeight: 500, fontStyle: 'italic', letterSpacing: 0.3, marginLeft: 8, textTransform: 'none' }}>{asOf}</span>}
        </div>
        {subtitle && <div style={{ fontSize: 10.5, color: T.tx2, marginTop: 2 }}>{subtitle}</div>}
      </div>
      <ul style={{ margin: 0, padding: '12px 18px', listStyle: 'none' }}>
        {bullets.map((b, i) => {
          const ic = iconFor(b.type);
          return (
            <li key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              fontSize: 12.5, color: T.tx, lineHeight: 1.5,
              paddingTop: i === 0 ? 0 : 6, paddingBottom: i === bullets.length - 1 ? 0 : 6,
              borderTop: i === 0 ? 'none' : `1px solid ${T.bd2}`,
            }}>
              <span style={{
                color: ic.color, fontWeight: 800, fontSize: 14, lineHeight: 1.3,
                width: 14, textAlign: 'center', flexShrink: 0, fontVariantNumeric: 'tabular-nums',
              }}>{ic.ch}</span>
              <span>{b.text}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
};

const ConvictionHeader = ({ title, subtitle, signals, footer }) => {
  if (!signals || signals.length === 0) return null;
  const colorFor = (s) => s === 'good' ? T.buyTx : s === 'bad' ? T.chartNeg : T.watchTx;
  const bgFor    = (s) => s === 'good' ? T.buyBg : s === 'bad' ? '#FEEFEF'    : T.watchBg;
  return (
    <Card padding={0} style={{ background: T.bg2, borderLeft: `3px solid ${T.accentDk}`, overflow: 'hidden' }}>
      <div style={{ padding: '10px 18px 8px 18px', borderBottom: `1px solid ${T.bd2}`, background: T.bg3 }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, color: T.accentDk, letterSpacing: 1, textTransform: 'uppercase' }}>
          {title || 'Conviction'}
        </div>
        {subtitle && <div style={{ fontSize: 10.5, color: T.tx2, marginTop: 2 }}>{subtitle}</div>}
      </div>
      <div>
        {signals.map((s, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'flex-start', gap: 12,
            padding: '10px 18px',
            borderTop: i === 0 ? 'none' : `1px solid ${T.bd2}`,
            background: 'transparent',
          }}>
            <div style={{
              flex: '0 0 auto', width: 6, alignSelf: 'stretch',
              background: colorFor(s.status), borderRadius: 1, marginTop: 2,
            }} />
            <div style={{ flex: '0 0 auto', width: 110 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: colorFor(s.status), letterSpacing: 0.7, textTransform: 'uppercase', lineHeight: 1.4 }}>
                {s.label}
              </div>
            </div>
            <div style={{ flex: '1 1 auto', minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: T.tx, lineHeight: 1.4 }}>
                {s.headline}
              </div>
              {s.detail && (
                <div style={{ fontSize: 11, color: T.tx2, marginTop: 2, lineHeight: 1.45 }}>
                  {s.detail}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      {footer && (
        <div style={{ padding: '8px 18px 10px 18px', borderTop: `1px solid ${T.bd2}`, background: T.bg3, fontSize: 11, color: T.tx2, lineHeight: 1.5 }}>
          {footer}
        </div>
      )}
    </Card>
  );
};

const Slider = ({ label, value, onChange, min = 0, max = 100, step = 1, hint, info, suffix = '' }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
      <span style={{ fontSize: 11.5, color: T.tx, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
        {label}
        {info && <InfoTip text={info} />}
      </span>
      <span style={{
        fontSize: 11.5, color: T.accentDk, fontWeight: 700,
        fontVariantNumeric: 'tabular-nums',
        background: T.bg3, padding: '1px 7px', borderRadius: T.radius,
        minWidth: 32, textAlign: 'center',
      }}>{value}{suffix}</span>
    </div>
    <input
      type="range"
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      min={min}
      max={max}
      step={step}
      style={{
        width: '100%',
        accentColor: T.accentDk,
        cursor: 'pointer',
        height: 4,
      }}
    />
    {hint && <div style={{ fontSize: 10, color: T.tx3, marginTop: 3 }}>{hint}</div>}
  </div>
);

const Toggle = ({ label, value, onChange, hint, info }) => (
  <div style={{ marginBottom: 14 }}>
    <div
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
      onClick={() => onChange(!value)}
    >
      <span style={{ fontSize: 11.5, color: T.tx, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
        {label}
        {info && <InfoTip text={info} />}
      </span>
      <div style={{
        width: 36, height: 20, borderRadius: 10, position: 'relative',
        background: value ? T.accentDk : T.bd,
        transition: 'background 140ms',
        flexShrink: 0,
      }}>
        <div style={{
          width: 16, height: 16, borderRadius: '50%', background: T.bg2,
          position: 'absolute', top: 2, left: value ? 18 : 2,
          transition: 'left 140ms',
          boxShadow: T.shadow,
        }} />
      </div>
    </div>
    {hint && <div style={{ fontSize: 10, color: T.tx3, marginTop: 4 }}>{hint}</div>}
  </div>
);

const ScoringPanel = ({ layerW, setLayerW, opMode, setOpMode, resetScoring, title = 'Scoring Controls', compact = false }) => {
  const [subW, zipW, propW] = layerW;
  return (
    <Card title={title} subtitle="Tune weights — rankings update live" padding={compact ? 16 : 20}
      right={
        <button onClick={resetScoring} style={{
          background: 'transparent', border: `1px solid ${T.bd}`, borderRadius: T.radius,
          padding: '4px 10px', fontSize: 11, color: T.tx2, cursor: 'pointer',
          fontFamily: T.fontFamily, fontWeight: 500,
        }}>Reset</button>
      }
    >
      <div style={{ fontSize: 10, color: T.tx2, letterSpacing: 0.5, fontWeight: 600, textTransform: 'uppercase', marginBottom: 10 }}>
        Composite Layer Weights
      </div>
      <Slider
        label="Submarket weight"
        value={subW}
        onChange={v => setLayerW([v, zipW, propW])}
        info="How much of each property's composite score comes from its submarket's operating fundamentals (vacancy, ERG, UC, A/D ratio). Default 25."
      />
      <Slider
        label="Zip weight"
        value={zipW}
        onChange={v => setLayerW([subW, v, propW])}
        info="How much of the composite comes from the zip code's demographic quality (tech workers, population growth, income, schools, walkability). 16-factor model. Default 40."
      />
      <Slider
        label="Property weight"
        value={propW}
        onChange={v => setLayerW([subW, zipW, v])}
        info="How much of the composite comes from the property's own quality metrics (size, vintage, vacancy, concessions, class, rent productivity). Default 35."
      />
      <div style={{ fontSize: 10, color: T.tx3, marginTop: 4, marginBottom: 14, padding: '6px 8px', background: T.bg3, borderRadius: T.radius }}>
        Weights normalize automatically — sum need not equal 100.
      </div>
      <div style={{ borderTop: `1px solid ${T.bd2}`, paddingTop: 14 }}>
        <div style={{ fontSize: 10, color: T.tx2, letterSpacing: 0.5, fontWeight: 600, textTransform: 'uppercase', marginBottom: 10 }}>
          Mode
        </div>
        <Toggle
          label="Opportunistic Mode"
          value={opMode}
          onChange={setOpMode}
          info="Blends 55% distress score + 45% property quality. Surfaces motivated-seller opportunities even when property quality is average. Default: off."
          hint={opMode ? 'Distress weighting active — sweet spots amplified' : 'Standard scoring — pure quality signal'}
        />
      </div>
    </Card>
  );
};

const GLOSSARY = [
  { term: 'ERG', def: 'Effective Rent Growth. Year-over-year change in net rent after concessions.' },
  { term: 'UC', def: 'Units Under Construction. New apartment units currently being built within a market.' },
  { term: 'A/D Ratio', def: 'Absorption-to-Delivery ratio. Units leased ÷ units delivered. Above 1.0 = demand exceeds supply.' },
  { term: 'Concessions', def: 'Free rent offered to attract tenants, measured as % of asking rent or as days of free rent.' },
  { term: 'Cap Rate', def: 'Capitalization rate. Annual Net Operating Income ÷ purchase price. Lower cap = higher price.' },
  { term: 'NOI', def: 'Net Operating Income. Property revenue less operating expenses (excludes debt service and capex).' },
  { term: 'LTV', def: 'Loan-to-Value. Loan balance ÷ property value. 60% LTV = 60¢ of debt per $1 of value.' },
  { term: 'DSCR', def: 'Debt Service Coverage Ratio. NOI ÷ annual debt payment. Lenders typically require 1.20× minimum.' },
  { term: 'Rent/SF', def: 'Rent per square foot. Monthly rent ÷ unit size. Measures revenue productivity per leasable foot.' },
  { term: 'Vintage', def: 'Year the property was built. Atlas buy-box targets 2000 or later.' },
  { term: 'Buy Box', def: 'Atlas acquisition criteria: 150+ units, built 2000 or later, average unit 900+ SF, in thesis-aligned submarkets.' },
  { term: 'Composite Score', def: 'Blended property score 0-100 across three layers (submarket 25% / zip 40% / property 35% default). BUY ≥ 65, WATCH 50-64, AVOID <50.' },
];

const TABS = [
  { id: 'exec',     label: 'Exec Summary',      icon: Home },
  { id: 'supply',   label: 'Supply & Demand',   icon: TrendingUp },
  { id: 'rent',     label: 'Rent & Revenue',    icon: DollarSign },
  { id: 'fund',     label: 'Market Fundamentals', icon: BarChart3 },
  { id: 'sub',      label: 'Submarket',         icon: MapPin },
  { id: 'zip',      label: 'Zip Analysis',      icon: LineChartIcon },
  { id: 'props',    label: 'Property Pipeline', icon: Building2 },
  { id: 'leaseup',  label: 'Lease-Up',          icon: TrendingUp },
  { id: 'cap',      label: 'Capital Markets',   icon: Landmark },
];

const TabNav = ({ tab, setTab }) => (
  <div style={{
    background: T.bg2, borderBottom: `1px solid ${T.bd}`,
    position: 'sticky', top: 0, zIndex: 30,
  }}>
    <div style={{
      maxWidth: 1400, margin: '0 auto', padding: '0 24px',
      display: 'flex', gap: 0, overflowX: 'auto',
    }}>
      {TABS.map(t => {
        const Icon = t.icon;
        const active = tab === t.id;
        return (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '14px 14px', border: 'none', background: 'none',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 12.5, fontWeight: active ? 600 : 500,
              color: active ? T.tx : T.tx2,
              borderBottom: `2px solid ${active ? T.accentDk : 'transparent'}`,
              whiteSpace: 'nowrap', fontFamily: T.fontFamily,
              transition: 'color 120ms',
            }}
          >
            <Icon size={14} /> {t.label}
          </button>
        );
      })}
    </div>
  </div>
);

const Header = ({ asOf }) => (
  <div style={{ background: T.bgDark, color: T.txLt }}>
    <div style={{
      maxWidth: 1400, margin: '0 auto', padding: '18px 24px',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
    }}>
      <div>
        <div style={{ fontSize: 10, letterSpacing: 1.5, fontWeight: 600, color: T.accent, textTransform: 'uppercase' }}>
          Atlas Real Estate Partners — Acquisitions
        </div>
        <div style={{ fontSize: 24, fontWeight: 600, marginTop: 4, letterSpacing: -0.3 }}>
          Austin Multifamily — Deal Intelligence
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 11, color: T.accent, letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: 600 }}>
          As of
        </div>
        <div style={{ fontSize: 13, fontWeight: 500, marginTop: 2 }}>{asOf}</div>
      </div>
    </div>
  </div>
);

function ExecSummaryTab({ setTab, layerW, opMode, zipFactorW, propFactorW, subFactorW, navigateTo, setSelectedSubModal,
                         leasesPerMo, preLeasedUC, stabThresh }) {
  const stats = useMemo(() => {
    const sp = buildScoredProps(layerW, opMode, zipFactorW, propFactorW, subFactorW);
    const buys = sp.filter(p => p.sg === 'BUY');
    const buyCount = buys.length;
    const avoids = sp.filter(p => p.sg === 'AVOID').length;
    const sweet = buildScoredProps(layerW, true, zipFactorW, propFactorW, subFactorW).filter(p => p.sweet).length;
    const peakDel = Math.max(...ANN.map(x => x.d || 0));
    const peakRow = ANN.find(x => x.d === peakDel);
    const y2026 = ANN.find(x => x.y === '2026');
    const totalUnits = PROPS.reduce((a, p) => a + (p.u || 0), 0);

    const buyBox = buys.filter(p => p.u >= 150 && p.yb >= 2000 && (p.sf || 0) >= 900);
    const bbUnits = buyBox.reduce((a, p) => a + (p.u || 0), 0);
    let totalValueLow = 0, totalValueMid = 0, totalValueHigh = 0;
    for (const p of buyBox) {
      const est = expectedPpu(p);
      totalValueLow  += est.totalValueLow;
      totalValueMid  += est.totalValueMid;
      totalValueHigh += est.totalValueHigh;
    }
    const avgPxMid = bbUnits > 0 ? totalValueMid / bbUnits : 0;
    const equity = totalValueMid * 0.40;

    const distressedBuy = sp.filter(p => p.sg === 'BUY' && p.ds >= 5).length;

    return {
      propCount: PROPS.length,
      totalUnits,
      buys: buyCount, avoids, sweet,
      peakDel, peakYr: peakRow?.y,
      del26: y2026?.d, abs26: y2026?.a,
      supplyCliff: peakDel && y2026?.d ? ((peakDel - y2026.d) / peakDel * 100).toFixed(0) : '—',
      buyBoxCount: buyBox.length, bbUnits,
      totalValue: totalValueMid, totalValueLow, totalValueHigh,
      equity, pxPerUnit: avgPxMid,
      distressedBuy,
      zipsScored: ZIPS.length,
    };
  }, [layerW, opMode, zipFactorW, propFactorW, subFactorW]);

  const whereToBuy = useMemo(() => {
    const sp = buildScoredProps(layerW, opMode, zipFactorW, propFactorW, subFactorW);
    const propsByZip = {};
    const unitsByZip = {};
    PROPS.forEach(p => {
      if (!p.z) return;
      propsByZip[p.z] = (propsByZip[p.z] || 0) + 1;
      unitsByZip[p.z] = (unitsByZip[p.z] || 0) + (p.u || 0);
    });
    const topSubs = buildScoredSubs(subFactorW).sort((a, b) => b.cs - a.cs).slice(0, 5);
    const topZips = buildScoredZips(layerW, zipFactorW)
      .map(z => ({ ...z, propCount: propsByZip[z.z] || 0, unitCount: unitsByZip[z.z] || 0 }))
      .filter(z => z.propCount > 0)
      .sort((a, b) => b.cs - a.cs).slice(0, 7);
    const topProps = sp.filter(p => p.sg === 'BUY').sort((a, b) => b.cs - a.cs).slice(0, 7);
    return { topSubs, topZips, topProps };
  }, [layerW, opMode, zipFactorW, propFactorW, subFactorW]);

  return (
    <div>
      {/* Hero: thesis headline */}
      <Card padding={28} style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: T.tx2, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 600, marginBottom: 8 }}>
          Investment Thesis · {TODAY_LABEL}
        </div>
        <div style={{ fontSize: 26, lineHeight: 1.25, color: T.tx, fontWeight: 600, letterSpacing: -0.3, marginBottom: 20 }}>
          Austin is at a supply-cliff inflection. 2026 is the first year absorption exceeds deliveries since 2022.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, paddingTop: 16, borderTop: `1px solid ${T.bd2}` }}>
          <Metric label="Green Street Grade" value="A" subValue="Rank 9 of 50 markets" info={DV.gs} />
          <Metric label="Pop Growth Forecast" value="#1 / 50" subValue="5-year projection" info={DV.gs} />
          <Metric label="Supply Cliff 2024→2026" value={`-${stats.supplyCliff}%`} subValue={`${fmtN(stats.peakDel)} → ${fmtN(stats.del26)} units`} info={DV.ann} />
          <Metric label="Atlas Properties Screened" value={fmtN(stats.propCount)} subValue={`${fmtN(stats.totalUnits)} total units`} info={DV.props} />
        </div>
      </Card>

      {/* Capital Deployment Opportunity */}
      <Card padding={0} style={{ marginBottom: 20 }}>
        <div style={{ padding: '14px 24px', background: T.bgDark, color: T.txLt }}>
          <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent }}>
            Capital Deployment Opportunity
          </div>
          <div style={{ fontSize: 14, color: T.txLt, marginTop: 3 }}>
            Atlas buy-box match · 150+ units · 2000+ vintage · 900+ SF · BUY signal
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 0, borderTop: `1px solid ${T.bd}` }}>
          {[
            { label: 'Buy Box Properties', value: fmtN(stats.buyBoxCount), sub: `of ${stats.buys} BUY signals`, accent: T.buyBd, tx: T.buyTx },
            { label: 'Aggregate Units', value: fmtN(stats.bbUnits), sub: 'across Buy Box matches' },
            { label: 'Est. Total Acq. Value', value: fmt$(stats.totalValue), sub: `range ${fmt$(stats.totalValueLow)} – ${fmt$(stats.totalValueHigh)}` },
            { label: 'Weighted $/unit', value: `$${Math.round(stats.pxPerUnit/1000)}K`, sub: 'blended across vintage + sub + class' },
            { label: 'Deployment Window', value: '12–18mo', sub: 'before recovery priced in', accent: T.watchBd, tx: T.watchTx, isText: true },
          ].map((m, i, arr) => (
            <div key={m.label} style={{
              padding: '18px 20px',
              borderRight: i < arr.length - 1 ? `1px solid ${T.bd2}` : 'none',
              background: m.accent ? T.bg2 : T.bg2,
              borderTop: m.accent ? `3px solid ${m.accent}` : `3px solid transparent`,
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>{m.label}</div>
              <div style={{ fontSize: m.isText ? 22 : 24, fontWeight: 700, color: m.tx || T.tx, lineHeight: 1.1, letterSpacing: -0.4 }}>{m.value}</div>
              <div style={{ fontSize: 11, color: T.tx2, marginTop: 4, lineHeight: 1.3 }}>{m.sub}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: '12px 24px', fontSize: 11, color: T.tx2, borderTop: `1px solid ${T.bd2}`, background: T.bg3 }}>
          Based on current scoring weights ({layerW[0]}/{layerW[1]}/{layerW[2]}) + buy-box criteria. Per-property $/u calibrated off 187 real Austin comps with vintage band × submarket × class × distress adjustments. No aggregate market avg assumption.
        </div>
      </Card>

      {/* Recovery Timeline — Key Dates */}
      <Card title="Recovery Timeline — Key Dates" subtitle="Supply-demand inflection milestones through 2029" padding={20} style={{ marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
          {[
            { period: '2024', title: 'Supply Peak', detail: `${fmtN(stats.peakDel)} units delivered`, status: 'past', color: T.chartNeg },
            { period: 'Q1 2026', title: 'Last Wave', detail: 'Final major deliveries', status: 'past', color: T.watchTx },
            { period: '2026', title: 'Crossover', detail: `Absorption ${fmtN(stats.abs26)} > Supply ${fmtN(stats.del26)}`, status: 'current', color: T.accentDk },
            { period: '2026F', title: 'ERG Positive', detail: `${fmtPctD((RP.fcAnnual.find(f => f.y === '2026F')?.erg || 0) * 100)} per RealPage`, status: 'future', color: T.buyTx },
            { period: '2027', title: 'Supply Cliff', detail: `${fmtN(ANN.find(a => a.y === '2027')?.d || 0)} deliveries (${Math.round((1 - (ANN.find(a => a.y === '2027')?.d || 0)/stats.peakDel) * 100)}% from peak)`, status: 'future', color: T.buyTx },
            { period: '2028–29F', title: 'Rent Acceleration', detail: '+2.6% to +3.0% ERG', status: 'future', color: T.buyTx },
          ].map((m, i) => (
            <div key={m.period} style={{
              padding: '12px 12px', border: `1px solid ${T.bd}`, borderTop: `3px solid ${m.color}`,
              borderRadius: T.radius, background: m.status === 'current' ? T.buyBg : T.bg2,
              position: 'relative',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.tx, letterSpacing: 0.3 }}>
                {m.period}
                {m.status === 'past' && <span style={{ color: T.buyTx, marginLeft: 4 }}>✓</span>}
                {m.status === 'current' && <span style={{ color: T.accentDk, marginLeft: 4, fontSize: 10 }}>●</span>}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: m.color, marginTop: 2 }}>{m.title}</div>
              <div style={{ fontSize: 10, color: T.tx2, marginTop: 4, lineHeight: 1.35 }}>{m.detail}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Narrative — three paragraphs with dark navy headers */}
      <Grid cols={3} gap={16} style={{ marginBottom: 20 }}>
        <Card padding={0}>
          <div style={{ padding: '12px 20px', background: T.bgDark, color: T.txLt }}>
            <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent }}>
              The Setup
            </div>
            <div style={{ fontSize: 11, color: T.txLt, marginTop: 2, opacity: 0.8 }}>What happened in Austin multifamily</div>
          </div>
          <div style={{ padding: 20, fontSize: 13, color: T.tx, lineHeight: 1.6 }}>
            {EXEC_NARRATIVE.lead}
          </div>
        </Card>
        <Card padding={0}>
          <div style={{ padding: '12px 20px', background: T.bgDark, color: T.txLt }}>
            <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent }}>
              The Case
            </div>
            <div style={{ fontSize: 11, color: T.txLt, marginTop: 2, opacity: 0.8 }}>Why conviction is structural</div>
          </div>
          <div style={{ padding: 20, fontSize: 13, color: T.tx, lineHeight: 1.6 }}>
            {EXEC_NARRATIVE.thesis}
          </div>
        </Card>
        <Card padding={0}>
          <div style={{ padding: '12px 20px', background: T.bgDark, color: T.txLt }}>
            <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent }}>
              The Timing
            </div>
            <div style={{ fontSize: 11, color: T.txLt, marginTop: 2, opacity: 0.8 }}>What to look for and where</div>
          </div>
          <div style={{ padding: 20, fontSize: 13, color: T.tx, lineHeight: 1.6 }}>
            {EXEC_NARRATIVE.timing}
          </div>
        </Card>
      </Grid>

      {/* ACTIVE ABSORPTION PIPELINE — combined LU + UC, the thesis answer */}
      {(() => {
        const luUnits = LEASEUP_PROPS.reduce((a, p) => a + p.u, 0);
        const ucUnits = UC_DEALS.reduce((a, d) => a + d.u, 0);
        const totalUnits = luUnits + ucUnits;
        const leased = LEASEUP_PROPS.reduce((a, p) => a + p.u * p.curOcc, 0);
        const wtdOcc = luUnits > 0 ? leased / luUnits : 0;

        const vels = LEASEUP_PROPS.map(p => p.vel || 0).filter(v => v > 0).sort((a,b)=>a-b);
        const medVel = vels.length > 0 ? vels[Math.floor(vels.length/2)] : 0;
        const milestones = computeAbsorptionMilestones(LEASEUP_PROPS, UC_DEALS, leasesPerMo, preLeasedUC, [0.75, 0.85, stabThresh], stabThresh);

        const subsWithPipeline = new Set([...LEASEUP_PROPS.map(p => p.sb), ...UC_DEALS.map(d => d.sb)]);
        const sp = buildScoredProps(layerW, opMode, zipFactorW, propFactorW, subFactorW);
        const bbInPipeline = stats.buyBoxCount > 0
          ? sp.filter(p => p.sg === 'BUY' && p.u >= 150 && p.yb >= 2000 && (p.sf || 0) >= 900 && subsWithPipeline.has(p.sb)).length
          : 0;
        const bbShare = stats.buyBoxCount > 0 ? Math.round(bbInPipeline / stats.buyBoxCount * 100) : 0;

        return (
          <Card padding={0} style={{ marginBottom: 20 }}>
            <div style={{ padding: '14px 24px', background: T.bgDark, color: T.txLt, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent }}>
                  Active Absorption Pipeline — Lease-Up + UC Combined
                </div>
                <div style={{ fontSize: 12, color: T.txLt, marginTop: 2, opacity: 0.85 }}>The core thesis question: when does everything currently in lease-up plus under-construction absorb? Three honest answers below. · CoStar + RealPage · 26Q2TD</div>
              </div>
              <button onClick={() => setTab && setTab('leaseup')} style={{
                padding: '6px 14px', fontSize: 11, fontWeight: 700,
                background: T.accent, color: T.bgDark, border: `1px solid ${T.accent}`,
                borderRadius: T.radius, cursor: 'pointer', fontFamily: T.fontFamily,
              }}>Open Lease-Up Tab →</button>
            </div>
            {/* Pool composition */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, borderTop: `1px solid ${T.bd}` }}>
              {[
                { label: 'Active Lease-Up', value: fmtN(LEASEUP_PROPS.length), sub: `${fmtN(luUnits)} units at ${(wtdOcc*100).toFixed(1)}% occ` },
                { label: 'UC Pipeline', value: fmtN(UC_DEALS.length), sub: `${fmtN(ucUnits)} units · 26Q2–28Q2 deliveries` },
                { label: 'Combined Pool', value: fmtN(totalUnits), sub: 'total units eventually', accent: T.accent, tx: T.accentDk },
                { label: 'Observed Median Vel', value: `${medVel.toFixed(1)}/mo`, sub: `per property · using ${leasesPerMo}/mo for projection` },
              ].map((m, i, arr) => (
                <div key={m.label} style={{
                  padding: '14px 18px',
                  borderRight: i < arr.length - 1 ? `1px solid ${T.bd2}` : 'none',
                  background: T.bg2,
                  borderTop: m.accent ? `3px solid ${m.accent}` : `3px solid transparent`,
                }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>{m.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: m.tx || T.tx, lineHeight: 1.1, letterSpacing: -0.4 }}>{m.value}</div>
                  <div style={{ fontSize: 10.5, color: T.tx2, marginTop: 4, lineHeight: 1.3 }}>{m.sub}</div>
                </div>
              ))}
            </div>
            {/* Milestone triangle — the three honest answers, fully reactive */}
            <div style={{ padding: '14px 24px', borderTop: `1px solid ${T.bd2}`, background: T.bg3 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  Market Clearing Milestones
                  <InfoTip text="Three honest answers to 'when does supply absorb?' — pick the one that matches the decision. 75% cleared = market begins to heal, concessions roll off. 85% = functionally stable, rent growth reaccelerates. Full stab = last-laggard point, dominated by outlier UCs. Reactive to Lease-Up tab sliders." />
                </div>
                <div style={{ fontSize: 10.5, color: T.tx3, fontStyle: 'italic' }}>
                  At {leasesPerMo}/mo · {(preLeasedUC*100).toFixed(0)}% UC pre-leased · {(stabThresh*100).toFixed(0)}% stab threshold
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {(() => {
                  const tiles = [];
                  if (stabThresh > 0.75 + 1e-9) tiles.push({ label: '75% Pool Cleared', sub: 'Market clearing point — supply overhang meaningfully resolved', val: milestones?.[0.75], bg: '#E8F5E9', tx: T.buyTx, bd: T.buyBd });
                  if (stabThresh > 0.85 + 1e-9) tiles.push({ label: '85% Pool Cleared', sub: 'Functionally healed — concessions compress, rent growth returns', val: milestones?.[0.85], bg: T.bg2, tx: T.accentDk, bd: T.accentDk });
                  tiles.push({ label: `${(stabThresh*100).toFixed(0)}% Full Stab`, sub: 'Last-laggard clearance — all UC delivered + pool at threshold', val: milestones?.[stabThresh], bg: '#FFF4E5', tx: T.watchTx, bd: T.watchBd });
                  return tiles.map((m, i) => (
                    <div key={i} style={{ padding: 12, background: m.bg, border: `1px solid ${m.bd}`, borderLeft: `3px solid ${m.bd}`, borderRadius: T.radius }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: m.tx, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>{m.label}</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: m.tx, lineHeight: 1.1, letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums' }}>
                        {m.val ? m.val.quarter : '—'}
                      </div>
                      <div style={{ fontSize: 10.5, color: T.tx2, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>
                        {m.val?.months != null ? `${m.val.months} months from today` : 'beyond horizon'}
                      </div>
                      <div style={{ fontSize: 10, color: T.tx3, marginTop: 6, lineHeight: 1.4 }}>{m.sub}</div>
                    </div>
                  ));
                })()}
              </div>
            </div>
            <div style={{ padding: '12px 24px', background: T.bg3, borderTop: `1px solid ${T.bd2}`, fontSize: 11.5, color: T.tx, lineHeight: 1.5 }}>
              <b>Read:</b> Austin's combined pool is <b>{fmtN(totalUnits)}</b> units. At <b>{leasesPerMo}/mo</b>, supply overhang meaningfully resolves by <b style={{ color: T.buyTx }}>{milestones?.[0.75]?.quarter || '—'}</b>, and the market is functionally stable by <b style={{ color: T.accentDk }}>{milestones?.[0.85]?.quarter || '—'}</b>. Full-pool stab runs later because of late-delivery large UCs — see bottleneck table on Lease-Up tab. <b>{bbShare}% of Atlas Buy Box matches ({bbInPipeline} of {stats.buyBoxCount})</b> sit in subs with absorption activity — the question is which clear fastest.
            </div>
          </Card>
        );
      })()}

      {/* WHERE TO BUY NOW — 3-column convergence view */}
      <Card padding={0} style={{ marginBottom: 20 }}>
        <div style={{ padding: '14px 24px', background: T.bgDark, color: T.txLt }}>
          <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent }}>
            Where to Buy Now
          </div>
          <div style={{ fontSize: 12, color: T.txLt, marginTop: 2, opacity: 0.85 }}>Recovery-leading submarkets · Highest-scoring zips · Top acquisition targets · Updates live with slider changes</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0 }}>
          {/* Top submarkets */}
          <div style={{ borderRight: `1px solid ${T.bd2}` }}>
            <div style={{ padding: '10px 20px', background: T.bg3, borderBottom: `1px solid ${T.bd2}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.accentDk, letterSpacing: 0.8, textTransform: 'uppercase' }}>Recovery-Leading Submarkets</div>
              <div style={{ fontSize: 10, color: T.tx2, marginTop: 1 }}>Top {whereToBuy.topSubs.length} by composite score · <span style={{ color: T.accentDk, fontWeight: 600 }}>click for deep dive</span></div>
            </div>
            <div style={{ padding: 18 }}>
              {whereToBuy.topSubs.map((s, i) => (
                <div key={s.s}
                  onClick={() => setSelectedSubModal ? setSelectedSubModal(s.s) : navigateTo && navigateTo('sub', s.s)}
                  onMouseEnter={e => { e.currentTarget.style.background = T.accent; e.currentTarget.style.paddingLeft = '8px'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.paddingLeft = '0'; }}
                  title="Open submarket deep dive"
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                    paddingBottom: 10, marginBottom: 10,
                    borderBottom: i < whereToBuy.topSubs.length - 1 ? `1px solid ${T.bd2}` : 'none',
                    cursor: 'pointer', paddingLeft: 0, paddingTop: 4,
                    transition: 'all 0.12s',
                  }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.tx }}>{s.s} <ChevronRight size={10} style={{ display: 'inline', color: T.tx3, marginLeft: 2, verticalAlign: 'middle' }} /></div>
                    <div style={{ fontSize: 10, color: T.tx2, marginTop: 2 }}>
                      {s.vac.toFixed(1)}% vac · {fmtN(s.inv)} inv · A/D {s.uc === 0 ? '—' : s.ad.toFixed(1) + 'x'}
                    </div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: T.buyTx, fontVariantNumeric: 'tabular-nums', marginLeft: 10 }}>{s.cs}</div>
                </div>
              ))}
            </div>
          </div>
          {/* Top zips */}
          <div style={{ borderRight: `1px solid ${T.bd2}` }}>
            <div style={{ padding: '10px 20px', background: T.bg3, borderBottom: `1px solid ${T.bd2}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.accentDk, letterSpacing: 0.8, textTransform: 'uppercase' }}>Highest-Scoring Zip Codes</div>
              <div style={{ fontSize: 10, color: T.tx2, marginTop: 1 }}>Top {whereToBuy.topZips.length} with Atlas coverage · <span style={{ color: T.accentDk, fontWeight: 600 }}>click to open Zip tab</span></div>
            </div>
            <div style={{ padding: 18 }}>
              {whereToBuy.topZips.map((z, i) => (
                <div key={z.z}
                  onClick={() => navigateTo && navigateTo('zip', z.z)}
                  onMouseEnter={e => { e.currentTarget.style.background = T.accent; e.currentTarget.style.paddingLeft = '8px'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.paddingLeft = '0'; }}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                    paddingBottom: 8, marginBottom: 8,
                    borderBottom: i < whereToBuy.topZips.length - 1 ? `1px solid ${T.bd2}` : 'none',
                    cursor: 'pointer', paddingLeft: 0, paddingTop: 4,
                    transition: 'all 0.12s',
                  }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.tx }}>{z.z} <span style={{ color: T.tx2, fontWeight: 400 }}>({z.sb})</span> <ChevronRight size={10} style={{ display: 'inline', color: T.tx3, marginLeft: 2, verticalAlign: 'middle' }} /></div>
                    <div style={{ fontSize: 10, color: T.tx2, marginTop: 2 }}>{fmtN(z.propCount)} props · {fmtN(z.unitCount)} units</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.buyTx, fontVariantNumeric: 'tabular-nums', marginLeft: 10 }}>{z.cs}</div>
                </div>
              ))}
            </div>
          </div>
          {/* Top properties */}
          <div>
            <div style={{ padding: '10px 20px', background: T.bg3, borderBottom: `1px solid ${T.bd2}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.accentDk, letterSpacing: 0.8, textTransform: 'uppercase' }}>Top Acquisition Targets</div>
              <div style={{ fontSize: 10, color: T.tx2, marginTop: 1 }}>Top {whereToBuy.topProps.length} BUY-signal properties · <span style={{ color: T.accentDk, fontWeight: 600 }}>click for full detail</span></div>
            </div>
            <div style={{ padding: 18 }}>
              {whereToBuy.topProps.map((p, i) => (
                <div key={i}
                  onClick={() => navigateTo && navigateTo('prop', p.n)}
                  onMouseEnter={e => { e.currentTarget.style.background = T.accent; e.currentTarget.style.paddingLeft = '8px'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.paddingLeft = '0'; }}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                    paddingBottom: 8, marginBottom: 8,
                    borderBottom: i < whereToBuy.topProps.length - 1 ? `1px solid ${T.bd2}` : 'none',
                    cursor: 'pointer', paddingLeft: 0, paddingTop: 4,
                    transition: 'all 0.12s',
                  }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.tx, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.n} <ChevronRight size={10} style={{ display: 'inline', color: T.tx3, marginLeft: 2, verticalAlign: 'middle' }} /></div>
                    <div style={{ fontSize: 10, color: T.tx2, marginTop: 2 }}>{p.sb} · {p.u}u · {fmtRent(p.er)}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.buyTx, fontVariantNumeric: 'tabular-nums', marginLeft: 10 }}>{p.cs}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* 4-tile summary footer */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, borderTop: `1px solid ${T.bd}` }}>
          {[
            { value: stats.buys, label: 'BUY-signal properties', color: T.buyTx, bg: T.buyBg, bd: T.buyBd },
            { value: stats.buyBoxCount, label: 'Atlas Buy Box matches', color: T.tx, bg: T.bg2 },
            { value: stats.distressedBuy, label: 'Distressed + BUY signal', color: T.chartNeg, bg: T.avoidBg, bd: T.avoidBd },
            { value: stats.zipsScored, label: 'Zip codes scored', color: T.tx, bg: T.bg2 },
          ].map((t, i) => (
            <div key={i} style={{
              padding: '18px 20px', textAlign: 'center',
              background: t.bg, borderLeft: t.bd ? `3px solid ${t.bd}` : 'none',
              borderRight: i < 3 ? `1px solid ${T.bd2}` : 'none',
            }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: t.color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{fmtN(t.value)}</div>
              <div style={{ fontSize: 11, color: T.tx2, marginTop: 6 }}>{t.label}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Screening output + Opp mode + Conviction zones */}
      <Grid cols={3} gap={16} style={{ marginBottom: 20 }}>
        <Card padding={0}>
          <div style={{ padding: '12px 20px', background: T.bgDark, color: T.txLt, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent }}>
                Screening Output
              </div>
              <div style={{ fontSize: 11, color: T.txLt, marginTop: 2, opacity: 0.85 }}>Current weights {layerW[0]}/{layerW[1]}/{layerW[2]}</div>
            </div>
            <button
              onClick={() => setTab('props')}
              style={{
                background: 'transparent', border: `1px solid ${T.bd}`, borderRadius: T.radius,
                padding: '5px 10px', fontSize: 10, color: T.txLt, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4, fontFamily: T.fontFamily, fontWeight: 600,
              }}
            >View pipeline <ChevronRight size={11} /></button>
          </div>
          <div style={{ padding: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
              <Metric label="Buy" value={stats.buys} subValue="institutional screen" />
              <Metric label="Watch" value={716 - stats.buys - stats.avoids} subValue="monitoring pool" />
              <Metric label="Avoid" value={stats.avoids} subValue="structural pass" />
            </div>
            <div style={{ marginTop: 14, fontSize: 11, color: T.tx2, padding: '8px 10px', background: T.bg3, borderRadius: T.radius }}>
              Composite thresholds: BUY ≥ 65 · WATCH 50–64 · AVOID &lt; 50
            </div>
          </div>
        </Card>

        <Card padding={0}>
          <div style={{ padding: '12px 20px', background: T.bgDark, color: T.txLt }}>
            <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent, display: 'flex', alignItems: 'center', gap: 5 }}>
              Opportunistic Mode
              <InfoTip text={METHODOLOGY.opportunistic} />
            </div>
            <div style={{ fontSize: 11, color: T.txLt, marginTop: 2, opacity: 0.85 }}>Blends 55% distress + 45% quality {opMode ? '· ACTIVE' : ''}</div>
          </div>
          <div style={{ padding: 20 }}>
            <Metric label="Sweet Spots" value={stats.sweet} subValue="distress ≥ 5 + quality ≥ 55" size="lg" />
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.bd2}`, fontSize: 12, color: T.tx2, lineHeight: 1.5 }}>
              Austin has limited distress (8 properties at ds ≥ 5). Sweet spots concentrate in suburban thesis zones — Pflugerville, Round Rock, Cedar Park, South Austin.
            </div>
          </div>
        </Card>

        <Card padding={0}>
          <div style={{ padding: '12px 20px', background: T.bgDark, color: T.txLt }}>
            <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent }}>
              Conviction Zones
            </div>
            <div style={{ fontSize: 11, color: T.txLt, marginTop: 2, opacity: 0.85 }}>Thesis-aligned submarkets (0 UC, strong A/D)</div>
          </div>
          <div style={{ padding: 20 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { name: 'Round Rock',  detail: '21,944u · 0 UC · 2.70x A/D',   sub: 'Dell HQ · bedroom community' },
                { name: 'Cedar Park',  detail: '15,829u · 0 UC · 1.71x A/D',   sub: 'Concessions at 16% — compressed pricing' },
                { name: 'Pflugerville',detail: '24,269u · 0 UC · 1.12x A/D',   sub: 'Classic zero-pipeline suburb' },
                { name: 'Central Austin', detail: '3,971u · 0 UC · Class B stock', sub: 'UT anchor, mature walkability' },
              ].map((s, i, arr) => (
                <div key={s.name} style={{ paddingBottom: 8, borderBottom: i < arr.length - 1 ? `1px solid ${T.bd2}` : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{s.name}</div>
                    <div style={{ fontSize: 10, color: T.tx3, fontVariantNumeric: 'tabular-nums' }}>{s.detail}</div>
                  </div>
                  <div style={{ fontSize: 11, color: T.tx2, marginTop: 2 }}>{s.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </Grid>

      {/* Key Terms glossary — terminology reference */}
      <Card padding={0} style={{ marginBottom: 20 }}>
        <div style={{ padding: '12px 20px', background: T.bgDark, color: T.txLt }}>
          <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent }}>
            Key Terms
          </div>
          <div style={{ fontSize: 11, color: T.txLt, marginTop: 2, opacity: 0.85 }}>Abbreviation and concept reference for team readers</div>
        </div>
        <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px 24px' }}>
          {GLOSSARY.map(g => (
            <div key={g.term} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.accentDk, minWidth: 74, whiteSpace: 'nowrap' }}>{g.term}</div>
              <div style={{ fontSize: 11, color: T.tx2, lineHeight: 1.5 }}>{g.def}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Risk callouts */}
      <Card padding={0}>
        <div style={{ padding: '12px 20px', background: T.bgDark, color: T.txLt }}>
          <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent }}>
            Risk Framework
          </div>
          <div style={{ fontSize: 11, color: T.txLt, marginTop: 2, opacity: 0.85 }}>Concrete thresholds and leading indicators</div>
        </div>
        <div style={{ padding: 20 }}>
          <Grid cols={1} gap={0}>
            {RISK_FACTORS.map((r, i) => (
              <div
                key={r.label}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '200px 1fr',
                  gap: 20,
                  padding: '12px 0',
                  borderBottom: i < RISK_FACTORS.length - 1 ? `1px solid ${T.bd2}` : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <AlertCircle size={14} style={{ color: T.tx2, marginTop: 2, flexShrink: 0 }} />
                <div style={{ fontSize: 13, fontWeight: 600, color: T.tx, lineHeight: 1.35 }}>{r.label}</div>
              </div>
              <div style={{ fontSize: 12.5, color: T.tx, lineHeight: 1.6 }}>{r.detail}</div>
            </div>
          ))}
        </Grid>
        </div>
      </Card>

      {/* Navigation hints */}
      <div style={{ marginTop: 20, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {[
          { id: 'supply', label: 'Supply & demand dynamics' },
          { id: 'props',  label: 'Property pipeline (716 screened)' },
          { id: 'sub',    label: 'Submarket deep-dive' },
          { id: 'cap',    label: 'Capital markets history' },
        ].map(l => (
          <button
            key={l.id}
            onClick={() => setTab(l.id)}
            style={{
              background: T.bg2, border: `1px solid ${T.bd}`, borderRadius: T.radius,
              padding: '8px 12px', fontSize: 12, color: T.tx, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6, fontFamily: T.fontFamily,
              fontWeight: 500,
            }}
          >
            {l.label} <ChevronRight size={12} />
          </button>
        ))}
      </div>
    </div>
  );
}

const ChartBox = ({ h = 260, children }) => (
  <div style={{ width: '100%', height: h }}>
    <ResponsiveContainer>{children}</ResponsiveContainer>
  </div>
);

const TodayLine = ({ yAxisId, label = 'Today', xVal = TODAY_Q }) => (
  <ReferenceLine
    x={xVal}
    yAxisId={yAxisId}
    stroke={T.accentDk}
    strokeWidth={1.5}
    label={{ value: label, position: 'insideTopRight', fill: T.accentDk, fontSize: 10, fontWeight: 700, offset: 6 }}
  />
);

const ForecastShade = ({ start, end, yAxisId }) => (
  <ReferenceArea
    x1={start}
    x2={end}
    yAxisId={yAxisId}
    fill={T.bg3}
    fillOpacity={0.85}
    stroke="none"
  />
);

const forecastRange = series => {
  const fcs = series.filter(x => x.fc);
  if (!fcs.length) return { start: null, end: null };
  return { start: fcs[0].q || fcs[0].y, end: fcs[fcs.length - 1].q || fcs[fcs.length - 1].y };
};

const AtlasTooltip = ({ active, payload, label, valueFmt, labelFmt }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{
      background: T.bg2, border: `1px solid ${T.bdStrong}`, borderRadius: T.radius,
      padding: '8px 12px', boxShadow: T.shadowHv, fontSize: 11, fontFamily: T.fontFamily,
      minWidth: 120,
    }}>
      <div style={{ fontWeight: 600, color: T.tx, marginBottom: 4, fontSize: 11 }}>
        {labelFmt ? labelFmt(label) : label}
      </div>
      {payload.filter(p => p.value != null).map((p, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 2 }}>
          <span style={{ color: p.color || p.fill || T.tx2 }}>{p.name}</span>
          <span style={{ color: T.tx, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {valueFmt ? valueFmt(p.value, p.name) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
};

const forecastBoundary = series => {
  const actuals = series.filter(x => !x.fc);
  if (!actuals.length) return null;
  return actuals[actuals.length - 1].q || actuals[actuals.length - 1].y;
};

const fmtQ = q => q ? `Q${q.slice(-1)} '${q.slice(0,2)}` : '';

const axisProps = {
  tick: { fill: T.tx2, fontSize: 10, fontFamily: T.fontFamily },
  tickLine: { stroke: T.bd },
  axisLine: { stroke: T.bd },
};

function SupplyDemandTab() {
  const metrics = useMemo(() => {
    const peak = ANN.reduce((m, a) => a.d > (m?.d || 0) ? a : m, null);
    const y2026 = ANN.find(a => a.y === '2026');
    const y2025 = ANN.find(a => a.y === '2025');
    const peakUC = Q_UC.reduce((m, q) => (q.v || 0) > (m?.v || 0) ? q : m, null);
    const actualsUC = Q_UC.filter(q => !q.fc);
    const currentUC = actualsUC[actualsUC.length - 1];
    const ad26 = y2026 ? y2026.a / y2026.d : null;
    return {
      peak, y2026, y2025, peakUC, currentUC, ad26,
      supplyCut: peak && y2026 ? Math.round((1 - y2026.d / peak.d) * 100) : 0,
      ucCut: peakUC && currentUC ? Math.round((1 - currentUC.v / peakUC.v) * 100) : 0,
    };
  }, []);

  const boundaryUC = forecastBoundary(Q_UC);

  const subRows = useMemo(() => {
    return SUBS.map(s => ({
      ...s,
      ucPct: s.inv > 0 ? (s.uc / s.inv * 100) : 0,
    }))
    .filter(s => s.inv >= 500)
    .sort((a, b) => b.inv - a.inv);
  }, []);

  return (
    <div>
      {/* Hero metrics */}
      <Card padding={24} style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: T.tx2, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>
          Supply-Demand Inflection
        </div>
        <div style={{ fontSize: 20, lineHeight: 1.3, color: T.tx, fontWeight: 600, marginBottom: 18, letterSpacing: -0.2 }}>
          Peak 2024 deliveries of {fmtN(metrics.peak?.d)} collapse to {fmtN(metrics.y2026?.d)} in 2026F. Absorption recovers to {fmtN(metrics.y2026?.a)} — the first absorption-{'>'}-supply year since 2022.
        </div>
        <Grid cols={4} gap={20}>
          <Metric label="Peak Deliveries" value={fmtN(metrics.peak?.d)} subValue={`Year ${metrics.peak?.y}`} />
          <Metric label="2026F Deliveries" value={fmtN(metrics.y2026?.d)} subValue={`-${metrics.supplyCut}% from peak`} />
          <Metric label="Current UC" value={fmtN(metrics.currentUC?.v)} subValue={`-${metrics.ucCut}% from peak (${fmtN(metrics.peakUC?.v)})`} />
          <Metric label="2026F A/D Ratio" value={metrics.ad26 ? `${metrics.ad26.toFixed(2)}x` : '—'} subValue="Absorption / delivery coverage" />
        </Grid>
      </Card>

      {/* Annual supply/demand chart */}
      <Card title="Annual Deliveries vs Absorption" subtitle="Historical (solid) and 6-year forecast (lighter) — 2026 is the absorption>supply crossover" padding={20} style={{ marginBottom: 20 }} titleInfo={DV.ann}>
        <ChartBox h={320}>
          <BarChart data={ANN} margin={{ top: 20, right: 40, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid} vertical={false} />
            <XAxis dataKey="y" {...axisProps} />
            <YAxis {...axisProps} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
            <ReferenceArea x1="2026" x2="2030" fill={T.bg3} fillOpacity={0.85} stroke="none" />
            <ReferenceLine x="2026" stroke={T.accentDk} strokeWidth={1.5}
              label={{ value: 'Today (2026)', position: 'top', fill: T.accentDk, fontSize: 10, fontWeight: 700 }} />
            <ReferenceLine x="2024" stroke={T.chartNeg} strokeDasharray="3 3"
              label={{ value: 'Peak', position: 'top', fill: T.chartNeg, fontSize: 10, fontWeight: 600 }} />
            <ReTooltip content={<AtlasTooltip valueFmt={v => fmtN(v) + ' units'} />} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="square" iconSize={10} />
            <ReBar dataKey="d" name="Deliveries" fill={T.chart1} radius={[2,2,0,0]}>
              {ANN.map((e, i) => <Cell key={i} fill={e.fc ? T.chart3 : T.chart1} />)}
            </ReBar>
            <ReBar dataKey="a" name="Absorption" fill={T.chart2} radius={[2,2,0,0]}>
              {ANN.map((e, i) => <Cell key={i} fill={e.fc ? '#E1ECFF' : T.chart2} />)}
            </ReBar>
          </BarChart>
        </ChartBox>
      </Card>

      {/* Under construction trend */}
      <Grid cols={2} gap={16} style={{ marginBottom: 20 }}>
        <Card title="Units Under Construction" subtitle={`Peak ${fmtN(metrics.peakUC?.v)} (${fmtQ(metrics.peakUC?.q)}) → trough forecast`} padding={20} titleInfo={DV.ts}>
          <ChartBox h={260}>
            <AreaChart data={Q_UC} margin={{ top: 20, right: 40, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="ucGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={T.chart1} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={T.chart1} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid} vertical={false} />
              <XAxis dataKey="q" {...axisProps} tickFormatter={fmtQ} interval={7} />
              <YAxis {...axisProps} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
              <ReferenceArea x1="26Q1" x2="31Q1" fill={T.bg3} fillOpacity={0.85} stroke="none" />
              <ReferenceLine x={TODAY_Q} stroke={T.accentDk} strokeWidth={1.5}
                label={{ value: 'Today', position: 'insideTopRight', fill: T.accentDk, fontSize: 10, fontWeight: 700, offset: 6 }} />
              <ReTooltip content={<AtlasTooltip valueFmt={v => fmtN(v) + ' units'} labelFmt={fmtQ} />} />
              <Area type="monotone" dataKey="v" stroke={T.chart1} strokeWidth={2} fill="url(#ucGrad)" name="UC Units" />
            </AreaChart>
          </ChartBox>
        </Card>

        <Card title="Quarterly New Starts" subtitle="Leading indicator for future deliveries" padding={20} titleInfo={DV.ts}>
          <ChartBox h={260}>
            <BarChart data={Q_STARTS} margin={{ top: 20, right: 40, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid} vertical={false} />
              <XAxis dataKey="q" {...axisProps} tickFormatter={fmtQ} interval={7} />
              <YAxis {...axisProps} tickFormatter={v => `${(v/1000).toFixed(1)}K`} />
              <ReferenceArea x1="26Q1" x2="31Q1" fill={T.bg3} fillOpacity={0.85} stroke="none" />
              <ReferenceLine x={TODAY_Q} stroke={T.accentDk} strokeWidth={1.5}
                label={{ value: 'Today', position: 'insideTopRight', fill: T.accentDk, fontSize: 10, fontWeight: 700, offset: 6 }} />
              <ReTooltip content={<AtlasTooltip valueFmt={v => fmtN(v) + ' units'} labelFmt={fmtQ} />} />
              <ReBar dataKey="v" name="Starts" fill={T.chart1} radius={[2,2,0,0]}>
                {Q_STARTS.map((e, i) => <Cell key={i} fill={e.fc ? T.chart3 : T.chart1} />)}
              </ReBar>
            </BarChart>
          </ChartBox>
        </Card>
      </Grid>

      {/* Submarket pipeline table */}
      <Card title="Submarket Pipeline Risk" subtitle="Inventory, construction, and absorption coverage by submarket" padding={0} titleInfo={DV.ts}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: T.fontFamily }}>
            <thead>
              <tr style={{ background: T.bgDark }}>
                {['Submarket', 'Inventory', 'UC', 'UC / Inv', 'A/D', 'Vacancy', 'ERG', 'Pipeline Signal'].map((h, i) => (
                  <th key={h} style={{
                    padding: '12px 14px', textAlign: i === 0 ? 'left' : 'right',
                    fontSize: 10, fontWeight: 700, color: T.txLt,
                    textTransform: 'uppercase', letterSpacing: 0.6, whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subRows.map((s, i) => {
                const pipeSignal = s.ucPct === 0 ? { lbl: 'Zero', bg: T.buyBg, tx: T.buyTx } :
                                  s.ucPct < 3 ? { lbl: 'Low', bg: T.buyBg, tx: T.buyTx } :
                                  s.ucPct < 8 ? { lbl: 'Moderate', bg: T.watchBg, tx: T.watchTx } :
                                                { lbl: 'Heavy', bg: T.avoidBg, tx: T.avoidTx };
                const vacColor = s.vac < 10 ? T.chartPos : s.vac > 18 ? T.chartNeg : T.tx;
                const adColor = s.ad >= 1.5 ? T.chartPos : s.ad < 0.5 ? T.chartNeg : s.ad >= 1 ? T.tx : T.tx2;
                const ucPctColor = s.ucPct === 0 ? T.chartPos : s.ucPct >= 8 ? T.chartNeg : s.ucPct >= 3 ? T.watchTx : T.tx;
                const ergColor = s.erg >= 2 ? T.chartPos : s.erg < -4 ? T.chartNeg : s.erg >= 0 ? T.tx : T.watchTx;
                return (
                  <tr key={s.s} style={{ borderBottom: `1px solid ${T.bd2}`, background: i % 2 === 0 ? T.bg2 : T.bg3 }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: T.tx }}>{s.s}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.tx, fontWeight: 500 }}>{fmtN(s.inv)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.tx }}>{fmtN(s.uc)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: ucPctColor, fontWeight: 600 }}>
                      {s.ucPct.toFixed(1)}%
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: adColor, fontWeight: 600 }}>
                      {s.uc === 0 ? '—' : `${s.ad.toFixed(2)}x`}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: vacColor, fontWeight: 600 }}>{s.vac.toFixed(1)}%</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: ergColor, fontWeight: 600 }}>
                      {s.erg > 0 ? '+' : ''}{s.erg.toFixed(1)}%
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: T.radius, fontSize: 10, fontWeight: 700,
                        background: pipeSignal.bg, color: pipeSignal.tx, letterSpacing: 0.3,
                      }}>{pipeSignal.lbl}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function RentRevenueTab() {
  const metrics = useMemo(() => {
    const rentActuals = Q_RENT.filter(q => !q.fc);
    const currentRent = rentActuals[rentActuals.length - 1];
    const peakRent = rentActuals.reduce((m, q) => (q.v || 0) > (m?.v || 0) ? q : m, null);
    const ergActuals = Q_ERG.filter(q => !q.fc);
    const peakErg = ergActuals.reduce((m, q) => (q.v || 0) > (m?.v || 0) ? q : m, null);
    const currentErg = ergActuals[ergActuals.length - 1];
    const erg2026F = Q_ERG.find(q => q.q === '26Q4') || Q_ERG.find(q => q.q === '26Q2');
    return { currentRent, peakRent, peakErg, currentErg, erg2026F };
  }, []);

  const ergBoundary = forecastBoundary(Q_ERG);
  const rentBoundary = forecastBoundary(Q_RENT);

  const rentErgData = useMemo(() => {
    return Q_RENT.map((r, i) => ({
      q: r.q,
      rent: r.v,
      erg: Q_ERG[i] ? Q_ERG[i].v * 100 : null,
      fc: r.fc,
    }));
  }, []);

  return (
    <div>
      {/* Hero metrics */}
      <Card padding={24} style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: T.tx2, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>
          Rent Trajectory
        </div>
        <div style={{ fontSize: 20, lineHeight: 1.3, color: T.tx, fontWeight: 600, marginBottom: 18, letterSpacing: -0.2 }}>
          Peak ERG of {(metrics.peakErg?.v * 100).toFixed(1)}% in {metrics.peakErg?.q} collapsed to {(metrics.currentErg?.v * 100).toFixed(1)}% at trough. RealPage projects 2026F recovery to {fmtPct(RP.fcAnnual.find(f => f.y === '2026F')?.erg * 100)}.
        </div>
        <Grid cols={4} gap={20}>
          <Metric label="Current Rent" value={fmt$(metrics.currentRent?.v)} subValue={metrics.currentRent?.q} />
          <Metric label="Peak ERG" value={fmtPctD(metrics.peakErg?.v * 100)} subValue={metrics.peakErg?.q} />
          <Metric label="Current ERG" value={fmtPctD(metrics.currentErg?.v * 100)} subValue={metrics.currentErg?.q} />
          <Metric label="2026F ERG" value={fmtPctD(RP.fcAnnual.find(f => f.y === '2026F')?.erg * 100)} subValue="RealPage forecast" />
        </Grid>
      </Card>

      {/* Hero chart: rent + ERG combo */}
      <Card title="Quarterly Rent & Effective Rent Growth" subtitle="Dual-axis: rent level ($) and YoY growth rate (%). 2026-2031 forecast." padding={20} style={{ marginBottom: 20 }} titleInfo={DV.ts}>
        <ChartBox h={340}>
          <ComposedChart data={rentErgData} margin={{ top: 20, right: 40, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid} vertical={false} />
            <XAxis dataKey="q" {...axisProps} tickFormatter={fmtQ} interval={7} />
            <YAxis yAxisId="rent" {...axisProps} tickFormatter={v => `$${v}`} domain={['dataMin - 50', 'dataMax + 50']} />
            <YAxis yAxisId="erg" orientation="right" {...axisProps} tickFormatter={v => `${v.toFixed(0)}%`} domain={[-12, 28]} />
            <ReferenceArea yAxisId="erg" x1="26Q1" x2="31Q1" fill={T.bg3} fillOpacity={0.85} stroke="none" />
            <ReferenceLine yAxisId="erg" y={0} stroke={T.bd} />
            <ReferenceLine yAxisId="erg" x={TODAY_Q} stroke={T.accentDk} strokeWidth={1.5}
              label={{ value: 'Today', position: 'insideTopRight', fill: T.accentDk, fontSize: 10, fontWeight: 700, offset: 6 }} />
            <ReTooltip content={<AtlasTooltip labelFmt={fmtQ} valueFmt={(v, n) => n === 'ERG' ? `${v.toFixed(1)}%` : `$${fmtN(Math.round(v))}`} />} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="line" iconSize={12} />
            <ReBar yAxisId="erg" dataKey="erg" name="ERG" radius={[2,2,0,0]}>
              {rentErgData.map((e, i) => (
                <Cell key={i} fill={e.erg >= 0 ? (e.fc ? '#A8D8B8' : T.chartPos) : (e.fc ? '#D8A8A8' : T.chartNeg)} fillOpacity={e.fc ? 0.55 : 0.85} />
              ))}
            </ReBar>
            <Line yAxisId="rent" type="monotone" dataKey="rent" stroke={T.chart1} strokeWidth={2} dot={false} name="Rent" />
          </ComposedChart>
        </ChartBox>
      </Card>

      {/* Concessions + forecast table */}
      <Grid cols={2} gap={16} style={{ marginBottom: 20 }}>
        <Card title="Concessions Trend" subtitle="Days of free rent offered (ApartmentTrends, 6.7-yr window)" padding={20} titleInfo={DV.at}>
          <ChartBox h={260}>
            <AreaChart data={AT.histCnv} margin={{ top: 20, right: 40, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="concGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={T.chartNeg} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={T.chartNeg} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid} vertical={false} />
              <XAxis dataKey="q" {...axisProps} tickFormatter={fmtQ} interval={3} />
              <YAxis {...axisProps} tickFormatter={v => `${v}d`} />
              <ReferenceLine x="26Q1" stroke={T.accentDk} strokeWidth={1.5}
                label={{ value: 'Today', position: 'insideTopRight', fill: T.accentDk, fontSize: 10, fontWeight: 700, offset: 6 }} />
              <ReTooltip content={<AtlasTooltip labelFmt={fmtQ} valueFmt={v => `${v} days`} />} />
              <Area type="monotone" dataKey="conc" stroke={T.chartNeg} strokeWidth={2} fill="url(#concGrad)" name="Concession days" />
            </AreaChart>
          </ChartBox>
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.bd2}`, fontSize: 11, color: T.tx2 }}>
            Concessions lead rent recovery. Declining concession days is the earliest indicator of pricing power returning.
          </div>
        </Card>

        <Card title="Annual Rent Forecast" subtitle="RealPage ERG projections through 2029" padding={20} titleInfo={DV.rp}>
          <div style={{ overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: T.bgDark }}>
                  {['Year', 'Avg Rent', 'ERG', 'Occupancy', 'Conc %'].map((h, i) => (
                    <th key={h} style={{
                      padding: '10px 10px', textAlign: i === 0 ? 'left' : 'right',
                      fontSize: 10, fontWeight: 700, color: T.txLt,
                      textTransform: 'uppercase', letterSpacing: 0.6,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {RP.fcAnnual.map((r, i) => {
                  const isToday = r.y === '2026F';
                  const isForecast = r.y.includes('F');
                  const ergPct = r.erg * 100;
                  const ergColor = ergPct >= 2 ? T.chartPos : ergPct < -4 ? T.chartNeg : ergPct >= 0 ? T.tx : T.watchTx;
                  return (
                    <tr key={r.y} style={{
                      borderBottom: `1px solid ${T.bd2}`,
                      background: isToday ? T.buyBg : isForecast ? T.bg3 : T.bg2,
                      borderLeft: isToday ? `3px solid ${T.accentDk}` : 'none',
                    }}>
                      <td style={{ padding: '9px 10px', fontWeight: 700, color: T.tx }}>
                        {r.y}{isToday ? ' ← Today' : ''}
                      </td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.tx, fontWeight: 500 }}>
                        {fmtRent(r.rent)}
                      </td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                        color: ergColor, fontWeight: 700 }}>
                        {fmtPctD(ergPct)}
                      </td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.tx }}>
                        {fmtPct(r.occ * 100)}
                      </td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                        color: r.concP != null && r.concP * 100 > 8 ? T.chartNeg : T.tx2, fontWeight: 500 }}>
                        {r.concP != null ? fmtPct(r.concP * 100) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </Grid>

      {/* Submarket rent comparison */}
      <Card title="Submarket Rent & ERG" subtitle="Current $/unit and year-over-year growth by submarket" padding={20}>
        <ChartBox h={Math.max(300, SUBS.length * 22)}>
          <BarChart
            data={[...SUBS].sort((a, b) => b.rent - a.rent)}
            layout="vertical"
            margin={{ top: 10, right: 40, left: 100, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid} horizontal={false} />
            <XAxis type="number" {...axisProps} tickFormatter={v => `$${v}`} />
            <YAxis type="category" dataKey="s" {...axisProps} width={100} tick={{ fill: T.tx, fontSize: 11, fontFamily: T.fontFamily }} />
            <ReTooltip content={<AtlasTooltip valueFmt={(v, n) => n === 'ERG' ? `${v.toFixed(1)}%` : `$${fmtN(v)}`} />} />
            <ReBar dataKey="rent" name="Avg Rent" fill={T.chart1} radius={[0,2,2,0]} />
          </BarChart>
        </ChartBox>
      </Card>
    </div>
  );
}

function FundamentalsTab() {
  const demo = NM.demo;
  const emp = NM.employment;

  const popData = useMemo(() => Q_POP.map(q => ({ q: q.q, v: q.v, fc: q.fc })), []);
  const empData = useMemo(() => Q_EMP.map(q => ({ q: q.q, v: q.v, fc: q.fc })), []);

  return (
    <div>
      {/* ═══ 1. HERO NARRATIVE ═══ */}
      <Card padding={0} style={{ marginBottom: 16 }}>
        <div style={{ padding: '18px 24px', background: T.bgDark, color: T.txLt }}>
          <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent, marginBottom: 6 }}>
            Demand Fundamentals — Why Austin
          </div>
          <div style={{ fontSize: 18, lineHeight: 1.4, color: T.txLt, fontWeight: 600, letterSpacing: -0.2 }}>
            {fmtN(demo?.popGrow20to24)} people added 2020-2024 (<b style={{ color: T.accent }}>{fmtPct(demo?.popGrow20to24Pct)}</b> MSA growth). Office-using jobs up <b style={{ color: T.accent }}>{fmtPct(emp?.officeJobs5y)}</b> over 5 years — #2 nationally. Median HHI <b style={{ color: T.accent }}>{fmt$(demo?.medHHI)}</b> against $1,459 rent supports <b style={{ color: T.accent }}>{fmtPct(demo?.rentToIncome)}</b> rent-to-income — well inside affordability bands for rent recovery.
          </div>
        </div>
        <div style={{ padding: '18px 24px' }}>
          <Grid cols={4} gap={20}>
            <Metric label="Metro Population" value={`${demo?.popMM}M`} subValue={`#${demo?.popMetroRank} nationally by MSA size`} />
            <Metric label="Pop Growth 2025-2030F" value={fmtPct(demo?.annGrow25to30)} subValue={`${fmtN(demo?.dailyGain5y)} people/day trailing 5Y`} />
            <Metric label="Median HH Income" value={fmt$(demo?.medHHI)} subValue={`Up ${fmtPct((demo?.medHHI / demo?.medHHIPeak22 - 1) * 100)} vs 2022 peak`} />
            <Metric label="Office Jobs 5Y Growth" value={fmtPct(emp?.officeJobs5y)} subValue="#2 nationally (BLS)" />
          </Grid>
        </div>
      </Card>

      {/* ═══ 2. NATIONAL RANKINGS BAND ═══ */}
      <Card padding={0} style={{ marginBottom: 16 }}>
        <div style={{ padding: '12px 20px', background: T.bgDark, color: T.txLt }}>
          <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent }}>
            Austin in the National Rankings
          </div>
          <div style={{ fontSize: 11, color: T.txLt, marginTop: 2, opacity: 0.85 }}>Independent third-party rankings — Newmark Q3 2025 Market Overview</div>
        </div>
        <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
          {(NM.rankings || []).map((r, i) => {
            const isTop3 = r.rk && ['#1', '#2', '#3'].includes(r.rk);
            return (
              <div key={i} style={{
                padding: '12px 14px', background: isTop3 ? T.buyBg : T.bg3,
                border: `1px solid ${isTop3 ? T.buyBd : T.bd2}`,
                borderLeft: `3px solid ${isTop3 ? T.buyTx : T.bd}`,
                borderRadius: T.radius,
              }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: isTop3 ? T.buyTx : T.tx, lineHeight: 1, marginBottom: 4, fontVariantNumeric: 'tabular-nums' }}>{r.rk}</div>
                <div style={{ fontSize: 11, color: T.tx, lineHeight: 1.35, fontWeight: 600 }}>{r.cat}</div>
                <div style={{ fontSize: 10, color: T.tx2, marginTop: 4, fontStyle: 'italic' }}>{r.src}</div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ═══ 3. GREEN STREET SCORECARD — headline metrics + 5Y forecast ═══ */}
      <Grid cols={2} gap={16} style={{ marginBottom: 16 }}>
        <Card padding={0}>
          <div style={{ padding: '12px 20px', background: T.bgDark, color: T.txLt, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent }}>
                Green Street Market Scorecard
              </div>
              <div style={{ fontSize: 11, color: T.txLt, marginTop: 2, opacity: 0.85 }}>Grade {GS.grade || 'A'} market · Ranked {GS.headline?.gradeRank?.v} of 50 MSAs · As of {GS.asOf}</div>
            </div>
            <div style={{ padding: '4px 10px', background: T.buyBg, color: T.buyTx, border: `1.5px solid ${T.buyBd}`, borderRadius: T.radius, fontSize: 14, fontWeight: 700 }}>
              Grade {GS.grade || 'A'}
            </div>
          </div>
          <div style={{ padding: 14 }}>
            {[
              { k: 'gradeRank',    label: 'Overall Market Grade Rank',  color: T.buyTx },
              { k: 'mRevPAF5y',    label: 'M-RevPAF 5Y Growth Forecast' },
              { k: 'effRent',      label: 'Effective Rent' },
              { k: 'capRate',      label: 'Nominal Cap Rate' },
              { k: 'yoyCPPI',      label: 'YoY CPPI (Price Index)' },
              { k: 'ltNOIGrow',    label: 'Long-Term NOI Growth' },
              { k: 'irrRiskAdj',   label: 'Risk-Adjusted IRR' },
              { k: 'occupancy',    label: 'Current Occupancy' },
            ].map((m, i) => {
              const d = GS.headline?.[m.k];
              if (!d) return null;
              const rank = d.rank;
              const isTop10 = rank && rank <= 10;
              const isBottom10 = rank && rank >= 40;
              const rankColor = isTop10 ? T.buyTx : isBottom10 ? T.chartNeg : T.tx2;
              const suffix = d.suffix || '';
              let display;
              if (suffix === '$') display = fmt$(d.v);
              else if (suffix === '%') display = `${d.v.toFixed(1)}%`;
              else display = d.v;
              return (
                <div key={m.k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < 7 ? `1px solid ${T.bd2}` : 'none' }}>
                  <span style={{ fontSize: 11.5, color: T.tx, fontWeight: 500 }}>{m.label}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 13, color: m.color || T.tx, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{display}</span>
                    <span style={{
                      fontSize: 10.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                      color: rankColor, minWidth: 52, textAlign: 'right',
                      padding: '2px 6px', background: isTop10 ? T.buyBg : isBottom10 ? T.avoidBg : T.bg3,
                      borderRadius: T.radius, letterSpacing: 0.3,
                    }}>#{rank} of 50</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card padding={0}>
          <div style={{ padding: '12px 20px', background: T.bgDark, color: T.txLt }}>
            <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent }}>
              Five-Year Growth Forecast vs. Top 50 Markets
            </div>
            <div style={{ fontSize: 11, color: T.txLt, marginTop: 2, opacity: 0.85 }}>Green Street 5Y forecast · Lower rank = better</div>
          </div>
          <div style={{ padding: 18 }}>
            {(GS.forecast5y || []).map((f, i) => {
              const isTop5 = f.rank <= 5;
              const isBottom10 = f.rank >= 40;
              const color = isTop5 ? T.buyTx : isBottom10 ? T.chartNeg : T.accentDk;
              return (
                <div key={f.m} style={{ marginBottom: i < 3 ? 16 : 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: T.tx, fontWeight: 600 }}>{f.m}</span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                      <span style={{ fontSize: 17, color: color, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: -0.3 }}>{f.v.toFixed(1)}%</span>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: color, padding: '2px 8px', background: isTop5 ? T.buyBg : isBottom10 ? T.avoidBg : T.bg3, borderRadius: T.radius }}>#{f.rank} of 50</span>
                    </div>
                  </div>
                  <div style={{ background: T.bd2, height: 4, borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ background: color, height: '100%', width: `${Math.max(10, 100 - (f.rank - 1) * 2)}%` }} />
                  </div>
                </div>
              );
            })}
            <div style={{ marginTop: 20, padding: 14, background: T.buyBg, border: `1px solid ${T.buyBd}`, borderLeft: `3px solid ${T.buyTx}`, borderRadius: T.radius }}>
              <div style={{ fontSize: 10, color: T.buyTx, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4 }}>Why this matters</div>
              <div style={{ fontSize: 12, color: T.tx, lineHeight: 1.5 }}>
                Austin is forecast <b>#1 of 50</b> in job growth and <b>#2 of 50</b> in M-RevPAF (revenue per available foot). The #48 supply growth ranking is the supply-cliff setup — 2024 peak of 30K+ deliveries falls to ~10K in 2026. Demand-side rank of #1 against supply-side rank of #48 is the clearest two-sided setup in the top 50 U.S. markets.
              </div>
            </div>
          </div>
        </Card>
      </Grid>

      {/* ═══ 4. RENT RECOVERY FORECAST — RealPage annual projections ═══ */}
      <Card padding={0} style={{ marginBottom: 16 }}>
        <div style={{ padding: '12px 20px', background: T.bgDark, color: T.txLt }}>
          <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent }}>
            Annual Rent & Occupancy Forecast — RealPage
          </div>
          <div style={{ fontSize: 11, color: T.txLt, marginTop: 2, opacity: 0.85 }}>2023 peak through 2029F · ERG inflection point is 2026 · As of {RP.asOf}</div>
        </div>
        <div style={{ padding: 18 }}>
          <Grid cols={2} gap={16}>
            <ChartBox h={240}>
              <ComposedChart data={RP.fcAnnual} margin={{ top: 20, right: 40, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid} vertical={false} />
                <XAxis dataKey="y" {...axisProps} />
                <YAxis yAxisId="rent" {...axisProps} tickFormatter={v => `$${(v/1000).toFixed(1)}K`} domain={['dataMin - 50', 'dataMax + 50']} />
                <YAxis yAxisId="erg" orientation="right" {...axisProps} tickFormatter={v => `${(v*100).toFixed(0)}%`} />
                <ReTooltip content={<AtlasTooltip
                  valueFmt={(v, n) => n === 'Rent' ? fmt$(v) : `${(v * 100).toFixed(2)}%`}
                />} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} iconType="square" iconSize={10} />
                <ReBar yAxisId="rent" dataKey="rent" name="Rent" fill={T.chart1} radius={[2,2,0,0]} />
                <Line yAxisId="erg" type="monotone" dataKey="erg" name="ERG" stroke={T.chartNeg} strokeWidth={2.5} dot={{ fill: T.chartNeg, r: 4 }} />
                <ReferenceLine yAxisId="erg" y={0} stroke={T.tx3} strokeDasharray="2 2" />
              </ComposedChart>
            </ChartBox>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: T.fontFamily }}>
                <thead>
                  <tr style={{ background: T.bgDark }}>
                    {['Year', 'Rent', 'ERG', 'Occ', 'Conc%'].map((h, i) => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: i === 0 ? 'left' : 'right', fontSize: 9.5, fontWeight: 700, color: T.txLt, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {RP.fcAnnual.map((r, i) => {
                    const isForecast = r.y.endsWith('F');
                    const ergColor = r.erg > 0 ? T.chartPos : T.chartNeg;
                    return (
                      <tr key={r.y} style={{ background: isForecast ? T.bg3 : T.bg2, borderBottom: `1px solid ${T.bd2}`, fontStyle: isForecast ? 'italic' : 'normal' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 700, color: T.tx }}>{r.y}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.tx }}>{fmtRent(r.rent)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: ergColor, fontWeight: 700 }}>{r.erg > 0 ? '+' : ''}{(r.erg * 100).toFixed(1)}%</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.tx }}>{(r.occ * 100).toFixed(1)}%</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.tx2 }}>{r.concP != null ? `${(r.concP * 100).toFixed(1)}%` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ marginTop: 14, padding: 12, background: T.accent, borderLeft: `3px solid ${T.accentDk}`, borderRadius: T.radius, fontSize: 11.5, color: T.tx, lineHeight: 1.55 }}>
                <b>2026 is the inflection.</b> Effective rent growth swings from -7.8% in 2025 to +0.8% in 2026F, then accelerates to +3.0% by 2029F. Occupancy climbs 92.2% → 93.9% → 95.3%. Concessions at 8.2% in 2025 are the peak — already compressing.
              </div>
            </div>
          </Grid>
        </div>
      </Card>

      {/* ═══ 5. POP & EMPLOYMENT CHARTS ═══ */}
      <Grid cols={2} gap={16} style={{ marginBottom: 16 }}>
        <Card padding={0}>
          <div style={{ padding: '12px 20px', background: T.bgDark, color: T.txLt }}>
            <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent }}>
              Metro Population Trajectory
            </div>
            <div style={{ fontSize: 11, color: T.txLt, marginTop: 2, opacity: 0.85 }}>16Q1 {fmtK(popData[0]?.v)} → {fmtK(popData[popData.length-1]?.v)} 31Q1F (+{Math.round((popData[popData.length-1]?.v / popData[0]?.v - 1) * 100)}% over 15 years)</div>
          </div>
          <div style={{ padding: 18 }}>
            <ChartBox h={240}>
              <AreaChart data={popData} margin={{ top: 20, right: 40, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="popGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={T.chart1} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={T.chart1} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid} vertical={false} />
                <XAxis dataKey="q" {...axisProps} tickFormatter={fmtQ} interval={7} />
                <YAxis {...axisProps} tickFormatter={v => `${(v/1e6).toFixed(1)}M`} domain={['dataMin - 50000', 'dataMax + 50000']} />
                <ReferenceArea x1="26Q1" x2="31Q1" fill={T.bg3} fillOpacity={0.85} stroke="none" />
                <ReferenceLine x={TODAY_Q} stroke={T.accentDk} strokeWidth={1.5}
                  label={{ value: 'Today', position: 'insideTopRight', fill: T.accentDk, fontSize: 10, fontWeight: 700, offset: 6 }} />
                <ReTooltip content={<AtlasTooltip labelFmt={fmtQ} valueFmt={v => fmtN(v) + ' people'} />} />
                <Area type="monotone" dataKey="v" stroke={T.chart1} strokeWidth={2} fill="url(#popGrad)" name="Population" />
              </AreaChart>
            </ChartBox>
          </div>
        </Card>

        <Card padding={0}>
          <div style={{ padding: '12px 20px', background: T.bgDark, color: T.txLt }}>
            <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent }}>
              Total Employment Trajectory
            </div>
            <div style={{ fontSize: 11, color: T.txLt, marginTop: 2, opacity: 0.85 }}>16Q1 {fmtK(empData[0]?.v)} → {fmtK(empData[empData.length-1]?.v)} 31Q1F (+{Math.round((empData[empData.length-1]?.v / empData[0]?.v - 1) * 100)}% over 15 years)</div>
          </div>
          <div style={{ padding: 18 }}>
            <ChartBox h={240}>
              <AreaChart data={empData} margin={{ top: 20, right: 40, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="empGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={T.accentDk} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={T.accentDk} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid} vertical={false} />
                <XAxis dataKey="q" {...axisProps} tickFormatter={fmtQ} interval={7} />
                <YAxis {...axisProps} tickFormatter={v => `${(v/1e6).toFixed(2)}M`} domain={['dataMin - 20000', 'dataMax + 20000']} />
                <ReferenceArea x1="26Q1" x2="31Q1" fill={T.bg3} fillOpacity={0.85} stroke="none" />
                <ReferenceLine x={TODAY_Q} stroke={T.accentDk} strokeWidth={1.5}
                  label={{ value: 'Today', position: 'insideTopRight', fill: T.accentDk, fontSize: 10, fontWeight: 700, offset: 6 }} />
                <ReTooltip content={<AtlasTooltip labelFmt={fmtQ} valueFmt={v => fmtN(v) + ' jobs'} />} />
                <Area type="monotone" dataKey="v" stroke={T.accentDk} strokeWidth={2} fill="url(#empGrad)" name="Jobs" />
              </AreaChart>
            </ChartBox>
          </div>
        </Card>
      </Grid>

      {/* ═══ 6. DEMOGRAPHICS / EMPLOYMENT / EMPLOYERS ═══ */}
      <Grid cols={3} gap={16} style={{ marginBottom: 16 }}>
        <Card padding={0}>
          <div style={{ padding: '12px 20px', background: T.bgDark, color: T.txLt }}>
            <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent }}>Demographics</div>
            <div style={{ fontSize: 11, color: T.txLt, marginTop: 2, opacity: 0.85 }}>Newmark Q3 2025</div>
          </div>
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              ['Median age', `${demo?.medAge} years`],
              ['Median HH income', fmt$(demo?.medHHI)],
              ['Income since 2022 peak', fmtPctD(((demo?.medHHI - demo?.medHHIPeak22) / demo?.medHHIPeak22) * 100)],
              ['Ann. pop growth 2025-30', fmtPct(demo?.annGrow25to30)],
              ['Ann. pop growth 2030+', fmtPct(demo?.annGrow2030)],
              ['People/day 5Y avg', fmtN(demo?.dailyGain5y)],
              ['Annual people added 2030F', fmtN(demo?.peopleAddByYr2030)],
              ['Annual jobs added 2030F', fmtN(demo?.jobsAdd2030)],
              ['Rent-to-income', fmtPct(demo?.rentToIncome)],
            ].map(([k, v], i, arr) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, paddingBottom: 6, borderBottom: i < arr.length - 1 ? `1px solid ${T.bd2}` : 'none' }}>
                <span style={{ color: T.tx2 }}>{k}</span>
                <span style={{ color: T.tx, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card padding={0}>
          <div style={{ padding: '12px 20px', background: T.bgDark, color: T.txLt }}>
            <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent }}>Employment</div>
            <div style={{ fontSize: 11, color: T.txLt, marginTop: 2, opacity: 0.85 }}>BLS / Newmark</div>
          </div>
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              ['Total employment', `${emp?.total}M`],
              ['Unemployment rate', fmtPct(emp?.unempRate)],
              ['Annual job growth', fmtPct(emp?.annGrow)],
              ['LFPR overall', fmtPct(emp?.lfpr)],
              ['LFPR prime-age', fmtPct(emp?.lfprPrime)],
              ['5Y rank (growth)', `#${emp?.rank5yGrow}`],
              ['Office jobs 5Y', fmtPct(emp?.officeJobs5y)],
              ['Industrial jobs 5Y', fmtPct(emp?.industrialJobs5y)],
              ['Total jobs 5Y', fmtPct(emp?.totalJobs5y)],
            ].map(([k, v], i, arr) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, paddingBottom: 6, borderBottom: i < arr.length - 1 ? `1px solid ${T.bd2}` : 'none' }}>
                <span style={{ color: T.tx2 }}>{k}</span>
                <span style={{ color: T.tx, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card padding={0}>
          <div style={{ padding: '12px 20px', background: T.bgDark, color: T.txLt }}>
            <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent }}>Top Employers</div>
            <div style={{ fontSize: 11, color: T.txLt, marginTop: 2, opacity: 0.85 }}>Major Austin-area employers</div>
          </div>
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(NM.employers || []).slice(0, 12).map((e, i, arr) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 5, borderBottom: i < arr.length - 1 ? `1px solid ${T.bd2}` : 'none' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: T.tx }}>{e.n}</span>
                <span style={{ fontSize: 10, color: T.tx2, letterSpacing: 0.3, fontStyle: 'italic' }}>{e.ind}</span>
              </div>
            ))}
          </div>
        </Card>
      </Grid>

      {/* ═══ 7. IN-MIGRATION FLOWS + DEMAND-SIDE RANKINGS ═══ */}
      <Grid cols={2} gap={16} style={{ marginBottom: 16 }}>
        <Card padding={0}>
          <div style={{ padding: '12px 20px', background: T.bgDark, color: T.txLt }}>
            <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent }}>
              In-Migration Sources
            </div>
            <div style={{ fontSize: 11, color: T.txLt, marginTop: 2, opacity: 0.85 }}>Where Austin's new residents are coming from · Newmark</div>
          </div>
          <div style={{ padding: 18 }}>
            {(NM.inmig || []).map((m, i) => (
              <div key={m.o} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
                  <span style={{ color: T.tx, fontWeight: 600 }}>{m.o}</span>
                  <span style={{ color: T.accentDk, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{m.share.toFixed(1)}%</span>
                </div>
                <div style={{ background: T.bd2, height: 6, borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ background: T.chart1, height: '100%', width: `${m.share * 7}%`, maxWidth: '100%' }} />
                </div>
                {m.note && <div style={{ fontSize: 10, color: T.tx2, marginTop: 2, fontStyle: 'italic' }}>{m.note}</div>}
              </div>
            ))}
            <div style={{ marginTop: 14, padding: 10, background: T.bg3, borderLeft: `3px solid ${T.accentDk}`, borderRadius: T.radius, fontSize: 11, color: T.tx2, lineHeight: 1.5 }}>
              Texas triangle (Houston + DFW + SA) accounts for 27.2% of in-migration — renters who already know Texas market dynamics. International share from Asia is 4.5% and rising as Samsung/AMD/Applied Materials expand semiconductor operations.
            </div>
          </div>
        </Card>

        <Card padding={0}>
          <div style={{ padding: '12px 20px', background: T.bgDark, color: T.txLt }}>
            <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent }}>
              Demand-Side Rankings (Top 50 MSAs)
            </div>
            <div style={{ fontSize: 11, color: T.txLt, marginTop: 2, opacity: 0.85 }}>Green Street · Lower rank = stronger</div>
          </div>
          <div style={{ padding: 18 }}>
            {(GS.demandRanks || []).map((r, i, arr) => {
              const isTop5 = r.rank <= 5;
              const isBottom10 = r.rank >= 40;
              const color = isTop5 ? T.buyTx : isBottom10 ? T.chartNeg : T.tx;
              return (
                <div key={r.m} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: i < arr.length - 1 ? `1px solid ${T.bd2}` : 'none' }}>
                  <span style={{ fontSize: 11.5, color: T.tx, fontWeight: 500 }}>{r.m}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, color: color, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {r.v}{r.suffix || ''}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                      color: color, padding: '2px 7px',
                      background: isTop5 ? T.buyBg : isBottom10 ? T.avoidBg : T.bg3,
                      borderRadius: T.radius, minWidth: 48, textAlign: 'center',
                    }}>#{r.rank} of 50</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </Grid>

      {/* ═══ 8. UNLEVERED IRR BUILD-UP ═══ */}
      {GS.irrBuild && GS.irrBuild.length > 0 && (
        <Card padding={0} style={{ marginBottom: 16 }}>
          <div style={{ padding: '12px 20px', background: T.bgDark, color: T.txLt }}>
            <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent }}>
              Unlevered IRR Build-Up — Green Street Decomposition
            </div>
            <div style={{ fontSize: 11, color: T.txLt, marginTop: 2, opacity: 0.85 }}>How Austin's projected 6.6% risk-adjusted IRR is constructed — cap rate → cap-ex drag → NOI growth → liquidity adjustment</div>
          </div>
          <div style={{ padding: 18, display: 'grid', gridTemplateColumns: `repeat(${GS.irrBuild.length}, 1fr)`, gap: 8 }}>
            {GS.irrBuild.map((b, i) => {
              const isNeg = b.v < 0;
              const isFinal = b.k === 'Risk-Adjusted IRR' || b.k === 'Unlevered IRR';
              return (
                <div key={b.k} style={{
                  padding: '12px 10px', background: isFinal ? T.buyBg : T.bg3,
                  border: `1px solid ${isFinal ? T.buyBd : T.bd2}`,
                  borderRadius: T.radius, textAlign: 'center',
                  display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                }}>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: T.tx2, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6, lineHeight: 1.2 }}>{b.k}</div>
                  <div style={{ fontSize: 19, fontWeight: 700, color: isNeg ? T.chartNeg : isFinal ? T.buyTx : T.tx, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                    {b.v > 0 ? '+' : ''}{b.v.toFixed(1)}%
                  </div>
                  {b.note && <div style={{ fontSize: 9, color: T.tx3, marginTop: 6, fontStyle: 'italic', lineHeight: 1.3 }}>{b.note}</div>}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ═══ 9. STRUCTURAL STRENGTHS / RISKS ═══ */}
      <Grid cols={2} gap={16}>
        <Card padding={0}>
          <div style={{ padding: '12px 20px', background: T.bgDark, color: T.txLt }}>
            <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent }}>
              Structural Strengths
            </div>
            <div style={{ fontSize: 11, color: T.txLt, marginTop: 2, opacity: 0.85 }}>Green Street Austin MSA assessment</div>
          </div>
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(GS.strengths || []).map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: 12, background: T.buyBg, border: `1px solid ${T.buyBd}`, borderLeft: `3px solid ${T.buyTx}`, borderRadius: T.radius }}>
                <ArrowUpRight size={14} style={{ color: T.buyTx, flexShrink: 0, marginTop: 2 }} />
                <div style={{ fontSize: 12, color: T.tx, lineHeight: 1.5 }}>{s}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card padding={0}>
          <div style={{ padding: '12px 20px', background: T.bgDark, color: T.txLt }}>
            <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent }}>
              Structural Risks
            </div>
            <div style={{ fontSize: 11, color: T.txLt, marginTop: 2, opacity: 0.85 }}>Green Street identified weaknesses</div>
          </div>
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(GS.weaknesses || []).map((w, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: 12, background: T.avoidBg, border: `1px solid ${T.avoidBd}`, borderLeft: `3px solid ${T.avoidTx}`, borderRadius: T.radius }}>
                <ArrowDownRight size={14} style={{ color: T.avoidTx, flexShrink: 0, marginTop: 2 }} />
                <div style={{ fontSize: 12, color: T.tx, lineHeight: 1.5 }}>{w}</div>
              </div>
            ))}
          </div>
        </Card>
      </Grid>
    </div>
  );
}

function SubDeepDiveTab({ layerW, opMode, zipFactorW, propFactorW, subFactorW, setSubFactorW, resetSubFactors, jumpIntent, setJumpIntent, navigateTo,
                          setSelectedSubModal,
                          leasesPerMo, preLeasedUC, stabThresh }) {
  const [selectedSub, setSelectedSub] = useState(null);

  // Sync left rankings card height to the right detail panel's content height.
  // Same pattern as ZipAnalysisTab — ResizeObserver watches the right panel.
  const rightPanelRef = useRef(null);
  const [leftHeight, setLeftHeight] = useState(null);
  useEffect(() => {
    if (!rightPanelRef.current) return undefined;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const h = Math.round(entry.contentRect.height);
        if (h > 0) setLeftHeight(h);
      }
    });
    ro.observe(rightPanelRef.current);
    return () => ro.disconnect();
  }, [selectedSub]);

  useEffect(() => {
    if (jumpIntent && jumpIntent.kind === 'sub' && jumpIntent.value) {
      setSelectedSub(jumpIntent.value);
      setJumpIntent(null);
    }
  }, []);

  const subData = useMemo(() => {
    const scored = buildScoredSubs(subFactorW);
    const sp = buildScoredProps(layerW, opMode, zipFactorW, propFactorW, subFactorW);
    const propsBySub = {};
    sp.forEach(p => {
      if (!p.sb) return;
      if (!propsBySub[p.sb]) propsBySub[p.sb] = [];
      propsBySub[p.sb].push(p);
    });
    return scored
      .map(s => ({
        ...s,
        narrative: SUB_NARRATIVES[s.s] || null,
        properties: propsBySub[s.s] || [],
        buyCount: (propsBySub[s.s] || []).filter(p => p.sg === 'BUY').length,
      }))
      .sort((a, b) => b.cs - a.cs);
  }, [layerW, opMode, zipFactorW, propFactorW, subFactorW]);

  const activeSub = useMemo(() => {
    if (!selectedSub) return subData[0];
    return subData.find(s => s.s === selectedSub) || subData[0];
  }, [selectedSub, subData]);

  return (
    <div>
      {/* Intro strip — full width */}
      <Card padding={16} style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: T.tx2, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>
              Submarket Deep Dive — {subData.length} submarkets ranked
            </div>
            <div style={{ fontSize: 12.5, color: T.tx, lineHeight: 1.5 }}>
              Submarket composite blends four operating metrics. Tune each factor's weight using the sliders below — rankings and downstream property scores update live. Click any submarket to see its property roster and analyst thesis.
            </div>
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 11, color: T.tx2 }}>
              <span><b style={{ color: T.buyTx }}>Green text</b> = strong operational reading</span>
              <span><b style={{ color: T.chartNeg }}>Red text</b> = weak</span>
              <span><b style={{ color: T.tx }}>Black text</b> = neutral</span>
            </div>
          </div>
          <div style={{ flexShrink: 0, padding: '6px 12px', background: T.bg3, border: `1px solid ${T.bd2}`, borderRadius: T.radius, textAlign: 'center', minWidth: 140 }}>
            <div style={{ fontSize: 9, color: T.tx3, letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: 700 }}>Data vintage</div>
            <div style={{ fontSize: 10.5, color: T.accentDk, fontWeight: 700, marginTop: 2 }}>Operating: {DATA_VINTAGE.propertyData}</div>
            <div style={{ fontSize: 10.5, color: T.accentDk, fontWeight: 700 }}>Narrative: {DATA_VINTAGE.subNarratives}</div>
          </div>
        </div>
      </Card>

      {/* Full-width submarket factor slider banner — 4x1 grid */}
      <Card padding={0} style={{ marginBottom: 16 }}>
        <div style={{
          padding: '12px 20px', background: T.bgDark, color: T.txLt,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent }}>
              Submarket Factor Weights — 4 factors
            </div>
            <div style={{ fontSize: 12, color: T.txLt, marginTop: 2, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span>All weights normalize automatically — rankings update live · {SUB_FACTORS.some(f => subFactorW[f.key] !== DEFAULT_SUB_W[f.key]) ? <span style={{ color: T.accent, fontWeight: 700 }}>Modified from defaults</span> : 'Defaults'}</span>
              <ScoringHelp scope="factor" />
            </div>
          </div>
          <button onClick={resetSubFactors} style={{
            background: 'transparent', border: `1px solid ${T.bd}`, borderRadius: T.radius,
            padding: '6px 14px', fontSize: 11, color: T.txLt, cursor: 'pointer',
            fontFamily: T.fontFamily, fontWeight: 700,
          }}>Reset to Defaults</button>
        </div>
        <div style={{
          padding: 18, display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px 20px',
        }}>
          {SUB_FACTORS.map(f => (
            <div key={f.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                <span style={{ fontSize: 11.5, color: T.tx, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {f.label}
                  <InfoTip text={f.info} />
                </span>
                <span style={{
                  fontSize: 11.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                  color: subFactorW[f.key] !== DEFAULT_SUB_W[f.key] ? T.accentDk : T.tx2,
                  background: subFactorW[f.key] !== DEFAULT_SUB_W[f.key] ? T.accent : T.bg3,
                  padding: '1px 7px', borderRadius: T.radius, minWidth: 28, textAlign: 'center',
                }}>{subFactorW[f.key]}</span>
              </div>
              <input type="range" min={0} max={50} step={1} value={subFactorW[f.key]}
                onChange={e => setSubFactorW({ ...subFactorW, [f.key]: Number(e.target.value) })}
                style={{ width: '100%', accentColor: T.accentDk, cursor: 'pointer', height: 4 }} />
              <div style={{ fontSize: 9, color: T.tx3, marginTop: 2, fontStyle: 'italic' }}>default {DEFAULT_SUB_W[f.key]}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Main layout: sub list left, detail right.
          ResizeObserver measures the right panel's height (above), and we set
          the left card to that exact pixel height. List scrolls inside the
          card. Bottom flush with the right panel's last content. */}
      <Grid cols={2} gap={16} style={{ marginBottom: 20, gridTemplateColumns: '1fr 1.5fr', alignItems: 'start' }}>
        {/* Ranked sub list — height matches right panel */}
        <Card title="Submarket Rankings" subtitle="Composite score ranks operating health" padding={0}>
          <div style={{ maxHeight: leftHeight ? Math.max(200, leftHeight - 56) : 680, overflowY: 'auto' }}>
            {subData.map((s, i) => {
              const active = s.s === activeSub?.s;
              const vacColor = s.vac < 10 ? T.chartPos : s.vac > 18 ? T.chartNeg : T.tx;
              const adColor = s.ad >= 1.5 ? T.chartPos : s.ad < 0.5 ? T.chartNeg : T.tx;
              return (
                <div
                  key={s.s}
                  onClick={() => { setSelectedSub(s.s); setSelectedSubModal(s.s); }}
                  title="Open submarket deep dive"
                  style={{
                    padding: '12px 16px',
                    borderBottom: `1px solid ${T.bd2}`,
                    cursor: 'pointer',
                    background: active ? T.accent : (i % 2 === 0 ? T.bg2 : T.bg3),
                    borderLeft: active ? `3px solid ${T.accentDk}` : '3px solid transparent',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.tx }}>
                      {i + 1}. {s.s}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: T.accentDk, fontVariantNumeric: 'tabular-nums' }}>
                      {s.cs}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 10, color: T.tx2 }}>
                    <span>Inv <b style={{ color: T.tx }}>{fmtN(s.inv)}</b></span>
                    <span>UC <b style={{ color: s.uc === 0 ? T.chartPos : T.tx }}>{fmtN(s.uc)}</b></span>
                    <span>Vac <b style={{ color: vacColor }}>{s.vac.toFixed(1)}%</b></span>
                    <span>A/D <b style={{ color: adColor }}>{s.uc === 0 ? '—' : s.ad.toFixed(2) + 'x'}</b></span>
                    {s.buyCount > 0 && <span style={{ marginLeft: 'auto' }}>
                      <b style={{ color: T.buyTx }}>{s.buyCount}</b> BUY
                    </span>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Selected sub detail — measured by ResizeObserver */}
        {activeSub && (
          <div ref={rightPanelRef} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card padding={20}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 10, color: T.tx2, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600 }}>Submarket</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: T.tx, letterSpacing: -0.3, marginTop: 2 }}>{activeSub.s}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: T.tx2, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600 }}>Composite</div>
                  <div style={{ fontSize: 30, fontWeight: 700, color: T.accentDk, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{activeSub.cs}</div>
                </div>
              </div>

              {}
              <button
                onClick={() => setSelectedSubModal(activeSub.s)}
                onMouseEnter={e => { e.currentTarget.style.background = T.accentDk; e.currentTarget.style.color = T.txLt; }}
                onMouseLeave={e => { e.currentTarget.style.background = T.accent; e.currentTarget.style.color = T.accentDk; }}
                style={{
                  width: '100%', padding: '10px 14px', marginBottom: 14,
                  background: T.accent, border: `1px solid ${T.accentDk}`, borderRadius: T.radius,
                  color: T.accentDk, fontWeight: 700, fontSize: 12, fontFamily: T.fontFamily,
                  letterSpacing: 0.5, textTransform: 'uppercase', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'all 0.12s',
                }}
                title="Open the full submarket briefing — charts, desirability, affordability, owners, properties"
              >
                Open Deep Dive
                <ChevronRight size={14} />
              </button>

              {}
              {(() => {
                const xtra = SUB_STATS[activeSub.s] || {};
                const propCounts = SUB_PROPS[activeSub.s] || { p: 0, u: 0 };
                const conviction = buildSubConviction(
                  activeSub, xtra, propCounts, activeSub.buyCount,
                  forwardRentGrowth(activeSub.s),
                  METRO_REF
                );
                if (!conviction) return null;
                return (
                  <div style={{ marginBottom: 14 }}>
                    <ConvictionHeader
                      title={`${activeSub.s} — Conviction Snapshot`}
                      subtitle="Forward growth · current state vs metro · model conviction · live to slider weights"
                      signals={conviction.signals}
                      footer={conviction.footer}
                    />
                  </div>
                );
              })()}

              {}
              {(() => {
                const fwd = forwardRentGrowth(activeSub.s);
                if (!fwd) return null;
                const tile = (label, period, fwdPoint) => {
                  if (!fwdPoint) return <Metric label={label} value="—" size="sm" />;
                  const pct = fwdPoint.pct;
                  const color = pct >= 1.5 ? T.chartPos : pct >= 0 ? T.tx : T.chartNeg;
                  return (
                    <div style={{ padding: 10, background: T.bg3, border: `1px solid ${T.bd2}`, borderRadius: T.radius }}>
                      <div style={{ fontSize: 9.5, fontWeight: 700, color: T.tx2, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4 }}>
                        {label} <span style={{ color: T.tx3, fontWeight: 500 }}>· {period}</span>
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                        {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                      </div>
                      <div style={{ fontSize: 10, color: T.tx3, marginTop: 3 }}>
                        ends {fmtRent(Math.round(fwdPoint.end))}{period.includes('Y') && period !== '1Y' ? ' · CAGR' : ''}
                      </div>
                    </div>
                  );
                };
                return (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, color: T.tx2, letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      Forward Rent Growth
                      <Info size={11} style={{ color: T.tx3, cursor: 'help' }}><title>{`CoStar forecast through 31Q1. Anchored at 26Q1 effective rent ${fmtRent(Math.round(fwd.now))}. 1Y is single-year change; 3Y and 5Y are compound annual growth rates.`}</title></Info>
                    </div>
                    <Grid cols={3} gap={10}>
                      {tile('1-Year', '27Q1', fwd.y1)}
                      {tile('3-Year', '29Q1', fwd.y3)}
                      {tile('5-Year', '31Q1', fwd.y5)}
                    </Grid>
                  </div>
                );
              })()}

              {/* Metric strip */}
              {(() => {
                const xtra = SUB_STATS[activeSub.s] || {};
                return (
                  <Grid cols={4} gap={14} style={{ marginBottom: 14 }}>
                    <Metric label="Inventory" value={fmtN(activeSub.inv)} subValue="units" size="sm" />
                    <Metric label="Under Construction" value={fmtN(activeSub.uc)} subValue={activeSub.inv > 0 ? `${(activeSub.uc/activeSub.inv*100).toFixed(1)}% of inv` : '—'} size="sm" />
                    <Metric label="Vacancy" value={`${activeSub.vac.toFixed(1)}%`} size="sm" />
                    <Metric label="Stabilized Vacancy" value={xtra.stabVac != null ? `${xtra.stabVac.toFixed(1)}%` : '—'} subValue={xtra.vacGap != null ? `${xtra.vacGap > 0 ? '+' : ''}${xtra.vacGap.toFixed(1)}p lease-up drag` : ''} size="sm" info="Stabilized vacancy excludes properties still in lease-up. The gap between total and stabilized vacancy is the lease-up drag — when it closes, occupancy normalizes." />
                    <Metric label="T12 Starts" value={xtra.t12St != null ? fmtN(xtra.t12St) : '—'} subValue={xtra.t12StPct != null ? `${xtra.t12StPct.toFixed(1)}% of inv` : ''} size="sm" info="Trailing 12-month construction starts, in units. As a % of inventory, this signals forward-supply momentum: a deliveries pipeline 18-24 months out." />
                    <Metric label="Peak-to-Trough Rent" value={xtra.ptotPct != null ? `${xtra.ptotPct.toFixed(1)}%` : '—'} subValue="cycle drawdown" size="sm" info="Cycle peak-to-trough rent decline (pre-computed cycle measure, not naive series-wide max-min — 2016Q1 rents were structurally lower and would inflate the number). Deeper decline = more room to run if demand returns." />
                    <Metric label="Effective Rent Growth" value={`${activeSub.erg > 0 ? '+' : ''}${activeSub.erg.toFixed(1)}%`} size="sm" />
                    <Metric label="Avg Rent" value={fmtRent(activeSub.rent)} size="sm" />
                    <Metric
                      label="Absorption / Delivery"
                      value={
                        activeSub.t4a == null || activeSub.t4d == null
                          ? '—'
                          : `${activeSub.t4a > 0 ? '+' : ''}${fmtN(activeSub.t4a)} / ${fmtN(activeSub.t4d)}`
                      }
                      subValue={
                        activeSub.t4a == null || activeSub.t4d == null ? ''
                          : activeSub.t4d > 0 ? `${(activeSub.t4a / activeSub.t4d).toFixed(2)}x · 12mo`
                          : activeSub.t4a > 0 ? 'absorbing, no new supply'
                          : activeSub.t4a < 0 ? 'move-outs, no new supply'
                          : 'no activity (12mo)'
                      }
                      size="sm"
                      info="T12 absorption / T12 deliveries. Both above zero = healthy churn. Absorption with zero deliveries = absorbing existing supply. Negative = move-outs."
                    />
                    <Metric label="Atlas Properties" value={fmtN(activeSub.properties.length)} subValue={`${activeSub.buyCount} BUY signals`} size="sm" />
                    <Metric label="Pipeline Risk" value={
                      activeSub.uc === 0 ? 'Zero' :
                      activeSub.inv > 0 && activeSub.uc / activeSub.inv < 0.03 ? 'Low' :
                      activeSub.inv > 0 && activeSub.uc / activeSub.inv < 0.08 ? 'Moderate' : 'Heavy'
                    } size="sm" />
                  </Grid>
                );
              })()}

              {}
              {(() => {
                const scored = buildScoredZips(layerW, zipFactorW);
                const subZips = scored.filter(z => z.sb === activeSub.s).sort((a, b) => b.cs - a.cs);
                if (subZips.length === 0) return null;
                const top3 = subZips.slice(0, 3);
                const remaining = subZips.length - top3.length;
                return (
                  <div style={{ margin: '14px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: T.tx2, letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                        Top Zips in {activeSub.s}
                        <Info size={11} style={{ color: T.tx3, cursor: 'help' }}><title>Zip codes in this submarket ranked by composite score under current weights. Click any tile to drill into the zip's full detail panel — demographics, factor contributions, and the property pipeline within that zip.</title></Info>
                      </div>
                      <div style={{ fontSize: 9.5, color: T.tx3, fontStyle: 'italic' }}>
                        ranked by composite · click to drill in
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                      {top3.map((z, i) => {
                        const sigColor = z.sg === 'BUY' ? T.buyTx : z.sg === 'WATCH' ? T.watchTx : T.tx3;
                        const sigBg    = z.sg === 'BUY' ? T.buyBg : z.sg === 'WATCH' ? T.watchBg : T.bg3;
                        const sigBd    = z.sg === 'BUY' ? T.buyBd : z.sg === 'WATCH' ? T.watchBd : T.bd2;
                        return (
                          <button
                            key={z.z}
                            onClick={() => navigateTo && navigateTo('zip', z.z)}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = T.accentDk; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = sigBd; e.currentTarget.style.transform = 'translateY(0)'; }}
                            style={{
                              padding: 12, background: sigBg, border: `1px solid ${sigBd}`, borderLeft: `3px solid ${sigColor}`,
                              borderRadius: T.radius, cursor: navigateTo ? 'pointer' : 'default', textAlign: 'left',
                              fontFamily: T.fontFamily, transition: 'all 0.12s', display: 'flex', flexDirection: 'column', gap: 4,
                            }}
                            title={`Drill into zip ${z.z} — ${z.p} Atlas properties, ${fmtN(z.u)} units`}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                              <span style={{ fontSize: 9, fontWeight: 700, color: T.tx2, letterSpacing: 0.5, textTransform: 'uppercase' }}>#{i + 1}</span>
                              <span style={{ fontSize: 9, fontWeight: 700, color: sigColor, letterSpacing: 0.5 }}>{z.sg}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                              <span style={{ fontSize: 18, fontWeight: 700, color: T.tx, fontVariantNumeric: 'tabular-nums', letterSpacing: -0.3 }}>{z.z}</span>
                              <span style={{ fontSize: 11, color: T.tx2, fontWeight: 600 }}>· {z.cs}</span>
                            </div>
                            <div style={{ fontSize: 10.5, color: T.tx2, lineHeight: 1.4 }}>
                              {z.p} {z.p === 1 ? 'prop' : 'props'} · {fmtN(z.u)}u
                            </div>
                            <div style={{ fontSize: 10, color: T.tx3, display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                              View detail <ChevronRight size={10} />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    {remaining > 0 && (
                      <div style={{ fontSize: 10, color: T.tx3, marginTop: 6, fontStyle: 'italic' }}>
                        + {remaining} additional zip{remaining === 1 ? '' : 's'} in this submarket
                      </div>
                    )}
                  </div>
                );
              })()}

              {activeSub.narrative && (
                <div style={{ padding: 14, background: T.bg3, border: `1px solid ${T.bd2}`, borderLeft: `3px solid ${T.accentDk}`, borderRadius: T.radius, fontSize: 12.5, color: T.tx, lineHeight: 1.6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                    <div style={{ fontSize: 10, color: T.tx2, letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: 700 }}>Analyst Thesis</div>
                    <div style={{ fontSize: 9.5, color: T.tx3, fontStyle: 'italic', letterSpacing: 0.3 }}>{DATA_VINTAGE.subNarratives}</div>
                  </div>
                  {activeSub.narrative}
                </div>
              )}

              {/* Combined LU + UC absorption pressure */}
              {(() => {
                const subLU = subLeaseUpSummary(activeSub.s, leasesPerMo, preLeasedUC, stabThresh);
                if (!subLU) {
                  return (
                    <div style={{ marginTop: 12, padding: 12, background: T.buyBg, border: `1px solid ${T.buyBd}`, borderLeft: `3px solid ${T.buyTx}`, borderRadius: T.radius, fontSize: 11.5, color: T.tx, lineHeight: 1.5 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: T.buyTx, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4 }}>Clean Absorption Profile</div>
                      Zero active lease-up and zero UC pipeline in {activeSub.s}. Absorbed universe — no new supply overhang pressuring existing rents through 2028.
                    </div>
                  );
                }
                const observedDisplay = subLU.luProps > 0 ? subLU.meanVel.toFixed(1) : null;
                return (
                  <div style={{ marginTop: 12, padding: 14, background: T.bg2, border: `1px solid ${T.bd2}`, borderLeft: `3px solid ${T.watchTx}`, borderRadius: T.radius }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: T.watchTx, letterSpacing: 0.6, textTransform: 'uppercase' }}>
                        Absorption Pipeline (LU + UC)
                        {subLU.thinSample && <span style={{ marginLeft: 8, fontSize: 9, padding: '1px 6px', background: T.watchTx, color: T.txLt, borderRadius: 3, letterSpacing: 0.3, fontWeight: 700 }}>THIN SAMPLE</span>}
                      </div>
                      <div style={{ fontSize: 9.5, color: T.tx3, fontStyle: 'italic' }}>CoStar + RealPage · 26Q2TD</div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10, marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 9, color: T.tx3, letterSpacing: 0.3, textTransform: 'uppercase' }}>LU Props</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: T.tx, fontVariantNumeric: 'tabular-nums' }}>{subLU.luProps}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: T.tx3, letterSpacing: 0.3, textTransform: 'uppercase' }}>UC Deals</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: subLU.ucDeals > 0 ? T.watchTx : T.tx3, fontVariantNumeric: 'tabular-nums' }}>{subLU.ucDeals || '—'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: T.tx3, letterSpacing: 0.3, textTransform: 'uppercase' }}>Pool Units</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: T.tx, fontVariantNumeric: 'tabular-nums' }}>{fmtN(subLU.totalUnits)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: T.tx3, letterSpacing: 0.3, textTransform: 'uppercase' }}>Delivered Occ</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: T.accentDk, fontVariantNumeric: 'tabular-nums' }}>{subLU.deliveredOcc != null ? `${(subLU.deliveredOcc*100).toFixed(0)}%` : '—'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: T.tx3, letterSpacing: 0.3, textTransform: 'uppercase' }} title="Sub's actual observed mean velocity from CoStar/RealPage data — backward-looking, not used in stab calc">Observed Vel</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: T.tx2, fontVariantNumeric: 'tabular-nums' }}>{observedDisplay != null ? observedDisplay : '—'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: T.tx3, letterSpacing: 0.3, textTransform: 'uppercase' }} title="Velocity assumption from the Lease-Up tab slider — what's actually used to compute the stab quarter">Assumption</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: T.accentDk, fontVariantNumeric: 'tabular-nums' }}>{leasesPerMo.toFixed(1)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: T.tx3, letterSpacing: 0.3, textTransform: 'uppercase' }}>Full Pool Stab</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: subLU.stabMonths && subLU.stabMonths <= 24 ? T.chartPos : T.watchTx, fontVariantNumeric: 'tabular-nums' }}>{subLU.stabQuarter}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: T.tx2, lineHeight: 1.4 }}>
                      {subLU.luProps > 0
                        ? <>{subLU.luProps} active lease-up {subLU.luProps === 1 ? 'property' : 'properties'} ({fmtN(subLU.luUnits)}u) at {(subLU.deliveredOcc*100).toFixed(1)}% delivered occupancy</>
                        : <>No active lease-ups today</>}
                      {subLU.ucDeals > 0 && <> plus <b>{subLU.ucDeals} UC {subLU.ucDeals === 1 ? 'deal' : 'deals'} ({fmtN(subLU.ucUnits)}u)</b> delivering 26Q2–28Q2</>}.
                      {' '}At <b>{leasesPerMo}/mo</b> assumption{observedDisplay != null ? <> (sub's observed mean is {observedDisplay}/mo across {subLU.luProps} {subLU.luProps === 1 ? 'prop' : 'props'}{subLU.thinSample ? ', thin sample' : ''})</> : <> (no LU observations in this sub yet — UC-only)</>}, the combined pool fully absorbs <b>{subLU.stabQuarter}</b>{subLU.stabMonths != null ? ` (${subLU.stabMonths} months out)` : ''}.
                    </div>
                  </div>
                );
              })()}
            </Card>

            {/* Property roster */}
            <Card title={`Property Roster — ${activeSub.properties.length} Atlas-screened properties`} subtitle={`Ranked by composite score (current weights: ${layerW[0]}/${layerW[1]}/${layerW[2]})`} padding={0} titleInfo={DV.props}>
              <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, fontFamily: T.fontFamily }}>
                  <thead>
                    <tr style={{ background: T.bgDark, position: 'sticky', top: 0 }}>
                      {['Property', 'Built', 'Units', 'Class', 'Rent', 'Vac', 'CS', 'Signal'].map((h, i) => (
                        <th key={h} style={{
                          padding: '10px 12px', textAlign: i === 0 ? 'left' : 'right',
                          fontSize: 9.5, fontWeight: 700, color: T.txLt,
                          textTransform: 'uppercase', letterSpacing: 0.6, whiteSpace: 'nowrap',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeSub.properties.sort((a, b) => b.cs - a.cs).slice(0, 30).map((p, i) => (
                      <tr
                        key={i}
                        onClick={() => navigateTo && navigateTo('prop', p.n)}
                        title="Open property card"
                        style={{ borderBottom: `1px solid ${T.bd2}`, background: i % 2 === 0 ? T.bg2 : T.bg3, cursor: navigateTo ? 'pointer' : 'default' }}
                        onMouseEnter={e => { if (navigateTo) e.currentTarget.style.background = T.accent; }}
                        onMouseLeave={e => { e.currentTarget.style.background = i % 2 === 0 ? T.bg2 : T.bg3; }}
                      >
                        <td style={{ padding: '8px 12px', color: T.tx, fontWeight: 500, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.sweet && <Target size={10} style={{ display: 'inline', marginRight: 4, color: T.accentDk }} />}
                          {LEASEUP_BY_MAIN[p.n] && <span title={`Lease-up · ${(LEASEUP_BY_MAIN[p.n].curOcc*100).toFixed(0)}% occ · ${LEASEUP_BY_MAIN[p.n].vel}/mo`} style={{ display: 'inline-block', fontSize: 9, fontWeight: 700, padding: '1px 5px', background: T.watchTx, color: T.txLt, borderRadius: 3, marginRight: 5, letterSpacing: 0.3 }}>◐ LU</span>}
                          {p.n}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.tx }}>{p.yb || '—'}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.tx }}>{p.u}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: T.tx }}>{p.cl || '—'}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.tx }}>{fmtRent(p.er)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                          color: p.v < 10 ? T.chartPos : p.v > 18 ? T.chartNeg : T.tx }}>{p.v != null ? p.v.toFixed(1) + '%' : '—'}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.accentDk, fontWeight: 700 }}>{p.cs}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}><Pill signal={p.sg} size="sm" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {activeSub.properties.length > 30 && (
                <div style={{ padding: '10px 16px', fontSize: 11, color: T.tx2, background: T.bg3, borderTop: `1px solid ${T.bd}` }}>
                  Showing top 30 of {activeSub.properties.length}. See Property Pipeline tab for the full list.
                </div>
              )}
            </Card>
          </div>
        )}
      </Grid>

      {}
      {activeSub && (() => {
        const series = subSeries(activeSub.s);
        if (series.length === 0) {
          return (
            <Card padding={20} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: T.tx2, fontStyle: 'italic' }}>
                No quarterly time-series available for {activeSub.s}. (Midtown Austin lacks CoStar coverage.)
              </div>
            </Card>
          );
        }
        const fcStartIdx = series.findIndex(r => r.fc === 1);
        const fcStart = fcStartIdx >= 0 ? series[fcStartIdx].q : null;
        const fcEnd = series[series.length - 1].q;
        const histRents = series.filter(r => r.fc === 0 && r.r != null);
        const peakRow = histRents.length ? histRents.reduce((a, b) => b.r > a.r ? b : a) : null;
        const troughRow = histRents.length ? histRents.reduce((a, b) => b.r < a.r ? b : a) : null;

        return (
          <Grid cols={2} gap={16} style={{ marginBottom: 16 }}>
            {/* Rent & Vacancy Trajectory */}
            <Card
              title="Rent & Vacancy Trajectory"
              subtitle={`${activeSub.s} · effective rent on left, vacancy on right · CoStar quarterly`}
              padding={16}
              titleInfo="Effective rent net of concessions. Peak and trough markers track the historical rent cycle. Stabilized vacancy excludes lease-up properties — the gap between vacancy and stabilized vacancy is lease-up drag."
            >
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={series} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={T.chartGrid} />
                  <XAxis dataKey="q" tick={{ fontSize: 9.5, fill: T.tx2 }} interval={7} />
                  <YAxis yAxisId="left" tick={{ fontSize: 9.5, fill: T.tx2 }} tickFormatter={v => '$' + (v/1000).toFixed(1) + 'K'} domain={['auto', 'auto']} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9.5, fill: T.tx2 }} tickFormatter={v => v.toFixed(0) + '%'} domain={[0, 'auto']} />
                  <ReTooltip
                    contentStyle={{ fontSize: 11, fontFamily: T.fontFamily, background: T.bg2, border: `1px solid ${T.bd}`, borderRadius: T.radius }}
                    formatter={(v, n) => {
                      if (v == null) return ['—', n];
                      if (n === 'r')  return ['$' + Math.round(v).toLocaleString(), 'Eff. rent'];
                      if (n === 'v')  return [v.toFixed(1) + '%', 'Vacancy'];
                      if (n === 'sv') return [v.toFixed(1) + '%', 'Stab. vacancy'];
                      if (n === 'mr') return ['$' + Math.round(v).toLocaleString(), 'Metro rent'];
                      return [v, n];
                    }}
                  />
                  {fcStart && <ReferenceArea x1={fcStart} x2={fcEnd} yAxisId="left" fill={T.accent} fillOpacity={0.18} />}
                  {peakRow && <ReferenceLine yAxisId="left" y={peakRow.r} stroke={T.chartPos} strokeDasharray="4 3" label={{ value: `Peak $${peakRow.r.toLocaleString()} · ${peakRow.q}`, fill: T.chartPos, fontSize: 9.5, position: 'insideTopLeft' }} />}
                  {troughRow && <ReferenceLine yAxisId="left" y={troughRow.r} stroke={T.chartNeg} strokeDasharray="4 3" label={{ value: `Trough $${troughRow.r.toLocaleString()} · ${troughRow.q}`, fill: T.chartNeg, fontSize: 9.5, position: 'insideBottomLeft' }} />}
                  <Line yAxisId="left" type="monotone" dataKey="mr" stroke={T.tx3} strokeWidth={1.3} strokeDasharray="5 3" dot={false} name="Metro rent" />
                  <Line yAxisId="left" type="monotone" dataKey="r" stroke={T.chart1} strokeWidth={2} dot={false} name="Eff. rent" />
                  <Line yAxisId="right" type="monotone" dataKey="v" stroke={T.chartNeg} strokeWidth={1.5} dot={false} name="Vacancy" />
                  <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} iconType="line" />
                </ComposedChart>
              </ResponsiveContainer>
              <div style={{ fontSize: 10.5, color: T.tx2, marginTop: 6, lineHeight: 1.4 }}>
                Shaded region = forecast (26Q2+) · dashed gray = metro rent reference. {peakRow && troughRow && peakRow.r > troughRow.r && (
                  <>Peak-to-trough decline of <b style={{ color: T.chartNeg }}>{(((troughRow.r/peakRow.r) - 1) * 100).toFixed(1)}%</b>.</>
                )}
              </div>
            </Card>

            {}
            <Card
              title="Supply & Demand Trajectory"
              subtitle={`${activeSub.s} · 12-month rolling absorption vs deliveries · last 8yr shown`}
              padding={16}
              titleInfo="12-mo rolling absorption (leased) vs deliveries (delivered). Bars above zero = supply or demand being added. Absorption > deliveries = market absorbing faster than growing (bullish rents). Last 32 quarters shown."
            >
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={series.slice(-32)} margin={{ top: 6, right: 8, left: 0, bottom: 0 }} barCategoryGap={2} barGap={1}>
                  <CartesianGrid strokeDasharray="2 4" stroke={T.chartGrid} />
                  <XAxis dataKey="q" tick={{ fontSize: 9.5, fill: T.tx2 }} interval={3} />
                  <YAxis tick={{ fontSize: 9.5, fill: T.tx2 }} tickFormatter={v => v >= 1000 ? (v/1000).toFixed(1) + 'K' : v} />
                  <ReTooltip
                    contentStyle={{ fontSize: 11, fontFamily: T.fontFamily, background: T.bg2, border: `1px solid ${T.bd}`, borderRadius: T.radius }}
                    formatter={(v, n) => {
                      if (v == null) return ['—', n];
                      const lbl = { a: 'Absorption (12mo)', d: 'Deliveries (12mo)' }[n] || n;
                      return [Math.round(v).toLocaleString() + ' u', lbl];
                    }}
                  />
                  {fcStart && <ReferenceArea x1={fcStart} x2={fcEnd} fill={T.accent} fillOpacity={0.18} />}
                  <ReferenceLine y={0} stroke={T.tx3} strokeWidth={1} />
                  <ReBar dataKey="d" fill={T.chartNeg} name="Deliveries" opacity={0.7} />
                  <ReBar dataKey="a" fill={T.chartPos} name="Absorption" opacity={0.85} />
                  <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} iconType="rect" />
                </ComposedChart>
              </ResponsiveContainer>
              {(() => {
                const lastHist = [...series].reverse().find(r => r.fc === 0 && r.a != null && r.d != null);
                const lastUC = [...series].reverse().find(r => r.fc === 0 && r.uc != null && r.uc > 0);
                const recentNegAbs = series.filter(r => r.fc === 0 && r.a != null && r.a < 0).length;
                if (!lastHist) return null;
                const ratio = lastHist.d > 0 ? (lastHist.a / lastHist.d) : null;
                const notes = [];
                if (lastUC && (!lastHist.uc || lastHist.uc === 0)) notes.push(`UC last cleared in ${lastUC.q} — no new construction since`);
                if (recentNegAbs >= 2) notes.push(`${recentNegAbs} quarters of negative absorption (move-outs)`);
                return (
                  <div style={{ fontSize: 10.5, color: T.tx2, marginTop: 6, lineHeight: 1.4 }}>
                    {lastHist.q}: <b>{lastHist.a.toLocaleString()}u absorbed</b> against <b>{lastHist.d.toLocaleString()}u delivered</b>
                    {ratio != null && <> · <b style={{ color: ratio >= 1 ? T.chartPos : T.chartNeg }}>{ratio.toFixed(2)}x</b> absorption-to-delivery</>}.
                    {notes.length > 0 && <span style={{ color: T.tx3 }}> · {notes.join(' · ')}.</span>}
                  </div>
                );
              })()}
            </Card>
          </Grid>
        );
      })()}
    </div>
  );
}

function ZipAnalysisTab({ layerW, opMode, zipFactorW, setZipFactorW, resetZipFactors, propFactorW, subFactorW, jumpIntent, setJumpIntent, navigateTo, setSelectedSubModal,
                          leasesPerMo, preLeasedUC, stabThresh }) {
  const [selectedZip, setSelectedZip] = useState(null);
  const [sortBy, setSortBy] = useState('cs');

  // Sync left rankings card height to the right detail panel's content height.
  // ResizeObserver watches the right panel — whenever its height changes (zip
  // selection, weight slider, viewport resize), update leftHeight. The left
  // Card uses height={leftHeight} so its bottom aligns flush with the right's.
  const rightPanelRef = useRef(null);
  const [leftHeight, setLeftHeight] = useState(null);
  useEffect(() => {
    if (!rightPanelRef.current) return undefined;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const h = Math.round(entry.contentRect.height);
        if (h > 0) setLeftHeight(h);
      }
    });
    ro.observe(rightPanelRef.current);
    return () => ro.disconnect();
  }, [selectedZip]);

  useEffect(() => {
    if (jumpIntent && jumpIntent.kind === 'zip' && jumpIntent.value) {
      setSelectedZip(jumpIntent.value);
      setJumpIntent(null);
    }
  }, []);

  const zipData = useMemo(() => {
    const scored = buildScoredZips(layerW, zipFactorW);
    const propsByZip = {};
    const unitsByZip = {};
    const buyCountByZip = {};
    const propListByZip = {};
    const sp = buildScoredProps(layerW, opMode, zipFactorW, propFactorW, subFactorW);
    sp.forEach(p => {
      if (!p.z) return;
      propsByZip[p.z] = (propsByZip[p.z] || 0) + 1;
      unitsByZip[p.z] = (unitsByZip[p.z] || 0) + (p.u || 0);
      if (p.sg === 'BUY') buyCountByZip[p.z] = (buyCountByZip[p.z] || 0) + 1;
      if (!propListByZip[p.z]) propListByZip[p.z] = [];
      propListByZip[p.z].push(p);
    });
    return scored.map(z => ({
      ...z,
      ms: MS[z.z] || {},
      propCount: propsByZip[z.z] || 0,
      unitCount: unitsByZip[z.z] || 0,
      buyCount: buyCountByZip[z.z] || 0,
      properties: propListByZip[z.z] || [],
    }));
  }, [layerW, opMode, zipFactorW, propFactorW, subFactorW]);

  const sortedZips = useMemo(() => {
    const list = [...zipData];
    const cmp = {
      cs: (a, b) => b.cs - a.cs,
      pg: (a, b) => b.pg - a.pg,
      ht: (a, b) => (b.ms?.ht || 0) - (a.ms?.ht || 0),
      rp: (a, b) => b.rp - a.rp,
      i2: (a, b) => b.i2 - a.i2,
      sc: (a, b) => (b.ms?.sc || 0) - (a.ms?.sc || 0),
      props: (a, b) => b.propCount - a.propCount,
    };
    return list.sort(cmp[sortBy] || cmp.cs);
  }, [zipData, sortBy]);

  const activeZip = useMemo(() => {
    if (!selectedZip) return sortedZips[0];
    return sortedZips.find(z => z.z === selectedZip) || sortedZips[0];
  }, [selectedZip, sortedZips]);

  const updateFactor = (key, value) => {
    setZipFactorW({ ...zipFactorW, [key]: value });
  };

  const isDirty = ZIP_FACTORS.some(f => zipFactorW[f.key] !== DEFAULT_ZIP_W[f.key]);

  return (
    <div>
      {/* Intro strip — full width */}
      <Card padding={18} style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: T.tx2, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>
          Zip Code Analysis — {zipData.length} zip codes scored
        </div>
        <div style={{ fontSize: 13, color: T.tx, lineHeight: 1.55 }}>
          Zip scoring blends 16 demographic and structural factors. Tune any factor's weight using the sliders below — rankings, composite scores, and property signals update live across every tab. Sort the rankings table by different metrics to explore how each factor reshapes the zip hierarchy. Click any zip for a factor-level breakdown of its score.
        </div>
        <div style={{ marginTop: 10, padding: '8px 12px', background: T.bg3, borderRadius: T.radius, fontSize: 11, color: T.tx2, lineHeight: 1.4 }}>
          <b style={{ color: T.tx }}>Data vintage:</b> American Community Survey 2024, Market Stadium 2025, CoStar zip extracts. The Property Pipeline tab controls the broader composite layer weights (submarket / zip / property proportions).
        </div>
      </Card>

      {/* Full-width zip factor slider banner — 4x4 grid */}
      <Card padding={0} style={{ marginBottom: 20 }}>
        <div style={{
          padding: '12px 20px', background: T.bgDark, color: T.txLt,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent }}>
              Zip Factor Weights — 16 factors
            </div>
            <div style={{ fontSize: 12, color: T.txLt, marginTop: 2, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span>Drag any slider to reweight. All weights normalize automatically — scale is relative, not absolute.{isDirty && <span style={{ marginLeft: 8, color: T.accent, fontWeight: 700 }}>· Modified from defaults</span>}</span>
              <ScoringHelp scope="factor" />
            </div>
          </div>
          <button
            onClick={resetZipFactors}
            style={{
              background: isDirty ? T.accent : 'transparent',
              border: `1px solid ${isDirty ? T.accent : T.bd}`,
              borderRadius: T.radius,
              padding: '6px 14px', fontSize: 11, color: isDirty ? T.bgDark : T.txLt,
              cursor: 'pointer', fontFamily: T.fontFamily, fontWeight: 700, letterSpacing: 0.3,
            }}
          >Reset to Defaults</button>
        </div>
        <div style={{
          padding: 20, display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '18px 24px',
        }}>
          {ZIP_FACTORS.map(f => (
            <div key={f.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                <span style={{ fontSize: 11.5, color: T.tx, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {f.label}
                  <InfoTip text={f.info} />
                </span>
                <span style={{
                  fontSize: 11.5,
                  color: zipFactorW[f.key] !== DEFAULT_ZIP_W[f.key] ? T.accentDk : T.tx2,
                  fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                  background: zipFactorW[f.key] !== DEFAULT_ZIP_W[f.key] ? T.accent : T.bg3,
                  padding: '1px 7px', borderRadius: T.radius,
                  minWidth: 28, textAlign: 'center',
                }}>{zipFactorW[f.key]}</span>
              </div>
              <input
                type="range"
                value={zipFactorW[f.key]}
                onChange={e => updateFactor(f.key, Number(e.target.value))}
                min={0}
                max={25}
                step={1}
                style={{
                  width: '100%',
                  accentColor: T.accentDk,
                  cursor: 'pointer',
                  height: 4,
                }}
              />
              <div style={{ fontSize: 9, color: T.tx3, marginTop: 2, fontStyle: 'italic' }}>
                default {DEFAULT_ZIP_W[f.key]}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Main layout: zip table left, detail right.
          ResizeObserver measures the right panel's height (above), and we set
          the left card to that exact pixel height. List scrolls inside the
          card. Bottom flush with the right panel's last content. */}
      <Grid cols={2} gap={16} style={{ marginBottom: 20, gridTemplateColumns: '1fr 1fr', alignItems: 'start' }}>
        {/* Zip rankings table — height matches right panel */}
        <Card
          title="Zip Rankings"
          subtitle={`Sorted by ${({cs:'Composite Score',pg:'Population Growth',ht:'HiTech %',rp:'Renter %',i2:'Income 25-44',sc:'Schools',props:'Atlas Property Count'})[sortBy]}`}
          padding={0}
          style={{}}
          right={
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{
              fontSize: 11, padding: '4px 8px', border: `1px solid ${T.bd}`, borderRadius: T.radius,
              background: T.bg2, color: T.tx, fontFamily: T.fontFamily, cursor: 'pointer',
            }}>
              <option value="cs">Composite Score</option>
              <option value="pg">Pop Growth</option>
              <option value="ht">HiTech %</option>
              <option value="rp">Renter %</option>
              <option value="i2">Income 25-44</option>
              <option value="sc">Schools</option>
              <option value="props">Property Count</option>
            </select>
          }
        >
          <div style={{ maxHeight: leftHeight ? Math.max(200, leftHeight - 56) : 700, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: T.fontFamily }}>
              <thead>
                <tr style={{ background: T.bgDark, position: 'sticky', top: 0 }}>
                  {['#', 'Zip', 'Submarket', 'Score', 'Props', 'BUY'].map((h, i) => (
                    <th key={h} style={{
                      padding: '10px 10px', textAlign: i < 3 ? 'left' : 'right',
                      fontSize: 9.5, fontWeight: 700, color: T.txLt,
                      textTransform: 'uppercase', letterSpacing: 0.6, whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedZips.map((z, i) => {
                  const active = z.z === activeZip?.z;
                  return (
                    <tr
                      key={z.z}
                      onClick={() => setSelectedZip(z.z)}
                      style={{
                        borderBottom: `1px solid ${T.bd2}`,
                        cursor: 'pointer',
                        background: active ? T.accent : (i % 2 === 0 ? T.bg2 : T.bg3),
                        borderLeft: active ? `3px solid ${T.accentDk}` : '3px solid transparent',
                      }}
                    >
                      <td style={{ padding: '8px 10px', color: T.tx2, fontVariantNumeric: 'tabular-nums' }}>{i + 1}</td>
                      <td style={{ padding: '8px 10px', color: T.tx, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{z.z}</td>
                      <td style={{ padding: '8px 10px', color: T.tx2, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{z.sb || '—'}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.accentDk, fontWeight: 700 }}>{z.cs}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.tx }}>{z.propCount || '—'}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                        color: z.buyCount > 0 ? T.buyTx : T.tx3, fontWeight: z.buyCount > 0 ? 700 : 400 }}>
                        {z.buyCount || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Selected zip detail with factor breakdown — measured by ResizeObserver */}
        {activeZip && (
          <div ref={rightPanelRef}>
          <Card padding={20}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 10, color: T.tx2, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600 }}>Zip Code</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: T.tx, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{activeZip.z}</div>
                {setSelectedSubModal ? (
                  <div
                    onClick={() => setSelectedSubModal(activeZip.sb)}
                    onMouseEnter={e => { e.currentTarget.style.color = T.accentDk; e.currentTarget.style.borderBottomColor = T.accentDk; }}
                    onMouseLeave={e => { e.currentTarget.style.color = T.tx2; e.currentTarget.style.borderBottomColor = 'transparent'; }}
                    style={{ fontSize: 12, color: T.tx2, marginTop: 2, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, borderBottom: '1px dashed transparent', transition: 'all 0.12s' }}
                    title={`Open ${activeZip.sb} submarket deep dive`}
                  >
                    {activeZip.sb} <ChevronRight size={11} />
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: T.tx2, marginTop: 2 }}>{activeZip.sb}</div>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: T.tx2, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600 }}>Composite</div>
                <div style={{ fontSize: 30, fontWeight: 700, color: T.accentDk, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{activeZip.cs}</div>
                <div style={{ fontSize: 11, color: T.tx2, marginTop: 4 }}>{activeZip.propCount} Atlas props · {fmtN(activeZip.unitCount)} units</div>
              </div>
            </div>

            {}
            {(() => {
              const sameSubZips = sortedZips.filter(z => z.sb === activeZip.sb);
              const parentSub = buildScoredSubs(subFactorW).find(s => s.s === activeZip.sb);
              const conviction = buildZipConviction(activeZip, parentSub ? parentSub.cs : null, sameSubZips);
              if (!conviction) return null;
              return (
                <div style={{ marginBottom: 14 }}>
                  <ConvictionHeader
                    title={`Zip ${activeZip.z} — Conviction Snapshot`}
                    subtitle={`Within ${activeZip.sb} submarket · ranked vs peers · re-renders when sliders move`}
                    signals={conviction.signals}
                    footer={conviction.footer}
                  />
                </div>
              );
            })()}

            {/* Demographics strip */}
            <Grid cols={2} gap={12} style={{ marginBottom: 14 }}>
              <Metric label="Population Growth (4Y)" value={fmtPctD(activeZip.pg)} size="sm" />
              <Metric label="Renter Households" value={fmtPct(activeZip.rp, 0)} size="sm" />
              <Metric label="Median Income" value={fmt$(activeZip.mi)} size="sm" />
              <Metric label="Median Income Age 25-44" value={fmt$(activeZip.i2)} size="sm" />
              <Metric label="HiTech Employment" value={fmtPct(activeZip.ms?.ht, 1)} size="sm" />
              <Metric label="Six-figure Households" value={fmtPct(activeZip.ms?.sf, 0)} size="sm" />
              <Metric label="School Rating" value={activeZip.ms?.sc ? `${activeZip.ms.sc.toFixed(1)} / 10` : '—'} size="sm" />
              <Metric label="Median Commute" value={activeZip.ms?.ct ? `${activeZip.ms.ct.toFixed(0)} min` : '—'} size="sm" />
            </Grid>

            {/* Combined LU + UC absorption pressure in this zip */}
            {(() => {
              const zipLU = zipLeaseUpSummary(activeZip.z, leasesPerMo, preLeasedUC, stabThresh);
              if (!zipLU) return null;
              const observedDisplay = zipLU.luProps > 0 ? zipLU.meanVel.toFixed(1) : null;
              return (
                <div style={{ borderTop: `1px solid ${T.bd2}`, paddingTop: 14, marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: T.watchTx, letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: 700 }}>
                      ◐ Absorption Pipeline in Zip {activeZip.z}
                      {zipLU.thinSample && <span style={{ marginLeft: 8, fontSize: 9, padding: '1px 6px', background: T.watchTx, color: T.txLt, borderRadius: 3, letterSpacing: 0.3, fontWeight: 700 }}>THIN SAMPLE</span>}
                    </div>
                    <div style={{ fontSize: 9.5, color: T.tx3, fontStyle: 'italic' }}>CoStar + RealPage · 26Q2TD</div>
                  </div>
                  <div style={{ padding: 12, background: T.bg3, border: `1px solid ${T.bd2}`, borderLeft: `3px solid ${T.watchTx}`, borderRadius: T.radius }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10, marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 9, color: T.tx3, letterSpacing: 0.3, textTransform: 'uppercase' }}>LU Props</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: T.tx, fontVariantNumeric: 'tabular-nums' }}>{zipLU.luProps}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: T.tx3, letterSpacing: 0.3, textTransform: 'uppercase' }}>UC Deals</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: zipLU.ucDeals > 0 ? T.watchTx : T.tx3, fontVariantNumeric: 'tabular-nums' }}>{zipLU.ucDeals || '—'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: T.tx3, letterSpacing: 0.3, textTransform: 'uppercase' }}>Pool Units</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: T.tx, fontVariantNumeric: 'tabular-nums' }}>{fmtN(zipLU.totalUnits)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: T.tx3, letterSpacing: 0.3, textTransform: 'uppercase' }}>Delivered Occ</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: T.accentDk, fontVariantNumeric: 'tabular-nums' }}>{zipLU.deliveredOcc != null ? `${(zipLU.deliveredOcc*100).toFixed(0)}%` : '—'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: T.tx3, letterSpacing: 0.3, textTransform: 'uppercase' }} title="Zip's actual observed mean velocity from CoStar/RealPage data">Observed Vel</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: T.tx2, fontVariantNumeric: 'tabular-nums' }}>{observedDisplay != null ? observedDisplay : '—'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: T.tx3, letterSpacing: 0.3, textTransform: 'uppercase' }} title="Velocity assumption from the Lease-Up tab slider — what's used to compute the stab quarter">Assumption</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: T.accentDk, fontVariantNumeric: 'tabular-nums' }}>{leasesPerMo.toFixed(1)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: T.tx3, letterSpacing: 0.3, textTransform: 'uppercase' }}>Full Pool Stab</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: zipLU.stabMonths && zipLU.stabMonths <= 24 ? T.chartPos : T.watchTx, fontVariantNumeric: 'tabular-nums' }}>{zipLU.stabQuarter}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: T.tx2, lineHeight: 1.45 }}>
                      {zipLU.luProps > 0
                        ? <>{zipLU.luProps} active lease-up {zipLU.luProps === 1 ? 'property' : 'properties'} ({fmtN(zipLU.luUnits)}u) at {(zipLU.deliveredOcc*100).toFixed(1)}% delivered</>
                        : <>No active lease-ups today</>}
                      {zipLU.ucDeals > 0 && <> plus <b>{zipLU.ucDeals} UC {zipLU.ucDeals === 1 ? 'deal' : 'deals'} ({fmtN(zipLU.ucUnits)}u)</b> delivering 26Q2–28Q2</>}.
                      {' '}At <b>{leasesPerMo}/mo</b> assumption{observedDisplay != null ? <> (zip's observed mean is {observedDisplay}/mo across {zipLU.luProps} {zipLU.luProps === 1 ? 'prop' : 'props'}{zipLU.thinSample ? ', thin sample' : ''})</> : <> (no LU observations in this zip yet — UC-only)</>}, the combined pool fully absorbs <b>{zipLU.stabQuarter}</b>{zipLU.stabMonths != null ? ` (${zipLU.stabMonths} months out).` : '.'}
                    </div>
                  </div>
                </div>
              );
            })()}

            {}
            {(() => {
              const zipEmps = EMPLOYERS.filter(e => e.z === activeZip.z);
              if (zipEmps.length === 0) return null;
              const top5 = zipEmps.slice(0, 5);
              const more = zipEmps.length - top5.length;
              return (
                <div style={{ borderTop: `1px solid ${T.bd2}`, paddingTop: 14, marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                    <div style={{ fontSize: 10, color: T.tx2, letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: 700 }}>
                      Major Employers in Zip {activeZip.z}
                    </div>
                    <div style={{ fontSize: 9.5, color: T.tx3, fontStyle: 'italic' }}>
                      {zipEmps.length} mapped · Opportunity Austin
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {top5.map((e, i) => (
                      <div key={`${e.n}-${i}`} style={{
                        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                        gap: 12, padding: '4px 0',
                        borderBottom: i < top5.length - 1 ? `1px solid ${T.bd2}` : 'none',
                      }}>
                        <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: 11.5, fontWeight: 600, color: T.tx, lineHeight: 1.3, wordBreak: 'break-word' }}>{e.n}</span>
                          <span style={{ fontSize: 10, color: T.tx3, marginTop: 1 }}>{e.ind}</span>
                        </div>
                        <div style={{
                          flex: '0 0 auto', fontSize: 9.5, fontWeight: 700,
                          color: e.rank <= 0 ? T.buyTx : e.rank <= 1 ? T.tx : T.tx2,
                          background: e.rank <= 0 ? T.buyBg : 'transparent',
                          border: e.rank <= 0 ? `1px solid ${T.buyBd}` : `1px solid ${T.bd2}`,
                          borderRadius: T.radius, padding: '1px 6px',
                          fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                        }}>{e.tier}</div>
                      </div>
                    ))}
                  </div>
                  {more > 0 && (
                    <div style={{ fontSize: 10, color: T.tx3, marginTop: 6, fontStyle: 'italic' }}>
                      + {more} additional employer{more === 1 ? '' : 's'} in this zip
                    </div>
                  )}
                </div>
              );
            })()}

            {/* 16-factor score contributions — live-reactive to slider weights */}
            <div style={{ borderTop: `1px solid ${T.bd2}`, paddingTop: 14 }}>
              <div style={{ fontSize: 10, color: T.tx2, letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>
                Factor Contributions — Current Weights
              </div>
              {(() => {
                const m = activeZip.ms || {};
                const z = activeZip;
                const rows = [
                  { key: 'ht', label: 'HiTech workers %', norm: lerp(m.ht, 2, 15) },
                  { key: 'pg', label: 'Population growth (4Y)', norm: lerp(z.pg, -5, 30) },
                  { key: 'rp', label: 'Renter households %', norm: lerp(z.rp, 10, 75) },
                  { key: 'cp', label: 'Construction pipeline (inv)', norm: lerp(m.cp, 0, 30, true) },
                  { key: 'sf', label: 'Six-figure households %', norm: lerp(m.sf, 20, 70) },
                  { key: 'i2', label: 'Income, age 25-44', norm: lerp(z.i2, 60000, 180000) },
                  { key: 'ct', label: 'Median commute (inv)', norm: lerp(m.ct, 18, 35, true) },
                  { key: 'rt', label: 'Retail score', norm: lerp(m.rt, 0, 80) },
                  { key: 'fs', label: 'Forecast score (MS)', norm: lerp(m.fs, 30, 90) },
                  { key: 'wk', label: 'Walkability', norm: lerp(m.wk, 0, 80) },
                  { key: 'tc', label: 'Crime per 1K (inv)', norm: lerp(m.tc, 50, 500, true) },
                  { key: 'jo', label: 'Jobs per 1K population', norm: lerp(m.jo, 50, 1500) },
                  { key: 'ns', label: 'New supply % (inv)', norm: lerp(z.ns, 0, 20, true) },
                  { key: 'sc', label: 'School rating', norm: lerp(m.sc, 2, 9) },
                  { key: 'mf', label: 'Multifamily density %', norm: lerp(z.mf, 5, 60) },
                  { key: 'p2', label: 'Pre-2000 stock %', norm: lerp(z.p2, 10, 80) },
                ];
                const totalW = rows.reduce((a, r) => a + (zipFactorW[r.key] || 0), 0);
                return rows.map(r => {
                  const w = zipFactorW[r.key] || 0;
                  const contrib = totalW > 0 ? (r.norm * w / totalW).toFixed(1) : '0.0';
                  const normColor = r.norm >= 70 ? T.chartPos : r.norm < 40 ? T.chartNeg : T.tx;
                  const isActive = w !== DEFAULT_ZIP_W[r.key];
                  return (
                    <div key={r.key} style={{ marginBottom: 6, fontSize: 11 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span style={{ color: T.tx }}>
                          {r.label}
                          <span style={{ color: isActive ? T.accentDk : T.tx3, fontSize: 10, fontWeight: isActive ? 700 : 400, marginLeft: 4 }}>
                            (wt {w}{isActive ? '*' : ''})
                          </span>
                        </span>
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                          <span style={{ color: normColor, fontWeight: 600 }}>{r.norm}</span>
                          <span style={{ color: T.tx3, marginLeft: 6 }}>→ {contrib} pts</span>
                        </span>
                      </div>
                      <div style={{ background: T.bd2, height: 3, borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ background: normColor, height: '100%', width: `${r.norm}%` }} />
                      </div>
                    </div>
                  );
                });
              })()}
              <div style={{ fontSize: 10, color: T.tx3, marginTop: 10, fontStyle: 'italic' }}>
                * asterisk indicates weight has been modified from the default value
              </div>
            </div>
          </Card>
          </div>
        )}
      </Grid>

      {/* Property roster for active zip — full width below the grid */}
      {activeZip && activeZip.properties.length > 0 && (
        <Card
          title={`Properties in Zip ${activeZip.z} — ${activeZip.properties.length} Atlas-screened`}
          subtitle={`Ranked by composite score (current weights: ${layerW[0]}/${layerW[1]}/${layerW[2]}). Click any row to open the property card.`}
          padding={0}
          titleInfo={DV.props}
        >
          <div style={{ maxHeight: 480, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, fontFamily: T.fontFamily }}>
              <thead>
                <tr style={{ background: T.bgDark, position: 'sticky', top: 0 }}>
                  {['Property', 'Submarket', 'Built', 'Units', 'Class', 'Rent', 'Vac', 'Conc', 'CS', 'Signal'].map((h, i) => (
                    <th key={h} style={{
                      padding: '10px 12px', textAlign: i <= 1 ? 'left' : 'right',
                      fontSize: 9.5, fontWeight: 700, color: T.txLt,
                      textTransform: 'uppercase', letterSpacing: 0.6, whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeZip.properties.sort((a, b) => b.cs - a.cs).map((p, i) => (
                  <tr
                    key={i}
                    onClick={() => navigateTo && navigateTo('prop', p.n)}
                    title="Open property card"
                    style={{ borderBottom: `1px solid ${T.bd2}`, background: i % 2 === 0 ? T.bg2 : T.bg3, cursor: navigateTo ? 'pointer' : 'default' }}
                    onMouseEnter={e => { if (navigateTo) e.currentTarget.style.background = T.accent; }}
                    onMouseLeave={e => { e.currentTarget.style.background = i % 2 === 0 ? T.bg2 : T.bg3; }}
                  >
                    <td style={{ padding: '8px 12px', color: T.tx, fontWeight: 500, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.sweet && <Target size={10} style={{ display: 'inline', marginRight: 4, color: T.accentDk }} />}
                      {LEASEUP_BY_MAIN[p.n] && <span title={`Lease-up · ${(LEASEUP_BY_MAIN[p.n].curOcc*100).toFixed(0)}% occ · ${LEASEUP_BY_MAIN[p.n].vel}/mo`} style={{ display: 'inline-block', fontSize: 9, fontWeight: 700, padding: '1px 5px', background: T.watchTx, color: T.txLt, borderRadius: 3, marginRight: 5, letterSpacing: 0.3 }}>◐ LU</span>}
                      {p.n}
                    </td>
                    <td style={{ padding: '8px 12px', color: T.tx2, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.sb || '—'}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.tx }}>{p.yb || '—'}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.tx }}>{p.u}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: T.tx }}>{p.cl || '—'}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.tx }}>{fmtRent(p.er)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                      color: p.v < 10 ? T.chartPos : p.v > 18 ? T.chartNeg : T.tx }}>{p.v != null ? p.v.toFixed(1) + '%' : '—'}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                      color: p.cn != null && p.cn > 10 ? T.chartNeg : T.tx }}>{p.cn != null ? `${p.cn.toFixed(1)}%` : '—'}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.accentDk, fontWeight: 700 }}>{p.cs}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}><Pill signal={p.sg} size="sm" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {activeZip && activeZip.properties.length === 0 && (
        <Card padding={20}>
          <div style={{ fontSize: 12, color: T.tx2, fontStyle: 'italic' }}>
            No Atlas-screened properties currently mapped to zip {activeZip.z}. The zip is scored on demographics; properties may roll up to neighboring zips in the CoStar dataset.
          </div>
        </Card>
      )}
    </div>
  );
}

const CORE_FIELDS = ['yb', 'u', 'sf', 'v', 'cn', 'cl', 'er', 'o', 'z', 'sb'];
const dataPct = (p) => Math.round(CORE_FIELDS.filter(f => p[f] != null && p[f] !== '').length / CORE_FIELDS.length * 100);

const matYear = (mt) => {
  if (!mt) return null;
  const parts = String(mt).split('/');
  if (parts.length !== 3) return null;
  const y = parseInt(parts[2], 10);
  return isNaN(y) ? null : y;
};

const saleYear = (sd) => {
  if (!sd) return null;
  const s = String(sd).slice(0, 4);
  const y = parseInt(s, 10);
  return isNaN(y) ? null : y;
};

/* URBAN_SUBS is provided per-market via hydrate() from market data (d.URBAN_SUBS). */
const vintageBandPpu = (yb) => {
  if (yb == null) return { mid: 180000, low: 150000, high: 220000 };
  if (yb >= 2020) return { mid: 232000, low: 200000, high: 280000 };
  if (yb >= 2010) return { mid: 209000, low: 175000, high: 250000 };
  if (yb >= 2000) return { mid: 159000, low: 130000, high: 195000 };
  return { mid: 145000, low: 115000, high: 180000 };
};
function expectedPpu(p) {
  const v = vintageBandPpu(p.yb);
  let low = v.low, mid = v.mid, high = v.high;
  const drivers = [];
  drivers.push(`Vintage ${p.yb || '?'}: baseline $${Math.round(v.mid/1000)}K/u`);

  if (p.sb && URBAN_SUBS.has(p.sb)) {
    low *= 1.25; mid *= 1.35; high *= 1.55;
    drivers.push(`Urban sub (+35% mid)`);
  } else {
    drivers.push(`Suburban sub (no premium)`);
  }

  if (p.cl === 'A') {
    low *= 1.05; mid *= 1.10; high *= 1.15;
    drivers.push(`Class A (+10%)`);
  } else if (p.cl === 'C') {
    low *= 0.80; mid *= 0.80; high *= 0.85;
    drivers.push(`Class C (-20%)`);
  }

  if (p.sf && p.sf >= 1000) {
    low *= 1.05; mid *= 1.08; high *= 1.10;
    drivers.push(`Avg SF ≥1,000 (+8%)`);
  }

  if (p.ds != null && p.ds >= 5) {
    low *= 0.85; mid *= 0.88; high *= 0.93;
    drivers.push(`Distress discount (-12%)`);
  }

  return {
    low: Math.round(low / 1000) * 1000,
    mid: Math.round(mid / 1000) * 1000,
    high: Math.round(high / 1000) * 1000,
    drivers,
    totalValueLow: Math.round(low / 1000) * 1000 * (p.u || 0),
    totalValueMid: Math.round(mid / 1000) * 1000 * (p.u || 0),
    totalValueHigh: Math.round(high / 1000) * 1000 * (p.u || 0),
  };
}

const PREVAILING_REFI_RATE = 6.75;
function refiPressure(p) {
  const mY = matYear(p.mt);
  const isFloating = p.it === 'Floating' || p.it === 'Variable';
  const signals = [];
  let rawScore = 0;

  if (mY != null) {
    const yearsToMat = mY - 2026;
    let matPts = 0;
    if (yearsToMat <= 0)      matPts = 30;
    else if (yearsToMat <= 1) matPts = 25;
    else if (yearsToMat <= 2) matPts = 18;
    else if (yearsToMat <= 4) matPts = 10;
    else if (yearsToMat <= 7) matPts = 4;
    else                      matPts = 0;
    rawScore += matPts;
    if (matPts > 0) signals.push({ label: `Maturity ${mY}`, pts: matPts, explain: `${yearsToMat <= 0 ? 'Already mature' : yearsToMat + ' year' + (yearsToMat === 1 ? '' : 's') + ' to maturity'}` });
  } else {
    signals.push({ label: 'Maturity unknown', pts: 0, explain: 'No loan data available' });
  }

  if (isFloating) {
    rawScore += 25;
    signals.push({ label: 'Floating rate', pts: 25, explain: 'Rate resets drive pressure' });
  }

  if (p.lr != null) {
    const spread = PREVAILING_REFI_RATE - p.lr;
    let spreadPts = 0;
    if (spread >= 3.5)      spreadPts = 20;
    else if (spread >= 2.5) spreadPts = 15;
    else if (spread >= 1.5) spreadPts = 8;
    else if (spread >= 0.5) spreadPts = 3;
    else                    spreadPts = 0;
    rawScore += spreadPts;
    if (spreadPts > 0) signals.push({ label: `Rate ${p.lr.toFixed(2)}% vs ${PREVAILING_REFI_RATE}% prevailing`, pts: spreadPts, explain: `+${Math.round(spread * 100)} bps refi gap` });
  } else if (isFloating) {
    rawScore += 12;
    signals.push({ label: 'Floating assumed ~4.5% orig', pts: 12, explain: '~225 bps below prevailing (estimated)' });
  }

  if (p.la > 0 && p.u > 0) {
    const est = expectedPpu(p);
    const estValue = est.totalValueMid;
    const ltv = p.la / estValue;
    let ltvPts = 0;
    if (ltv >= 0.85)      ltvPts = 15;
    else if (ltv >= 0.75) ltvPts = 10;
    else if (ltv >= 0.65) ltvPts = 5;
    else                  ltvPts = 0;
    rawScore += ltvPts;
    if (ltvPts > 0) signals.push({ label: `Est. LTV ${(ltv*100).toFixed(0)}%`, pts: ltvPts, explain: `Loan ${fmt$(p.la)} vs est. value ${fmt$(estValue)}` });
  }

  const sY = saleYear(p.sd);
  if (sY != null && (sY === 2021 || sY === 2022)) {
    rawScore += 10;
    signals.push({ label: '2021-22 peak purchase', pts: 10, explain: `Bought ${sY} at peak basis` });
  }

  const score = Math.min(10, rawScore / 10);
  return { score, rawScore, signals, maxRaw: 100 };
}

function distressBreakdown(p) {
  const mY = matYear(p.mt);
  const sY = saleYear(p.sd);
  const isFloating = p.it === 'Floating' || p.it === 'Variable';
  const inputs = [];
  const pushRow = (applicable, pts, label, explain) => inputs.push({ applicable, pts: applicable ? pts : 0, max: pts, label, explain });

  pushRow(
    isFloating && mY != null && mY <= 2027,
    20,
    'Variable rate + matures ≤ 2027',
    isFloating && mY != null ? `Floating rate, matures ${mY}` : !isFloating ? 'Not floating rate' : 'Maturity unknown or beyond 2027'
  );
  pushRow(
    mY != null && mY <= 2026,
    10,
    'Matures ≤ 2026',
    mY != null ? `Matures ${mY}${mY <= 2026 ? ' — near-term refi pressure' : ''}` : 'No loan data'
  );
  pushRow(
    p.v != null && p.v > 20,
    10,
    'Vacancy > 20%',
    p.v != null ? `${p.v.toFixed(1)}% vacancy` : 'Vacancy data missing'
  );
  pushRow(
    p.cn != null && p.cn > 15,
    10,
    'Concessions > 15%',
    p.cn != null ? `${p.cn.toFixed(1)}% concessions` : 'Concessions data missing'
  );
  pushRow(
    sY != null && (sY === 2021 || sY === 2022),
    15,
    '2021-22 peak purchase',
    sY != null ? `Last sold ${sY}${(sY === 2021 || sY === 2022) ? ' — bought at peak pricing' : ''}` : 'No recent sale recorded'
  );

  const rawTotal = inputs.reduce((a, r) => a + r.pts, 0);
  const total = rawTotal / 6.5;
  return { total, inputs, rawTotal, maxTotal: 65 };
}

function PropertyPipelineTab({
  layerW, setLayerW, opMode, setOpMode,
  zipFactorW, propFactorW, setPropFactorW, subFactorW,
  resetScoring, resetPropFactors,
  jumpIntent, setJumpIntent,
  selectedProp, setSelectedProp,
  leasesPerMo, preLeasedUC, stabThresh
}) {
  const [mapVisible, setMapVisible] = useState(true);
  const [ownersVisible, setOwnersVisible] = useState(false);
  const [maturitiesVisible, setMaturitiesVisible] = useState(false);

  const [searchText, setSearchText] = useState('');
  const [sigFilter, setSigFilter] = useState({ BUY: true, WATCH: true, AVOID: true });
  const [subFilter, setSubFilter] = useState(new Set());
  const [classFilter, setClassFilter] = useState({ A: true, B: true, C: true, unknown: true });
  const [minUnits, setMinUnits] = useState(0);
  const [minVintage, setMinVintage] = useState(1960);
  const [buyBoxOnly, setBuyBoxOnly] = useState(false);
  const [sweetOnly, setSweetOnly] = useState(false);
  const [distressedOnly, setDistressedOnly] = useState(false);
  const [leaseUpOnly, setLeaseUpOnly] = useState(false);
  const [ownerFilter, setOwnerFilter] = useState(null);
  const [matYrFilter, setMatYrFilter] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showPropSliders, setShowPropSliders] = useState(true);

  const [sortKey, setSortKey] = useState('cs');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const [mapZoom, setMapZoom] = useState(1);
  const [mapCenter, setMapCenter] = useState({ x: MAP_VIEW.W/2, y: MAP_VIEW.H/2 });
  const [dragStart, setDragStart] = useState(null);
  const [hoveredProp, setHoveredProp] = useState(null);
  const [subOverlayVisible, setSubOverlayVisible] = useState(false);

  const [compareSet, setCompareSet] = useState(new Set());
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const toggleCompare = (name) => {
    const next = new Set(compareSet);
    if (next.has(name)) next.delete(name);
    else {
      if (next.size >= 4) return;
      next.add(name);
    }
    setCompareSet(next);
  };

  const [searchFocused, setSearchFocused] = useState(false);

  const resetFilters = () => {
    setSearchText('');
    setSigFilter({ BUY: true, WATCH: true, AVOID: true });
    setSubFilter(new Set());
    setClassFilter({ A: true, B: true, C: true, unknown: true });
    setMinUnits(0);
    setMinVintage(1960);
    setBuyBoxOnly(false);
    setSweetOnly(false);
    setDistressedOnly(false);
    setLeaseUpOnly(false);
    setOwnerFilter(null);
    setMatYrFilter(null);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (selectedProp) {
        setSelectedProp(null);
      } else if (ownerFilter || matYrFilter || searchText || buyBoxOnly || sweetOnly || distressedOnly || leaseUpOnly || subFilter.size > 0) {
        resetFilters();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedProp, ownerFilter, matYrFilter, searchText, buyBoxOnly, sweetOnly, distressedOnly, leaseUpOnly, subFilter]);

  const scoredProps = useMemo(() => {
    return buildScoredProps(layerW, opMode, zipFactorW, propFactorW, subFactorW);
  }, [layerW, opMode, zipFactorW, propFactorW, subFactorW]);

  const searchSuggestions = useMemo(() => {
    const s = searchText.trim().toLowerCase();
    if (s.length < 2) return [];
    const matches = [];
    for (const p of scoredProps) {
      const nameLc = (p.n || '').toLowerCase();
      let rank = null;
      if (nameLc.startsWith(s))      rank = 0;
      else if (nameLc.includes(s))   rank = 1;
      else {
        const otherHay = [p.o, p.z, p.sb, p.m].filter(Boolean).join(' ').toLowerCase();
        if (otherHay.includes(s))    rank = 2;
      }
      if (rank != null) matches.push({ p, rank });
    }
    matches.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return (b.p.cs || 0) - (a.p.cs || 0);
    });
    return matches.slice(0, 8).map(m => m.p);
  }, [searchText, scoredProps]);

  const filtered = useMemo(() => {
    const s = searchText.trim().toLowerCase();
    return scoredProps.filter(p => {
      if (!sigFilter[p.sg]) return false;
      if (subFilter.size > 0 && !subFilter.has(p.sb)) return false;
      if ((p.u || 0) < minUnits) return false;
      if ((p.yb || 0) < minVintage) return false;
      const clKey = p.cl || 'unknown';
      if (!classFilter[clKey]) return false;
      if (buyBoxOnly && !(p.u >= 150 && p.yb >= 2000 && (p.sf || 0) >= 900)) return false;
      if (sweetOnly && !p.sweet) return false;
      if (distressedOnly && !(p.ds != null && p.ds >= 5)) return false;
      if (leaseUpOnly && !LEASEUP_BY_MAIN[p.n]) return false;
      if (ownerFilter && p.o !== ownerFilter) return false;
      if (matYrFilter && p.matYr !== matYrFilter) return false;
      if (s) {
        const hay = [p.n, p.o, p.z, p.sb, p.m].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [scoredProps, searchText, sigFilter, subFilter, minUnits, minVintage, classFilter, buyBoxOnly, sweetOnly, distressedOnly, leaseUpOnly, ownerFilter, matYrFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const mult = sortDir === 'desc' ? -1 : 1;
    arr.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      let primary;
      if (av == null && bv == null) primary = 0;
      else if (av == null) primary = 1;
      else if (bv == null) primary = -1;
      else if (typeof av === 'string') primary = av.localeCompare(bv) * mult;
      else primary = (av - bv) * mult;
      if (primary !== 0) return primary;
      if (sortKey === 'cs') return 0;
      const acs = a.cs != null ? a.cs : -1;
      const bcs = b.cs != null ? b.cs : -1;
      return bcs - acs;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);


  useMemo(() => setPage(0), [searchText, sigFilter, subFilter, minUnits, minVintage, classFilter, buyBoxOnly, sweetOnly, distressedOnly, ownerFilter, matYrFilter, sortKey, sortDir]);

  const pageStart = page * PAGE_SIZE;
  const pageEnd = Math.min(pageStart + PAGE_SIZE, sorted.length);
  const pageProps = sorted.slice(pageStart, pageEnd);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));

  const summary = useMemo(() => {
    const f = filtered;
    return {
      total: f.length,
      units: f.reduce((a, p) => a + (p.u || 0), 0),
      buy: f.filter(p => p.sg === 'BUY').length,
      watch: f.filter(p => p.sg === 'WATCH').length,
      avoid: f.filter(p => p.sg === 'AVOID').length,
      distressed: f.filter(p => p.ds != null && p.ds >= 5).length,
      mat27: f.filter(p => p.matYr && p.matYr <= 2027).length,
    };
  }, [filtered]);

  const ownerData = useMemo(() => {
    const byOwner = {};
    filtered.forEach(p => {
      if (!p.o) return;
      if (!byOwner[p.o]) byOwner[p.o] = { n: p.o, props: 0, units: 0, dsSum: 0, dsCount: 0, subs: new Set() };
      byOwner[p.o].props += 1;
      byOwner[p.o].units += (p.u || 0);
      if (p.ds != null) { byOwner[p.o].dsSum += p.ds; byOwner[p.o].dsCount += 1; }
      if (p.sb) byOwner[p.o].subs.add(p.sb);
    });
    return Object.values(byOwner)
      .map(o => ({
        ...o,
        avgDistress: o.dsCount > 0 ? o.dsSum / o.dsCount : null,
        subs: [...o.subs],
      }))
      .sort((a, b) => b.units - a.units)
      .slice(0, 20);
  }, [filtered]);

  const maturityCols = useMemo(() => {
    const years = [2024, 2025, 2026, 2027, 2028, 2029, 2030];
    return years.map(y => {
      const props = filtered.filter(p => p.matYr === y);
      const floating = props.filter(p => p.it === 'Floating' || (p.it && /float/i.test(p.it))).length;
      return { year: y, props, count: props.length, floating };
    });
  }, [filtered]);

  const allSubs = useMemo(() => [...new Set(scoredProps.map(p => p.sb).filter(Boolean))].sort(), [scoredProps]);

  const mv = MAP_VIEW;
  const vbW = mv.W / mapZoom;
  const vbH = mv.H / mapZoom;
  const vbX = mapCenter.x - vbW / 2;
  const vbY = mapCenter.y - vbH / 2;
  const viewBox = `${vbX} ${vbY} ${vbW} ${vbH}`;
  const project = (lat, lng) => ({
    x: ((lng - mv.LNG0) / (mv.LNG1 - mv.LNG0)) * mv.W,
    y: ((mv.LAT1 - lat) / (mv.LAT1 - mv.LAT0)) * mv.H,
  });
  const pathFromPts = pts => {
    if (!pts || pts.length === 0) return '';
    return pts.map((pt, i) => {
      const p = project(pt[0], pt[1]);
      return `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    }).join(' ');
  };

  const onMapMouseDown = (e) => {
    setDragStart({ clientX: e.clientX, clientY: e.clientY, centerX: mapCenter.x, centerY: mapCenter.y });
  };
  const onMapMouseMove = (e) => {
    if (!dragStart) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = vbW / rect.width;
    const scaleY = vbH / rect.height;
    setMapCenter({
      x: dragStart.centerX - (e.clientX - dragStart.clientX) * scaleX,
      y: dragStart.centerY - (e.clientY - dragStart.clientY) * scaleY,
    });
  };
  const onMapMouseUp = () => setDragStart(null);

  const dotR = 2.5;
  const dotRsweet = 3.5;
  const dotRactive = 5;

  const convexHull = (pts) => {
    if (pts.length < 3) return pts.slice();
    const sorted = [...pts].sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x);
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower = [];
    for (const p of sorted) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
      lower.push(p);
    }
    const upper = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
      const p = sorted[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
      upper.push(p);
    }
    return lower.slice(0, -1).concat(upper.slice(0, -1));
  };

  const subOverlays = useMemo(() => {
    if (!subOverlayVisible) return [];
    const bySub = {};
    for (const p of filtered) {
      if (p.lat == null || p.lng == null || !p.sb) continue;
      (bySub[p.sb] = bySub[p.sb] || []).push(p);
    }
    const scoredSubs = buildScoredSubs(subFactorW);
    const subScoreMap = {};
    scoredSubs.forEach(s => { subScoreMap[s.s] = s.cs; });
    const polys = [];
    for (const [subName, props] of Object.entries(bySub)) {
      if (props.length < 3) continue;
      const ptsXY = props.map(p => {
        const pr = project(p.lat, p.lng);
        return { x: pr.x, y: pr.y };
      });
      const hull = convexHull(ptsXY);
      if (hull.length < 3) continue;
      const centroidX = hull.reduce((a, h) => a + h.x, 0) / hull.length;
      const centroidY = hull.reduce((a, h) => a + h.y, 0) / hull.length;
      polys.push({
        sub: subName,
        hull,
        centroid: { x: centroidX, y: centroidY },
        score: subScoreMap[subName] || 0,
        propCount: props.length,
      });
    }
    return polys;
  }, [filtered, subOverlayVisible, subFactorW]);

  const fitToProps = (propsArr) => {
    const geo = propsArr.filter(p => p.lat != null && p.lng != null);
    if (geo.length === 0) return;
    if (geo.length === 1) {
      const p = project(geo[0].lat, geo[0].lng);
      setMapCenter({ x: p.x, y: p.y });
      setMapZoom(4);
      return;
    }
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const p of geo) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    }
    const p1 = project(maxLat, minLng);
    const p2 = project(minLat, maxLng);
    const cx = (p1.x + p2.x) / 2;
    const cy = (p1.y + p2.y) / 2;
    const w = Math.max(40, (p2.x - p1.x) * 1.25);
    const h = Math.max(40, (p2.y - p1.y) * 1.25);
    const zoomX = MAP_VIEW.W / w;
    const zoomY = MAP_VIEW.H / h;
    const z = Math.min(8, Math.max(0.5, Math.min(zoomX, zoomY)));
    setMapCenter({ x: cx, y: cy });
    setMapZoom(z);
  };
  const fitToFiltered = () => fitToProps(filtered);
  const fitToCompared = () => fitToProps(filtered.filter(p => compareSet.has(p.n)));

  const handleSort = k => {
    if (k === sortKey) setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    else { setSortKey(k); setSortDir('desc'); }
  };

  const activeFilters = [];
  if (ownerFilter) activeFilters.push({ label: ownerFilter, clear: () => setOwnerFilter(null) });
  if (matYrFilter) activeFilters.push({ label: `Maturity ${matYrFilter}`, clear: () => setMatYrFilter(null) });
  if (buyBoxOnly) activeFilters.push({ label: 'Atlas Buy Box', clear: () => setBuyBoxOnly(false) });
  if (sweetOnly) activeFilters.push({ label: 'Sweet Spots only', clear: () => setSweetOnly(false) });
  if (distressedOnly) activeFilters.push({ label: 'Distressed only', clear: () => setDistressedOnly(false) });
  if (leaseUpOnly) activeFilters.push({ label: 'Lease-Up only', clear: () => setLeaseUpOnly(false) });
  if (subFilter.size > 0) activeFilters.push({ label: `${subFilter.size} submarkets`, clear: () => setSubFilter(new Set()) });

  return (
    <div>
      {/* Intro */}
      <Card padding={16} style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: T.tx2, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, marginBottom: 3 }}>
              Property Pipeline — {fmtN(PROPS.length)} Austin multifamily properties screened
            </div>
            <div style={{ fontSize: 12.5, color: T.tx, lineHeight: 1.5 }}>
              Search, filter, and rank properties across the full Austin universe. All scoring weights (submarket, zip, property factors) flow live from sliders below and on the Zip and Submarket tabs. Toggle view mode between table, owners grid, loan maturities timeline, or interactive map. Null fields are skipped in scoring — missing data never inflates or deflates a property's score.
            </div>
          </div>
          <div style={{ flexShrink: 0, padding: '6px 12px', background: T.bg3, border: `1px solid ${T.bd2}`, borderRadius: T.radius, textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: T.tx3, letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: 700 }}>Data vintage</div>
            <div style={{ fontSize: 11, color: T.accentDk, fontWeight: 700, marginTop: 2 }}>{DATA_VINTAGE.propertyData}</div>
          </div>
        </div>
      </Card>

      {}
      {subFilter.size > 0 && subFilter.size <= 2 && sorted.length > 0 && (() => {
        const contextLabel = [...subFilter].join(' / ');
        const conviction = buildPropsConviction(sorted, contextLabel);
        if (!conviction) return null;
        return (
          <div style={{ marginBottom: 14 }}>
            <ConvictionHeader
              title={`Property Pipeline — ${contextLabel}`}
              subtitle="Filtered universe summary · click any property below to open the full screening card"
              signals={conviction.signals}
              footer={conviction.footer}
            />
          </div>
        );
      })()}

      {/* 7-tile summary header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10, marginBottom: 14 }}>
        {[
          { label: 'TOTAL',    value: fmtN(summary.total),    color: T.tx,       sub: `of ${fmtN(PROPS.length)}`, info: 'Properties matching current filters.' },
          { label: 'UNITS',    value: fmtN(summary.units),    color: T.tx,       sub: summary.total > 0 ? `avg ${fmtN(Math.round(summary.units/summary.total))}/prop` : '—', info: 'Total unit count across filtered properties.' },
          { label: 'BUY',      value: summary.buy,            color: T.buyTx,    sub: summary.total > 0 ? `${Math.round(summary.buy/summary.total*100)}% of filtered` : '—', info: 'Composite score ≥ 65. Strongest conviction tier.' },
          { label: 'WATCH',    value: summary.watch,          color: T.watchTx,  sub: summary.total > 0 ? `${Math.round(summary.watch/summary.total*100)}% of filtered` : '—', info: 'Composite score 50-64. Monitor; re-evaluate on weight tuning or market move.' },
          { label: 'AVOID',    value: summary.avoid,          color: T.chartNeg, sub: summary.total > 0 ? `${Math.round(summary.avoid/summary.total*100)}% of filtered` : '—', info: 'Composite score < 50. Pass unless opportunistic thesis or pricing distress emerges.' },
          { label: 'DISTRESSED', value: summary.distressed,   color: T.chartNeg, sub: 'ds ≥ 5', info: 'Distress score ≥ 5/10. Inputs: occupancy drop, concession surge, loan maturity pressure, rent trend, sponsor history.' },
          { label: 'MAT ≤2027', value: summary.mat27,         color: T.watchTx,  sub: 'refi pressure', info: 'Loans maturing 2027 or earlier — owners facing refi into higher rates with depressed NOI are motivated sellers.' },
        ].map((m, i) => (
          <div key={m.label} style={{
            padding: '12px 14px', background: T.bg2, border: `1px solid ${T.bd2}`, borderRadius: T.radius,
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
              {m.label}
              <InfoTip text={m.info} />
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: m.color, lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>{m.value}</div>
            <div style={{ fontSize: 10, color: T.tx2, marginTop: 3 }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Preset filter buttons row */}
      <Card padding={0} style={{ marginBottom: 14 }}>
        <div style={{ padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color: T.tx2, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700 }}>Filters</span>

          {/* Search with autocomplete dropdown */}
          <div style={{ position: 'relative', flex: '1 1 260px', minWidth: 200, maxWidth: 360 }}>
            <input
              type="text"
              placeholder="Search property, owner, zip, submarket..."
              value={searchText}
              onChange={e => { setSearchText(e.target.value); setSearchFocused(true); }}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
              style={{
                width: '100%',
                padding: '7px 12px', fontSize: 12, color: T.tx,
                border: `1px solid ${searchFocused ? T.accentDk : T.bd}`, borderRadius: T.radius,
                background: T.bg2, fontFamily: T.fontFamily, outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {searchFocused && searchSuggestions.length > 0 && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                background: T.bg2, border: `1px solid ${T.bd}`, borderRadius: T.radius,
                boxShadow: '0 8px 24px rgba(9, 14, 65, 0.15)',
                maxHeight: 380, overflowY: 'auto', zIndex: 50,
              }}>
                <div style={{ padding: '6px 12px', fontSize: 9, color: T.tx3, letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: 700, background: T.bg3, borderBottom: `1px solid ${T.bd2}` }}>
                  {searchSuggestions.length} match{searchSuggestions.length > 1 ? 'es' : ''} · click to open
                </div>
                {searchSuggestions.map((p, i) => {
                  const c = p.sg === 'BUY' ? T.buyBg : p.sg === 'WATCH' ? T.watchBg : T.avoidBg;
                  const cTx = p.sg === 'BUY' ? T.buyTx : p.sg === 'WATCH' ? T.watchTx : T.chartNeg;
                  return (
                    <div key={i}
                      onMouseDown={e => { e.preventDefault(); setSelectedProp(p); setSearchFocused(false); }}
                      onMouseEnter={e => e.currentTarget.style.background = T.accent}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      style={{
                        padding: '8px 12px', cursor: 'pointer',
                        borderBottom: i < searchSuggestions.length - 1 ? `1px solid ${T.bd2}` : 'none',
                        display: 'flex', alignItems: 'center', gap: 10,
                      }}>
                      <span style={{
                        padding: '2px 7px', fontSize: 9, fontWeight: 700, color: cTx, background: c,
                        border: `1px solid ${cTx}`, borderRadius: T.radius, minWidth: 42, textAlign: 'center',
                        letterSpacing: 0.3,
                      }}>{p.sg}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: T.tx, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {p.n}
                        </div>
                        <div style={{ fontSize: 10, color: T.tx2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 }}>
                          {p.sb || '—'} · {p.u}u · {p.yb || '?'} · {p.o || '—'}
                        </div>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: T.accentDk, fontVariantNumeric: 'tabular-nums' }}>{p.cs}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {searchFocused && searchText.trim().length >= 2 && searchSuggestions.length === 0 && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                background: T.bg2, border: `1px solid ${T.bd}`, borderRadius: T.radius,
                padding: '10px 14px', fontSize: 11, color: T.tx2, fontStyle: 'italic',
                boxShadow: '0 8px 24px rgba(9, 14, 65, 0.15)', zIndex: 50,
              }}>
                No matches in 716 properties. Try a different search term.
              </div>
            )}
          </div>

          {/* Opportunistic toggle */}
          <button onClick={() => setOpMode(!opMode)} style={{
            padding: '7px 16px', fontSize: 12, fontWeight: 600,
            background: opMode ? T.accentDk : T.bg2,
            color: opMode ? T.txLt : T.tx,
            border: `1.5px solid ${opMode ? T.accentDk : T.bd}`, borderRadius: T.radius,
            cursor: 'pointer', fontFamily: T.fontFamily, letterSpacing: 0.2,
          }}>Opportunistic</button>

          {/* Buy Box toggle */}
          <button onClick={() => setBuyBoxOnly(!buyBoxOnly)} style={{
            padding: '7px 16px', fontSize: 12, fontWeight: 600,
            background: buyBoxOnly ? T.accentDk : T.bg2,
            color: buyBoxOnly ? T.txLt : T.tx,
            border: `1.5px solid ${buyBoxOnly ? T.accentDk : T.bd}`, borderRadius: T.radius,
            cursor: 'pointer', fontFamily: T.fontFamily,
          }}>Atlas Buy Box</button>

          {/* Lease-Up toggle — shows only the 65 matched lease-up properties */}
          <button onClick={() => setLeaseUpOnly(!leaseUpOnly)} style={{
            padding: '7px 16px', fontSize: 12, fontWeight: 600,
            background: leaseUpOnly ? T.watchTx : T.bg2,
            color: leaseUpOnly ? T.txLt : T.tx,
            border: `1.5px solid ${leaseUpOnly ? T.watchTx : T.bd}`, borderRadius: T.radius,
            cursor: 'pointer', fontFamily: T.fontFamily,
          }} title="Filter to properties currently in lease-up (65 of 73 matched to main universe)">◐ Lease-Up ({Object.keys(LEASEUP_BY_MAIN).length})</button>

          {}
          <button onClick={() => setMapVisible(!mapVisible)} style={{
            padding: '7px 16px', fontSize: 12, fontWeight: 600,
            background: mapVisible ? T.accentDk : T.bg2,
            color: mapVisible ? T.txLt : T.tx,
            border: `1.5px solid ${mapVisible ? T.accentDk : T.bd}`, borderRadius: T.radius,
            cursor: 'pointer', fontFamily: T.fontFamily,
          }}>{mapVisible ? 'Hide Map' : 'Show Map'}</button>

          {/* More filters toggle */}
          <button onClick={() => setShowFilters(!showFilters)} style={{
            padding: '7px 14px', fontSize: 12, fontWeight: 500,
            background: 'transparent', color: T.tx2,
            border: `1px dashed ${T.bd}`, borderRadius: T.radius,
            cursor: 'pointer', fontFamily: T.fontFamily,
          }}>{showFilters ? 'Hide' : 'More'} filters {showFilters ? '−' : '+'}</button>

          {/* Match count */}
          <div style={{ marginLeft: 'auto', fontSize: 11, color: T.tx2, display: 'flex', alignItems: 'center', gap: 10 }}>
            {activeFilters.map((f, i) => (
              <span key={i} onClick={f.clear} style={{
                padding: '4px 10px', fontSize: 11, fontWeight: 600,
                background: T.bgDark, color: T.accent, cursor: 'pointer',
                border: `1px solid ${T.accentDk}`, borderRadius: T.radius,
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ fontSize: 13, lineHeight: 1 }}>×</span>
                {f.label}
              </span>
            ))}
            <span style={{ fontWeight: 600, color: T.tx }}>
              <b style={{ color: T.accentDk }}>{fmtN(summary.total)}</b> of {fmtN(PROPS.length)}
            </span>
          </div>
        </div>

        {/* Expanded filter panel */}
        {showFilters && (
          <div style={{ padding: '14px 16px', borderTop: `1px solid ${T.bd2}`, background: T.bg3 }}>
            <Grid cols={3} gap={16}>
              {/* Signal */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>Signal</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['BUY', 'WATCH', 'AVOID'].map(s => {
                    const active = sigFilter[s];
                    const c = s === 'BUY' ? { bg: T.buyBg, tx: T.buyTx, bd: T.buyBd }
                            : s === 'WATCH' ? { bg: T.watchBg, tx: T.watchTx, bd: T.watchBd }
                            : { bg: T.avoidBg, tx: T.avoidTx, bd: T.avoidBd };
                    return (
                      <button key={s} onClick={() => setSigFilter({ ...sigFilter, [s]: !active })} style={{
                        padding: '4px 12px', fontSize: 11, fontWeight: 700,
                        background: active ? c.bg : T.bg2, color: active ? c.tx : T.tx3,
                        border: `1.5px solid ${active ? c.bd : T.bd}`, borderRadius: T.radius,
                        cursor: 'pointer', fontFamily: T.fontFamily, letterSpacing: 0.3,
                      }}>{s}</button>
                    );
                  })}
                </div>
              </div>

              {/* Class */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>Class</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[['A','A'], ['B','B'], ['C','C'], ['unknown','—']].map(([k, lbl]) => (
                    <button key={k} onClick={() => setClassFilter({ ...classFilter, [k]: !classFilter[k] })} style={{
                      padding: '4px 12px', fontSize: 11, fontWeight: 700,
                      background: classFilter[k] ? T.accent : T.bg2,
                      color: classFilter[k] ? T.bgDark : T.tx3,
                      border: `1.5px solid ${classFilter[k] ? T.accentDk : T.bd}`, borderRadius: T.radius,
                      cursor: 'pointer', fontFamily: T.fontFamily,
                    }}>{lbl}</button>
                  ))}
                </div>
              </div>

              {/* Special toggles */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>Quick toggles</div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <input type="checkbox" checked={sweetOnly} onChange={e => setSweetOnly(e.target.checked)} style={{ accentColor: T.accentDk }} />
                    <span style={{ color: T.tx }}>Sweet Spots</span>
                    <InfoTip text="Sweet Spot = opMode ON + distress ≥ 5 + property quality ≥ 55. Surfaces distressed assets with underlying quality — target for value-add acquirers." />
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <input type="checkbox" checked={distressedOnly} onChange={e => setDistressedOnly(e.target.checked)} style={{ accentColor: T.accentDk }} />
                    <span style={{ color: T.tx }}>Distressed</span>
                  </label>
                </div>
              </div>

              {/* Min Units */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: T.tx, fontWeight: 600 }}>Min units</span>
                  <span style={{ fontSize: 11, color: T.accentDk, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{minUnits}+</span>
                </div>
                <input type="range" min={0} max={500} step={25} value={minUnits}
                  onChange={e => setMinUnits(Number(e.target.value))}
                  style={{ width: '100%', accentColor: T.accentDk, cursor: 'pointer' }} />
              </div>

              {/* Min Vintage */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: T.tx, fontWeight: 600 }}>Min vintage</span>
                  <span style={{ fontSize: 11, color: T.accentDk, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{minVintage}+</span>
                </div>
                <input type="range" min={1960} max={2025} step={1} value={minVintage}
                  onChange={e => setMinVintage(Number(e.target.value))}
                  style={{ width: '100%', accentColor: T.accentDk, cursor: 'pointer' }} />
              </div>

              {/* Reset */}
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button onClick={resetFilters} style={{
                  padding: '6px 14px', fontSize: 11, fontWeight: 600,
                  background: 'transparent', color: T.tx2,
                  border: `1px solid ${T.bd}`, borderRadius: T.radius,
                  cursor: 'pointer', fontFamily: T.fontFamily,
                }}>Reset all filters</button>
              </div>
            </Grid>

            {/* Submarket chips */}
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
                Submarkets {subFilter.size > 0 && <span style={{ color: T.accentDk }}>({subFilter.size} selected)</span>}
                {subFilter.size > 0 && <button onClick={() => setSubFilter(new Set())} style={{
                  background: 'none', border: 'none', color: T.tx2, fontSize: 10, cursor: 'pointer',
                  fontFamily: T.fontFamily, textDecoration: 'underline', marginLeft: 8,
                }}>Clear</button>}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {allSubs.map(sb => {
                  const active = subFilter.has(sb);
                  return (
                    <button key={sb} onClick={() => {
                      const n = new Set(subFilter);
                      if (n.has(sb)) n.delete(sb); else n.add(sb);
                      setSubFilter(n);
                    }} style={{
                      padding: '3px 9px', fontSize: 10, fontWeight: 600,
                      background: active ? T.accentDk : T.bg3,
                      color: active ? T.txLt : T.tx2,
                      border: `1px solid ${active ? T.accentDk : T.bd2}`,
                      borderRadius: T.radius, cursor: 'pointer', fontFamily: T.fontFamily,
                    }}>{sb}</button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Scoring controls — unified collapsible section wrapping both panels */}
      <Card padding={0} style={{ marginBottom: 14 }}>
        <div style={{ padding: '10px 16px', background: T.bgDark, color: T.txLt, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent }}>
              Scoring Controls
            </div>
            <div style={{ fontSize: 11, color: T.txLt, marginTop: 2, opacity: 0.85, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span>Composite layer + property factor weights · All rankings update live · {
                (layerW[0] !== 25 || layerW[1] !== 40 || layerW[2] !== 35 || opMode ||
                 Object.keys(propFactorW).some(k => propFactorW[k] !== DEFAULT_PROP_W[k]))
                  ? <span style={{ color: T.accent, fontWeight: 700 }}>Modified from defaults</span>
                  : 'Using defaults'
              }</span>
              <ScoringHelp scope="composite" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => { resetScoring(); resetPropFactors(); }} style={{
              background: 'transparent', border: `1px solid ${T.bd}`, borderRadius: T.radius,
              padding: '5px 12px', fontSize: 11, color: T.txLt, cursor: 'pointer',
              fontFamily: T.fontFamily, fontWeight: 600,
            }}>Reset All</button>
            <button onClick={() => setShowPropSliders(!showPropSliders)} style={{
              background: T.accent, border: `1px solid ${T.accent}`, borderRadius: T.radius,
              padding: '5px 12px', fontSize: 11, color: T.bgDark, cursor: 'pointer',
              fontFamily: T.fontFamily, fontWeight: 700,
            }}>{showPropSliders ? 'Hide Controls ▲' : 'Show Controls ▼'}</button>
          </div>
        </div>

        {showPropSliders && (
          <div style={{ padding: 14, display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 14 }}>
            {/* Composite Layer Weights — compact inline version */}
            <div style={{ border: `1px solid ${T.bd2}`, borderRadius: T.radius, padding: 14, background: T.bg2 }}>
              <div style={{ fontSize: 10, color: T.tx2, letterSpacing: 0.5, fontWeight: 700, textTransform: 'uppercase', marginBottom: 10 }}>
                Composite Layer Weights
              </div>
              {[
                { key: 0, label: 'Submarket weight', info: 'How much of each property\'s composite score comes from its submarket\'s operating fundamentals (vacancy, ERG, UC, A/D ratio). Default 25.' },
                { key: 1, label: 'Zip weight',       info: 'How much of the composite comes from the zip code\'s demographic quality (tech workers, population growth, income, schools, walkability). 16-factor model. Default 40.' },
                { key: 2, label: 'Property weight',  info: 'How much of the composite comes from the property\'s own quality metrics (size, vintage, vacancy, concessions, class, rent productivity). Default 35.' },
              ].map((s, i) => (
                <div key={s.key} style={{ marginBottom: i < 2 ? 10 : 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: T.tx, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                      {s.label}
                      <InfoTip text={s.info} />
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                      color: T.accentDk, background: T.bg3,
                      padding: '1px 8px', borderRadius: T.radius, minWidth: 28, textAlign: 'center',
                    }}>{layerW[s.key]}</span>
                  </div>
                  <input type="range" min={0} max={100} step={1} value={layerW[s.key]}
                    onChange={e => {
                      const v = Number(e.target.value);
                      const nw = [...layerW];
                      nw[s.key] = v;
                      setLayerW(nw);
                    }}
                    style={{ width: '100%', accentColor: T.accentDk, cursor: 'pointer', height: 4 }} />
                </div>
              ))}
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.bd2}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: T.tx, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                  Opportunistic Mode
                  <InfoTip text="Blends 55% distress score + 45% property quality. Surfaces motivated-seller opportunities even when property quality is average. Default: off." />
                </span>
                <button onClick={() => setOpMode(!opMode)} style={{
                  background: opMode ? T.accentDk : T.bg3, border: `1px solid ${opMode ? T.accentDk : T.bd}`,
                  borderRadius: 12, padding: '2px 4px', width: 40, height: 20, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: opMode ? 'flex-end' : 'flex-start',
                  transition: 'all 0.15s',
                }}>
                  <span style={{ width: 14, height: 14, borderRadius: '50%', background: opMode ? T.accent : T.tx3, display: 'block' }} />
                </button>
              </div>
              <div style={{ fontSize: 10, color: T.tx3, marginTop: 4, fontStyle: 'italic' }}>
                {opMode ? 'Distress weighting active' : 'Standard scoring — pure quality signal'}
              </div>
            </div>

            {/* Property Factor Weights — condensed */}
            <div style={{ border: `1px solid ${T.bd2}`, borderRadius: T.radius, padding: 14, background: T.bg2 }}>
              <div style={{ fontSize: 10, color: T.tx2, letterSpacing: 0.5, fontWeight: 700, textTransform: 'uppercase', marginBottom: 10 }}>
                Property Factor Weights — 7 Factors
              </div>
              {PROP_FACTORS.map((f, i) => {
                const modified = propFactorW[f.key] !== DEFAULT_PROP_W[f.key];
                return (
                  <div key={f.key} style={{ marginBottom: i < PROP_FACTORS.length - 1 ? 6 : 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                      <span style={{ fontSize: 10.5, color: T.tx, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                        {f.label}
                        <InfoTip text={f.info} />
                        {modified && <span style={{ fontSize: 8, color: T.accentDk, fontStyle: 'italic', fontWeight: 500, marginLeft: 2 }}>· modified</span>}
                      </span>
                      <span style={{
                        fontSize: 10.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                        color: modified ? T.accentDk : T.tx2,
                        background: modified ? T.accent : T.bg3,
                        padding: '1px 7px', borderRadius: T.radius, minWidth: 28, textAlign: 'center',
                      }}>{propFactorW[f.key]}</span>
                    </div>
                    <input type="range" min={0} max={30} step={1} value={propFactorW[f.key]}
                      onChange={e => setPropFactorW({ ...propFactorW, [f.key]: Number(e.target.value) })}
                      style={{ width: '100%', accentColor: T.accentDk, cursor: 'pointer', height: 3 }} />
                  </div>
                );
              })}
              <div style={{ fontSize: 9, color: T.tx3, marginTop: 8, padding: '5px 8px', background: T.bg3, borderRadius: T.radius, lineHeight: 1.4 }}>
                Weights normalize automatically — ratios matter, not absolute values. Null fields skipped (missing data doesn't skew scores).
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* ═══ MAIN VIEW AREA — one of: table | owners | maturities | map ═══ */}

      {mapVisible && (
        <Card padding={0}>
          <div style={{ padding: '10px 14px', background: T.bgDark, color: T.txLt, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent }}>
                Austin Metro Map — {fmtN(filtered.length)} properties
              </div>
              <div style={{ fontSize: 11, color: T.txLt, marginTop: 2 }}>
                Drag to pan · + / − to zoom · <b style={{ color: T.accent }}>⊹ Fit to Filtered</b> auto-zooms to the current filter · hover for detail · click to open card
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setSubOverlayVisible(!subOverlayVisible)} style={{
                padding: '5px 12px', fontSize: 11, fontWeight: 600,
                background: subOverlayVisible ? T.accentDk : T.bg2,
                color: subOverlayVisible ? T.txLt : T.tx,
                border: `1px solid ${subOverlayVisible ? T.accentDk : T.bd}`, borderRadius: T.radius,
                cursor: 'pointer', fontFamily: T.fontFamily,
              }} title="Shade each submarket polygon by composite score (BUY green, WATCH amber, AVOID red)">◈ Sub Overlay</button>
              <button onClick={fitToFiltered} style={{
                padding: '5px 14px', fontSize: 11, fontWeight: 700,
                background: T.accent, color: T.bgDark,
                border: `1px solid ${T.accent}`, borderRadius: T.radius,
                cursor: 'pointer', fontFamily: T.fontFamily,
              }} title="Zoom and center on current filtered properties">⊹ Fit to Filtered</button>
              {compareSet.size > 0 && (
                <button onClick={fitToCompared} style={{
                  padding: '5px 14px', fontSize: 11, fontWeight: 700,
                  background: T.accentDk, color: T.txLt,
                  border: `1px solid ${T.accentDk}`, borderRadius: T.radius,
                  cursor: 'pointer', fontFamily: T.fontFamily,
                }} title={`Zoom to the ${compareSet.size} selected comparison properties`}>
                  ⇄ Fit Compared ({compareSet.size})
                </button>
              )}
              <button onClick={() => setMapZoom(Math.min(8, mapZoom * 1.5))} style={{ padding: '5px 10px', fontSize: 12, background: T.bg2, color: T.tx, border: `1px solid ${T.bd}`, borderRadius: T.radius, cursor: 'pointer', fontFamily: T.fontFamily, fontWeight: 700 }}>+</button>
              <button onClick={() => setMapZoom(Math.max(0.5, mapZoom / 1.5))} style={{ padding: '5px 10px', fontSize: 12, background: T.bg2, color: T.tx, border: `1px solid ${T.bd}`, borderRadius: T.radius, cursor: 'pointer', fontFamily: T.fontFamily, fontWeight: 700 }}>−</button>
              <button onClick={() => { setMapZoom(1); setMapCenter({ x: mv.W/2, y: mv.H/2 }); }} style={{ padding: '5px 12px', fontSize: 11, background: T.bg2, color: T.tx, border: `1px solid ${T.bd}`, borderRadius: T.radius, cursor: 'pointer', fontFamily: T.fontFamily, fontWeight: 600 }}>Reset</button>
              <span style={{ padding: '5px 8px', fontSize: 11, color: T.txLt, fontVariantNumeric: 'tabular-nums' }}>{mapZoom.toFixed(1)}×</span>
            </div>
          </div>
          <div style={{ position: 'relative', padding: 10 }}>
            <svg viewBox={viewBox} preserveAspectRatio="xMidYMid meet"
                 onMouseDown={onMapMouseDown} onMouseMove={onMapMouseMove}
                 onMouseUp={onMapMouseUp} onMouseLeave={onMapMouseUp}
                 style={{ width: '100%', height: 'auto', maxHeight: 560, background: `radial-gradient(ellipse at center, ${T.bg2} 0%, ${T.bg3} 100%)`, border: `1px solid ${T.bd2}`, borderRadius: T.radius, cursor: dragStart ? 'grabbing' : 'grab', userSelect: 'none' }}>
              <path d={pathFromPts(COAST) + ' Z'} fill="#FAFBFC" stroke={T.accentDk} strokeWidth={1.5} strokeOpacity={0.35} />
              {COUNTY_LINES.map((line, i) => (
                <path key={i} d={pathFromPts(line.pts)} fill="none" stroke={T.bd} strokeWidth={0.5} strokeDasharray="3 3" />
              ))}
              {/* Submarket score overlay — polygon per submarket tinted by composite */}
              {subOverlayVisible && subOverlays.map((ov, i) => {
                const pts = ov.hull.map(h => `${h.x},${h.y}`).join(' ');
                const fill = ov.score >= 65 ? '#10B981' : ov.score >= 50 ? '#F59E0B' : '#EF4444';
                const opacity = ov.score >= 65 ? 0.18 : ov.score >= 50 ? 0.14 : 0.12;
                return (
                  <g key={ov.sub}>
                    <polygon points={pts} fill={fill} fillOpacity={opacity} stroke={fill} strokeOpacity={0.55} strokeWidth={0.8} strokeDasharray="2 2" style={{ pointerEvents: 'none' }} />
                    <text x={ov.centroid.x} y={ov.centroid.y}
                      fontSize={8} fontWeight={700}
                      fill={fill} textAnchor="middle"
                      opacity={0.9}
                      style={{ fontFamily: T.fontFamily, letterSpacing: 0.3, pointerEvents: 'none', textShadow: `0 0 3px ${T.bg}` }}
                    >{ov.sub}</text>
                    <text x={ov.centroid.x} y={ov.centroid.y + 8}
                      fontSize={7} fontWeight={700}
                      fill={fill} textAnchor="middle"
                      opacity={0.9}
                      style={{ fontFamily: T.fontFamily, pointerEvents: 'none' }}
                    >{Math.round(ov.score)} · {ov.propCount}p</text>
                  </g>
                );
              })}
              {MAP_LABELS.map((l, i) => {
                const p = project(l.lat, l.lng);
                const isCounty = l.k === 'county';
                return (
                  <text key={i} x={p.x} y={p.y}
                    fontSize={isCounty ? 11 : l.k === 'city' ? 9 : 8}
                    fontWeight={l.k === 'city' ? 700 : 500}
                    fill={isCounty ? T.tx3 : l.k === 'city' ? T.tx : T.tx2}
                    textAnchor="middle"
                    opacity={isCounty ? 0.35 : 0.9}
                    style={{ fontFamily: T.fontFamily, letterSpacing: l.k === 'city' ? 0.5 : 0, textTransform: isCounty ? 'uppercase' : 'none', pointerEvents: 'none' }}
                  >{l.t}</text>
                );
              })}
              {filtered.map((p, i) => {
                if (p.lat == null || p.lng == null) return null;
                const pt = project(p.lat, p.lng);
                const active = selectedProp === p;
                const c = p.sg === 'BUY' ? T.chartPos : p.sg === 'WATCH' ? T.watchTx : T.chartNeg;
                const r = active ? dotRactive : (p.sweet ? dotRsweet : dotR);
                return (
                  <circle key={i}
                    cx={pt.x} cy={pt.y} r={r}
                    fill={c} fillOpacity={active ? 1 : 0.75}
                    stroke={active ? T.bgDark : (p.sweet ? T.accentDk : 'none')}
                    strokeWidth={active ? 2 : (p.sweet ? 1.5 : 0)}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setHoveredProp(p)}
                    onMouseLeave={() => setHoveredProp(null)}
                    onClick={() => setSelectedProp(p)}
                  >
                    <title>{p.n} · {p.sb} · {p.u}u · {p.yb} · {p.sg} ({p.cs})</title>
                  </circle>
                );
              })}
              {}
              {filtered.filter(p => LEASEUP_BY_MAIN[p.n] && p.lat != null && p.lng != null).map((p, i) => {
                const pt = project(p.lat, p.lng);
                const lu = LEASEUP_BY_MAIN[p.n];
                return (
                  <circle key={`lu-${i}`}
                    cx={pt.x} cy={pt.y} r={6}
                    fill="none" stroke={T.watchTx} strokeWidth={1.2} strokeDasharray="2 2" strokeOpacity={0.75}
                    style={{ pointerEvents: 'none' }}
                  >
                    <title>{p.n} — Lease-Up · {(lu.curOcc*100).toFixed(0)}% occ · {lu.vel}/mo</title>
                  </circle>
                );
              })}
              {/* Compare highlight overlay — rendered last so compared dots sit on top */}
              {filtered.filter(p => compareSet.has(p.n) && p.lat != null && p.lng != null).map((p, i) => {
                const pt = project(p.lat, p.lng);
                const c = p.sg === 'BUY' ? T.chartPos : p.sg === 'WATCH' ? T.watchTx : T.chartNeg;
                const label = p.n.length > 22 ? p.n.slice(0, 20) + '…' : p.n;
                return (
                  <g key={`cmp-${i}`} style={{ pointerEvents: 'none' }}>
                    {/* Outer pulse ring — big, transparent, gold */}
                    <circle cx={pt.x} cy={pt.y} r={12} fill="none" stroke={T.accent} strokeWidth={2} strokeOpacity={0.55} />
                    <circle cx={pt.x} cy={pt.y} r={8}  fill="none" stroke={T.accentDk} strokeWidth={1.5} strokeOpacity={0.85} />
                    {/* Bold dot on top (colored by signal) with dark navy border */}
                    <circle cx={pt.x} cy={pt.y} r={5.5} fill={c} fillOpacity={1} stroke={T.bgDark} strokeWidth={1.5} />
                    {/* Label with shadow for legibility */}
                    <text x={pt.x} y={pt.y - 14} fontSize={9.5} fontWeight={700}
                      fill={T.bgDark} textAnchor="middle"
                      stroke={T.accent} strokeWidth={3} paintOrder="stroke"
                      style={{ fontFamily: T.fontFamily, letterSpacing: 0.2 }}>
                      {label}
                    </text>
                  </g>
                );
              })}
            </svg>
            {hoveredProp && (
              <div style={{
                position: 'absolute', top: 18, right: 18, maxWidth: 260,
                padding: '10px 14px', background: T.bgDark, color: T.txLt,
                border: `1px solid ${T.accentDk}`, borderRadius: T.radius,
                boxShadow: T.shadow, fontSize: 11, lineHeight: 1.5, pointerEvents: 'none',
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.accent, marginBottom: 4 }}>{hoveredProp.n}</div>
                <div>{hoveredProp.sb} · {hoveredProp.m}</div>
                <div>{hoveredProp.u} units · Built {hoveredProp.yb} · Class {hoveredProp.cl || '—'}</div>
                <div>Rent {fmtRent(hoveredProp.er)} · Vac {hoveredProp.v != null ? hoveredProp.v.toFixed(1) + '%' : '—'}</div>
                <div style={{ marginTop: 4 }}>Signal: <b style={{ color: hoveredProp.sg === 'BUY' ? T.chartPos : hoveredProp.sg === 'WATCH' ? T.watchTx : T.chartNeg }}>{hoveredProp.sg} ({hoveredProp.cs})</b></div>
              </div>
            )}
            <div style={{
              position: 'absolute', bottom: 20, left: 20,
              background: T.bg2, border: `1px solid ${T.bd}`, borderRadius: T.radius,
              padding: '5px 10px', fontSize: 10, display: 'flex', gap: 10, alignItems: 'center',
              boxShadow: T.shadow,
            }}>
              <span style={{ color: T.tx2 }}>Signal:</span>
              {[['BUY', T.chartPos], ['WATCH', T.watchTx], ['AVOID', T.chartNeg]].map(([lbl, c]) => (
                <span key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 3, color: T.tx }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: c }} />{lbl}
                </span>
              ))}
              <span style={{ color: T.tx2, marginLeft: 4 }}>· Sweet:</span>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: T.chartPos, border: `1.5px solid ${T.accentDk}` }} />
            </div>
          </div>
        </Card>
      )}

      {}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, padding: '8px 14px', background: T.bg3, borderRadius: T.radius, border: `1px solid ${T.bd2}`, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: T.tx2, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700 }}>Additional views</span>
        <button onClick={() => setOwnersVisible(!ownersVisible)} style={{
          padding: '6px 14px', fontSize: 11.5, fontWeight: 600,
          background: ownersVisible ? T.accentDk : T.bg2,
          color: ownersVisible ? T.txLt : T.tx,
          border: `1.5px solid ${ownersVisible ? T.accentDk : T.bd}`, borderRadius: T.radius,
          cursor: 'pointer', fontFamily: T.fontFamily,
        }}>{ownersVisible ? 'Hide Owners ▲' : 'Show Owners ▼'}</button>
        <button onClick={() => setMaturitiesVisible(!maturitiesVisible)} style={{
          padding: '6px 14px', fontSize: 11.5, fontWeight: 600,
          background: maturitiesVisible ? T.watchTx : T.bg2,
          color: maturitiesVisible ? T.txLt : T.tx,
          border: `1.5px solid ${maturitiesVisible ? T.watchTx : T.bd}`, borderRadius: T.radius,
          cursor: 'pointer', fontFamily: T.fontFamily,
        }}>{maturitiesVisible ? 'Hide Maturities ▲' : 'Show Maturities ▼'}</button>

        {/* Compare button — only shown when 2+ properties are selected */}
        {compareSet.size > 0 && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', paddingLeft: 8, marginLeft: 4, borderLeft: `1px solid ${T.bd}` }}>
            <button
              onClick={() => compareSet.size >= 2 && setCompareModalOpen(true)}
              disabled={compareSet.size < 2}
              style={{
                padding: '6px 14px', fontSize: 11.5, fontWeight: 700,
                background: compareSet.size >= 2 ? T.accentDk : T.bg2,
                color: compareSet.size >= 2 ? T.txLt : T.tx3,
                border: `1.5px solid ${compareSet.size >= 2 ? T.accentDk : T.bd}`,
                borderRadius: T.radius,
                cursor: compareSet.size >= 2 ? 'pointer' : 'not-allowed',
                fontFamily: T.fontFamily,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
              <span style={{ fontSize: 13, lineHeight: 1 }}>⇄</span>
              Compare ({compareSet.size}) {compareSet.size < 2 ? '· pick 1 more' : ''}
            </button>
            <button onClick={() => setCompareSet(new Set())} style={{
              padding: '5px 10px', fontSize: 10, fontWeight: 600,
              background: 'transparent', color: T.tx2, border: `1px dashed ${T.bd}`,
              borderRadius: T.radius, cursor: 'pointer', fontFamily: T.fontFamily,
            }}>Clear selection</button>
          </div>
        )}

        {/* Active filter chips — visible when owner or maturity filter is applied */}
        {(ownerFilter || matYrFilter || searchText || buyBoxOnly || sweetOnly || distressedOnly || subFilter.size > 0) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8, paddingLeft: 10, borderLeft: `1px solid ${T.bd}`, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, color: T.tx2, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>Active:</span>
            {ownerFilter && (
              <span onClick={() => setOwnerFilter(null)} style={{
                padding: '4px 10px', fontSize: 11, fontWeight: 600,
                background: T.accentDk, color: T.txLt, cursor: 'pointer',
                border: `1px solid ${T.accentDk}`, borderRadius: T.radius,
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ fontSize: 13, lineHeight: 1 }}>×</span>
                Owner: {ownerFilter.length > 24 ? ownerFilter.slice(0, 24) + '…' : ownerFilter}
              </span>
            )}
            {matYrFilter && (
              <span onClick={() => setMatYrFilter(null)} style={{
                padding: '4px 10px', fontSize: 11, fontWeight: 600,
                background: T.watchTx, color: T.txLt, cursor: 'pointer',
                border: `1px solid ${T.watchTx}`, borderRadius: T.radius,
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ fontSize: 13, lineHeight: 1 }}>×</span>
                Maturity: {matYrFilter}
              </span>
            )}
            {searchText && (
              <span onClick={() => setSearchText('')} style={{
                padding: '4px 10px', fontSize: 11, fontWeight: 600,
                background: T.bg2, color: T.tx, cursor: 'pointer',
                border: `1px solid ${T.bd}`, borderRadius: T.radius,
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ fontSize: 13, lineHeight: 1 }}>×</span>
                Search: "{searchText.length > 20 ? searchText.slice(0, 20) + '…' : searchText}"
              </span>
            )}
            {buyBoxOnly && (
              <span onClick={() => setBuyBoxOnly(false)} style={{
                padding: '4px 10px', fontSize: 11, fontWeight: 600,
                background: T.bg2, color: T.tx, cursor: 'pointer',
                border: `1px solid ${T.bd}`, borderRadius: T.radius,
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ fontSize: 13, lineHeight: 1 }}>×</span>
                Atlas Buy Box
              </span>
            )}
            {sweetOnly && (
              <span onClick={() => setSweetOnly(false)} style={{
                padding: '4px 10px', fontSize: 11, fontWeight: 600,
                background: T.bg2, color: T.tx, cursor: 'pointer',
                border: `1px solid ${T.bd}`, borderRadius: T.radius,
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ fontSize: 13, lineHeight: 1 }}>×</span>
                Sweet Spots
              </span>
            )}
            {distressedOnly && (
              <span onClick={() => setDistressedOnly(false)} style={{
                padding: '4px 10px', fontSize: 11, fontWeight: 600,
                background: T.bg2, color: T.tx, cursor: 'pointer',
                border: `1px solid ${T.bd}`, borderRadius: T.radius,
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ fontSize: 13, lineHeight: 1 }}>×</span>
                Distressed
              </span>
            )}
            {subFilter.size > 0 && (
              <span onClick={() => setSubFilter(new Set())} style={{
                padding: '4px 10px', fontSize: 11, fontWeight: 600,
                background: T.bg2, color: T.tx, cursor: 'pointer',
                border: `1px solid ${T.bd}`, borderRadius: T.radius,
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ fontSize: 13, lineHeight: 1 }}>×</span>
                {subFilter.size} submarket{subFilter.size > 1 ? 's' : ''}
              </span>
            )}
            <button onClick={resetFilters} style={{
              padding: '4px 10px', fontSize: 10.5, fontWeight: 700,
              background: 'transparent', color: T.chartNeg,
              border: `1px dashed ${T.chartNeg}`, borderRadius: T.radius,
              cursor: 'pointer', fontFamily: T.fontFamily, letterSpacing: 0.3,
            }}>Clear All ✕</button>
            <span style={{ fontSize: 10, color: T.tx3, fontStyle: 'italic' }}>· press Esc to clear</span>
          </div>
        )}

        {!(ownerFilter || matYrFilter || searchText || buyBoxOnly || sweetOnly || distressedOnly || subFilter.size > 0) && (
          <span style={{ fontSize: 10.5, color: T.tx3, marginLeft: 'auto', fontStyle: 'italic' }}>
            Opens above the table · click any row to filter · does not hide the table
          </span>
        )}
      </div>

      {ownersVisible && (
        <Card padding={0}>
          <div style={{ padding: '12px 16px', background: T.bgDark, color: T.txLt }}>
            <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent }}>
              Owner Concentration Analysis — Top 20 by Unit Count
              <InfoTip text="Top 20 owners by total unit count across filtered properties. Colored left border indicates average distress score across that owner's portfolio (red = high distress, green = low). Click a card to filter the property table to that owner." />
            </div>
            <div style={{ fontSize: 12, color: T.txLt, marginTop: 2 }}>Click any owner to filter the table to their properties only</div>
          </div>
          <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {ownerData.map((o, i) => {
              const dsColor = o.avgDistress == null ? T.tx3 : o.avgDistress >= 7 ? T.chartNeg : o.avgDistress >= 5 ? T.watchTx : o.avgDistress >= 3 ? T.accent2 : T.chartPos;
              const borderColor = o.avgDistress == null ? T.bd2 : o.avgDistress >= 7 ? T.chartNeg : o.avgDistress >= 5 ? T.watchTx : o.avgDistress >= 3 ? T.accent2 : T.chartPos;
              return (
                <div key={o.n} onClick={() => { setOwnerFilter(o.n); }} style={{
                  padding: '10px 12px', background: T.bg2,
                  border: `1px solid ${T.bd2}`, borderLeft: `3px solid ${borderColor}`,
                  borderRadius: T.radius, cursor: 'pointer',
                }}>
                  <div style={{ fontSize: 12, color: T.tx, fontWeight: 700, marginBottom: 3, lineHeight: 1.25, maxHeight: 30, overflow: 'hidden' }}>
                    {o.n}
                  </div>
                  <div style={{ fontSize: 10.5, color: T.tx2, marginBottom: 2 }}>
                    {o.props} {o.props === 1 ? 'prop' : 'props'} · {fmtN(o.units)} units
                  </div>
                  {o.avgDistress != null && (
                    <div style={{ fontSize: 10.5, color: T.tx2, marginBottom: 2 }}>
                      Avg Distress: <b style={{ color: dsColor }}>{o.avgDistress.toFixed(1)}</b>
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: T.tx3, marginTop: 4, maxHeight: 30, overflow: 'hidden', lineHeight: 1.3 }}>
                    {o.subs.slice(0, 3).join(', ')}{o.subs.length > 3 ? '…' : ''}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ padding: '12px 16px', borderTop: `1px solid ${T.bd2}`, background: T.bg3, borderLeft: `3px solid ${T.accentDk}`, marginTop: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>Analysis Note</div>
            <div style={{ fontSize: 12, color: T.tx, lineHeight: 1.5 }}>
              {ownerData.length > 0 && <>
                {ownerData[0].n} ({ownerData[0].props} props, {fmtN(ownerData[0].units)} units)
                {ownerData.length > 1 && <> and {ownerData[1].n} ({ownerData[1].props} props, {fmtN(ownerData[1].units)} units)</>} are the largest owners among filtered properties.{' '}
              </>}
              <b>Portfolio trade potential:</b> owners with 3+ properties facing distress may be willing to sell multiple assets at a discount. Cross-reference distress scores with owner concentration to identify motivated portfolio sellers.
            </div>
          </div>
        </Card>
      )}

      {maturitiesVisible && (
        <Card padding={0}>
          <div style={{ padding: '12px 16px', background: T.bgDark, color: T.txLt }}>
            <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent }}>
              Loan Maturity Timeline (2024-2030)
              <InfoTip text="Properties grouped by loan maturity year. Properties with 2025-2027 maturities facing refi into higher rates with depressed NOI are the most motivated sellers. Click a year column to filter the table to that maturity cohort." />
            </div>
            <div style={{ fontSize: 12, color: T.txLt, marginTop: 2 }}>Click a year to filter the table to properties maturing that year</div>
          </div>
          <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
            {maturityCols.map(col => {
              const pressure = col.year <= 2027;
              const titleColor = pressure ? T.chartNeg : T.tx2;
              const bg = pressure ? '#FFF5F5' : T.bg3;
              return (
                <div key={col.year} onClick={() => { setMatYrFilter(col.year); }} style={{
                  padding: '10px 12px', background: bg, border: `1px solid ${T.bd2}`,
                  borderTop: `3px solid ${pressure ? T.chartNeg : T.bd}`,
                  borderRadius: T.radius, cursor: 'pointer',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.tx, marginBottom: 4 }}>{col.year}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: titleColor, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{col.count}</div>
                  <div style={{ fontSize: 10, color: T.tx2, marginBottom: 8 }}>{col.count === 1 ? 'property' : 'properties'}</div>
                  {col.floating > 0 && (
                    <div style={{ fontSize: 10, color: T.chartNeg, fontWeight: 600, marginBottom: 6 }}>
                      {col.floating} floating rate
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: T.tx2, lineHeight: 1.35, maxHeight: 120, overflow: 'hidden' }}>
                    {col.props.slice(0, 6).map((p, i) => (
                      <div key={i} style={{ color: p.it === 'Floating' ? T.chartNeg : T.tx2, fontWeight: p.it === 'Floating' ? 600 : 400, marginBottom: 2 }}>
                        {(p.n || '').slice(0, 28)}{p.n && p.n.length > 28 ? '…' : ''} ({p.u}u)
                      </div>
                    ))}
                    {col.props.length > 6 && <div style={{ color: T.tx3, fontStyle: 'italic' }}>+{col.props.length - 6} more</div>}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ padding: '12px 16px', borderTop: `1px solid ${T.bd2}`, background: T.bg3, borderLeft: `3px solid ${T.chartNeg}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>Analysis Note</div>
            <div style={{ fontSize: 12, color: T.tx, lineHeight: 1.5 }}>
              Properties with <b>2025-2027 maturities</b> facing refi into higher rates with depressed NOI are the most motivated sellers. Floating-rate loans have been in pain since Fed hikes starting 2022. Of filtered properties, <b>{maturityCols.slice(0,4).reduce((a,c)=>a+c.count,0)} mature 2024-2027</b> and <b>{maturityCols.slice(0,4).reduce((a,c)=>a+c.floating,0)} are floating-rate</b> — highest-confidence distressed pipeline.
            </div>
          </div>

          {/* Top refi pressure candidates within filtered set */}
          {(() => {
            const scored = filtered
              .map(p => ({ p, rp: refiPressure(p) }))
              .filter(x => x.rp.score >= 3)
              .sort((a, b) => b.rp.score - a.rp.score)
              .slice(0, 12);
            if (scored.length === 0) return null;
            return (
              <div style={{ padding: '14px 16px', borderTop: `1px solid ${T.bd2}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
                  Top Refi Pressure Candidates · <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: T.tx3, fontStyle: 'italic' }}>From filtered set · click row to view detail</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {scored.map(({ p, rp }, i) => {
                    const sevColor = rp.score >= 7 ? T.chartNeg : rp.score >= 4 ? T.watchTx : T.tx2;
                    return (
                      <div key={i} onClick={() => setSelectedProp(p)} style={{
                        padding: '10px 12px', background: T.bg2, border: `1px solid ${T.bd2}`,
                        borderLeft: `3px solid ${sevColor}`, borderRadius: T.radius, cursor: 'pointer',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
                          <span style={{ fontSize: 11.5, color: T.tx, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8 }}>{p.n}</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: sevColor, fontVariantNumeric: 'tabular-nums' }}>{rp.score.toFixed(1)}</span>
                        </div>
                        <div style={{ fontSize: 10, color: T.tx2 }}>
                          {p.sb} · {p.u}u · {p.it || 'Fixed'} {p.mt ? `· mt ${String(p.mt).split('/')[2] || p.mt}` : ''} {p.lr ? `· ${p.lr.toFixed(2)}%` : ''}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </Card>
      )}

      {/* Table always renders as primary data view */}
      {true && (
        <Card padding={0}>
          <div style={{ padding: '10px 14px', background: T.bgDark, color: T.txLt, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent }}>
              Property Table — {fmtN(sorted.length)} properties
              <InfoTip text="All 716 Austin properties scored against composite layer weights and property factor weights. Columns sortable by clicking headers. Click any row to show property detail below." />
            </div>
            <div style={{ fontSize: 11, color: T.txLt }}>
              Sort: <b style={{ color: T.accent }}>{sortKey}</b> {sortDir === 'desc' ? '↓' : '↑'} · Page {page + 1}/{totalPages}
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: T.fontFamily, minWidth: 1400 }}>
              <thead>
                <tr style={{ background: T.bgDark }}>
                  <th style={{
                    padding: '9px 6px', textAlign: 'center',
                    fontSize: 9, fontWeight: 700, color: T.accent,
                    textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap',
                    width: 36, position: 'sticky', top: 0,
                  }}>
                    <InfoTip text="Check 2-4 properties to compare side-by-side. Max 4 selections." />
                  </th>
                  {[
                    { k: 'sg', l: 'Signal', align: 'left', info: 'BUY ≥ 65 · WATCH 50-64 · AVOID < 50 composite score.' },
                    { k: 'cs', l: 'Score', align: 'right', info: 'Composite score 0-100 = Sub×w_sub + Zip×w_zip + Property×w_prop (weights from layer sliders).' },
                    { k: 'ds', l: 'Distress', align: 'right', info: 'Distress score 0-10. Inputs: occupancy drop, concession surge, loan maturity proximity, rent trend, sponsor history.' },
                    { k: 'n',  l: 'Property', align: 'left', info: 'Property name from CoStar.' },
                    { k: 'm',  l: 'Market', align: 'left', info: 'CoStar micromarket designation.' },
                    { k: 'sb', l: 'Submarket', align: 'left', info: 'CoStar submarket (25 total in Austin MSA).' },
                    { k: 'u',  l: 'Units', align: 'right', info: 'Property unit count.' },
                    { k: 'yb', l: 'Built', align: 'right', info: 'Year built per CoStar.' },
                    { k: 'cl', l: 'Class', align: 'right', info: 'CoStar property class A/B/C. Scored A=85, B=72, C=55; missing skipped.' },
                    { k: 'er', l: 'Rent', align: 'right', info: 'Effective monthly rent.' },
                    { k: 'v',  l: 'Vac%', align: 'right', info: 'Current vacancy rate. Green ≤ 10%, red ≥ 18%.' },
                    { k: 'cn', l: 'Conc%', align: 'right', info: 'Concessions as % of asking rent. Red ≥ 15%, amber ≥ 8%.' },
                    { k: 'rentGap', l: 'RentGap', align: 'right', info: 'Formula: (property rent / submarket avg rent − 1) × 100%. Positive = rent premium vs sub, negative = discount. Red if < −10%, green if > +5%.' },
                    { k: 'zs', l: 'Zip Scr', align: 'right', info: 'Property\'s zip code composite score 0-100 (set by the 16 zip factor sliders on Zip tab).' },
                    { k: 'dataPct', l: 'Data%', align: 'right', info: 'Share of 10 core fields populated (yb, u, sf, v, cn, cl, er, o, z, sb). Low Data% means partial CoStar record — score is based only on fields we have.' },
                    { k: 'o',  l: 'Owner', align: 'left', info: 'Current owner per CoStar.' },
                  ].map(col => (
                    <th key={col.k} onClick={() => handleSort(col.k)} style={{
                      padding: '9px 10px', textAlign: col.align,
                      fontSize: 9, fontWeight: 700, color: T.txLt,
                      textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap',
                      cursor: 'pointer', userSelect: 'none', position: 'sticky', top: 0,
                    }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        {col.l}
                        <InfoTip text={col.info} />
                        {sortKey === col.k && <span style={{ color: T.accent }}>{sortDir === 'desc' ? '↓' : '↑'}</span>}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageProps.map((p, i) => {
                  const vacColor = p.v == null ? T.tx3 : p.v < 10 ? T.chartPos : p.v > 18 ? T.chartNeg : T.tx;
                  const concColor = p.cn == null ? T.tx3 : p.cn > 15 ? T.chartNeg : p.cn > 8 ? T.watchTx : T.tx;
                  const rentGapColor = p.rentGap == null ? T.tx3 : p.rentGap > 5 ? T.chartPos : p.rentGap < -10 ? T.chartNeg : T.tx;
                  const dataColor = p.dataPct < 60 ? T.chartNeg : p.dataPct < 80 ? T.watchTx : T.chartPos;
                  const selected = selectedProp === p;
                  const inCompare = compareSet.has(p.n);
                  return (
                    <tr key={i} onClick={() => setSelectedProp(p)} style={{
                      borderBottom: `1px solid ${T.bd2}`,
                      background: selected ? T.accent : inCompare ? '#FFF8E1' : (i % 2 === 0 ? T.bg2 : T.bg3),
                      cursor: 'pointer',
                    }}>
                      <td onClick={e => { e.stopPropagation(); toggleCompare(p.n); }} style={{ padding: '7px 6px', textAlign: 'center', cursor: compareSet.size >= 4 && !inCompare ? 'not-allowed' : 'pointer' }}>
                        <input type="checkbox" checked={inCompare}
                          disabled={compareSet.size >= 4 && !inCompare}
                          onChange={e => { e.stopPropagation(); toggleCompare(p.n); }}
                          onClick={e => e.stopPropagation()}
                          style={{ cursor: compareSet.size >= 4 && !inCompare ? 'not-allowed' : 'pointer', width: 14, height: 14, accentColor: T.accentDk }}
                        />
                      </td>
                      <td style={{ padding: '7px 10px' }}><Pill signal={p.sg} size="sm" /></td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.accentDk, fontWeight: 700 }}>{p.cs}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: p.ds >= 5 ? T.chartNeg : T.tx3, fontWeight: p.ds >= 5 ? 700 : 400 }}>{p.ds != null ? p.ds.toFixed(1) : '—'}</td>
                      <td style={{ padding: '7px 10px', color: T.tx, fontWeight: 600, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.sweet && <Target size={10} style={{ display: 'inline', marginRight: 4, color: T.accentDk }} />}
                        {LEASEUP_BY_MAIN[p.n] && <span title={`Lease-up · ${(LEASEUP_BY_MAIN[p.n].curOcc*100).toFixed(0)}% occ · ${LEASEUP_BY_MAIN[p.n].vel}/mo`} style={{ display: 'inline-block', fontSize: 9, fontWeight: 700, padding: '1px 5px', background: T.watchTx, color: T.txLt, borderRadius: 3, marginRight: 5, letterSpacing: 0.3 }}>◐ LU</span>}
                        {p.n}
                      </td>
                      <td style={{ padding: '7px 10px', color: T.tx2, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.m || '—'}</td>
                      <td style={{ padding: '7px 10px', color: T.tx2, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.sb || '—'}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.tx }}>{fmtN(p.u)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.tx }}>{p.yb || '—'}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: T.tx }}>{p.cl || '—'}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.tx }}>{p.er ? fmtRent(p.er) : '—'}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: vacColor, fontWeight: 600 }}>{p.v != null ? p.v.toFixed(1) : '—'}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: concColor, fontWeight: 600 }}>{p.cn != null ? p.cn.toFixed(1) : '—'}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: rentGapColor, fontWeight: 600 }}>
                        {p.rentGap != null ? `${p.rentGap > 0 ? '+' : ''}${p.rentGap.toFixed(1)}%` : '—'}
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.tx }}>{p.zs}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: dataColor, fontWeight: 600 }}>{p.dataPct}%</td>
                      <td style={{ padding: '7px 10px', color: T.tx2, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.o || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderTop: `1px solid ${T.bd}`, background: T.bg3 }}>
            <div style={{ fontSize: 11, color: T.tx2 }}>
              {sorted.length === 0 ? 'No properties match current filters' : `Showing ${fmtN(pageStart + 1)}-${fmtN(pageEnd)} of ${fmtN(sorted.length)}`}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11 }}>
              <button onClick={() => setPage(0)} disabled={page === 0} style={{ padding: '4px 10px', border: `1px solid ${T.bd}`, borderRadius: T.radius, background: page === 0 ? T.bg3 : T.bg2, color: page === 0 ? T.tx3 : T.tx, cursor: page === 0 ? 'not-allowed' : 'pointer', fontFamily: T.fontFamily, fontWeight: 600 }}>« First</button>
              <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} style={{ padding: '4px 10px', border: `1px solid ${T.bd}`, borderRadius: T.radius, background: page === 0 ? T.bg3 : T.bg2, color: page === 0 ? T.tx3 : T.tx, cursor: page === 0 ? 'not-allowed' : 'pointer', fontFamily: T.fontFamily, fontWeight: 600 }}>← Prev</button>
              <span style={{ color: T.tx2, margin: '0 8px', fontVariantNumeric: 'tabular-nums' }}>Page {page + 1} / {totalPages}</span>
              <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} style={{ padding: '4px 10px', border: `1px solid ${T.bd}`, borderRadius: T.radius, background: page >= totalPages - 1 ? T.bg3 : T.bg2, color: page >= totalPages - 1 ? T.tx3 : T.tx, cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', fontFamily: T.fontFamily, fontWeight: 600 }}>Next →</button>
              <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1} style={{ padding: '4px 10px', border: `1px solid ${T.bd}`, borderRadius: T.radius, background: page >= totalPages - 1 ? T.bg3 : T.bg2, color: page >= totalPages - 1 ? T.tx3 : T.tx, cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', fontFamily: T.fontFamily, fontWeight: 600 }}>Last »</button>
            </div>
          </div>
        </Card>
      )}

      {/* Selected property MODAL — overlays the whole page when row clicked */}
      {/* Property card modal lifted to App-level — see <PropertyCardModal /> */}

      {/* Compare modal — side-by-side view of 2-4 selected properties */}
      {compareModalOpen && compareSet.size >= 2 && (() => {
        const selected = scoredProps.filter(p => compareSet.has(p.n));
        if (selected.length < 2) return null;

        const highlightBest = (vals, dir = 'high') => {
          const nums = vals.map(v => (v == null || isNaN(v)) ? null : Number(v));
          const valid = nums.filter(v => v != null);
          if (valid.length === 0) return vals.map(() => false);
          const best = dir === 'high' ? Math.max(...valid) : Math.min(...valid);
          return nums.map(v => v === best);
        };

        const rows = [
          {
            section: 'Scoring',
            items: [
              { label: 'Signal', values: selected.map(p => p.sg), fmt: v => v, direction: null, pill: true },
              { label: 'Composite Score', values: selected.map(p => p.cs), fmt: v => v, direction: 'high' },
              { label: 'Submarket Score', values: selected.map(p => Math.round(p.ss)), fmt: v => v, direction: 'high' },
              { label: 'Zip Score', values: selected.map(p => Math.round(p.zs)), fmt: v => v, direction: 'high' },
              { label: 'Property Quality', values: selected.map(p => Math.round(p.pq)), fmt: v => v, direction: 'high' },
              { label: 'Distress Score', values: selected.map(p => p.ds), fmt: v => v != null ? v.toFixed(1) : '—', direction: null },
              { label: 'Data Completeness', values: selected.map(p => p.dataPct), fmt: v => `${v}%`, direction: 'high' },
            ],
          },
          {
            section: 'Size & Vintage',
            items: [
              { label: 'Units', values: selected.map(p => p.u), fmt: v => fmtN(v), direction: null },
              { label: 'Avg Unit SF', values: selected.map(p => p.sf), fmt: v => v != null ? `${fmtN(v)} SF` : '—', direction: 'high' },
              { label: 'Year Built', values: selected.map(p => p.yb), fmt: v => v || '—', direction: 'high' },
              { label: 'Class', values: selected.map(p => p.cl || '—'), fmt: v => v, direction: null },
            ],
          },
          {
            section: 'Operations',
            items: [
              { label: 'Effective Rent', values: selected.map(p => p.er), fmt: v => v != null ? `$${Math.round(v).toLocaleString()}` : '—', direction: null },
              { label: 'Vacancy', values: selected.map(p => p.v), fmt: v => v != null ? `${v.toFixed(1)}%` : '—', direction: 'low' },
              { label: 'Concessions', values: selected.map(p => p.cn), fmt: v => v != null ? `${v.toFixed(1)}%` : '—', direction: 'low' },
              { label: 'Rent Gap vs Sub', values: selected.map(p => p.rentGap), fmt: v => v != null ? `${v > 0 ? '+' : ''}${v.toFixed(1)}%` : '—', direction: null },
            ],
          },
          {
            section: 'Location',
            items: [
              { label: 'Submarket', values: selected.map(p => p.sb || '—'), fmt: v => v, direction: null },
              { label: 'Zip Code', values: selected.map(p => p.z || '—'), fmt: v => v, direction: null },
              { label: 'Market/Neighborhood', values: selected.map(p => p.m || '—'), fmt: v => v, direction: null },
            ],
          },
          {
            section: 'Ownership',
            items: [
              { label: 'Owner', values: selected.map(p => p.o || '—'), fmt: v => v, direction: null },
              { label: 'Property Manager', values: selected.map(p => p.pm || '—'), fmt: v => v, direction: null },
            ],
          },
          {
            section: 'Debt',
            items: [
              { label: 'Maturity', values: selected.map(p => p.mt || '—'), fmt: v => v, direction: null },
              { label: 'Rate Type', values: selected.map(p => p.it || '—'), fmt: v => v, direction: null },
              { label: 'Loan Rate', values: selected.map(p => p.lr), fmt: v => v != null ? `${v.toFixed(2)}%` : '—', direction: 'low' },
              { label: 'Loan Balance', values: selected.map(p => p.la), fmt: v => v && v > 0 ? fmt$(v) : '—', direction: null },
            ],
          },
          {
            section: 'Pricing',
            items: [
              { label: 'Expected $/u (Mid)', values: selected.map(p => expectedPpu(p).mid), fmt: v => `$${Math.round(v/1000)}K`, direction: null },
              { label: 'Expected $/u Range', values: selected.map(p => { const e = expectedPpu(p); return `$${Math.round(e.low/1000)}-${Math.round(e.high/1000)}K`; }), fmt: v => v, direction: null },
              { label: 'Last Sale Date', values: selected.map(p => p.sd ? String(p.sd).slice(0, 10) : '—'), fmt: v => v, direction: null },
              { label: 'Last Sale Price', values: selected.map(p => p.sp), fmt: v => v ? fmt$(v) : '—', direction: null },
              { label: 'Last Sale $/u', values: selected.map(p => p.sp && p.u ? Math.round(p.sp / p.u) : null), fmt: v => v != null ? `$${Math.round(v/1000)}K` : '—', direction: null },
            ],
          },
          {
            section: 'Lease-Up Context',
            items: [
              { label: 'In Lease-Up', values: selected.map(p => LEASEUP_BY_MAIN[p.n] ? 'Yes ◐' : '—'), fmt: v => v, direction: null },
              { label: 'Current Occupancy', values: selected.map(p => { const lu = LEASEUP_BY_MAIN[p.n]; return lu ? lu.curOcc : null; }), fmt: v => v != null ? `${(v*100).toFixed(1)}%` : '—', direction: 'high' },
              { label: 'Trailing Velocity', values: selected.map(p => { const lu = LEASEUP_BY_MAIN[p.n]; return lu ? lu.vel : null; }), fmt: v => v != null ? `${v.toFixed(1)}/mo` : '—', direction: 'high' },
              { label: 'Implied Stab Quarter', values: selected.map(p => { const lu = LEASEUP_BY_MAIN[p.n]; if (!lu) return '—'; const v = (lu.vel || 0) > 0 ? lu.vel : MARKET_VEL_ASSUMPTION; const stab = calcStabilization(lu.curOcc, lu.u, v, stabThresh); return stab ? stab.quarter : '—'; }), fmt: v => v, direction: null },
              { label: 'Sub Lease-Up Count', values: selected.map(p => { const s = LEASEUP_SUBS[p.sb]; return s ? s.n : 0; }), fmt: v => v > 0 ? `${v} props` : 'none', direction: null },
              { label: 'Sub Lease-Up Occupancy', values: selected.map(p => { const s = LEASEUP_SUBS[p.sb]; return s ? s.wtdOcc : null; }), fmt: v => v != null ? `${(v*100).toFixed(0)}%` : '—', direction: 'high' },
            ],
          },
          {
            section: 'Refi Pressure',
            items: [
              { label: 'Refi Pressure Score', values: selected.map(p => refiPressure(p).score), fmt: v => v.toFixed(1) + '/10', direction: null },
              { label: 'Signals Firing', values: selected.map(p => refiPressure(p).signals.length), fmt: v => fmtN(v), direction: null },
            ],
          },
        ];

        return (
          <div onClick={() => setCompareModalOpen(false)} style={{
            position: 'fixed', inset: 0, background: 'rgba(9, 14, 65, 0.55)', backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1001, padding: 24, fontFamily: T.fontFamily,
          }}>
            <div onClick={(e) => e.stopPropagation()} style={{
              background: T.bg2, maxWidth: 1400, width: '100%',
              maxHeight: '92vh', overflow: 'auto',
              borderRadius: T.radius, boxShadow: '0 20px 60px rgba(9, 14, 65, 0.4)',
            }}>
              {/* Sticky header */}
              <div style={{
                position: 'sticky', top: 0, zIndex: 2,
                padding: '18px 24px', background: T.bgDark, color: T.txLt,
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              }}>
                <div>
                  <div style={{ fontSize: 10, color: T.accent, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 700 }}>
                    Property Comparison
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: T.txLt, marginTop: 4 }}>
                    {selected.length} properties · side-by-side
                  </div>
                  <div style={{ fontSize: 11, color: T.txLt, marginTop: 2, opacity: 0.8 }}>
                    Highlighted cells mark the best value for each directional metric · Data {DATA_VINTAGE.propertyData}
                  </div>
                </div>
                <button onClick={() => setCompareModalOpen(false)} style={{
                  background: 'transparent', border: `1px solid ${T.bd}`, color: T.txLt,
                  padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  fontFamily: T.fontFamily, borderRadius: T.radius,
                }}>Close ✕</button>
              </div>

              {/* Property name header row */}
              <div style={{ display: 'grid', gridTemplateColumns: `220px repeat(${selected.length}, 1fr)`, background: T.bg3, borderBottom: `2px solid ${T.bd}`, position: 'sticky', top: 74, zIndex: 1 }}>
                <div style={{ padding: '14px 16px', fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.8, borderRight: `1px solid ${T.bd2}` }}>
                  Metric
                </div>
                {selected.map((p, i) => (
                  <div key={p.n} style={{ padding: '14px 16px', borderRight: i < selected.length - 1 ? `1px solid ${T.bd2}` : 'none' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.tx, lineHeight: 1.25 }}>{p.n}</div>
                    <div style={{ fontSize: 10, color: T.tx2, marginTop: 3 }}>
                      {p.sb} · {p.yb} · {p.u}u · Class {p.cl || '?'}
                    </div>
                  </div>
                ))}
              </div>

              {/* Comparison rows grouped by section */}
              {rows.map((group, gi) => (
                <div key={group.section}>
                  <div style={{ padding: '10px 16px', background: T.bgDark, color: T.accent, fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                    {group.section}
                  </div>
                  {group.items.map((row, ri) => {
                    const isBest = row.direction ? highlightBest(row.values, row.direction) : row.values.map(() => false);
                    return (
                      <div key={ri} style={{
                        display: 'grid', gridTemplateColumns: `220px repeat(${selected.length}, 1fr)`,
                        borderBottom: `1px solid ${T.bd2}`,
                        background: ri % 2 === 0 ? T.bg2 : T.bg3,
                      }}>
                        <div style={{ padding: '10px 16px', fontSize: 11.5, color: T.tx2, borderRight: `1px solid ${T.bd2}`, fontWeight: 500 }}>
                          {row.label}
                        </div>
                        {row.values.map((v, ci) => (
                          <div key={ci} style={{
                            padding: '10px 16px', fontSize: 12, color: T.tx,
                            borderRight: ci < row.values.length - 1 ? `1px solid ${T.bd2}` : 'none',
                            background: isBest[ci] ? T.buyBg : 'transparent',
                            fontWeight: isBest[ci] ? 700 : 500,
                            fontVariantNumeric: 'tabular-nums',
                          }}>
                            {row.pill ? <Pill signal={v} size="sm" /> : row.fmt(v)}
                            {isBest[ci] && <span style={{ marginLeft: 6, fontSize: 10, color: T.buyTx, fontWeight: 700 }}>★</span>}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* Footer actions */}
              <div style={{ padding: '14px 20px', background: T.bg3, borderTop: `1px solid ${T.bd2}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: T.tx2 }}>
                <div>
                  ★ marks best value for directional metrics (composite, vacancy, vintage, etc.). Non-directional metrics (owner, class, etc.) are unhighlighted.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setCompareSet(new Set()); setCompareModalOpen(false); }} style={{
                    padding: '6px 14px', fontSize: 11, fontWeight: 600,
                    background: 'transparent', color: T.tx2, border: `1px solid ${T.bd}`,
                    borderRadius: T.radius, cursor: 'pointer', fontFamily: T.fontFamily,
                  }}>Clear & close</button>
                  <button onClick={() => setCompareModalOpen(false)} style={{
                    padding: '6px 14px', fontSize: 11, fontWeight: 700,
                    background: T.accentDk, color: T.txLt, border: `1px solid ${T.accentDk}`,
                    borderRadius: T.radius, cursor: 'pointer', fontFamily: T.fontFamily,
                  }}>Close</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}


    </div>
  );
}

const LEASEUP_SUB_COLORS = {
  'Downtown Austin':     '#1E3A8A',
  'Central Austin':      '#2563EB',
  'West Austin':         '#14B8A6',
  'South Austin':        '#F59E0B',
  'South Central Austin':'#EF4444',
  'North Austin':        '#8B5CF6',
  'Northwest Austin':    '#EC4899',
  'Southwest Austin':    '#0EA5E9',
  'Round Rock':          '#10B981',
  'Cedar Park':          '#84CC16',
  'Pflugerville':        '#F97316',
  'Georgetown-Leander':  '#A855F7',
  'Far West Austin':     '#06B6D4',
  'Lake Travis':         '#3B82F6',
  'Riverside':           '#DC2626',
  'Midtown Austin':      '#7C3AED',
  'East Austin':         '#22C55E',
  'Northeast Austin':    '#D97706',
  'Southeast Austin':    '#BE185D',
  'Far North Austin':    '#65A30D',
  'San Marcos':          '#0891B2',
  'Buda-Kyle':           '#DB2777',
  'Hill Country':        '#6366F1',
  'Bastrop County':      '#B45309',
  'Caldwell County':     '#475569',
};

function LeaseUpTab({ layerW, opMode, zipFactorW, propFactorW, subFactorW, navigateTo, setSelectedProp, setSelectedSubModal,
                     leasesPerMo, setLeasesPerMo, preLeasedUC, setPreLeasedUC, stabThresh, setStabThresh }) {
  const [selectedSub, setSelectedSub] = useState('All');

  const [tableSearch, setTableSearch] = useState('');
  const [tableStatus, setTableStatus] = useState('All');
  const [tableSortKey, setTableSortKey] = useState('stabMonths');
  const [tableSortDir, setTableSortDir] = useState('asc');

  const subScoreMap = useMemo(() => {
    const scored = buildScoredSubs(subFactorW);
    const m = {};
    scored.forEach(s => { m[s.s] = s.cs; });
    return m;
  }, [subFactorW]);

  const forwardQuarters = useMemo(() => {
    const labels = ['26Q2TD'];
    let baseY = 26, baseQ = 2;
    for (let i = 1; i <= 32; i++) {
      let totalQ = baseQ + i;
      let y = baseY + Math.floor((totalQ - 1) / 4);
      let q = ((totalQ - 1) % 4) + 1;
      labels.push(y + 'Q' + q);
    }
    return labels;
  }, []);

  const pipeline = useMemo(() => {
    const lu = LEASEUP_PROPS.map(p => ({
      ...p,
      status: p.st === 'Under Construction/Lease-Up' ? 'UC-Active' : 'Lease-Up',
      deliveredByToday: true,
      entryQ: null,
    }));
    const uc = UC_DEALS.map(d => ({
      n: d.n,
      st: 'UC',
      tp: 'UC Pipeline',
      u: d.u,
      yb: 2026,
      z: d.z,
      sb: d.sb,
      curOcc: preLeasedUC,
      vel: null,
      occ: [],
      status: 'UC',
      deliveredByToday: false,
      entryQ: d.cq,
    }));
    return [...lu, ...uc];
  }, [preLeasedUC]);

  const filteredPipeline = useMemo(() => {
    if (selectedSub === 'All') return pipeline;
    return pipeline.filter(p => p.sb === selectedSub);
  }, [pipeline, selectedSub]);

  const activeLU = useMemo(() =>
    filteredPipeline.filter(p => p.deliveredByToday),
    [filteredPipeline]
  );

  const agg = useMemo(() => {
    const totalUnits = activeLU.reduce((a, p) => a + p.u, 0);
    const totalLeased = activeLU.reduce((a, p) => a + p.u * p.curOcc, 0);
    const wtdOcc = totalUnits > 0 ? totalLeased / totalUnits : 0;
    const vels = activeLU.map(p => p.vel || 0).filter(v => v > 0);
    const sorted = [...vels].sort((a, b) => a - b);
    const medVel = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;
    const meanVel = sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;

    const luSubset = filteredPipeline.filter(p => p.deliveredByToday);
    const ucSubset = filteredPipeline.filter(p => !p.deliveredByToday)
      .map(p => ({ u: p.u, cq: p.entryQ, sb: p.sb, z: p.z, n: p.n }));

    const stabStats = computeAbsorptionStab(luSubset, ucSubset, leasesPerMo, preLeasedUC, stabThresh);
    const milestones = computeAbsorptionMilestones(luSubset, ucSubset, leasesPerMo, preLeasedUC, [0.75, 0.85, stabThresh], stabThresh);
    const bottleneck = computeBottleneckProps(luSubset, ucSubset, leasesPerMo, preLeasedUC, stabThresh, 5);

    const ucCount = ucSubset.length;
    const ucUnits = ucSubset.reduce((a, p) => a + p.u, 0);
    const combinedPool = totalUnits + ucUnits;

    const ucDeliveredToday = ucSubset.filter(u => u.cq === TODAY_Q);
    const ucDeliveredTodayUnits = ucDeliveredToday.reduce((a, u) => a + u.u, 0);
    const todayPoolUnits = totalUnits + ucDeliveredTodayUnits;
    const todayPoolLeased = totalLeased + ucDeliveredTodayUnits * preLeasedUC;
    const todayPoolOcc = todayPoolUnits > 0 ? todayPoolLeased / todayPoolUnits : 0;

    return {
      count: activeLU.length, totalUnits, combinedPool,
      unitsRemaining: totalUnits - Math.round(totalLeased),
      wtdOcc, medVel, meanVel,
      stabQuarter: stabStats ? stabStats.quarter : '—',
      stabMonths: stabStats ? stabStats.months : null,
      stabWtdOcc: stabStats ? stabStats.wtdOcc : null,
      milestones,
      bottleneck,
      ucCount, ucUnits,
      todayPoolOcc,
      todayPoolUnits,
      ucDeliveredTodayCount: ucDeliveredToday.length,
      ucDeliveredTodayUnits,
    };
  }, [activeLU, filteredPipeline, leasesPerMo, stabThresh, preLeasedUC]);

  const propProjections = useMemo(() => {
    const out = {};
    const histQuarters = LEASEUP_PROPS[0]?.occ.map(o => o.q) || [];
    const DELIVERY_THRESHOLD = 0.01;

    for (const p of pipeline) {
      const occByQ = {};
      if (p.deliveredByToday) {
        const trueEntry = (p.occ || []).find(pt => pt.o >= DELIVERY_THRESHOLD);
        const trueEntryQ = trueEntry ? trueEntry.q : null;
        let seen = false;
        for (const pt of p.occ) {
          if (!seen && pt.q === trueEntryQ) seen = true;
          occByQ[pt.q] = seen ? pt.o : null;
        }
        let occ = p.curOcc;
        const stabCap = stabThresh;
        for (const q of forwardQuarters.slice(1)) {
          if (occ < stabCap) {
            occ = Math.min(stabCap, occ + (leasesPerMo * 3) / p.u);
          }
          occByQ[q] = occ;
        }
      } else {
        for (const q of histQuarters) occByQ[q] = null;
        let entryIdx = forwardQuarters.indexOf(p.entryQ);
        if (entryIdx === -1 && p.entryQ === TODAY_Q) entryIdx = 0;
        let occ = preLeasedUC;
        for (let i = 0; i < forwardQuarters.length; i++) {
          const q = forwardQuarters[i];
          if (i < entryIdx || entryIdx === -1) {
            occByQ[q] = null;
          } else if (i === entryIdx) {
            occ = preLeasedUC;
            if (i > 0 && occ < stabThresh) {
              occ = Math.min(stabThresh, occ + (leasesPerMo * 3) / p.u);
            }
            occByQ[q] = occ;
          } else {
            if (occ < stabThresh) {
              occ = Math.min(stabThresh, occ + (leasesPerMo * 3) / p.u);
            }
            occByQ[q] = occ;
          }
        }
      }
      out[p.n] = {
        status: p.status,
        sb: p.sb,
        u: p.u,
        curOcc: p.curOcc,
        vel: p.vel,
        entryQ: p.entryQ,
        occByQ,
      };
    }
    return out;
  }, [pipeline, leasesPerMo, stabThresh, preLeasedUC, forwardQuarters]);

  const aggOccData = useMemo(() => {
    const histQuarters = LEASEUP_PROPS[0]?.occ.map(o => o.q) || [];
    const allQuarters = [...histQuarters, ...forwardQuarters.slice(1)];
    return allQuarters.map(q => {
      let luProps = 0, ucProps = 0;
      let luUnits = 0, ucUnits = 0;
      let leasedU = 0;
      for (const p of filteredPipeline) {
        const occ = propProjections[p.n]?.occByQ[q];
        if (occ != null) {
          if (p.deliveredByToday) {
            luProps++;
            luUnits += p.u;
          } else {
            ucProps++;
            ucUnits += p.u;
          }
          leasedU += p.u * occ;
        }
      }
      const totalU = luUnits + ucUnits;
      return {
        q,
        occ: totalU > 0 ? leasedU / totalU : null,
        denom: totalU,
        luProps, ucProps, luUnits, ucUnits,
        totalProps: luProps + ucProps,
        totalUnits: totalU,
        leasedUnits: Math.round(leasedU),
        unitsRemaining: Math.round(totalU - leasedU),
      };
    });
  }, [filteredPipeline, propProjections, forwardQuarters]);

  const stackedData = useMemo(() => {
    const histQuarters = LEASEUP_PROPS[0]?.occ.map(o => o.q) || [];
    const allQuarters = [...histQuarters, ...forwardQuarters.slice(1)];
    return allQuarters.map(q => {
      let activeAvail = 0, ucAvail = 0;
      let totalUnits = 0, totalLeased = 0;
      for (const p of filteredPipeline) {
        const occ = propProjections[p.n]?.occByQ[q];
        if (occ != null) {
          const avail = p.u * (1 - occ);
          if (p.deliveredByToday) activeAvail += avail;
          else ucAvail += avail;
          totalUnits += p.u;
          totalLeased += p.u * occ;
        }
      }
      return {
        q,
        activeLU: Math.round(activeAvail),
        ucPipe: Math.round(ucAvail),
        totalAvail: Math.round(activeAvail + ucAvail),
        occ: totalUnits > 0 ? totalLeased / totalUnits : null,
      };
    });
  }, [filteredPipeline, propProjections, forwardQuarters]);

  const presentSubs = useMemo(() =>
    [...new Set(filteredPipeline.map(p => p.sb))].sort(),
    [filteredPipeline]
  );

  const impliedLeasesPerMo = useMemo(() => {
    const actives = activeLU.filter(p => p.curOcc < stabThresh);
    if (actives.length === 0) return 0;
    const vels = actives.map(p => impliedVelocity(p, subScoreMap[p.sb]) || 0);
    return Math.round((vels.reduce((a, b) => a + b, 0) / vels.length) * 10) / 10;
  }, [activeLU, subScoreMap, stabThresh]);

  const detailRows = useMemo(() => {
    return filteredPipeline.map(p => {
      const subScore = subScoreMap[p.sb];
      const implied = p.deliveredByToday ? (impliedVelocity(p, subScore) || 0) : 0;
      let stab;
      if (p.deliveredByToday) {
        stab = calcStabilization(p.curOcc, p.u, leasesPerMo, stabThresh);
      } else {
        const gap = (stabThresh - preLeasedUC) * p.u;
        const months = gap / leasesPerMo;
        const entryIdx = forwardQuarters.indexOf(p.entryQ);
        const quartersAfter = Math.ceil(months / 3);
        const stabQIdx = entryIdx + quartersAfter;
        const stabQ = stabQIdx >= 0 && stabQIdx < forwardQuarters.length ? forwardQuarters[stabQIdx] : '29Q2+';
        stab = { quarter: stabQ, months: Math.round(months) };
      }
      return {
        name: p.n,
        status: p.status,
        sub: p.sb,
        units: p.u,
        yb: p.yb,
        curOcc: p.deliveredByToday ? p.curOcc : null,
        entryQ: p.entryQ || '—',
        vel: p.vel,
        implied,
        subScore: subScore != null ? Math.round(subScore) : null,
        stabQuarter: stab ? stab.quarter : '—',
        stabMonths: stab ? stab.months : null,
        occByQ: propProjections[p.n]?.occByQ || {},
      };
    });
  }, [filteredPipeline, subScoreMap, leasesPerMo, stabThresh, preLeasedUC, propProjections, forwardQuarters]);

  const visibleRows = useMemo(() => {
    let rows = [...detailRows];
    if (tableSearch.trim()) {
      const q = tableSearch.trim().toLowerCase();
      rows = rows.filter(r =>
        r.name.toLowerCase().includes(q) ||
        (r.sub || '').toLowerCase().includes(q)
      );
    }
    if (tableStatus !== 'All') {
      if (tableStatus === 'Lease-Up') rows = rows.filter(r => r.status === 'Lease-Up' || r.status === 'UC-Active');
      else if (tableStatus === 'UC') rows = rows.filter(r => r.status === 'UC');
    }
    rows.sort((a, b) => {
      const av = a[tableSortKey];
      const bv = b[tableSortKey];
      const sign = tableSortDir === 'asc' ? 1 : -1;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string') return av.localeCompare(bv) * sign;
      return (av - bv) * sign;
    });
    return rows;
  }, [detailRows, tableSearch, tableStatus, tableSortKey, tableSortDir]);

  const subRanking = useMemo(() => {
    const allSubs = new Set([...Object.keys(LEASEUP_SUBS), ...UC_DEALS.map(d => d.sb)]);
    const rows = [];
    for (const subName of allSubs) {
      const summary = subLeaseUpSummary(subName, leasesPerMo, preLeasedUC, stabThresh);
      if (summary) {
        rows.push({
          sub: subName,
          ...summary,
          subScore: subScoreMap[subName] != null ? Math.round(subScoreMap[subName]) : null,
        });
      }
    }
    return rows.sort((a, b) => (b.meanVel || 0) - (a.meanVel || 0));
  }, [leasesPerMo, preLeasedUC, stabThresh, subScoreMap]);

  const subOptions = ['All', ...Object.keys(LEASEUP_SUBS).sort()];

  const yMin = useMemo(() => {
    const validOccs = aggOccData.map(d => d.occ).filter(v => v != null);
    if (validOccs.length === 0) return 0;
    return Math.max(0, Math.min(...validOccs) - 0.05);
  }, [aggOccData]);

  const sortHeader = (key, label, info) => (
    <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 9, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.5, cursor: 'pointer', whiteSpace: 'nowrap' }}
      onClick={() => {
        if (tableSortKey === key) setTableSortDir(tableSortDir === 'asc' ? 'desc' : 'asc');
        else { setTableSortKey(key); setTableSortDir('asc'); }
      }}>
      {label} {tableSortKey === key && (tableSortDir === 'asc' ? '▲' : '▼')}
      {info && <InfoTip text={info} />}
    </th>
  );

  return (
    <div>
      {/* Hero — frames the THREE answers (75/85/95) not just the final laggard */}
      <Card padding={0} style={{ marginBottom: 16 }}>
        <div style={{ padding: '18px 24px', background: T.bgDark, color: T.txLt }}>
          <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent, marginBottom: 6 }}>
            {selectedSub === 'All' ? 'Austin' : selectedSub} Absorption Pipeline — {activeLU.length} Active Lease-Up + {agg.ucCount} UC {agg.ucCount === 1 ? 'Deal' : 'Deals'}
          </div>
          <div style={{ fontSize: 16, lineHeight: 1.5, color: T.txLt, fontWeight: 500, letterSpacing: -0.1 }}>
            {selectedSub === 'All' ? 'Austin-wide' : selectedSub} combined pool: <b style={{ color: T.accent }}>{fmtN(agg.combinedPool)}</b> units eventually ({fmtN(agg.totalUnits)} already in lease-up at <b style={{ color: T.accent }}>{(agg.wtdOcc*100).toFixed(1)}%</b> delivered occupancy + {fmtN(agg.ucUnits)} UC delivering 26Q2–28Q2 at {(preLeasedUC*100).toFixed(0)}% pre-leased).
            At <b style={{ color: T.accent }}>{leasesPerMo}/mo per property</b> (vs. {selectedSub === 'All' ? "Austin's" : `${selectedSub}'s`} observed median of <b style={{ color: T.accent }}>{agg.medVel > 0 ? `${agg.medVel.toFixed(1)}/mo` : 'n/a (no LU observations)'}</b>), market clears in stages below.
          </div>
        </div>

        {/* MARKET CLEARING MILESTONES — what MDs actually need */}
        <div style={{ padding: '16px 24px', borderBottom: `1px solid ${T.bd2}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <div style={{ fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: 700, color: T.tx2 }}>
              Market Clearing Milestones
              <InfoTip text="Three honest answers to 'when does supply absorb?' — 75% weighted occ is the investment-actionable market clearing point. 85% is the 'functionally healed' point. 95% (full stab) is the last-laggard point — a single large late-delivery UC can drag this number by years. All three are correct; pick the one that matches the decision being made." />
            </div>
            <div style={{ fontSize: 10.5, color: T.tx3, fontStyle: 'italic' }}>All at {leasesPerMo}/mo · {(preLeasedUC*100).toFixed(0)}% UC pre-leased</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {(() => {
              const tiles = [];
              if (stabThresh > 0.75 + 1e-9) tiles.push({ label: '75% Pool Cleared', sub: 'Market clearing point — absorption begins to dominate supply', val: agg.milestones?.[0.75], bg: T.buyBg, tx: T.buyTx, bd: T.buyBd });
              if (stabThresh > 0.85 + 1e-9) tiles.push({ label: '85% Pool Cleared', sub: 'Functionally healed — concessions compress, rent growth reaccelerates', val: agg.milestones?.[0.85], bg: T.bg3, tx: T.accentDk, bd: T.accentDk });
              tiles.push({ label: `${(stabThresh*100).toFixed(0)}% Pool Cleared (Full Stab)`, sub: 'Last-laggard clearance — all UC delivered + pool at threshold; interpret w/ caution', val: agg.milestones?.[stabThresh], bg: T.watchBg, tx: T.watchTx, bd: T.watchBd });
              return tiles.map((m, i) => (
                <div key={i} style={{ padding: 14, background: m.bg, border: `1px solid ${m.bd}`, borderLeft: `3px solid ${m.bd}`, borderRadius: T.radius }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: m.tx, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>{m.label}</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: m.tx, lineHeight: 1.1, letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums' }}>
                    {m.val ? m.val.quarter : '—'}
                  </div>
                  <div style={{ fontSize: 11, color: T.tx2, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>
                    {m.val?.months != null ? `${m.val.months} months from today` : 'beyond 20-year horizon'}
                  </div>
                  <div style={{ fontSize: 10, color: T.tx3, marginTop: 6, lineHeight: 1.4 }}>{m.sub}</div>
                </div>
              ));
            })()}
          </div>
        </div>

        {/* SECONDARY METRICS */}
        <div style={{ padding: '16px 24px' }}>
          <Grid cols={5} gap={20}>
            <Metric label="Active Lease-Up Props" value={fmtN(agg.count)} subValue={selectedSub === 'All' ? 'all subs' : selectedSub} />
            <Metric label="UC Pipeline" value={fmtN(agg.ucUnits)} subValue={`${agg.ucCount} deals · 26Q2–28Q2`} />
            <Metric label="Combined Pool" value={fmtN(agg.combinedPool)} subValue="total units eventually" />
            <Metric
              label="Pool Occ Today"
              value={`${(agg.todayPoolOcc*100).toFixed(1)}%`}
              subValue={agg.ucDeliveredTodayCount > 0
                ? `LU ${(agg.wtdOcc*100).toFixed(0)}% + ${agg.ucDeliveredTodayCount} UCs @ ${(preLeasedUC*100).toFixed(0)}%`
                : `LU-only · no UCs delivered today`}
            />
            <Metric
              label={`Units to ${(stabThresh*100).toFixed(0)}% Stab`}
              value={fmtN(Math.max(0, Math.round(stabThresh * agg.totalUnits - (agg.totalUnits - agg.unitsRemaining))) + Math.round((stabThresh - preLeasedUC) * agg.ucUnits))}
              subValue={`${fmtN(Math.max(0, Math.round(stabThresh * agg.totalUnits - (agg.totalUnits - agg.unitsRemaining))))} LU + ${fmtN(Math.round((stabThresh - preLeasedUC) * agg.ucUnits))} UC`}
            />
          </Grid>
        </div>
      </Card>

      {/* Controls */}
      <Grid cols={3} gap={16} style={{ marginBottom: 16 }}>
        <Card padding={0}>
          <div style={{ padding: '12px 20px', background: T.bgDark, color: T.txLt }}>
            <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent }}>
              Submarket Filter
            </div>
            <div style={{ fontSize: 11, color: T.txLt, marginTop: 2, opacity: 0.85 }}>Flows through all sections and tables</div>
          </div>
          <div style={{ padding: 16 }}>
            <select value={selectedSub} onChange={e => setSelectedSub(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', fontSize: 12, fontFamily: T.fontFamily, background: T.bg2, color: T.tx, border: `1px solid ${T.bd}`, borderRadius: T.radius, outline: 'none' }}>
              {subOptions.map(s => {
                const info = LEASEUP_SUBS[s];
                const ucInfo = UC_DEALS.filter(d => d.sb === s);
                const tag = info ? ` (${info.n} LU${ucInfo.length > 0 ? ` · ${ucInfo.length} UC` : ''})` : '';
                return <option key={s} value={s}>{s}{tag}</option>;
              })}
            </select>
            <div style={{ marginTop: 12, padding: 10, background: T.bg3, borderRadius: T.radius, fontSize: 11, color: T.tx2, lineHeight: 1.5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ color: T.tx, fontWeight: 600 }}>UC pipeline baked in: {UC_DEALS.length} deals, {fmtN(UC_DEALS.reduce((a,d)=>a+d.u,0))} units</span>
                <InfoTip text="All 48 under-construction deals enter the projection at their scheduled completion quarter (26Q2–28Q2) at the pre-leased % assumption below. Projections always reflect the full combined pool — that's the whole point." />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 10.5, color: T.tx2 }}>Pre-leased % at delivery <InfoTip text="Assumed starting occupancy when a UC property delivers. Industry standard is 15%. Adjust based on deal-specific pre-leasing strength." /></span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: T.accentDk, fontVariantNumeric: 'tabular-nums' }}>{(preLeasedUC*100).toFixed(0)}%</span>
                </div>
                <input type="range" min={0} max={0.5} step={0.01} value={preLeasedUC}
                  onChange={e => setPreLeasedUC(Number(e.target.value))}
                  style={{ width: '100%', accentColor: T.accentDk, cursor: 'pointer', height: 4 }} />
              </div>
            </div>
          </div>
        </Card>

        <Card padding={0}>
          <div style={{ padding: '12px 20px', background: T.bgDark, color: T.txLt }}>
            <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent }}>
              Your Assumptions
            </div>
            <div style={{ fontSize: 11, color: T.txLt, marginTop: 2, opacity: 0.85 }}>Drives all projections and stab quarters</div>
          </div>
          <div style={{ padding: 16 }}>
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: T.tx, fontWeight: 600 }}>Net new leases / month (per property) <InfoTip text="Applied to every property's remaining vacancy each quarter. Projections follow Dylan's example workbook: MIN(prior_leased + rate×3, units × stabThresh)." /></span>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.accentDk, fontVariantNumeric: 'tabular-nums', background: T.accent, padding: '2px 10px', borderRadius: T.radius }}>{leasesPerMo}</span>
              </div>
              <input type="range" min={0} max={30} step={1} value={leasesPerMo}
                onChange={e => setLeasesPerMo(Number(e.target.value))}
                style={{ width: '100%', accentColor: T.accentDk, cursor: 'pointer' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: T.tx3, marginTop: 2 }}>
                <span>0 (stalled)</span><span>10 (market avg)</span><span>30 (tower pace)</span>
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: T.tx, fontWeight: 600 }}>Stabilization threshold <InfoTip text="Occupancy level at which a property is considered stabilized. Industry standard is 95%. Lower for student housing or affordability-restricted products." /></span>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.accentDk, fontVariantNumeric: 'tabular-nums', background: T.accent, padding: '2px 10px', borderRadius: T.radius }}>{(stabThresh*100).toFixed(0)}%</span>
              </div>
              <input type="range" min={0.85} max={0.98} step={0.01} value={stabThresh}
                onChange={e => setStabThresh(Number(e.target.value))}
                style={{ width: '100%', accentColor: T.accentDk, cursor: 'pointer' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: T.tx3, marginTop: 2 }}>
                <span>85%</span><span>92%</span><span>98%</span>
              </div>
            </div>
          </div>
        </Card>

        <Card padding={0}>
          <div style={{ padding: '12px 20px', background: T.bgDark, color: T.txLt }}>
            <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent }}>
              Claude-Implied Velocity <InfoTip text="Data-driven estimate of leases/mo. Takes each property's max(trailing actual, sub median) and adjusts by the sub's composite score multiplier. Compare against your manual input." />
            </div>
            <div style={{ fontSize: 11, color: T.txLt, marginTop: 2, opacity: 0.85 }}>trailing actual × sub composite multiplier</div>
          </div>
          <div style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: T.tx2, letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: 700 }}>Your input</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: T.tx, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{leasesPerMo.toFixed(1)}<span style={{ fontSize: 14, color: T.tx3 }}>/mo</span></div>
              </div>
              <div style={{ fontSize: 22, color: T.tx3 }}>→</div>
              <div style={{ flex: 1, textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: T.accentDk, letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: 700 }}>Implied</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: T.accentDk, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{impliedLeasesPerMo.toFixed(1)}<span style={{ fontSize: 14 }}>/mo</span></div>
              </div>
            </div>
            {Math.abs(leasesPerMo - impliedLeasesPerMo) >= 1 && (
              <div style={{ padding: 10, background: leasesPerMo > impliedLeasesPerMo ? T.avoidBg : T.buyBg, borderLeft: `3px solid ${leasesPerMo > impliedLeasesPerMo ? T.chartNeg : T.buyTx}`, borderRadius: T.radius, fontSize: 11, color: T.tx, lineHeight: 1.4, marginBottom: 8 }}>
                {leasesPerMo > impliedLeasesPerMo
                  ? <>Your assumption is <b>{(leasesPerMo - impliedLeasesPerMo).toFixed(1)}/mo higher</b> than data supports. Stabilization may run longer than modeled.</>
                  : <>Your assumption is <b>{(impliedLeasesPerMo - leasesPerMo).toFixed(1)}/mo below</b> data-implied. Projection may be conservative.</>}
              </div>
            )}
            <button onClick={() => setLeasesPerMo(Math.round(impliedLeasesPerMo))} style={{
              width: '100%', padding: '7px 12px', fontSize: 11, fontWeight: 700,
              background: T.accent, color: T.bgDark, border: `1px solid ${T.accent}`,
              borderRadius: T.radius, cursor: 'pointer', fontFamily: T.fontFamily,
            }}>Use implied velocity ({impliedLeasesPerMo.toFixed(1)}/mo)</button>
          </div>
        </Card>
      </Grid>

      {/* AGGREGATE OCCUPANCY — Historical + Projected */}
      <Card padding={0} style={{ marginBottom: 16 }}>
        <div style={{ padding: '12px 20px', background: T.bgDark, color: T.txLt }}>
          <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent }}>
            Aggregate Occupancy — Historical + Projected
          </div>
          <div style={{ fontSize: 11, color: T.txLt, marginTop: 2, opacity: 0.85 }}>
            Unit-weighted across {filteredPipeline.length} combined LU + UC properties · at {leasesPerMo}/mo with {(preLeasedUC*100).toFixed(0)}% UC pre-leased · historical uses true cohort-entry weighting (props enter denominator at first non-zero occ, not at data-source padding)
          </div>
        </div>
        <div style={{ padding: 20 }}>
          <ChartBox h={320}>
            <LineChart data={aggOccData} margin={{ top: 20, right: 40, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid} vertical={false} />
              <XAxis dataKey="q" {...axisProps} interval={2} />
              <YAxis {...axisProps} tickFormatter={v => `${(v*100).toFixed(0)}%`} domain={[yMin, 1]} />
              <ReTooltip content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload;
                if (!row) return null;
                const isToday = row.q === '26Q2TD';
                const m = row.q.match(/^(\d{2})Q(\d)$/);
                const isPast = m && (parseInt(m[1]) < 26 || (parseInt(m[1]) === 26 && parseInt(m[2]) < 2));
                const isFuture = !isPast && !isToday;
                return (
                  <div style={{
                    background: T.bg2, border: `1px solid ${T.bdStrong}`, borderRadius: T.radius,
                    padding: '10px 14px', boxShadow: T.shadowHv, fontSize: 11, fontFamily: T.fontFamily,
                    minWidth: 240,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, paddingBottom: 6, borderBottom: `1px solid ${T.bd2}` }}>
                      <div style={{ fontWeight: 700, color: T.tx, fontSize: 13 }}>{row.q}</div>
                      <div style={{ fontSize: 9, color: T.tx3, fontStyle: 'italic', letterSpacing: 0.3, textTransform: 'uppercase', fontWeight: 600 }}>
                        {isToday ? 'Today' : isPast ? 'Historical' : 'Projected'}
                      </div>
                    </div>
                    {row.occ != null ? (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ color: T.tx2 }}>Weighted Occupancy</span>
                          <span style={{ color: T.accentDk, fontWeight: 700, fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>{(row.occ*100).toFixed(1)}%</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 10px', marginTop: 6, paddingTop: 6, borderTop: `1px solid ${T.bd2}` }}>
                          <span style={{ color: T.tx3, fontSize: 10 }}>In pool</span>
                          <span style={{ color: T.tx, fontVariantNumeric: 'tabular-nums', textAlign: 'right', fontWeight: 600 }}>{row.totalProps} props · {fmtN(row.totalUnits)}u</span>

                          <span style={{ color: T.tx3, fontSize: 10 }}>Active lease-up</span>
                          <span style={{ color: T.tx, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{row.luProps} · {fmtN(row.luUnits)}u</span>

                          <span style={{ color: T.tx3, fontSize: 10 }}>UC delivered</span>
                          <span style={{ color: row.ucProps > 0 ? T.watchTx : T.tx3, fontVariantNumeric: 'tabular-nums', textAlign: 'right', fontWeight: row.ucProps > 0 ? 600 : 400 }}>
                            {row.ucProps} · {row.ucUnits > 0 ? fmtN(row.ucUnits) + 'u' : '—'}
                          </span>

                          <span style={{ color: T.tx3, fontSize: 10 }}>Leased</span>
                          <span style={{ color: T.tx, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{fmtN(row.leasedUnits)}u</span>

                          <span style={{ color: T.tx3, fontSize: 10 }}>Remaining</span>
                          <span style={{ color: T.watchTx, fontVariantNumeric: 'tabular-nums', textAlign: 'right', fontWeight: 600 }}>{fmtN(row.unitsRemaining)}u</span>
                        </div>
                      </>
                    ) : (
                      <div style={{ color: T.tx3, fontSize: 10, fontStyle: 'italic' }}>No props in pool yet</div>
                    )}
                  </div>
                );
              }} />
              <ReferenceArea x1="26Q2TD" x2={forwardQuarters[forwardQuarters.length - 1]} fill={T.bg3} fillOpacity={0.4} stroke="none" />
              <ReferenceLine x="26Q2TD" stroke={T.accentDk} strokeWidth={1.5}
                label={{ value: 'Today', position: 'insideTopRight', fill: T.accentDk, fontSize: 10, fontWeight: 700, offset: 6 }} />
              {/* Milestone horizontal lines — 75 / 85 / 95 */}
              <ReferenceLine y={0.75} stroke={T.buyTx} strokeDasharray="3 4" strokeWidth={1}
                label={{ value: '75% Cleared', position: 'left', fill: T.buyTx, fontSize: 9, fontWeight: 700 }} />
              <ReferenceLine y={0.85} stroke={T.accentDk} strokeDasharray="3 4" strokeWidth={1}
                label={{ value: '85% Cleared', position: 'left', fill: T.accentDk, fontSize: 9, fontWeight: 700 }} />
              <ReferenceLine y={stabThresh} stroke={T.chartPos} strokeDasharray="4 4" strokeWidth={1.25}
                label={{ value: `Stab ${(stabThresh*100).toFixed(0)}%`, position: 'left', fill: T.chartPos, fontSize: 9, fontWeight: 700 }} />
              {/* Milestone vertical lines — where the curve crosses each threshold */}
              {agg.milestones?.[0.75] && <ReferenceLine x={agg.milestones[0.75].quarter} stroke={T.buyTx} strokeDasharray="2 3" strokeWidth={1} />}
              {agg.milestones?.[0.85] && <ReferenceLine x={agg.milestones[0.85].quarter} stroke={T.accentDk} strokeDasharray="2 3" strokeWidth={1} />}
              {agg.milestones?.[stabThresh] && <ReferenceLine x={agg.milestones[stabThresh].quarter} stroke={T.chartPos} strokeDasharray="2 3" strokeWidth={1} />}
              <Line type="monotone" dataKey="occ" name="Aggregate Occupancy" stroke={T.chart1} strokeWidth={2.5} dot={{ fill: T.chart1, r: 2.5 }} connectNulls={false} isAnimationActive={false} />
            </LineChart>
          </ChartBox>
          {/* Milestone crossings summary below chart */}
          <div style={{ marginTop: 14, padding: 12, background: T.bg3, borderLeft: `3px solid ${T.accentDk}`, borderRadius: T.radius, fontSize: 11.5, color: T.tx, lineHeight: 1.5 }}>
            <b>Reading the curve:</b> Pool weighted occ crosses
            {agg.milestones?.[0.75] && <> <b style={{ color: T.buyTx }}>75% at {agg.milestones[0.75].quarter}</b> ({agg.milestones[0.75].months}mo)</>}
            {agg.milestones?.[0.85] && <> · <b style={{ color: T.accentDk }}>85% at {agg.milestones[0.85].quarter}</b> ({agg.milestones[0.85].months}mo)</>}
            {agg.milestones?.[stabThresh] && <> · <b style={{ color: T.chartPos }}>{(stabThresh*100).toFixed(0)}% at {agg.milestones[stabThresh].quarter}</b> ({agg.milestones[stabThresh].months}mo)</>}
            . The 75% milestone is the market-actionable clearing point (supply overhang meaningfully resolved). The 95% milestone reflects last-laggard clearance — see bottleneck table below.
          </div>
        </div>
      </Card>

      {/* STACKED: UNITS AVAILABLE TO LEASE */}
      <Card padding={0} style={{ marginBottom: 16 }}>
        <div style={{ padding: '12px 20px', background: T.bgDark, color: T.txLt }}>
          <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent }}>
            Units Available to Lease — Active Lease-Up + UC Pipeline
          </div>
          <div style={{ fontSize: 11, color: T.txLt, marginTop: 2, opacity: 0.85 }}>Blue bars shrink as active lease-ups absorb · amber bars grow as UC properties deliver · see the full pipeline work through to stabilization</div>
        </div>
        <div style={{ padding: 20 }}>
          <ChartBox h={300}>
            <BarChart data={stackedData} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid} vertical={false} />
              <XAxis dataKey="q" {...axisProps} interval={1} />
              <YAxis {...axisProps} tickFormatter={v => fmtN(v)} />
              <ReTooltip content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload;
                if (!row) return null;
                const lu = row.activeLU || 0, uc = row.ucPipe || 0;
                const total = lu + uc;
                return (
                  <div style={{
                    background: T.bg2, border: `1px solid ${T.bdStrong}`, borderRadius: T.radius,
                    padding: '10px 14px', boxShadow: T.shadowHv, fontSize: 11, fontFamily: T.fontFamily,
                    minWidth: 220,
                  }}>
                    <div style={{ fontWeight: 700, color: T.tx, fontSize: 13, marginBottom: 6, paddingBottom: 5, borderBottom: `1px solid ${T.bd2}` }}>{row.q}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '3px 10px' }}>
                      <span style={{ color: T.buyTx, fontSize: 10 }}>■ Active Lease-Up unleased</span>
                      <span style={{ color: T.tx, fontVariantNumeric: 'tabular-nums', fontWeight: 600, textAlign: 'right' }}>{fmtN(lu)}u</span>
                      <span style={{ color: T.watchTx, fontSize: 10 }}>■ UC Pipeline unleased</span>
                      <span style={{ color: T.tx, fontVariantNumeric: 'tabular-nums', fontWeight: 600, textAlign: 'right' }}>{fmtN(uc)}u</span>
                      <span style={{ color: T.tx2, fontSize: 10, borderTop: `1px solid ${T.bd2}`, paddingTop: 4, marginTop: 2 }}>Total overhang</span>
                      <span style={{ color: T.tx, fontVariantNumeric: 'tabular-nums', fontWeight: 700, textAlign: 'right', borderTop: `1px solid ${T.bd2}`, paddingTop: 4, marginTop: 2 }}>{fmtN(total)}u</span>
                      {row.occ != null && <>
                        <span style={{ color: T.tx3, fontSize: 10 }}>Pool wtd occ</span>
                        <span style={{ color: T.accentDk, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{(row.occ*100).toFixed(1)}%</span>
                      </>}
                    </div>
                  </div>
                );
              }} />
              <ReferenceLine x="26Q2TD" stroke={T.accentDk} strokeWidth={1.5}
                label={{ value: 'Today', position: 'insideTopRight', fill: T.accentDk, fontSize: 10, fontWeight: 700, offset: 6 }} />
              <ReBar dataKey="activeLU" stackId="a" fill={T.buyTx} name="Active Lease-Up" isAnimationActive={false} />
              <ReBar dataKey="ucPipe" stackId="a" fill={T.watchTx} name="UC Pipeline" isAnimationActive={false} />
            </BarChart>
          </ChartBox>
          <div style={{ marginTop: 12, display: 'flex', gap: 18, justifyContent: 'center', fontSize: 11, color: T.tx2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 14, height: 14, background: T.buyTx, borderRadius: 2 }} />
              Active Lease-Up — units currently available to lease
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 14, height: 14, background: T.watchTx, borderRadius: 2 }} />
              UC Pipeline — units joining on delivery at {(preLeasedUC*100).toFixed(0)}% pre-leased
            </div>
          </div>
          {(() => {
            const peakRow = stackedData.reduce((best, r) => r.totalAvail > (best?.totalAvail || 0) ? r : best, null);
            const lastRow = stackedData[stackedData.length - 1];
            const firstUC = stackedData.find(r => r.ucPipe > 0);
            return peakRow && lastRow ? (
              <div style={{ marginTop: 12, padding: 12, background: T.bg3, borderLeft: `3px solid ${T.accentDk}`, borderRadius: T.radius, fontSize: 11.5, color: T.tx, lineHeight: 1.5 }}>
                <b>Peak overhang:</b> {fmtN(peakRow.totalAvail)} units available at {peakRow.q}
                {firstUC && <> · <b>UC starts joining pipeline:</b> {firstUC.q}</>}
                {' '}· <b>Remaining at {lastRow.q}:</b> {fmtN(lastRow.totalAvail)} units
              </div>
            ) : null;
          })()}
        </div>
      </Card>

      {/* BOTTLENECK PROPERTIES — the 5 biggest drags on full-pool stab */}
      {agg.bottleneck && agg.bottleneck.length > 0 && (
        <Card padding={0} style={{ marginBottom: 16 }}>
          <div style={{ padding: '12px 20px', background: T.bgDark, color: T.txLt }}>
            <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent }}>
              Tail Risk — 5 Slowest-Stabilizing Properties
              <InfoTip text="These individual properties drive the 95% 'full stab' milestone. Each has a large unit count + low starting occupancy + late delivery quarter. Absent these outliers, the pool clears materially faster. Transparency matters — MDs can see exactly what's dragging the tail." />
            </div>
            <div style={{ fontSize: 11, color: T.txLt, marginTop: 2, opacity: 0.85 }}>
              Why full-pool stab ({agg.stabQuarter}) runs later than 85% clearing ({agg.milestones?.[0.85]?.quarter || '—'}) · dominated by these outliers
            </div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, fontFamily: T.fontFamily }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${T.bd}`, background: T.bg2 }}>
                <th style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Rank</th>
                <th style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Property</th>
                <th style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Submarket</th>
                <th style={{ padding: '9px 14px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Type</th>
                <th style={{ padding: '9px 14px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Units</th>
                <th style={{ padding: '9px 14px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Start Occ</th>
                <th style={{ padding: '9px 14px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Delivers</th>
                <th style={{ padding: '9px 14px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Mo To Stab</th>
                <th style={{ padding: '9px 14px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Stab Q</th>
              </tr>
            </thead>
            <tbody>
              {agg.bottleneck.map((p, i) => (
                <tr key={i}
                  onClick={() => navigateTo && navigateTo('prop', p.n)}
                  title="Open property card"
                  onMouseEnter={e => { e.currentTarget.style.background = T.accent; }}
                  onMouseLeave={e => { e.currentTarget.style.background = i % 2 === 0 ? T.bg2 : T.bg3; }}
                  style={{ borderBottom: `1px solid ${T.bd2}`, background: i % 2 === 0 ? T.bg2 : T.bg3, cursor: 'pointer', transition: 'background 0.12s' }}>
                  <td style={{ padding: '10px 14px', color: T.watchTx, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>#{i + 1}</td>
                  <td style={{ padding: '10px 14px', color: T.tx, fontWeight: 600 }}>{p.n}</td>
                  <td style={{ padding: '10px 14px', color: T.tx2 }}>{p.sb}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                    <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 8px', background: p.isLU ? T.accent : T.watchTx, color: p.isLU ? T.accentDk : T.txLt, borderRadius: 2, letterSpacing: 0.3 }}>
                      {p.isLU ? 'LU' : 'UC'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', color: T.tx, fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{fmtN(p.u)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', color: T.tx2, fontVariantNumeric: 'tabular-nums' }}>{(p.startOcc * 100).toFixed(1)}%</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', color: T.tx2, fontVariantNumeric: 'tabular-nums' }}>{p.isLU ? 'Today' : p.cq}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', color: T.tx, fontVariantNumeric: 'tabular-nums' }}>{p.monthsFromDelivery.toFixed(0)}mo</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', color: T.watchTx, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{p.stabQ}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: '10px 20px', borderTop: `1px solid ${T.bd2}`, background: T.bg3, fontSize: 10.5, color: T.tx2, fontStyle: 'italic', lineHeight: 1.5 }}>
            Individual property stab = delivery quarter + (95% − start occ) × units / velocity. Longer tails = larger properties, lower pre-leasing, later deliveries. A 416u UC at 15% pre-leased at 12/mo takes 27+ months to reach 95% from delivery alone.
          </div>
        </Card>
      )}

      {/* PROPERTY DETAIL PROJECTIONS TABLE */}
      <Card padding={0} style={{ marginBottom: 16 }}>
        <div style={{ padding: '12px 20px', background: T.bgDark, color: T.txLt, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent }}>
              Property Detail Projections
            </div>
            <div style={{ fontSize: 11, color: T.txLt, marginTop: 2, opacity: 0.85 }}>Per-property occupancy by quarter · historical (plain) + projected (shaded) · {visibleRows.length} of {detailRows.length} visible</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="text" value={tableSearch} onChange={e => setTableSearch(e.target.value)}
              placeholder="Search property or sub..."
              style={{ padding: '5px 10px', fontSize: 11, background: T.bg2, color: T.tx, border: `1px solid ${T.bd}`, borderRadius: T.radius, fontFamily: T.fontFamily, outline: 'none', width: 180 }} />
            <select value={tableStatus} onChange={e => setTableStatus(e.target.value)}
              style={{ padding: '5px 8px', fontSize: 11, background: T.bg2, color: T.tx, border: `1px solid ${T.bd}`, borderRadius: T.radius, fontFamily: T.fontFamily, outline: 'none' }}>
              <option value="All">All statuses</option>
              <option value="Lease-Up">Lease-Up only</option>
              <option value="UC">UC only</option>
            </select>
          </div>
        </div>
        <div style={{ overflowX: 'auto', maxHeight: 500, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5, fontFamily: T.fontFamily }}>
            <thead style={{ position: 'sticky', top: 0, background: T.bg2, zIndex: 2 }}>
              <tr style={{ borderBottom: `2px solid ${T.bd}` }}>
                {sortHeader('name', 'Property', 'Property name (lease-up or under construction)')}
                {sortHeader('status', 'Status', 'Lease-Up = delivered and leasing · UC = under construction, joins pipeline on delivery')}
                {sortHeader('sub', 'Submarket', 'CoStar submarket designation')}
                {sortHeader('units', 'Units', 'Total unit count')}
                {sortHeader('curOcc', 'Cur Occ', 'Current occupancy · UC properties show — until delivery')}
                {sortHeader('vel', 'Trail Vel', 'Trailing 6-month net leases per month · 0 = stalled or already near stable')}
                {sortHeader('stabQuarter', 'Stab Q', 'Implied stabilization quarter at current leases/mo assumption')}
                {sortHeader('stabMonths', 'Months', 'Months from today to projected stabilization')}
                {/* Quarterly occupancy columns — historical first, then projected */}
                {(() => {
                  const histQ = LEASEUP_PROPS[0]?.occ.map(o => o.q) || [];
                  const allQ = [...histQ, ...forwardQuarters.slice(1)];
                  const todayIdx = histQ.length - 1;
                  return allQ.map((q, i) => (
                    <th key={q} style={{
                      padding: '8px 6px', textAlign: 'right',
                      fontSize: 9, fontWeight: 700,
                      color: i <= todayIdx ? T.tx2 : T.accentDk,
                      background: i > todayIdx ? T.bg3 : 'transparent',
                      borderLeft: i === todayIdx + 1 ? `2px solid ${T.accentDk}` : 'none',
                      textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap',
                    }}>{q}</th>
                  ));
                })()}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r, i) => {
                const histQ = LEASEUP_PROPS[0]?.occ.map(o => o.q) || [];
                const allQ = [...histQ, ...forwardQuarters.slice(1)];
                const todayIdx = histQ.length - 1;
                const rowBg = i % 2 === 0 ? T.bg2 : T.bg3;
                return (
                  <tr key={i}
                    onClick={() => navigateTo && navigateTo('prop', r.name)}
                    title="Open property card"
                    onMouseEnter={e => { e.currentTarget.style.background = T.accent; }}
                    onMouseLeave={e => { e.currentTarget.style.background = rowBg; }}
                    style={{ borderBottom: `1px solid ${T.bd2}`, background: rowBg, cursor: 'pointer', transition: 'background 0.12s' }}>
                    <td style={{ padding: '6px 10px', color: T.tx, fontWeight: 600, position: 'sticky', left: 0, background: rowBg, zIndex: 1, whiteSpace: 'nowrap' }}>{r.name}</td>
                    <td style={{ padding: '6px 10px' }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3,
                        background: r.status === 'UC' ? T.watchTx : T.buyTx, color: T.txLt, letterSpacing: 0.3,
                      }}>{r.status}</span>
                    </td>
                    <td style={{ padding: '6px 10px', color: T.tx2, whiteSpace: 'nowrap' }}>{r.sub || '—'}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', color: T.tx, fontVariantNumeric: 'tabular-nums' }}>{fmtN(r.units)}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', color: T.tx, fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{r.curOcc != null ? `${(r.curOcc*100).toFixed(0)}%` : '—'}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', color: T.tx2, fontVariantNumeric: 'tabular-nums' }}>{r.vel != null ? r.vel.toFixed(1) : '—'}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', color: r.stabMonths != null && r.stabMonths <= 12 ? T.chartPos : T.watchTx, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{r.stabQuarter}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', color: T.tx2, fontVariantNumeric: 'tabular-nums' }}>{r.stabMonths != null ? r.stabMonths : '—'}</td>
                    {allQ.map((q, qi) => {
                      const v = r.occByQ[q];
                      const projected = qi > todayIdx;
                      return (
                        <td key={q} style={{
                          padding: '6px 6px', textAlign: 'right', fontSize: 10, fontVariantNumeric: 'tabular-nums',
                          color: v == null ? T.tx3 : (v >= stabThresh ? T.chartPos : T.tx),
                          background: projected ? (v != null ? `rgba(175, 203, 255, ${Math.min(0.3, v * 0.4)})` : T.bg3) : 'transparent',
                          borderLeft: qi === todayIdx + 1 ? `2px solid ${T.accentDk}` : 'none',
                          fontWeight: v != null && v >= stabThresh ? 700 : 400,
                        }}>{v != null ? `${(v*100).toFixed(0)}` : '—'}</td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* SUBMARKET VELOCITY RANKING */}
      <Card padding={0} style={{ marginBottom: 16 }}>
        <div style={{ padding: '12px 20px', background: T.bgDark, color: T.txLt }}>
          <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent }}>
            Submarket Velocity Ranking
          </div>
          <div style={{ fontSize: 11, color: T.txLt, marginTop: 2, opacity: 0.85 }}>{subRanking.length} submarkets with lease-up or UC activity · ranked by observed velocity · click row to jump</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, fontFamily: T.fontFamily }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${T.bd}`, background: T.bg2 }}>
                <th style={{ padding: '9px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Submarket <InfoTip text="Click row to open Sub Deep Dive tab" /></th>
                <th style={{ padding: '9px 12px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.5 }}># LU Props <InfoTip text="Number of active lease-up properties in submarket" /></th>
                <th style={{ padding: '9px 12px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.5 }}>UC Deals <InfoTip text="Number of under-construction deals delivering 26Q2–28Q2" /></th>
                <th style={{ padding: '9px 12px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Units LU <InfoTip text="Total units currently in lease-up" /></th>
                <th style={{ padding: '9px 12px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Units UC <InfoTip text="Total units under construction that will deliver" /></th>
                <th style={{ padding: '9px 12px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Deliv Occ <InfoTip text="Unit-weighted occupancy across LU (delivered today)" /></th>
                <th style={{ padding: '9px 12px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Observed <InfoTip text="Sub's actual mean leases-per-month from CoStar/RealPage data — backward-looking reference. * = thin sample (≤3 properties)." /></th>
                <th style={{ padding: '9px 12px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Assumption <InfoTip text="The velocity assumption used to compute Full Pool Stab. Comes from the Lease-Up tab slider — same value applied to every sub. Move the slider to stress-test." /></th>
                <th style={{ padding: '9px 12px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Full Pool Stab <InfoTip text="Quarter when combined LU+UC pool reaches the stab threshold AND all UC has delivered. Computed at the Lease-Up tab's velocity slider setting." /></th>
                <th style={{ padding: '9px 12px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Sub Scr <InfoTip text="Submarket composite score 0-100 · BUY ≥ 65 · WATCH 50-64 · AVOID < 50" /></th>
              </tr>
            </thead>
            <tbody>
              {subRanking.map((r, i) => {
                const ucForSub = UC_DEALS.filter(d => d.sb === r.sub);
                const ucUnits = ucForSub.reduce((a, d) => a + d.u, 0);
                const isUCOnly = r.n === 0;
                return (
                  <tr key={i}
                    onClick={() => setSelectedSubModal && setSelectedSubModal(r.sub)}
                    title="Open submarket deep dive"
                    onMouseEnter={e => { e.currentTarget.style.background = T.accent; }}
                    onMouseLeave={e => { e.currentTarget.style.background = i % 2 === 0 ? T.bg2 : T.bg3; }}
                    style={{ borderBottom: `1px solid ${T.bd2}`, background: i % 2 === 0 ? T.bg2 : T.bg3, cursor: 'pointer', transition: 'background 0.12s' }}>
                    <td style={{ padding: '8px 12px', color: T.tx, fontWeight: 600 }}>{r.sub}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: isUCOnly ? T.tx3 : T.tx, fontVariantNumeric: 'tabular-nums' }}>{isUCOnly ? '—' : r.n}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: ucForSub.length > 0 ? T.watchTx : T.tx3, fontVariantNumeric: 'tabular-nums', fontWeight: ucForSub.length > 0 ? 600 : 400 }}>{ucForSub.length || '—'}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: isUCOnly ? T.tx3 : T.tx2, fontVariantNumeric: 'tabular-nums' }}>{isUCOnly ? '—' : fmtN(r.units)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: ucUnits > 0 ? T.watchTx : T.tx3, fontVariantNumeric: 'tabular-nums', fontWeight: ucUnits > 0 ? 600 : 400 }}>{ucUnits > 0 ? fmtN(ucUnits) : '—'}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: isUCOnly ? T.tx3 : T.tx, fontVariantNumeric: 'tabular-nums', fontWeight: isUCOnly ? 400 : 700 }}>{isUCOnly ? '—' : `${(r.wtdOcc*100).toFixed(0)}%`}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: T.tx2, fontVariantNumeric: 'tabular-nums' }}>{isUCOnly ? '—' : `${r.meanVel.toFixed(1)}${r.thinSample ? '*' : ''}`}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: T.accentDk, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{leasesPerMo.toFixed(1)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: r.stabMonths && r.stabMonths <= 24 ? T.chartPos : T.watchTx, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{r.stabQuarter}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: r.subScore >= 65 ? T.buyTx : r.subScore >= 50 ? T.watchTx : T.chartNeg, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{r.subScore ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function CapitalMarketsTab({ navigateTo, setSelectedProp }) {
  return (
    <div>
      {/* Intro + hero metrics */}
      <Card padding={24} style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: T.tx2, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>
          Capital Markets — Austin Multifamily Transactions
        </div>
        <div style={{ fontSize: 19, lineHeight: 1.3, color: T.tx, fontWeight: 600, marginBottom: 18, letterSpacing: -0.2 }}>
          From peak ({SALES.peak.yrs}) to trough ({SALES.curr.yrs}): deal volume collapsed {fmtPct(Math.abs(SALES.decline.dealsPct))} and price-per-unit compressed {fmtPct(Math.abs(SALES.decline.ppuPct))}. Cap rates widened {Math.round(SALES.decline.capBps)} basis points.
        </div>
        <Grid cols={4} gap={20}>
          <Metric label="Total Transactions" value={fmtN(SALES.total)} subValue={`${fmtN(SALES.disclosed)} with disclosed prices`} info={DV.sales} />
          <Metric label="Date Range" value={`${SALES.dateRange[0]} to ${SALES.dateRange[1]}`} subValue="6+ years of trades" />
          <Metric label="Peak Era" value={`${SALES.peak.deals} deals`} subValue={`${SALES.peak.yrs} · ${fmt$(SALES.peak.vol * 1e6)} vol · ${fmtPct(SALES.peak.cap)} cap`} />
          <Metric label="Current Era" value={`${SALES.curr.deals} deals`} subValue={`${SALES.curr.yrs} · ${fmt$(SALES.curr.vol * 1e6)} vol · ${fmtPct(SALES.curr.cap)} cap`} />
        </Grid>
      </Card>

      {/* Latest trades — real recent transactions from PROPS sd+sp data */}
      {(() => {
        const recent = PROPS
          .filter(p => p.sd && p.sp && p.u > 0)
          .map(p => ({
            ...p,
            saleDate: new Date(p.sd),
            ppu: p.sp / p.u,
            saleY: parseInt(String(p.sd).slice(0, 4), 10),
          }))
          .filter(p => p.saleY >= 2024)
          .sort((a, b) => b.saleDate - a.saleDate);
        if (recent.length === 0) return null;
        const show = recent.slice(0, 15);
        const avgPpu = show.reduce((a, p) => a + p.ppu, 0) / show.length;
        const totalVol = show.reduce((a, p) => a + p.sp, 0);
        return (
          <Card padding={0} style={{ marginBottom: 20 }}>
            <div style={{ padding: '14px 20px', background: T.bgDark, color: T.txLt, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: T.accent }}>
                  Latest {show.length} Trades — 2024 Onward
                </div>
                <div style={{ fontSize: 11, color: T.txLt, marginTop: 2, opacity: 0.85 }}>
                  Who's buying right now · sourced from CoStar property-level sale records · excludes pre-2024 noise
                </div>
              </div>
              <div style={{ display: 'flex', gap: 20, textAlign: 'right' }}>
                <div>
                  <div style={{ fontSize: 9, color: T.accent, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: 700 }}>Total Vol</div>
                  <div style={{ fontSize: 16, color: T.txLt, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt$(totalVol)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: T.accent, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: 700 }}>Avg $/u</div>
                  <div style={{ fontSize: 16, color: T.txLt, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>${Math.round(avgPpu/1000)}K</div>
                </div>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: T.fontFamily }}>
                <thead>
                  <tr style={{ background: T.bg2, borderBottom: `2px solid ${T.bd}` }}>
                    {['Date', 'Property', 'Submarket', 'Units', 'Built', 'Class', 'Price', '$/Unit', 'Buyer'].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Property' || h === 'Submarket' || h === 'Buyer' ? 'left' : 'right', fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {show.map((p, i) => {
                    const inUniverse = PROPS.some(pp => pp.n === p.n);
                    const baseBg = i % 2 === 0 ? T.bg2 : T.bg3;
                    return (
                    <tr key={i}
                        onClick={inUniverse ? () => navigateTo && navigateTo('prop', p.n) : undefined}
                        title={inUniverse ? 'Open property card' : 'Property not in current screening universe'}
                        onMouseEnter={inUniverse ? e => { e.currentTarget.style.background = T.accent; } : undefined}
                        onMouseLeave={inUniverse ? e => { e.currentTarget.style.background = baseBg; } : undefined}
                        style={{ borderBottom: `1px solid ${T.bd2}`, background: baseBg, cursor: inUniverse ? 'pointer' : 'default', transition: 'background 0.12s' }}>
                      <td style={{ padding: '9px 12px', color: T.tx, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{String(p.sd).slice(0, 10)}</td>
                      <td style={{ padding: '9px 12px', color: T.tx, fontWeight: 600 }}>
                        {inUniverse && <ChevronRight size={9} style={{ display: 'inline', color: T.accentDk, marginRight: 4, verticalAlign: 'middle' }} />}
                        {p.n}
                      </td>
                      <td style={{ padding: '9px 12px', color: T.tx2 }}>{p.sb || '—'}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: T.tx, fontVariantNumeric: 'tabular-nums' }}>{fmtN(p.u)}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: T.tx2, fontVariantNumeric: 'tabular-nums' }}>{p.yb || '—'}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: T.tx2, fontWeight: 600 }}>{p.cl || '—'}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: T.tx, fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{fmt$(p.sp)}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: T.accentDk, fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>${Math.round(p.ppu/1000)}K</td>
                      <td style={{ padding: '9px 12px', color: T.tx2, fontSize: 11, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.o || '—'}</td>
                    </tr>
                  );})}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '12px 20px', background: T.bg3, borderTop: `1px solid ${T.bd2}`, fontSize: 11, color: T.tx2, lineHeight: 1.5 }}>
              <b>Read:</b> {show.length > 0 ? `Most recent: ${show[0].n} (${String(show[0].sd).slice(0, 10)}, $${Math.round(show[0].ppu/1000)}K/u to ${show[0].o}).` : ''} Active buyers include {[...new Set(show.slice(0, 8).map(p => p.o).filter(Boolean))].slice(0, 4).join(', ')}. Compare the avg ${Math.round(avgPpu/1000)}K/u to peak ({fmt$u(SALES.peak.ppu)}) — post-correction basis is holding {Math.round((1 - avgPpu / SALES.peak.ppu) * 100)}% below peak.
            </div>
          </Card>
        );
      })()}

      {/* Peak vs current side-by-side comparison */}
      <Card title="Peak vs. Current Trading Environment" subtitle={`Change from ${SALES.peak.yrs} peak to ${SALES.curr.yrs} current`} padding={20} style={{ marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
          {[
            { label: 'Deal Count', peak: SALES.peak.deals, curr: SALES.curr.deals, delta: SALES.decline.dealsPct, fmt: v => fmtN(v), inverted: false },
            { label: 'Total Volume', peak: SALES.peak.vol, curr: SALES.curr.vol, delta: SALES.decline.volPct, fmt: v => fmt$(v * 1e6), inverted: false },
            { label: 'Price per Unit', peak: SALES.peak.ppu, curr: SALES.curr.ppu, delta: SALES.decline.ppuPct, fmt: v => fmt$u(v), inverted: false },
            { label: 'Cap Rate', peak: SALES.peak.cap, curr: SALES.curr.cap, delta: SALES.decline.capBps, fmt: v => `${v.toFixed(2)}%`, inverted: true, isBps: true },
          ].map(m => {
            const deltaColor = m.inverted ? (m.delta > 0 ? T.chartPos : T.chartNeg) : (m.delta < 0 ? T.chartNeg : T.chartPos);
            const deltaLabel = m.isBps ? `${m.delta > 0 ? '+' : ''}${Math.round(m.delta)} bps` : fmtPctD(m.delta);
            return (
              <div key={m.label} style={{ padding: 16, background: T.bg3, border: `1px solid ${T.bd2}`, borderRadius: T.radius }}>
                <div style={{ fontSize: 10, color: T.tx2, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>{m.label}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div>
                    <div style={{ fontSize: 10, color: T.tx3 }}>Peak</div>
                    <div style={{ fontSize: 15, color: T.tx2, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{m.fmt(m.peak)}</div>
                  </div>
                  <div style={{ fontSize: 12, color: T.tx3 }}>→</div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: T.tx3 }}>Current</div>
                    <div style={{ fontSize: 18, color: T.tx, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{m.fmt(m.curr)}</div>
                  </div>
                </div>
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.bd2}`, fontSize: 12, color: deltaColor, fontWeight: 700, textAlign: 'center' }}>
                  {deltaLabel}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Annual trends chart */}
      <Card title="Annual Transaction Activity" subtitle="Deal count, total volume, and price per unit by year" padding={20} style={{ marginBottom: 20 }} titleInfo={DV.sales}>
        <ChartBox h={300}>
          <ComposedChart data={SALES.byYear} margin={{ top: 20, right: 50, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid} vertical={false} />
            <XAxis dataKey="y" {...axisProps} />
            <YAxis yAxisId="deals" {...axisProps} tickFormatter={v => v} />
            <YAxis yAxisId="ppu" orientation="right" {...axisProps} tickFormatter={v => `$${Math.round(v/1000)}K`} />
            <ReTooltip content={<AtlasTooltip
              valueFmt={(v, n) => n === 'Deals' ? fmtN(v) : n === 'Price/Unit' ? fmt$u(v) : fmt$(v * 1e6)}
            />} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="square" iconSize={10} />
            <ReBar yAxisId="deals" dataKey="deals" name="Deals" fill={T.chart1} radius={[2,2,0,0]} />
            <Line yAxisId="ppu" type="monotone" dataKey="ppu" name="Price/Unit" stroke={T.chartNeg} strokeWidth={2} dot={{ fill: T.chartNeg, r: 4 }} />
          </ComposedChart>
        </ChartBox>
      </Card>

      {/* Buyer / Seller / Origin composition */}
      <Grid cols={3} gap={16} style={{ marginBottom: 20 }}>
        <Card title="Buyer Type" subtitle="Who's purchasing Austin multifamily" padding={20}>
          {SALES.buyerType.map((b, i) => {
            const pct = (b.n / SALES.total * 100);
            return (
              <div key={b.t} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, fontSize: 12 }}>
                  <span style={{ color: T.tx, fontWeight: 600 }}>{b.t}</span>
                  <span style={{ color: T.tx2, fontVariantNumeric: 'tabular-nums' }}>{b.n} · {fmt$(b.vol * 1e6)}</span>
                </div>
                <div style={{ background: T.bd2, height: 6, borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ background: T.chart1, height: '100%', width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </Card>

        <Card title="Buyer Origin" subtitle="National capital dominant" padding={20}>
          {SALES.buyerOrigin.map((b, i) => {
            const pct = b.pct;
            const color = b.o === 'National' ? T.chart1 : b.o === 'Local' ? T.accentDk : b.o === 'Foreign' ? T.accent2 : T.tx3;
            return (
              <div key={b.o} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, fontSize: 12 }}>
                  <span style={{ color: T.tx, fontWeight: 600 }}>{b.o}</span>
                  <span style={{ color: T.tx2, fontVariantNumeric: 'tabular-nums' }}>{b.n} · {fmtPct(b.pct)}</span>
                </div>
                <div style={{ background: T.bd2, height: 6, borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ background: color, height: '100%', width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </Card>

        <Card title="Seller Type" subtitle="Who's exiting Austin multifamily" padding={20}>
          {SALES.sellerType.map((s, i) => {
            const pct = (s.n / SALES.total * 100);
            return (
              <div key={s.t} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, fontSize: 12 }}>
                  <span style={{ color: T.tx, fontWeight: 600 }}>{s.t}</span>
                  <span style={{ color: T.tx2, fontVariantNumeric: 'tabular-nums' }}>{s.n} · {fmt$(s.vol * 1e6)}</span>
                </div>
                <div style={{ background: T.bd2, height: 6, borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ background: T.chart4, height: '100%', width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </Card>
      </Grid>

      {/* Top buyers + sellers + sub breakdown */}
      <Grid cols={3} gap={16} style={{ marginBottom: 20 }}>
        <Card title="Most Active Buyers" subtitle="By deal count 2020-2026" padding={0}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, fontFamily: T.fontFamily }}>
            <thead>
              <tr style={{ background: T.bgDark }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 9.5, fontWeight: 700, color: T.txLt, textTransform: 'uppercase', letterSpacing: 0.6 }}>Buyer</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 9.5, fontWeight: 700, color: T.txLt, textTransform: 'uppercase', letterSpacing: 0.6 }}>Deals</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 9.5, fontWeight: 700, color: T.txLt, textTransform: 'uppercase', letterSpacing: 0.6 }}>Volume</th>
              </tr>
            </thead>
            <tbody>
              {SALES.topBuyers.slice(0, 10).map((b, i) => (
                <tr key={b.c} style={{ borderBottom: `1px solid ${T.bd2}`, background: i % 2 === 0 ? T.bg2 : T.bg3 }}>
                  <td style={{ padding: '8px 12px', color: T.tx, fontWeight: 500, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.c}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.tx, fontWeight: 600 }}>{b.n}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.tx }}>{b.vol > 0 ? fmt$(b.vol * 1e6) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Most Active Sellers" subtitle="By deal count 2020-2026" padding={0}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, fontFamily: T.fontFamily }}>
            <thead>
              <tr style={{ background: T.bgDark }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 9.5, fontWeight: 700, color: T.txLt, textTransform: 'uppercase', letterSpacing: 0.6 }}>Seller</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 9.5, fontWeight: 700, color: T.txLt, textTransform: 'uppercase', letterSpacing: 0.6 }}>Deals</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 9.5, fontWeight: 700, color: T.txLt, textTransform: 'uppercase', letterSpacing: 0.6 }}>Volume</th>
              </tr>
            </thead>
            <tbody>
              {SALES.topSellers.slice(0, 10).map((s, i) => (
                <tr key={s.c} style={{ borderBottom: `1px solid ${T.bd2}`, background: i % 2 === 0 ? T.bg2 : T.bg3 }}>
                  <td style={{ padding: '8px 12px', color: T.tx, fontWeight: 500, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.c}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.tx, fontWeight: 600 }}>{s.n}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.tx }}>{s.vol > 0 ? fmt$(s.vol * 1e6) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Transactions by Submarket" subtitle="Where deal activity concentrates" padding={0}>
          <div style={{ maxHeight: 450, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, fontFamily: T.fontFamily }}>
              <thead>
                <tr style={{ background: T.bgDark, position: 'sticky', top: 0 }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 9.5, fontWeight: 700, color: T.txLt, textTransform: 'uppercase', letterSpacing: 0.6 }}>Submarket</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 9.5, fontWeight: 700, color: T.txLt, textTransform: 'uppercase', letterSpacing: 0.6 }}>Deals</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 9.5, fontWeight: 700, color: T.txLt, textTransform: 'uppercase', letterSpacing: 0.6 }}>Volume</th>
                </tr>
              </thead>
              <tbody>
                {SALES.bySub.map((s, i) => (
                  <tr key={s.s} style={{ borderBottom: `1px solid ${T.bd2}`, background: i % 2 === 0 ? T.bg2 : T.bg3 }}>
                    <td style={{ padding: '8px 12px', color: T.tx, fontWeight: 500 }}>{s.s}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.tx, fontWeight: 600 }}>{s.n}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.tx }}>{s.vol > 0 ? fmt$(s.vol * 1e6) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Grid>

      {/* Hold period + vintage breakdowns */}
      <Grid cols={2} gap={16}>
        <Card title="Hold Period at Sale" subtitle={`Distribution of ownership duration for ${SALES.total} transactions`} padding={20}>
          {SALES.hold.map((h, i) => {
            const pct = (h.n / SALES.total * 100);
            return (
              <div key={h.b} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, fontSize: 12 }}>
                  <span style={{ color: T.tx, fontWeight: 600 }}>{h.b}</span>
                  <span style={{ color: T.tx2, fontVariantNumeric: 'tabular-nums' }}>{h.n} deals · {pct.toFixed(1)}%</span>
                </div>
                <div style={{ background: T.bd2, height: 6, borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ background: T.chart1, height: '100%', width: `${pct * 3}%`, maxWidth: '100%' }} />
                </div>
              </div>
            );
          })}
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.bd2}`, fontSize: 11, color: T.tx2, lineHeight: 1.45 }}>
            The &lt;1yr + 1-2yr bands (182 deals, 39% of transactions) reflect short-hold flips, often by value-add sponsors selling into the 2021-22 price peak. Longer holds indicate institutional patient capital.
          </div>
        </Card>

        <Card title="Transactions by Vintage" subtitle="Age of properties trading" padding={20}>
          {SALES.vintage.map((v, i) => {
            const pct = (v.n / SALES.total * 100);
            const color = v.b === 'pre-2000' ? T.chart3 : v.b === '2000-2009' ? T.chart2 : v.b === '2010-2019' ? T.chart1 : T.accentDk;
            return (
              <div key={v.b} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, fontSize: 12 }}>
                  <span style={{ color: T.tx, fontWeight: 600 }}>{v.b}</span>
                  <span style={{ color: T.tx2, fontVariantNumeric: 'tabular-nums' }}>{v.n} deals · {pct.toFixed(1)}%</span>
                </div>
                <div style={{ background: T.bd2, height: 6, borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ background: color, height: '100%', width: `${pct * 3}%`, maxWidth: '100%' }} />
                </div>
              </div>
            );
          })}
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.bd2}`, fontSize: 11, color: T.tx2, lineHeight: 1.45 }}>
            Atlas buy-box focuses on 2000+ vintage (318 of 467 Austin trades, 68%). Pre-2000 stock trades thinly and carries higher capital expenditure risk.
          </div>
        </Card>
      </Grid>
    </div>
  );
}

function TabStub({ tabId, label }) {
  return (
    <Card padding={48} style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: T.tx3, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600 }}>
        Coming in next iteration
      </div>
      <div style={{ fontSize: 22, fontWeight: 600, color: T.tx, marginTop: 8 }}>{label}</div>
      <div style={{ fontSize: 13, color: T.tx2, marginTop: 6 }}>Tab ID: {tabId}</div>
    </Card>
  );
}

const PropertyCardModal = ({ selectedProp: selectedPropRaw, setSelectedProp, setSelectedSubModal, navigateTo, layerW, opMode, zipFactorW, propFactorW, subFactorW, leasesPerMo, preLeasedUC, stabThresh }) => {
  const selectedProp = useMemo(() => {
    if (!selectedPropRaw) return null;
    const sp = buildScoredProps(
      layerW || [25, 40, 35],
      opMode,
      zipFactorW || DEFAULT_ZIP_W,
      propFactorW || DEFAULT_PROP_W,
      subFactorW || DEFAULT_SUB_W,
    );
    return sp.find(p => p.n === selectedPropRaw.n) || selectedPropRaw;
  }, [selectedPropRaw, layerW, opMode, zipFactorW, propFactorW, subFactorW]);

  useEffect(() => {
    if (!selectedProp) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setSelectedProp(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedProp, setSelectedProp]);

  if (!selectedProp) return null;
  const subData = SUBS.find(s => s.s === selectedProp.sb);
  const scoredSubData = subData ? { ...subData, cs: scoreSub(subData, subFactorW || DEFAULT_SUB_W) } : null;
  const zipData = ZIPS.find(z => z.z === selectedProp.z);
  const zipMS = zipData ? (MS[selectedProp.z] || {}) : {};
  const propBullets = generatePropBullets({ prop: selectedProp, subData: scoredSubData });
  return (
    <div onClick={() => setSelectedProp(null)} style={{
      position: 'fixed', inset: 0, background: 'rgba(9, 14, 65, 0.55)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 24, fontFamily: T.fontFamily,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: T.bg2, maxWidth: 1000, width: '100%',
        maxHeight: '92vh', overflow: 'auto',
        borderRadius: T.radius, boxShadow: '0 20px 60px rgba(9, 14, 65, 0.4)',
      }}>
        {/* Modal header — sticky */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 2,
          padding: '18px 24px', background: T.bgDark, color: T.txLt,
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          borderRadius: `${T.radius}px ${T.radius}px 0 0`,
        }}>
          <div style={{ flex: 1, minWidth: 0, paddingRight: 16 }}>
            <div style={{ fontSize: 10, color: T.accent, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 700 }}>Property Detail</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: T.txLt, marginTop: 4, lineHeight: 1.2, wordBreak: 'break-word' }}>
              {selectedProp.n}
            </div>
            <div style={{ fontSize: 12, color: T.txLt, marginTop: 4, opacity: 0.85 }}>
              {selectedProp.sb} · {selectedProp.m || '—'} · Zip {selectedProp.z} · {selectedProp.co} County
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            {selectedProp.sweet && <SweetBadge />}
            <Pill signal={selectedProp.sg} />
            <button onClick={() => setSelectedProp(null)} style={{
              background: T.accent, border: 'none', borderRadius: T.radius,
              padding: '6px 14px', fontSize: 11, color: T.bgDark, cursor: 'pointer',
              fontFamily: T.fontFamily, fontWeight: 700,
            }}>Close ×</button>
          </div>
        </div>

        {}
        {(setSelectedSubModal || navigateTo) && (
          <div style={{
            padding: '10px 24px', background: T.bg3, borderBottom: `1px solid ${T.bd2}`,
            display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 9.5, fontWeight: 700, color: T.tx2, letterSpacing: 0.8, textTransform: 'uppercase', marginRight: 4 }}>
              Drill to Context
            </span>
            {setSelectedSubModal && selectedProp.sb && (
              <button
                onClick={() => { setSelectedProp(null); setSelectedSubModal(selectedProp.sb); }}
                onMouseEnter={e => { e.currentTarget.style.background = T.accentDk; e.currentTarget.style.color = T.txLt; }}
                onMouseLeave={e => { e.currentTarget.style.background = T.bg2; e.currentTarget.style.color = T.accentDk; }}
                style={{
                  padding: '6px 12px', fontSize: 11.5, fontWeight: 700,
                  background: T.bg2, color: T.accentDk, border: `1px solid ${T.accentDk}`,
                  borderRadius: T.radius, cursor: 'pointer', fontFamily: T.fontFamily,
                  display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.12s',
                }}
                title={`Open the ${selectedProp.sb} submarket deep-dive modal`}
              >
                <Building2 size={12} /> View {selectedProp.sb} deep dive <ChevronRight size={12} />
              </button>
            )}
            {navigateTo && selectedProp.z && (
              <button
                onClick={() => { setSelectedProp(null); navigateTo('zip', selectedProp.z); }}
                onMouseEnter={e => { e.currentTarget.style.background = T.accentDk; e.currentTarget.style.color = T.txLt; }}
                onMouseLeave={e => { e.currentTarget.style.background = T.bg2; e.currentTarget.style.color = T.accentDk; }}
                style={{
                  padding: '6px 12px', fontSize: 11.5, fontWeight: 700,
                  background: T.bg2, color: T.accentDk, border: `1px solid ${T.accentDk}`,
                  borderRadius: T.radius, cursor: 'pointer', fontFamily: T.fontFamily,
                  display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.12s',
                }}
                title={`Jump to the Zip Analysis tab with ${selectedProp.z} pre-selected`}
              >
                <MapPin size={12} /> View Zip {selectedProp.z} <ChevronRight size={12} />
              </button>
            )}
          </div>
        )}

        {}
        {propBullets.length > 0 && (
          <div style={{ padding: '14px 24px', borderBottom: `1px solid ${T.bd2}` }}>
            <QuickRead
              bullets={propBullets}
              subtitle="Auto-generated from property + submarket data · re-renders when sliders move"
            />
          </div>
        )}

        {/* Section 1: Composite scoring breakdown */}
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${T.bd2}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
            Scoring Breakdown
          </div>
          <Grid cols={4} gap={12}>
            <div style={{ padding: 14, background: T.bgDark, color: T.txLt, borderRadius: T.radius, textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: T.accent, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: 700 }}>Composite</div>
              <div style={{ fontSize: 32, fontWeight: 700, color: T.accent, lineHeight: 1, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{selectedProp.cs}</div>
              <div style={{ fontSize: 10, color: T.txLt, marginTop: 4, opacity: 0.8 }}>Weighted composite 0-100</div>
            </div>
            <Metric label="Submarket Score" value={Math.round(selectedProp.ss)} subValue={`Weight ${layerW[0]}%`} size="sm" />
            <Metric label="Zip Score" value={Math.round(selectedProp.zs)} subValue={`Weight ${layerW[1]}%`} size="sm" />
            <Metric label="Property Quality" value={Math.round(selectedProp.pq)} subValue={`Weight ${layerW[2]}%${opMode ? ' · opMode blend' : ''}`} size="sm" />
            <Metric label="Distress Score" value={selectedProp.ds != null ? selectedProp.ds.toFixed(1) : '—'} subValue="0-10 scale" size="sm" />
            <Metric label="Data Completeness" value={`${selectedProp.dataPct}%`} subValue="10 core fields" size="sm" />
            <Metric label="Rent Gap vs Sub" value={selectedProp.rentGap != null ? `${selectedProp.rentGap > 0 ? '+' : ''}${selectedProp.rentGap.toFixed(1)}%` : '—'} subValue="vs submarket avg" size="sm" />
            <Metric label="Signal" value={selectedProp.sg} subValue={selectedProp.sg === 'BUY' ? 'cs ≥ 65' : selectedProp.sg === 'WATCH' ? '50 ≤ cs < 65' : 'cs < 50'} size="sm" />
          </Grid>
        </div>

        {/* Section 1b: Distress breakdown — show per-input contributions */}
        {(() => {
          const bd = distressBreakdown(selectedProp);
          const applicable = bd.inputs.filter(i => i.applicable);
          const dsScore = bd.total;
          const sevColor = dsScore >= 6 ? T.chartNeg : dsScore >= 3 ? T.watchTx : T.tx2;
          return (
            <div style={{ padding: '20px 24px', borderBottom: `1px solid ${T.bd2}`, background: dsScore >= 3 ? T.avoidBg : T.bg2 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                    Distress Signal Breakdown
                  </div>
                  <div style={{ fontSize: 11, color: T.tx2, marginTop: 2 }}>
                    Contributing signals behind this property's distress score · <InfoTip text={METHODOLOGY.distress} />
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 26, fontWeight: 700, color: sevColor, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                    {dsScore.toFixed(1)}<span style={{ fontSize: 14, color: T.tx3, fontWeight: 500 }}>/10</span>
                  </div>
                  <div style={{ fontSize: 10, color: T.tx2, marginTop: 2 }}>
                    {bd.rawTotal} of {bd.maxTotal} raw points · {applicable.length} of {bd.inputs.length} signals firing
                  </div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {bd.inputs.map((sig, i) => (
                  <div key={i} style={{
                    padding: '8px 12px',
                    background: sig.applicable ? T.bg2 : 'transparent',
                    border: `1px solid ${sig.applicable ? T.avoidBd : T.bd2}`,
                    borderLeft: `3px solid ${sig.applicable ? T.chartNeg : T.bd2}`,
                    borderRadius: T.radius,
                    opacity: sig.applicable ? 1 : 0.6,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontSize: 11.5, color: T.tx, fontWeight: sig.applicable ? 700 : 500 }}>
                        {sig.applicable ? '✓' : '○'} {sig.label}
                      </span>
                      <span style={{ fontSize: 11.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: sig.applicable ? T.chartNeg : T.tx3 }}>
                        {sig.applicable ? '+' : ''}{sig.pts}{sig.applicable ? '' : `/${sig.max}`} pts
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: T.tx2, marginTop: 3, fontStyle: 'italic' }}>
                      {sig.explain}
                    </div>
                  </div>
                ))}
              </div>
              {dsScore >= 5 && (
                <div style={{ marginTop: 12, padding: 10, background: T.bg3, borderLeft: `3px solid ${T.chartNeg}`, borderRadius: T.radius, fontSize: 11, color: T.tx, lineHeight: 1.5 }}>
                  <b style={{ color: T.chartNeg }}>Sweet spot candidate.</b> Distress ≥ 5 paired with quality ≥ 55 flags this for Opportunistic Mode. Expect motivated-seller dynamics on broker outreach.
                </div>
              )}
              {dsScore === 0 && (
                <div style={{ marginTop: 12, padding: 10, background: T.bg3, borderLeft: `3px solid ${T.buyTx}`, borderRadius: T.radius, fontSize: 11, color: T.tx2, lineHeight: 1.5 }}>
                  No distress signals firing. This property is not a forced-seller candidate — acquisition thesis rests purely on fundamentals and location.
                </div>
              )}
            </div>
          );
        })()}

        {/* Section 2: Property operating metrics */}
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${T.bd2}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.tx2, letterSpacing: 0.8, textTransform: 'uppercase' }}>
              Property Operating Metrics
            </div>
            <div style={{ fontSize: 9.5, color: T.tx3, fontStyle: 'italic', letterSpacing: 0.3 }}>
              CoStar data · {DATA_VINTAGE.propertyData}
            </div>
          </div>
          <Grid cols={4} gap={12}>
            <Metric label="Units" value={fmtN(selectedProp.u)} subValue={selectedProp.sf ? `avg ${selectedProp.sf} SF` : ''} size="sm" />
            <Metric label="Vintage" value={selectedProp.yb || '—'} subValue={`Class ${selectedProp.cl || '—'}`} size="sm" />
            <Metric label="Effective Rent" value={fmtRent(selectedProp.er)} subValue={selectedProp.sf && selectedProp.er ? `$${(selectedProp.er/selectedProp.sf).toFixed(2)}/SF` : ''} size="sm" />
            <Metric label="Vacancy" value={selectedProp.v != null ? `${selectedProp.v.toFixed(1)}%` : '—'} size="sm" />
            <Metric label="Concessions" value={selectedProp.cn != null ? `${selectedProp.cn.toFixed(1)}%` : '—'} subValue="% of ask rent" size="sm" />
            <Metric label="Occupancy" value={selectedProp.o_occ != null ? `${selectedProp.o_occ.toFixed(1)}%` : selectedProp.v != null ? `${(100-selectedProp.v).toFixed(1)}%` : '—'} size="sm" />
            {selectedProp.erg != null && <Metric label="Rent Growth YoY" value={`${selectedProp.erg > 0 ? '+' : ''}${selectedProp.erg.toFixed(1)}%`} size="sm" />}
            {selectedProp.gs != null && <Metric label="Google Rating" value={selectedProp.gs.toFixed(1)} subValue="stars" size="sm" />}
          </Grid>
        </div>

        {/* Section 3: Ownership + loan */}
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${T.bd2}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
            Ownership, Sale History & Debt
          </div>
          <div style={{ fontSize: 12.5, color: T.tx, lineHeight: 1.7, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px 24px' }}>
            <div><b style={{ color: T.tx2 }}>Owner:</b> {selectedProp.o || '—'}</div>
            <div><b style={{ color: T.tx2 }}>Property Manager:</b> {selectedProp.pm || '—'}</div>
            {selectedProp.sd && <div><b style={{ color: T.tx2 }}>Last sale:</b> {String(selectedProp.sd).slice(0, 10)}{selectedProp.sp ? ` · ${fmt$(selectedProp.sp)} ($${Math.round(selectedProp.sp / selectedProp.u / 1000)}K/u)` : ''}</div>}
            {selectedProp.mt && <div><b style={{ color: T.tx2 }}>Loan maturity:</b> {selectedProp.mt}{selectedProp.it ? ` (${selectedProp.it})` : ''}</div>}
            {selectedProp.la > 0 && <div><b style={{ color: T.tx2 }}>Loan balance:</b> {fmt$(selectedProp.la)}</div>}
            {selectedProp.lr && <div><b style={{ color: T.tx2 }}>Loan rate:</b> {selectedProp.lr.toFixed(2)}%</div>}
          </div>
        </div>

        {/* Section 3b: Per-property price expectation */}
        {(() => {
          const est = expectedPpu(selectedProp);
          return (
            <div style={{ padding: '20px 24px', borderBottom: `1px solid ${T.bd2}`, background: T.bg3 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                    Price Expectation
                  </div>
                  <div style={{ fontSize: 11, color: T.tx2, marginTop: 2 }}>
                    Based on vintage cohort actuals (187 real Austin comps) × submarket type × class × distress
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: T.accentDk, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                    ${Math.round(est.low/1000)}K — ${Math.round(est.high/1000)}K<span style={{ fontSize: 13, color: T.tx3, fontWeight: 500 }}>/u</span>
                  </div>
                  <div style={{ fontSize: 10, color: T.tx2, marginTop: 2 }}>
                    mid ${Math.round(est.mid/1000)}K/u · total asset value {fmt$(est.totalValueLow)}–{fmt$(est.totalValueHigh)}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                {est.drivers.map((d, i) => (
                  <span key={i} style={{
                    padding: '4px 10px', fontSize: 10.5, fontWeight: 600,
                    background: T.bg2, color: T.tx, border: `1px solid ${T.bd2}`,
                    borderRadius: T.radius, letterSpacing: 0.2,
                  }}>{d}</span>
                ))}
              </div>
              {selectedProp.sp && selectedProp.u > 0 && (() => {
                const actualPpu = selectedProp.sp / selectedProp.u;
                const vsMid = ((actualPpu - est.mid) / est.mid) * 100;
                const vsHigh = ((actualPpu - est.high) / est.high) * 100;
                return (
                  <div style={{ marginTop: 8, padding: 10, background: T.bg2, borderLeft: `3px solid ${vsMid > 10 ? T.chartNeg : vsMid < -10 ? T.buyTx : T.accentDk}`, borderRadius: T.radius, fontSize: 11, color: T.tx, lineHeight: 1.5 }}>
                    Last sold at <b>${Math.round(actualPpu/1000)}K/u</b> in {String(selectedProp.sd).slice(0,4)} — {vsMid > 10 ? `paid ${vsMid.toFixed(0)}% over mid expectation (overvalued basis)` : vsMid < -10 ? `${Math.abs(vsMid).toFixed(0)}% under mid (favorable basis)` : `close to mid expectation (fair basis)`}.
                  </div>
                );
              })()}
            </div>
          );
        })()}

        {}
        {(() => {
          const rp = refiPressure(selectedProp);
          if (rp.signals.length === 0) return null;
          const sevColor = rp.score >= 7 ? T.chartNeg : rp.score >= 4 ? T.watchTx : T.tx2;
          return (
            <div style={{ padding: '20px 24px', borderBottom: `1px solid ${T.bd2}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                    Refi Pressure
                  </div>
                  <div style={{ fontSize: 11, color: T.tx2, marginTop: 2 }}>
                    Composite from maturity proximity · floating exposure · rate spread vs {PREVAILING_REFI_RATE}% prevailing · est. LTV · peak-basis purchase
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: sevColor, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                    {rp.score.toFixed(1)}<span style={{ fontSize: 12, color: T.tx3, fontWeight: 500 }}>/10</span>
                  </div>
                  <div style={{ fontSize: 10, color: T.tx2, marginTop: 2 }}>
                    {rp.score >= 7 ? 'Forced-seller candidate' : rp.score >= 4 ? 'Moderate pressure' : 'Low pressure'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {rp.signals.map((s, i) => (
                  <div key={i} style={{
                    padding: '6px 10px', background: T.bg3, border: `1px solid ${T.bd2}`,
                    borderLeft: `3px solid ${T.watchTx}`, borderRadius: T.radius,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontSize: 11, color: T.tx, fontWeight: 600 }}>{s.label}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: T.watchTx }}>+{s.pts}</span>
                    </div>
                    <div style={{ fontSize: 10, color: T.tx2, marginTop: 2, fontStyle: 'italic' }}>{s.explain}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Section 3d: Recent Comp Sales — same submarket, vintage ±10yr */}
        {(() => {
          if (!selectedProp.sb || !selectedProp.yb) return null;
          const comps = PROPS
            .filter(p => p.sd && p.sp && p.u > 0 && p.n !== selectedProp.n)
            .filter(p => p.sb === selectedProp.sb)
            .filter(p => p.yb && Math.abs(p.yb - selectedProp.yb) <= 10)
            .map(p => ({ ...p, saleDate: new Date(p.sd), ppu: p.sp / p.u }))
            .sort((a, b) => b.saleDate - a.saleDate)
            .slice(0, 5);
          if (comps.length === 0) {
            return (
              <div style={{ padding: '20px 24px', borderBottom: `1px solid ${T.bd2}`, background: T.bg2 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>
                  Recent Comp Sales
                </div>
                <div style={{ fontSize: 11.5, color: T.tx2, fontStyle: 'italic' }}>
                  No comparable sales found in {selectedProp.sb} within vintage band ({selectedProp.yb - 10}-{selectedProp.yb + 10}). Try widening the submarket search or looking at adjacent submarkets.
                </div>
              </div>
            );
          }
          const avgPpu = comps.reduce((a, p) => a + p.ppu, 0) / comps.length;
          const est = expectedPpu(selectedProp);
          return (
            <div style={{ padding: '20px 24px', borderBottom: `1px solid ${T.bd2}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                    Recent Comp Sales
                  </div>
                  <div style={{ fontSize: 11, color: T.tx2, marginTop: 2 }}>
                    {comps.length} most-recent trade{comps.length > 1 ? 's' : ''} in {selectedProp.sb} · vintage {selectedProp.yb - 10}–{selectedProp.yb + 10}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 9, color: T.tx3, letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: 700 }}>Avg $/u</div>
                  <div style={{ fontSize: 18, color: T.accentDk, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>${Math.round(avgPpu/1000)}K</div>
                  <div style={{ fontSize: 10, color: T.tx3, marginTop: 2 }}>
                    vs. expectation ${Math.round(est.mid/1000)}K ({avgPpu > est.mid ? '+' : ''}{Math.round(((avgPpu - est.mid) / est.mid) * 100)}%)
                  </div>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, fontFamily: T.fontFamily }}>
                  <thead>
                    <tr style={{ background: T.bg2, borderBottom: `1px solid ${T.bd2}` }}>
                      {['Date', 'Property', 'Units', 'Built', 'Price', '$/Unit', 'Buyer'].map(h => (
                        <th key={h} style={{ padding: '7px 10px', textAlign: h === 'Property' || h === 'Buyer' ? 'left' : 'right', fontSize: 9.5, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {comps.map((p, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${T.bd2}`, background: i % 2 === 0 ? T.bg3 : T.bg2 }}>
                        <td style={{ padding: '7px 10px', color: T.tx, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{String(p.sd).slice(0, 10)}</td>
                        <td style={{ padding: '7px 10px', color: T.tx, fontWeight: 600 }}>{p.n}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: T.tx2, fontVariantNumeric: 'tabular-nums' }}>{fmtN(p.u)}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: T.tx2, fontVariantNumeric: 'tabular-nums' }}>{p.yb}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: T.tx, fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{fmt$(p.sp)}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: T.accentDk, fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>${Math.round(p.ppu/1000)}K</td>
                        <td style={{ padding: '7px 10px', color: T.tx2, fontSize: 10.5, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.o || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {/* Section 3e: Combined LU + UC absorption context */}
        {(() => {
          const subLU = selectedProp.sb ? subLeaseUpSummary(selectedProp.sb, leasesPerMo, preLeasedUC, stabThresh) : null;
          const zipLU = selectedProp.z ? zipLeaseUpSummary(selectedProp.z, leasesPerMo, preLeasedUC, stabThresh) : null;
          const thisLU = LEASEUP_BY_MAIN[selectedProp.n];

          if (!subLU && !zipLU && !thisLU) return null;

          return (
            <div style={{ padding: '20px 24px', borderBottom: `1px solid ${T.bd2}`, background: T.bg3 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.accentDk, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  Lease-Up Context {thisLU ? <span style={{ color: T.buyTx, marginLeft: 8 }}>● THIS PROPERTY IS IN LEASE-UP</span> : ''}
                </div>
                <div style={{ fontSize: 9.5, color: T.tx3, fontStyle: 'italic', letterSpacing: 0.3 }}>
                  Pool stabs at {leasesPerMo}/mo · {(preLeasedUC*100).toFixed(0)}% UC pre-leased · 26Q2TD
                </div>
              </div>

              {thisLU && (
                <div style={{ padding: 12, background: T.buyBg, border: `1px solid ${T.buyBd}`, borderLeft: `3px solid ${T.buyTx}`, borderRadius: T.radius, marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: T.tx, lineHeight: 1.4 }}>
                    {(() => {
                      const v = (thisLU.vel || 0) > 0 ? thisLU.vel : MARKET_VEL_ASSUMPTION;
                      const assumed = !(thisLU.vel > 0);
                      const stab = calcStabilization(thisLU.curOcc, thisLU.u, v, stabThresh);
                      return (
                        <>
                          <b>Current occupancy {(thisLU.curOcc * 100).toFixed(1)}%</b> at {assumed ? <>assumed <b>{v}/mo</b> (no trailing velocity data yet)</> : <>trailing velocity <b>{thisLU.vel}/mo</b></>}.
                          At that pace, this property stabilizes <b>{stab?.quarter || '—'}</b>{stab?.months != null ? ` (${stab.months} months)` : ''}.
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ padding: 12, background: T.bg2, border: `1px solid ${T.bd2}`, borderLeft: `3px solid ${T.accentDk}`, borderRadius: T.radius }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
                    In {selectedProp.sb} Submarket
                    {subLU?.thinSample && <span style={{ marginLeft: 6, fontSize: 8, padding: '1px 5px', background: T.watchTx, color: T.txLt, borderRadius: 3, letterSpacing: 0.3, fontWeight: 700 }}>THIN</span>}
                  </div>
                  {subLU ? (
                    <div>
                      <div style={{ display: 'flex', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontSize: 9, color: T.tx3, letterSpacing: 0.3, textTransform: 'uppercase' }}>LU + UC</div>
                          <div style={{ fontSize: 17, fontWeight: 700, color: T.tx, fontVariantNumeric: 'tabular-nums' }}>{subLU.luProps}<span style={{ fontSize: 12, color: T.tx3, fontWeight: 400 }}>+{subLU.ucDeals}</span></div>
                        </div>
                        <div>
                          <div style={{ fontSize: 9, color: T.tx3, letterSpacing: 0.3, textTransform: 'uppercase' }}>Pool Units</div>
                          <div style={{ fontSize: 17, fontWeight: 700, color: T.tx, fontVariantNumeric: 'tabular-nums' }}>{fmtN(subLU.totalUnits)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 9, color: T.tx3, letterSpacing: 0.3, textTransform: 'uppercase' }}>Deliv Occ</div>
                          <div style={{ fontSize: 17, fontWeight: 700, color: T.accentDk, fontVariantNumeric: 'tabular-nums' }}>{subLU.deliveredOcc != null ? `${(subLU.deliveredOcc * 100).toFixed(0)}%` : '—'}</div>
                        </div>
                        <div title="Sub's actual observed mean velocity from CoStar/RealPage data">
                          <div style={{ fontSize: 9, color: T.tx3, letterSpacing: 0.3, textTransform: 'uppercase' }}>Observed</div>
                          <div style={{ fontSize: 17, fontWeight: 700, color: T.tx2, fontVariantNumeric: 'tabular-nums' }}>{subLU.luProps > 0 ? subLU.meanVel.toFixed(1) : '—'}</div>
                        </div>
                        <div title="Velocity assumption from the Lease-Up tab slider — what's used to compute the stab quarter">
                          <div style={{ fontSize: 9, color: T.tx3, letterSpacing: 0.3, textTransform: 'uppercase' }}>Assumption</div>
                          <div style={{ fontSize: 17, fontWeight: 700, color: T.accentDk, fontVariantNumeric: 'tabular-nums' }}>{leasesPerMo.toFixed(1)}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: T.tx2, lineHeight: 1.4 }}>
                        Full pool absorbs: <b style={{ color: subLU.stabMonths && subLU.stabMonths <= 24 ? T.chartPos : T.watchTx }}>{subLU.stabQuarter}</b>{subLU.stabMonths != null && <> ({subLU.stabMonths}mo)</>} at <b>{leasesPerMo}/mo</b> assumption
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: T.tx3, fontStyle: 'italic' }}>
                      No active lease-up or UC pipeline in this submarket — clean absorption profile.
                    </div>
                  )}
                </div>

                <div style={{ padding: 12, background: T.bg2, border: `1px solid ${T.bd2}`, borderLeft: `3px solid ${T.watchTx}`, borderRadius: T.radius }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
                    In Zip {selectedProp.z}
                    {zipLU?.thinSample && <span style={{ marginLeft: 6, fontSize: 8, padding: '1px 5px', background: T.watchTx, color: T.txLt, borderRadius: 3, letterSpacing: 0.3, fontWeight: 700 }}>THIN</span>}
                  </div>
                  {zipLU ? (
                    <div>
                      <div style={{ display: 'flex', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontSize: 9, color: T.tx3, letterSpacing: 0.3, textTransform: 'uppercase' }}>LU + UC</div>
                          <div style={{ fontSize: 17, fontWeight: 700, color: T.tx, fontVariantNumeric: 'tabular-nums' }}>{zipLU.luProps}<span style={{ fontSize: 12, color: T.tx3, fontWeight: 400 }}>+{zipLU.ucDeals}</span></div>
                        </div>
                        <div>
                          <div style={{ fontSize: 9, color: T.tx3, letterSpacing: 0.3, textTransform: 'uppercase' }}>Pool Units</div>
                          <div style={{ fontSize: 17, fontWeight: 700, color: T.tx, fontVariantNumeric: 'tabular-nums' }}>{fmtN(zipLU.totalUnits)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 9, color: T.tx3, letterSpacing: 0.3, textTransform: 'uppercase' }}>Deliv Occ</div>
                          <div style={{ fontSize: 17, fontWeight: 700, color: T.accentDk, fontVariantNumeric: 'tabular-nums' }}>{zipLU.deliveredOcc != null ? `${(zipLU.deliveredOcc * 100).toFixed(0)}%` : '—'}</div>
                        </div>
                        <div title="Zip's actual observed mean velocity from CoStar/RealPage data">
                          <div style={{ fontSize: 9, color: T.tx3, letterSpacing: 0.3, textTransform: 'uppercase' }}>Observed</div>
                          <div style={{ fontSize: 17, fontWeight: 700, color: T.tx2, fontVariantNumeric: 'tabular-nums' }}>{zipLU.luProps > 0 ? zipLU.meanVel.toFixed(1) : '—'}</div>
                        </div>
                        <div title="Velocity assumption from the Lease-Up tab slider — what's used to compute the stab quarter">
                          <div style={{ fontSize: 9, color: T.tx3, letterSpacing: 0.3, textTransform: 'uppercase' }}>Assumption</div>
                          <div style={{ fontSize: 17, fontWeight: 700, color: T.accentDk, fontVariantNumeric: 'tabular-nums' }}>{leasesPerMo.toFixed(1)}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: T.tx2, lineHeight: 1.4 }}>
                        Full pool absorbs: <b style={{ color: zipLU.stabMonths && zipLU.stabMonths <= 24 ? T.chartPos : T.watchTx }}>{zipLU.stabQuarter}</b>{zipLU.stabMonths != null && <> ({zipLU.stabMonths}mo)</>} at <b>{leasesPerMo}/mo</b> assumption
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: T.tx3, fontStyle: 'italic' }}>
                      No active lease-up or UC pipeline in this zip.
                    </div>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 10, color: T.tx3, marginTop: 8, fontStyle: 'italic' }}>
                <b>Observed</b> = sub/zip's actual mean velocity from data (backward-looking, for reference). <b>Assumption</b> = the value you set on the Lease-Up tab slider — that's what's actually used in the stab calc. Move the slider to stress-test. Combined pool = LU + UC delivering 26Q2–28Q2 at {(preLeasedUC*100).toFixed(0)}% pre-leased.
              </div>
            </div>
          );
        })()}

        {/* Section 4: Submarket context */}
        {subData && (
          <div style={{ padding: '20px 24px', borderBottom: `1px solid ${T.bd2}`, background: T.bg3 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.accentDk, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Submarket Context — {subData.s}
              </div>
              <div style={{ fontSize: 9.5, color: T.tx3, fontStyle: 'italic', letterSpacing: 0.3 }}>
                Narrative {DATA_VINTAGE.subNarratives} · operating data {DATA_VINTAGE.propertyData}
              </div>
            </div>
            {SUB_NARRATIVES[subData.s] && (
              <div style={{ fontSize: 12, color: T.tx, lineHeight: 1.55, marginBottom: 12, fontStyle: 'italic' }}>
                {SUB_NARRATIVES[subData.s]}
              </div>
            )}
            <Grid cols={4} gap={10}>
              <Metric label="Sub Inventory" value={fmtN(subData.inv)} subValue="total units" size="sm" />
              <Metric label="Sub Vacancy" value={`${subData.vac.toFixed(1)}%`} size="sm" />
              <Metric label="Sub Rent Growth" value={`${subData.erg > 0 ? '+' : ''}${subData.erg.toFixed(1)}%`} size="sm" />
              <Metric label="Sub Avg Rent" value={fmtRent(subData.rent)} size="sm" />
              <Metric label="Under Construction" value={fmtN(subData.uc)} subValue={subData.inv > 0 ? `${(subData.uc/subData.inv*100).toFixed(1)}% of inv` : '—'} size="sm" />
              <Metric label="A/D Ratio" value={subData.uc === 0 ? '—' : `${subData.ad.toFixed(2)}x`} subValue={subData.uc === 0 ? 'N/A (zero pipeline)' : 'absorption ÷ delivery'} size="sm" />
              <Metric label="Sub Composite" value={Math.round(selectedProp.ss)} subValue="0-100" size="sm" />
              <Metric label="Pipeline Risk" value={subData.uc === 0 ? 'Zero' : subData.inv > 0 && subData.uc / subData.inv < 0.03 ? 'Low' : subData.inv > 0 && subData.uc / subData.inv < 0.08 ? 'Moderate' : 'Heavy'} size="sm" />
            </Grid>
          </div>
        )}

        {/* Section 5: Zip demographics */}
        {zipData && (
          <div style={{ padding: '20px 24px', background: T.bg2 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.accentDk, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
              Zip Code Context — {zipData.z}
            </div>
            <Grid cols={4} gap={10}>
              <Metric label="Population Growth (4Y)" value={fmtPctD(zipData.pg)} size="sm" />
              <Metric label="Renter Households" value={fmtPct(zipData.rp, 0)} size="sm" />
              <Metric label="Median Income" value={fmt$(zipData.mi)} size="sm" />
              <Metric label="Income Age 25-44" value={fmt$(zipData.i2)} size="sm" />
              <Metric label="HiTech Employment" value={fmtPct(zipMS.ht, 1)} size="sm" />
              <Metric label="Six-Figure HH" value={fmtPct(zipMS.sf, 0)} size="sm" />
              <Metric label="Walkability" value={zipMS.wk != null ? zipMS.wk.toFixed(0) : '—'} subValue="Walk Score" size="sm" />
              <Metric label="Median Commute" value={zipMS.ct != null ? `${zipMS.ct.toFixed(0)} min` : '—'} size="sm" />
              <Metric label="School Rating" value={zipMS.sc != null ? `${zipMS.sc.toFixed(1)} / 10` : '—'} size="sm" />
              <Metric label="Forecast Score" value={zipMS.fs != null ? zipMS.fs.toFixed(0) : '—'} subValue="Market Stadium 0-100" size="sm" />
              <Metric label="Construction Pipeline" value={zipMS.cp != null ? fmtPct(zipMS.cp, 1) : '—'} subValue="2Y % of inventory" size="sm" />
              <Metric label="Zip Composite" value={Math.round(selectedProp.zs)} subValue={`${zipData.sb}`} size="sm" />
            </Grid>
          </div>
        )}
      </div>
    </div>
  );
};

const SubmarketDeepDiveModal = ({
  subName, closeModal,
  layerW, opMode, zipFactorW, propFactorW, subFactorW,
  setSelectedProp,
  compareSubs, toggleCompareSub, setCompareModalOpen,
  leasesPerMo, preLeasedUC, stabThresh,
  mortgageRate, setMortgageRate,
  downPct, setDownPct,
  propTaxRate, setPropTaxRate,
  navigateTo,
}) => {
  useEffect(() => {
    if (!subName) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') closeModal(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [subName, closeModal]);

  if (!subName) return null;

  const scoredSubs = buildScoredSubs(subFactorW);
  const sub = scoredSubs.find(s => s.s === subName);
  if (!sub) return null;

  const xtra = SUB_STATS[subName] || {};
  const desire = SUB_DESIRE[subName];
  const afford = SUB_AFFORD[subName];
  const series = subSeries(subName);
  const narrative = SUB_NARRATIVES[subName];
  const propCounts = SUB_PROPS[subName] || { p: 0, u: 0 };

  const subEmployers = EMPLOYERS.filter(e => e.s === subName);
  const empAnchorCount = subEmployers.filter(e => e.rank <= 0).length;
  const empBigCount    = subEmployers.filter(e => e.rank <= 1).length;
  const indCounts = {};
  for (const e of subEmployers) indCounts[e.ind] = (indCounts[e.ind] || 0) + 1;
  const indSorted = Object.entries(indCounts).sort((a, b) => b[1] - a[1]);
  const indTop4 = indSorted.slice(0, 4);
  const indOther = indSorted.slice(4).reduce((s, [, c]) => s + c, 0);
  const totalMid = subEmployers.reduce((s, e) => s + (e.mid || 0), 0);
  const top3Mid = subEmployers.slice(0, 3).reduce((s, e) => s + (e.mid || 0), 0);
  const top3SharePct = totalMid > 0 ? (top3Mid / totalMid * 100) : null;

  const allScoredProps = buildScoredProps(layerW, opMode, zipFactorW, propFactorW, subFactorW);
  const subProps = allScoredProps.filter(p => p.sb === subName).sort((a, b) => b.cs - a.cs);
  const buyCount = subProps.filter(p => p.sg === 'BUY').length;
  const watchCount = subProps.filter(p => p.sg === 'WATCH').length;
  const distressCount = subProps.filter(p => (p.ds || 0) >= 5).length;
  const sweetCount = subProps.filter(p => p.sweet).length;

  const ownerAgg = {};
  for (const p of subProps) {
    if (!p.o) continue;
    if (!ownerAgg[p.o]) ownerAgg[p.o] = { name: p.o, props: 0, units: 0 };
    ownerAgg[p.o].props += 1;
    ownerAgg[p.o].units += (p.u || 0);
  }
  const topOwners = Object.values(ownerAgg).sort((a, b) => b.units - a.units).slice(0, 5);

  const county = subProps[0]?.co || '—';

  const subLU = subLeaseUpSummary(subName, leasesPerMo, preLeasedUC, stabThresh);

  const fcStartIdx = series.findIndex(r => r.fc === 1);
  const fcStart = fcStartIdx >= 0 ? series[fcStartIdx].q : null;
  const fcEnd = series.length ? series[series.length - 1].q : null;
  const histRents = series.filter(r => r.fc === 0 && r.r != null);
  const peakRow = histRents.length ? histRents.reduce((a, b) => b.r > a.r ? b : a) : null;
  const troughRow = histRents.length ? histRents.reduce((a, b) => b.r < a.r ? b : a) : null;

  const pipelineRisk = sub.uc === 0 ? 'Zero' : sub.inv > 0 && sub.uc/sub.inv < 0.03 ? 'Low' : sub.inv > 0 && sub.uc/sub.inv < 0.08 ? 'Moderate' : 'Heavy';
  const pipelineRiskColor = pipelineRisk === 'Zero' || pipelineRisk === 'Low' ? T.buyTx : pipelineRisk === 'Moderate' ? T.watchTx : T.chartNeg;

  const subsRanked = [...scoredSubs].sort((a, b) => b.cs - a.cs);
  const rank = subsRanked.findIndex(s => s.s === subName) + 1;

  const subBullets = generateSubBullets({
    sub, xtra, desire, afford, lu: subLU, leasesPerMo,
    rank, totalSubs: scoredSubs.length,
  });

  const subConviction = buildSubConviction(
    sub, xtra, propCounts, buyCount,
    forwardRentGrowth(subName),
    METRO_REF
  );

  const sparkSlice = (arr) => arr ? arr.slice(20, 41) : [];
  const subDat = SUB_TS.d[subName] || {};
  const sparkRent = sparkSlice(subDat.r);
  const sparkVac  = sparkSlice(subDat.v);
  const sparkSV   = sparkSlice(subDat.sv);
  const sparkAbs  = sparkSlice(subDat.a);

  const Tile = ({ label, value, sub, color, info }) => (
    <div style={{ background: T.bg2, border: `1px solid ${T.bd2}`, borderRadius: T.radius, padding: '10px 12px' }}>
      <div style={{ fontSize: 9.5, color: T.tx2, letterSpacing: 0.5, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
        {label}
        {info && <InfoTip text={info} />}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: color || T.tx, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: T.tx3, marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div onClick={closeModal} style={{
      position: 'fixed', inset: 0, background: 'rgba(9, 14, 65, 0.55)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 900, padding: 24, fontFamily: T.fontFamily,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: T.bg, maxWidth: 1200, width: '100%',
        maxHeight: '94vh', overflow: 'auto',
        borderRadius: T.radius, boxShadow: '0 20px 60px rgba(9, 14, 65, 0.4)',
      }}>
        {/* Header — sticky */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 5,
          background: T.bgDark, color: T.txLt,
          padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          borderBottom: `1px solid ${T.bgDark2}`,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: T.accent, letterSpacing: 1.4, textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>
              Submarket Deep Dive
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.4, lineHeight: 1.15 }}>{subName}</div>
            <div style={{ fontSize: 11.5, color: T.accent, marginTop: 4, opacity: 0.9 }}>
              {county} County · {propCounts.p} Atlas-screened {propCounts.p === 1 ? 'property' : 'properties'} · {fmtN(propCounts.u)} units · {desire?.zips || 0} zip {(desire?.zips || 0) === 1 ? 'code' : 'codes'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 9.5, color: T.accent, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700 }}>Composite</div>
              <div style={{ fontSize: 36, fontWeight: 700, color: T.accent, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{sub.cs}</div>
              <div style={{ fontSize: 10, color: T.txLt, opacity: 0.8, marginTop: 2 }}>BUY ≥ 65 · WATCH 50–64 · AVOID &lt; 50</div>
            </div>
            {toggleCompareSub && (() => {
              const inCompare = compareSubs && compareSubs.includes(subName);
              const atCap = compareSubs && compareSubs.length >= 3 && !inCompare;
              return (
                <button
                  onClick={() => !atCap && toggleCompareSub(subName)}
                  disabled={atCap}
                  title={inCompare ? 'Remove from comparison' : atCap ? 'Comparison limit reached (3)' : 'Add to comparison'}
                  style={{
                    background: inCompare ? T.accent : 'transparent',
                    border: `1px solid ${T.accent}`, borderRadius: T.radius,
                    padding: '8px 12px', cursor: atCap ? 'not-allowed' : 'pointer',
                    color: inCompare ? T.bgDark : T.txLt, fontSize: 11, lineHeight: 1,
                    fontFamily: T.fontFamily, fontWeight: 700,
                    opacity: atCap ? 0.5 : 1,
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  {inCompare ? '✓ In Compare' : '+ Compare'}
                </button>
              );
            })()}
            <button onClick={closeModal} style={{
              background: 'transparent', border: `1px solid ${T.accent}`, borderRadius: T.radius,
              padding: '8px 12px', cursor: 'pointer', color: T.txLt, fontSize: 13, lineHeight: 1,
              fontFamily: T.fontFamily, fontWeight: 700,
            }} title="Close (Esc)"><X size={16} /></button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>

          {}
          {compareSubs && compareSubs.length > 0 && (
            <div style={{
              padding: '10px 14px', background: T.buyBg, border: `1px solid ${T.buyTx}`,
              borderRadius: T.radius, fontSize: 12, color: T.tx, lineHeight: 1.4,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            }}>
              <div>
                <b style={{ color: T.buyTx, marginRight: 6 }}>Comparison set:</b>
                <span>{compareSubs.length} of 3 selected · {compareSubs.join(' · ')}</span>
                {compareSubs.length < 2 && (
                  <span style={{ color: T.tx2, marginLeft: 6, fontStyle: 'italic' }}>
                    Open another submarket and click "+ Compare" to enable side-by-side
                  </span>
                )}
              </div>
              {compareSubs.length >= 2 && setCompareModalOpen && (
                <button
                  onClick={() => setCompareModalOpen(true)}
                  style={{
                    padding: '6px 12px', fontSize: 11, fontWeight: 700,
                    background: T.buyTx, color: T.txLt, border: 'none',
                    borderRadius: T.radius, cursor: 'pointer', fontFamily: T.fontFamily,
                    whiteSpace: 'nowrap',
                  }}
                >Open Comparison →</button>
              )}
            </div>
          )}

          {}
          {subConviction && (
            <ConvictionHeader
              title={`${subName} — Conviction Snapshot`}
              subtitle="Forward growth · current state · model conviction · re-renders when sliders move"
              signals={subConviction.signals}
              footer={subConviction.footer}
            />
          )}

          {}
          <QuickRead
            bullets={subBullets}
            subtitle={`Auto-generated from CoStar Q1 2026 data + your scoring weights · re-renders when sliders move`}
          />

          {}
          {(() => {
            const fwd = forwardRentGrowth(subName);
            if (!fwd) return null;
            const tile = (label, period, fwdPoint) => {
              if (!fwdPoint) return null;
              const pct = fwdPoint.pct;
              const color = pct >= 1.5 ? T.chartPos : pct >= 0 ? T.tx : T.chartNeg;
              return (
                <div style={{ padding: 12, background: T.bg2, border: `1px solid ${T.bd2}`, borderRadius: T.radius }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.tx2, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4 }}>
                    {label} <span style={{ color: T.tx3, fontWeight: 500 }}>· through {period}</span>
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                    {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                  </div>
                  <div style={{ fontSize: 11, color: T.tx3, marginTop: 4 }}>
                    ends {fmtRent(Math.round(fwdPoint.end))}{label !== '1-Year' ? ' · CAGR' : ''}
                  </div>
                </div>
              );
            };
            return (
              <Card
                title="Forward Rent Growth"
                subtitle={`CoStar forecast · 26Q1 anchor at ${fmtRent(Math.round(fwd.now))}`}
                padding={16}
                titleInfo="CoStar forward rent forecast. 1Y = 26Q1→27Q1 change; 3Y/5Y = compound annual rates through 29Q1/31Q1. Color: green ≥1.5%, neutral 0-1.5%, red <0%. Reflects supply pipeline, demographics, employment, metro macro inputs."
              >
                <Grid cols={3} gap={12}>
                  {tile('1-Year', '27Q1', fwd.y1)}
                  {tile('3-Year', '29Q1', fwd.y3)}
                  {tile('5-Year', '31Q1', fwd.y5)}
                </Grid>
              </Card>
            );
          })()}

          {}
          {(() => {
            const scored = buildScoredZips(layerW, zipFactorW);
            const subZips = scored.filter(z => z.sb === subName).sort((a, b) => b.cs - a.cs);
            if (subZips.length === 0) return null;
            const top3 = subZips.slice(0, 3);
            const remaining = subZips.length - top3.length;
            return (
              <Card
                title="Top Zips"
                subtitle={`Ranked by composite under current weights · click to drill in`}
                padding={16}
                titleInfo="Zip codes within this submarket ranked by composite score — funnel hop sub→zip→prop. Click any tile to close this modal and open the zip detail panel (demographics + factor contributions + property pipeline)."
              >
                <Grid cols={3} gap={12}>
                  {top3.map((z, i) => {
                    const sigColor = z.sg === 'BUY' ? T.buyTx : z.sg === 'WATCH' ? T.watchTx : T.tx3;
                    const sigBg    = z.sg === 'BUY' ? T.buyBg : z.sg === 'WATCH' ? T.watchBg : T.bg3;
                    const sigBd    = z.sg === 'BUY' ? T.buyBd : z.sg === 'WATCH' ? T.watchBd : T.bd2;
                    return (
                      <button
                        key={z.z}
                        onClick={() => {
                          if (closeModal) closeModal();
                          if (navigateTo) navigateTo('zip', z.z);
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = T.accentDk; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 4px 12px ${T.accent}30`; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = sigBd; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                        style={{
                          padding: 14, background: sigBg, border: `1px solid ${sigBd}`, borderLeft: `3px solid ${sigColor}`,
                          borderRadius: T.radius, cursor: navigateTo ? 'pointer' : 'default', textAlign: 'left',
                          fontFamily: T.fontFamily, transition: 'all 0.14s', display: 'flex', flexDirection: 'column', gap: 5,
                        }}
                        title={`Drill into zip ${z.z} — ${z.p} Atlas properties, ${fmtN(z.u)} units`}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <span style={{ fontSize: 9.5, fontWeight: 700, color: T.tx2, letterSpacing: 0.5, textTransform: 'uppercase' }}>Rank #{i + 1}</span>
                          <span style={{ fontSize: 9.5, fontWeight: 700, color: sigColor, letterSpacing: 0.5 }}>{z.sg}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
                          <span style={{ fontSize: 22, fontWeight: 700, color: T.tx, fontVariantNumeric: 'tabular-nums', letterSpacing: -0.4, lineHeight: 1 }}>{z.z}</span>
                          <span style={{ fontSize: 13, color: T.tx2, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>· {z.cs}</span>
                        </div>
                        <div style={{ fontSize: 11, color: T.tx2, lineHeight: 1.4, marginTop: 2 }}>
                          {z.p} {z.p === 1 ? 'Atlas property' : 'Atlas properties'} · {fmtN(z.u)} units
                        </div>
                        <div style={{ fontSize: 10.5, color: T.tx3, display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                          Drill into zip <ChevronRight size={11} />
                        </div>
                      </button>
                    );
                  })}
                </Grid>
                {remaining > 0 && (
                  <div style={{ fontSize: 10.5, color: T.tx3, marginTop: 10, fontStyle: 'italic' }}>
                    + {remaining} additional zip{remaining === 1 ? '' : 's'} in {subName} (not shown — see the Zip tab for the full ranking)
                  </div>
                )}
              </Card>
            );
          })()}

          {/* Operating fundamentals — 12-tile metric strip */}
          <Card title="Operating Fundamentals" subtitle={`As of May 2026 · CoStar quarterly · weights ${layerW[0]}/${layerW[1]}/${layerW[2]}`} padding={18}>
            <Grid cols={4} gap={14}>
              <Metric label="Inventory" value={fmtN(sub.inv)} subValue="units" size="sm" info={`Total existing multifamily units in ${subName} per CoStar Submarket Source of Truth (May 2026 vintage). Includes stabilized + lease-up properties of all classes.`} />
              <Metric label="Atlas Properties" value={fmtN(subProps.length)} subValue={`${buyCount} BUY · ${watchCount} WATCH`} size="sm" info="Properties in our screened universe (716 total ATX) that sit in this submarket. BUY/WATCH counts reflect the current scoring weights — adjust the layer sliders and these will recompute." />
              <Metric label="Sweet Spots" value={fmtN(sweetCount)} subValue={`${distressCount} distress-flagged`} size="sm" info="Sweet Spots = opportunistic mode + ds ≥5 + pq ≥55. Distress-flagged = ds ≥5/10 (refi pressure or lease-up overhang). Toggle Op Mode to enable." />
              <Metric label="Pipeline Risk" value={pipelineRisk} subValue={`UC ${fmtN(sub.uc)}u`} size="sm" info="Pipeline classification by UC % of inventory: Zero = no UC. Low <3%. Moderate 3-8%. Heavy >8%. UC includes only properties currently under construction, not those in planning or proposed." />
              <Metric label="Vacancy" value={`${sub.vac.toFixed(1)}%`} subValue={xtra.stabVac != null ? `stab ${xtra.stabVac.toFixed(1)}%` : ''} size="sm" info="Total vacancy from CoStar (includes lease-up properties still leasing up). 'Stab' shows stabilized-only vacancy — properties that have completed lease-up. Difference between the two is the lease-up overhang." spark={sparkVac.length ? { data: sparkVac, color: T.chartNeg } : null} />
              <Metric label="Vacancy Gap" value={xtra.vacGap != null ? `${xtra.vacGap > 0 ? '+' : ''}${xtra.vacGap.toFixed(1)}p` : '—'} subValue="lease-up drag" size="sm" info="Total vacancy minus stabilized vacancy. The lease-up overhang that's expected to absorb. 0p means no lease-up drag — the entire submarket is stabilized." spark={sparkSV.length ? { data: sparkSV, color: T.chart3 } : null} />
              <Metric label="UC % of Inv" value={xtra.ucPct != null ? `${xtra.ucPct.toFixed(1)}%` : '—'} subValue="forward supply" size="sm" info="Units under construction as a share of existing inventory. >5% = heavy forward supply. <2% = clearing pipeline. Determines how much new product hits the market in the next 12-24 months." />
              <Metric label="T12 Starts" value={xtra.t12St != null ? fmtN(xtra.t12St) : '—'} subValue={xtra.t12StPct != null ? `${xtra.t12StPct.toFixed(1)}% of inv` : ''} size="sm" info="Trailing 12-month construction starts. Forward-supply momentum 18-24 months out — these are the units that will deliver after the current UC pipeline clears. Zero starts = no future supply pressure." />
              <Metric label="Effective Rent" value={`$${fmtN(Math.round(sub.rent))}`} subValue={`ERG ${sub.erg > 0 ? '+' : ''}${sub.erg.toFixed(1)}%`} size="sm" info="Effective rent (asking rent net of concessions) per CoStar. ERG = Effective Rent Growth, T12 YoY. The ERG number is what shows up on the rent chart trajectory above." spark={sparkRent.length ? { data: sparkRent, color: T.chart1 } : null} />
              <Metric label="Peak Rent" value={peakRow ? `$${fmtN(Math.round(peakRow.r))}` : '—'} subValue={peakRow ? `set in ${peakRow.q}` : ''} size="sm" info="Highest effective rent observed in the time series. After SUB_TS reconciliation with the May 2026 Source of Truth snapshot, this includes the latest quarter — so if rent has fully recovered past the prior cycle peak, the new high shows here." />
              <Metric label="Peak-to-Trough" value={xtra.ptotPct != null ? `${xtra.ptotPct.toFixed(1)}%` : '—'} subValue="cycle drawdown" size="sm" info="Effective rent decline from cycle peak to cycle trough — measures the deepest drawdown experienced. Computed at data prep time from the historical time series. Naive series-wide max-min would over-state this because rents in 2016 were structurally lower; the cycle measure isolates the recent down-cycle." />
              {}
              <Metric
                label="Absorption / Delivery"
                value={
                  sub.t4a == null || sub.t4d == null
                    ? '—'
                    : `${sub.t4a > 0 ? '+' : ''}${fmtN(sub.t4a)} / ${fmtN(sub.t4d)}`
                }
                subValue={
                  sub.t4a == null || sub.t4d == null ? ''
                    : sub.t4d > 0 ? `${(sub.t4a / sub.t4d).toFixed(2)}x · 12mo`
                    : sub.t4a > 0 ? 'absorbing, no new supply'
                    : sub.t4a < 0 ? 'move-outs, no new supply'
                    : 'no activity (12mo)'
                }
                size="sm"
                info="T12 absorption (units leased) / T12 deliveries (brought online). Both above zero = healthy churn. Absorption with zero deliveries = absorbing existing supply. Negative = move-outs. Ratio shown when t4d > 0."
                spark={sparkAbs.length ? { data: sparkAbs, color: T.buyTx } : null}
              />
            </Grid>
          </Card>

          {/* Charts — same as the inline pair, here at full modal width */}
          {series.length > 0 && (
            <Grid cols={2} gap={16}>
              {/* Rent & Vacancy */}
              <Card title="Rent & Vacancy Trajectory" subtitle="Effective rent on left (sub vs metro dashed) · vacancy on right" padding={16}>
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart data={series} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke={T.chartGrid} />
                    <XAxis dataKey="q" tick={{ fontSize: 9.5, fill: T.tx2 }} interval={7} />
                    <YAxis yAxisId="left" tick={{ fontSize: 9.5, fill: T.tx2 }} tickFormatter={v => '$' + (v/1000).toFixed(1) + 'K'} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9.5, fill: T.tx2 }} tickFormatter={v => v.toFixed(0) + '%'} domain={[0, 'auto']} />
                    <ReTooltip
                      contentStyle={{ fontSize: 11, fontFamily: T.fontFamily, background: T.bg2, border: `1px solid ${T.bd}`, borderRadius: T.radius }}
                      formatter={(v, n) => {
                        if (v == null) return ['—', n];
                        if (n === 'r')  return ['$' + Math.round(v).toLocaleString(), 'Eff. rent'];
                        if (n === 'v')  return [v.toFixed(1) + '%', 'Vacancy'];
                        if (n === 'sv') return [v.toFixed(1) + '%', 'Stab. vacancy'];
                        if (n === 'mr') return ['$' + Math.round(v).toLocaleString(), 'Metro rent'];
                        return [v, n];
                      }}
                    />
                    {fcStart && <ReferenceArea x1={fcStart} x2={fcEnd} yAxisId="left" fill={T.accent} fillOpacity={0.18} />}
                    {peakRow && <ReferenceLine yAxisId="left" y={peakRow.r} stroke={T.chartPos} strokeDasharray="4 3" label={{ value: `Peak $${peakRow.r.toLocaleString()} · ${peakRow.q}`, fill: T.chartPos, fontSize: 9.5, position: 'insideTopLeft' }} />}
                    {troughRow && <ReferenceLine yAxisId="left" y={troughRow.r} stroke={T.chartNeg} strokeDasharray="4 3" label={{ value: `Trough $${troughRow.r.toLocaleString()} · ${troughRow.q}`, fill: T.chartNeg, fontSize: 9.5, position: 'insideBottomLeft' }} />}
                    <Line yAxisId="left" type="monotone" dataKey="mr" stroke={T.tx3} strokeWidth={1.3} strokeDasharray="5 3" dot={false} name="Metro rent" />
                    <Line yAxisId="left" type="monotone" dataKey="r" stroke={T.chart1} strokeWidth={2} dot={false} name="Eff. rent" />
                    <Line yAxisId="right" type="monotone" dataKey="v" stroke={T.chartNeg} strokeWidth={1.5} dot={false} name="Vacancy" />
                    <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} iconType="line" />
                  </ComposedChart>
                </ResponsiveContainer>
              </Card>

              {}
              <Card title="Supply & Demand Trajectory" subtitle="12mo rolling absorption vs deliveries · last 8yr shown" padding={16} titleInfo="12-mo rolling absorption (leased) vs deliveries (delivered). Bars above zero = supply or demand being added. Absorption > deliveries = market absorbing faster than growing (bullish rents). Last 32 quarters shown.">
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={series.slice(-32)} margin={{ top: 6, right: 8, left: 0, bottom: 0 }} barCategoryGap={2} barGap={1}>
                    <CartesianGrid strokeDasharray="2 4" stroke={T.chartGrid} />
                    <XAxis dataKey="q" tick={{ fontSize: 9.5, fill: T.tx2 }} interval={3} />
                    <YAxis tick={{ fontSize: 9.5, fill: T.tx2 }} tickFormatter={v => v >= 1000 ? (v/1000).toFixed(1) + 'K' : v} />
                    <ReTooltip
                      contentStyle={{ fontSize: 11, fontFamily: T.fontFamily, background: T.bg2, border: `1px solid ${T.bd}`, borderRadius: T.radius }}
                      formatter={(v, n) => {
                        if (v == null) return ['—', n];
                        const lbl = { a: 'Absorption (12mo)', d: 'Deliveries (12mo)' }[n] || n;
                        return [Math.round(v).toLocaleString() + ' u', lbl];
                      }}
                    />
                    {fcStart && <ReferenceArea x1={fcStart} x2={fcEnd} fill={T.accent} fillOpacity={0.18} />}
                    <ReferenceLine y={0} stroke={T.tx3} strokeWidth={1} />
                    <ReBar dataKey="d" fill={T.chartNeg} name="Deliveries" opacity={0.7} />
                    <ReBar dataKey="a" fill={T.chartPos} name="Absorption" opacity={0.85} />
                    <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} iconType="rect" />
                  </ComposedChart>
                </ResponsiveContainer>
                {(() => {
                  const lastHist = [...series].reverse().find(r => r.fc === 0 && r.a != null && r.d != null);
                  const lastUC = [...series].reverse().find(r => r.fc === 0 && r.uc != null && r.uc > 0);
                  const recentNegAbs = series.filter(r => r.fc === 0 && r.a != null && r.a < 0).length;
                  if (!lastHist) return null;
                  const ratio = lastHist.d > 0 ? (lastHist.a / lastHist.d) : null;
                  const notes = [];
                  if (lastUC && (!lastHist.uc || lastHist.uc === 0)) notes.push(`UC last cleared in ${lastUC.q} — no new construction since`);
                  if (recentNegAbs >= 2) notes.push(`${recentNegAbs} quarters of negative absorption (move-outs)`);
                  return (
                    <div style={{ fontSize: 10.5, color: T.tx2, marginTop: 6, lineHeight: 1.4 }}>
                      {lastHist.q}: <b>{lastHist.a.toLocaleString()}u absorbed</b> against <b>{lastHist.d.toLocaleString()}u delivered</b>
                      {ratio != null && <> · <b style={{ color: ratio >= 1 ? T.chartPos : T.chartNeg }}>{ratio.toFixed(2)}x</b> absorption-to-delivery</>}.
                      {notes.length > 0 && <span style={{ color: T.tx3 }}> · {notes.join(' · ')}.</span>}
                    </div>
                  );
                })()}
              </Card>
            </Grid>
          )}

          {/* Analyst thesis — narrative blockquote */}
          {narrative && (
            <Card padding={16}>
              <div style={{ fontSize: 10, color: T.accentDk, letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>
                Analyst thesis
                <span style={{ fontSize: 9.5, color: T.tx3, fontStyle: 'italic', letterSpacing: 0.3, marginLeft: 8, fontWeight: 400, textTransform: 'none' }}>{DATA_VINTAGE.subNarratives}</span>
              </div>
              <div style={{ fontSize: 13, color: T.tx, lineHeight: 1.6 }}>{narrative}</div>
            </Card>
          )}

          {/* Recovery timing — absorption pipeline at sub level */}
          {subLU && (
            <Card title="Recovery Timing — Lease-Up + UC Pool" subtitle={`At the current ${leasesPerMo}/mo velocity assumption${subLU.thinSample ? ' · thin sample, treat directionally' : ''}`} padding={16}>
              <Grid cols={7} gap={10}>
                <Metric label="LU props" value={fmtN(subLU.luProps)} size="sm" />
                <Metric label="UC deals" value={subLU.ucDeals > 0 ? fmtN(subLU.ucDeals) : '—'} size="sm" />
                <Metric label="Pool units" value={fmtN(subLU.totalUnits)} size="sm" />
                <Metric label="Delivered occ" value={subLU.deliveredOcc != null ? `${(subLU.deliveredOcc*100).toFixed(0)}%` : '—'} size="sm" />
                <Metric label="Observed vel" value={subLU.luProps > 0 ? subLU.meanVel.toFixed(1) : '—'} subValue={subLU.luProps > 0 ? '/ mo' : ''} size="sm" />
                <Metric label="Assumption" value={leasesPerMo.toFixed(1)} subValue="/ mo" size="sm" />
                <Metric label="Full pool stab" value={subLU.stabQuarter} subValue={subLU.stabMonths != null ? `${subLU.stabMonths} mos` : ''} size="sm" />
              </Grid>
            </Card>
          )}

          {}
          {subLU && (() => {
            const luProps = LEASEUP_PROPS.filter(p => p.sb === subName);
            const ucDeals = UC_DEALS.filter(d => d.sb === subName);
            const scenarios = [
              { v: 8,  label: 'Slow (8/mo)',         color: T.chartNeg, dash: '4 3' },
              { v: 12, label: 'Base (12/mo)',        color: T.chart3,   dash: null },
              { v: 16, label: 'Fast (16/mo)',        color: T.buyTx,    dash: '4 3' },
            ];
            const userIsClose = scenarios.some(s => Math.abs(s.v - leasesPerMo) < 0.5);
            if (!userIsClose) {
              scenarios.push({ v: leasesPerMo, label: `Current (${leasesPerMo.toFixed(1)}/mo)`, color: T.accentDk, dash: null, emphasize: true });
            }
            const trajs = scenarios.map(s => ({
              ...s,
              t: computeAbsorptionTrajectory(luProps, ucDeals, s.v, preLeasedUC, stabThresh),
            }));
            const longestT = trajs.reduce((a, b) => b.t.length > a.t.length ? b : a, trajs[0]);
            const chartData = longestT.t.map((row, i) => {
              const out = { q: row.q };
              trajs.forEach(s => {
                const r = s.t[i];
                out[`v${s.v}`] = r ? Math.round(r.occ * 1000) / 10 : null;
              });
              return out;
            });
            const stabResults = trajs.map(s => {
              const stab = computeAbsorptionStab(luProps, ucDeals, s.v, preLeasedUC, stabThresh);
              return { ...s, stabQ: stab?.quarter || '—', stabMos: stab?.months };
            });

            return (
              <Card
                title="Recovery Trajectory — Velocity Scenarios"
                subtitle={`Pool weighted occupancy projecting forward at three leasing-velocity scenarios · stabilization threshold ${(stabThresh*100).toFixed(0)}%`}
                padding={16}
                titleInfo="LU+UC pool absorption at three velocities (Slow 8/mo conservative, Base 12/mo Atlas standard, Fast 16/mo strong market). Line reaches dashed reference when pool clears stabilization — that's the recovery quarter for that scenario."
              >
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={chartData} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke={T.chartGrid} />
                    <XAxis dataKey="q" tick={{ fontSize: 9.5, fill: T.tx2 }} interval={Math.floor(chartData.length / 8)} />
                    <YAxis tick={{ fontSize: 9.5, fill: T.tx2 }} domain={[Math.max(0, Math.min(...chartData.flatMap(d => trajs.map(s => d[`v${s.v}`] ?? 100))) - 5), 100]} tickFormatter={v => v.toFixed(0) + '%'} />
                    <ReTooltip
                      contentStyle={{ fontSize: 11, fontFamily: T.fontFamily, background: T.bg2, border: `1px solid ${T.bd}`, borderRadius: T.radius }}
                      formatter={(v, n) => v == null ? ['—', n] : [v.toFixed(1) + '%', n]}
                    />
                    <ReferenceLine y={stabThresh * 100} stroke={T.tx3} strokeDasharray="3 3" label={{ value: `Stab ${(stabThresh*100).toFixed(0)}%`, fill: T.tx3, fontSize: 9.5, position: 'insideTopRight' }} />
                    {trajs.map(s => (
                      <Line
                        key={s.v}
                        type="monotone"
                        dataKey={`v${s.v}`}
                        stroke={s.color}
                        strokeWidth={s.emphasize ? 2.5 : 1.7}
                        strokeDasharray={s.dash || undefined}
                        dot={false}
                        name={s.label}
                      />
                    ))}
                    <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} iconType="line" />
                  </LineChart>
                </ResponsiveContainer>
                <div style={{ fontSize: 10.5, color: T.tx2, marginTop: 8, lineHeight: 1.5, display: 'flex', flexWrap: 'wrap', gap: 14 }}>
                  {stabResults.map(s => (
                    <div key={s.v} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ display: 'inline-block', width: 12, height: 2, background: s.color, borderRadius: 1 }} />
                      <span><b style={{ color: s.color }}>{s.label}:</b> stabs {s.stabQ}{s.stabMos != null ? ` (${s.stabMos} mos)` : ''}</span>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })()}

          {!subLU && (
            <Card padding={16} style={{ background: T.buyBg, border: `1px solid ${T.buyBd}`, borderLeft: `3px solid ${T.buyTx}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.buyTx, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4 }}>Clean Absorption Profile</div>
              <div style={{ fontSize: 12, color: T.tx, lineHeight: 1.5 }}>
                Zero active lease-up and zero UC pipeline in {subName}. Absorbed universe — no new supply overhang pressuring existing rents through 2028.
              </div>
            </Card>
          )}

          {/* Desirability + Affordability — two side-by-side panels */}
          <Grid cols={2} gap={16}>
            <Card title="Desirability" subtitle="Rolled up from zip-level Market Stadium data" padding={16} titleInfo="Averages of zip-level metrics within the submarket. Market Stadium 2025 vintage. Higher schools/walkability/HiTech %/retail/jobs is better; lower crime/commute/unemployment is better.">
              {desire ? (
                <Grid cols={3} gap={10}>
                  <Tile label="School score" value={desire.sc != null ? `${desire.sc.toFixed(1)} / 10` : '—'} color={desire.sc >= 7 ? T.chartPos : desire.sc < 5 ? T.chartNeg : T.tx} />
                  <Tile label="Walkability" value={desire.wk != null ? `${desire.wk.toFixed(0)} / 100` : '—'} color={desire.wk >= 50 ? T.chartPos : desire.wk < 20 ? T.chartNeg : T.tx} />
                  <Tile label="Total crime" value={desire.tc != null ? `${desire.tc.toFixed(0)}` : '—'} sub="per 1k pop (lower better)" color={desire.tc != null && desire.tc <= 300 ? T.chartPos : desire.tc > 600 ? T.chartNeg : T.tx} />
                  <Tile label="HiTech employment" value={desire.ht != null ? `${desire.ht.toFixed(1)}%` : '—'} color={desire.ht >= 10 ? T.chartPos : desire.ht < 4 ? T.chartNeg : T.tx} />
                  <Tile label="Six-figure households" value={desire.sf != null ? `${desire.sf.toFixed(0)}%` : '—'} color={desire.sf >= 50 ? T.chartPos : desire.sf < 30 ? T.chartNeg : T.tx} />
                  <Tile label="Retail score" value={desire.rt != null ? `${desire.rt.toFixed(0)} / 100` : '—'} color={desire.rt >= 50 ? T.chartPos : desire.rt < 20 ? T.chartNeg : T.tx} />
                  <Tile label="Jobs / 1k pop" value={desire.jo != null ? fmtN(Math.round(desire.jo)) : '—'} color={desire.jo >= 500 ? T.chartPos : desire.jo < 100 ? T.chartNeg : T.tx} />
                  <Tile label="Median commute" value={desire.ct != null ? `${desire.ct.toFixed(0)} min` : '—'} color={desire.ct <= 25 ? T.chartPos : desire.ct > 32 ? T.chartNeg : T.tx} />
                  <Tile label="Unemployment" value={desire.ur != null ? `${desire.ur.toFixed(1)}%` : '—'} color={desire.ur <= 3.5 ? T.chartPos : desire.ur > 4.5 ? T.chartNeg : T.tx} />
                </Grid>
              ) : (
                <div style={{ fontSize: 12, color: T.tx2, fontStyle: 'italic' }}>No zip-level desirability data available for this submarket.</div>
              )}
            </Card>

            <Card title="Affordability" subtitle="Income, rent, ownership cost — sub-level rollup" padding={16} titleInfo="Rent burden and rent-to-income are Market Stadium zip averages across this sub. Income (ACS 2024), home value (Zillow 2026), gross rent (ACS 2024) are zip averages. Cost-to-own with dollar gap below.">
              {afford ? (
                <Grid cols={3} gap={10}>
                  <Tile
                    label="Median income"
                    value={afford.medIncome != null ? `$${fmtN(afford.medIncome)}` : '—'}
                    color={afford.medIncome >= 110000 ? T.chartPos : afford.medIncome < 80000 ? T.chartNeg : T.tx}
                    sub="ACS 2024, all HH"
                    info="Median household income across the submarket's zip codes (Census ACS 2024 dollars). Above $110K = strong affordability for renters; below $80K = pressured."
                  />
                  <Tile
                    label="Median rent"
                    value={afford.medRent != null ? fmtRent(afford.medRent) : '—'}
                    sub="ACS 2024 gross"
                    info="Census ACS 2024 median gross rent across this sub's zips (includes tenant-paid utilities/fees). Sourced separately from CoStar effective rent — covers all rentals, not just institutional MF."
                  />
                  <Tile
                    label="Median rent-to-income"
                    value={afford.ri != null ? `${afford.ri.toFixed(1)}%` : '—'}
                    color={afford.ri <= 28 ? T.chartPos : afford.ri > 32 ? T.chartNeg : T.tx}
                    sub="Market Stadium typical-HH"
                    info={`Market Stadium proprietary metric — captures typical rent burden across the income distribution, weighted by renter prevalence (not the naive median ratio). Below 28% = affordable, room to grow rent. Above 32% = stretched.${afford.medRent && afford.medIncome ? ` For reference: simple ratio (12 × ${fmtRent(afford.medRent)} ÷ $${fmtN(afford.medIncome)}) = ${(12*afford.medRent/afford.medIncome*100).toFixed(1)}%, lower than Market Stadium's measure because the median household isn't necessarily a renter — Market Stadium isolates the renting population.` : ''}`}
                  />
                  <Tile
                    label="% rent-burdened"
                    value={afford.rb != null ? `${afford.rb.toFixed(1)}%` : '—'}
                    color={afford.rb <= 33 ? T.chartPos : afford.rb > 38 ? T.chartNeg : T.tx}
                    sub="HH paying 30%+ of income"
                    info="HUD-standard: % of renter HH spending 30%+ of gross income on rent. Count of households, not average ratio — typically higher than median rent-to-income. >38% = stress, <33% = healthy."
                  />
                  <Tile
                    label="Median home value"
                    value={afford.medHomeVal != null ? fmt$(afford.medHomeVal) : '—'}
                    sub="Zillow ZHVI 2026"
                    info="Zillow Home Value Index, 2026 vintage, averaged across the submarket's zip codes. Used to compute the price-to-rent multiple and the cost-to-own gap (see panel below)."
                  />
                  <Tile
                    label="Price-to-rent"
                    value={afford.priceToRent != null ? `${afford.priceToRent.toFixed(1)}x` : '—'}
                    color={afford.priceToRent >= 25 ? T.chartPos : afford.priceToRent < 15 ? T.chartNeg : T.tx}
                    sub="home value ÷ annual rent"
                    info="Home value ÷ annualized gross rent. >20x = ownership expensive vs renting (good for landlords, captive renters). <15x = renting expensive (bad for landlords). See Cost-to-Own panel for dollar version."
                  />
                </Grid>
              ) : (
                <div style={{ fontSize: 12, color: T.tx2, fontStyle: 'italic' }}>No zip-level affordability data available for this submarket.</div>
              )}
            </Card>
          </Grid>

          {}
          {subEmployers.length > 0 && (
            <Card
              title="Major Employers"
              subtitle={`${subEmployers.length} employer${subEmployers.length === 1 ? '' : 's'} mapped to ${subName}${empAnchorCount > 0 ? ` · ${empAnchorCount} anchor (6,000+)` : ''}`}
              padding={16}
              titleInfo="Major employers with street addresses mapped to this submarket. Source: Opportunity Austin Major Employers list. Headcount bands (e.g. '2,000-5,999') — granular numbers not disclosed. Qualitative color for IC, not a scoring input."
            >
              <Grid cols={3} gap={16}>
                {/* Left 2/3: top employers list */}
                <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: T.tx2, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4 }}>
                    Top Employers by Tier
                  </div>
                  {subEmployers.slice(0, 8).map((e, i) => (
                    <div key={`${e.n}-${i}`} style={{
                      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                      gap: 12, padding: '5px 0',
                      borderBottom: i < Math.min(7, subEmployers.length - 1) ? `1px solid ${T.bd2}` : 'none',
                    }}>
                      {/* Name + industry — flexible width, never truncate name */}
                      <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: T.tx, lineHeight: 1.3, wordBreak: 'break-word' }}>{e.n}</span>
                        <span style={{ fontSize: 10.5, color: T.tx3, marginTop: 1 }}>{e.ind}</span>
                      </div>
                      {/* Tier badge — fixed width, right-aligned */}
                      <div style={{
                        flex: '0 0 auto', fontSize: 10, fontWeight: 700,
                        color: e.rank <= 0 ? T.buyTx : e.rank <= 1 ? T.tx : T.tx2,
                        background: e.rank <= 0 ? T.buyBg : 'transparent',
                        border: e.rank <= 0 ? `1px solid ${T.buyBd}` : `1px solid ${T.bd2}`,
                        borderRadius: T.radius, padding: '2px 8px',
                        fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                      }}>{e.tier}</div>
                    </div>
                  ))}
                  {subEmployers.length > 8 && (
                    <div style={{ fontSize: 10.5, color: T.tx3, marginTop: 6, fontStyle: 'italic' }}>
                      + {subEmployers.length - 8} additional employer{subEmployers.length - 8 === 1 ? '' : 's'} (smaller tiers)
                    </div>
                  )}
                </div>

                {/* Right 1/3: industry mix + concentration */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Industry mix */}
                  <div>
                    <div style={{ fontSize: 9.5, fontWeight: 700, color: T.tx2, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6 }}>
                      Industry Mix
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {indTop4.map(([ind, c]) => (
                        <div key={ind} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                          <div style={{ flex: 1, minWidth: 0, color: T.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ind}>{ind}</div>
                          <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{
                              width: 36, height: 6, background: T.bd2, borderRadius: T.radius, overflow: 'hidden',
                            }}>
                              <div style={{
                                width: `${(c / subEmployers.length) * 100}%`, height: '100%', background: T.accentDk,
                              }} />
                            </div>
                            <span style={{ fontSize: 10.5, color: T.tx2, fontVariantNumeric: 'tabular-nums', minWidth: 18, textAlign: 'right' }}>{c}</span>
                          </div>
                        </div>
                      ))}
                      {indOther > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: T.tx3 }}>
                          <div style={{ flex: 1 }}>Other ({indSorted.length - 4})</div>
                          <div style={{ flex: '0 0 auto', fontSize: 10.5, fontVariantNumeric: 'tabular-nums' }}>{indOther}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Top-3 concentration tile */}
                  {top3SharePct != null && subEmployers.length >= 3 && (
                    <div style={{
                      padding: 10, background: T.bg3, borderRadius: T.radius, border: `1px solid ${T.bd2}`,
                    }}>
                      <div style={{ fontSize: 9.5, fontWeight: 700, color: T.tx2, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4 }}>
                        Top-3 Concentration
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: top3SharePct >= 60 ? T.chartNeg : top3SharePct >= 45 ? T.tx : T.chartPos, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                        {top3SharePct.toFixed(0)}%
                      </div>
                      <div style={{ fontSize: 10, color: T.tx3, marginTop: 4, lineHeight: 1.4 }}>
                        of mapped headcount{top3SharePct >= 60 ? ' · concentrated' : top3SharePct >= 45 ? ' · moderate' : ' · diversified'}. Approximate — uses band midpoints.
                      </div>
                    </div>
                  )}
                </div>
              </Grid>
            </Card>
          )}

          {}
          {afford && afford.medHomeVal && afford.medRent && (() => {
            const cto = costToOwn(afford.medHomeVal, afford.medRent, mortgageRate, downPct, propTaxRate);
            if (!cto) return null;
            const premiumColor =
              cto.premiumPct >= 100 ? T.chartPos :
              cto.premiumPct >= 50 ? T.watchTx :
              cto.premiumPct >= 0 ? T.tx :
              T.chartNeg;
            return (
              <Card
                title="Cost-to-Own Analysis (PITI+M)"
                subtitle={`Monthly homeownership cost vs monthly rent · ${(downPct).toFixed(0)}% down, ${mortgageRate.toFixed(2)}% rate, ${propTaxRate.toFixed(2)}% effective property tax`}
                padding={0}
                titleInfo="PITI+M (Principal+Interest+Taxes+Insurance+Maintenance) — institutional buy-vs-rent standard. Wider ownership premium = more renters blocked from buying = stronger captive demand. Defaults: 0.40% insurance/yr (TX-elevated), 1.00% maintenance/yr (Fannie standard)."
              >
                {/* Headline strip — total own, total rent, gap */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderBottom: `1px solid ${T.bd2}` }}>
                  <div style={{ padding: '16px 20px', borderRight: `1px solid ${T.bd2}` }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>Monthly Cost-to-Own</div>
                    <div style={{ fontSize: 26, fontWeight: 700, color: T.tx, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>${fmtN(Math.round(cto.totalOwn))}</div>
                    <div style={{ fontSize: 11, color: T.tx2, marginTop: 4 }}>P&amp;I + tax + ins + maint</div>
                  </div>
                  <div style={{ padding: '16px 20px', borderRight: `1px solid ${T.bd2}` }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>Monthly Rent</div>
                    <div style={{ fontSize: 26, fontWeight: 700, color: T.tx, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>${fmtN(Math.round(cto.rent))}</div>
                    <div style={{ fontSize: 11, color: T.tx2, marginTop: 4 }}>ACS 2024 gross rent (zip avg)</div>
                  </div>
                  <div style={{ padding: '16px 20px', background: cto.premiumPct >= 50 ? T.buyBg : T.bg2 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>Ownership Premium</div>
                    <div style={{ fontSize: 26, fontWeight: 700, color: premiumColor, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
                      {cto.gapMo > 0 ? '+' : ''}${fmtN(Math.round(Math.abs(cto.gapMo)))}<span style={{ fontSize: 14, color: T.tx2, fontWeight: 600, marginLeft: 6 }}>/ mo</span>
                    </div>
                    <div style={{ fontSize: 11, color: T.tx2, marginTop: 4 }}>
                      {cto.gapMo > 0 ? 'Owning costs ' : 'Owning is cheaper by '}
                      <b style={{ color: premiumColor }}>{Math.abs(cto.premiumPct).toFixed(0)}%</b>
                      {cto.gapMo > 0 ? ' more than renting' : ' than renting'}
                    </div>
                  </div>
                </div>

                {/* PITI+M itemized breakdown */}
                <div style={{ padding: '16px 20px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>Cost-to-Own Breakdown</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: T.fontFamily }}>
                    <thead>
                      <tr style={{ background: T.bg3 }}>
                        <th style={{ padding: '7px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Component</th>
                        <th style={{ padding: '7px 10px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Monthly</th>
                        <th style={{ padding: '7px 10px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Annual</th>
                        <th style={{ padding: '7px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Basis</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: `1px solid ${T.bd2}` }}>
                        <td style={{ padding: '7px 10px', color: T.tx, fontWeight: 600 }}>Principal &amp; Interest</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.tx }}>${fmtN(Math.round(cto.pi))}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.tx2 }}>${fmtN(Math.round(cto.pi * 12))}</td>
                        <td style={{ padding: '7px 10px', color: T.tx2, fontSize: 11 }}>${fmtN(Math.round(afford.medHomeVal * (1 - downPct/100)))} loan @ {mortgageRate.toFixed(2)}% × 30yr</td>
                      </tr>
                      <tr style={{ borderBottom: `1px solid ${T.bd2}` }}>
                        <td style={{ padding: '7px 10px', color: T.tx, fontWeight: 600 }}>Property Taxes</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.tx }}>${fmtN(Math.round(cto.tax))}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.tx2 }}>${fmtN(Math.round(cto.tax * 12))}</td>
                        <td style={{ padding: '7px 10px', color: T.tx2, fontSize: 11 }}>{propTaxRate.toFixed(2)}% × ${fmtN(afford.medHomeVal)}</td>
                      </tr>
                      <tr style={{ borderBottom: `1px solid ${T.bd2}` }}>
                        <td style={{ padding: '7px 10px', color: T.tx, fontWeight: 600 }}>Homeowner's Insurance</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.tx }}>${fmtN(Math.round(cto.ins))}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.tx2 }}>${fmtN(Math.round(cto.ins * 12))}</td>
                        <td style={{ padding: '7px 10px', color: T.tx2, fontSize: 11 }}>{COST_TO_OWN_INSURANCE_PCT.toFixed(2)}% × home value (TX-elevated)</td>
                      </tr>
                      <tr style={{ borderBottom: `1px solid ${T.bd2}` }}>
                        <td style={{ padding: '7px 10px', color: T.tx, fontWeight: 600 }}>Maintenance Reserve</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.tx }}>${fmtN(Math.round(cto.maint))}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.tx2 }}>${fmtN(Math.round(cto.maint * 12))}</td>
                        <td style={{ padding: '7px 10px', color: T.tx2, fontSize: 11 }}>{COST_TO_OWN_MAINT_PCT.toFixed(2)}% × home value (Fannie standard)</td>
                      </tr>
                      <tr style={{ background: T.bg3, fontWeight: 700 }}>
                        <td style={{ padding: '8px 10px', color: T.tx }}>Total Cost-to-Own</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.tx }}>${fmtN(Math.round(cto.totalOwn))}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.tx2 }}>${fmtN(Math.round(cto.totalOwn * 12))}</td>
                        <td style={{ padding: '8px 10px', color: T.tx2, fontSize: 11, fontWeight: 500 }}>PITI + maintenance</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Embedded inputs — three sliders for rate / down / tax */}
                <div style={{ padding: '14px 20px', background: T.bg3, borderTop: `1px solid ${T.bd2}` }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>
                    Cost-to-Own Inputs <InfoTip text="Adjustments here flow through to the comparison modal too — both views read the same App-level state." />
                  </div>
                  <Grid cols={3} gap={16}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: T.tx2 }}>30-yr fixed rate</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: T.accentDk, fontVariantNumeric: 'tabular-nums' }}>{mortgageRate.toFixed(2)}%</span>
                      </div>
                      <input type="range" min={3} max={10} step={0.05} value={mortgageRate}
                        onChange={e => setMortgageRate(Number(e.target.value))}
                        style={{ width: '100%', accentColor: T.accentDk, cursor: 'pointer', height: 4 }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: T.tx3, marginTop: 2 }}>
                        <span>3%</span><span>6.5%</span><span>10%</span>
                      </div>
                    </div>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: T.tx2 }}>Down payment</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: T.accentDk, fontVariantNumeric: 'tabular-nums' }}>{downPct.toFixed(0)}%</span>
                      </div>
                      <input type="range" min={3} max={50} step={1} value={downPct}
                        onChange={e => setDownPct(Number(e.target.value))}
                        style={{ width: '100%', accentColor: T.accentDk, cursor: 'pointer', height: 4 }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: T.tx3, marginTop: 2 }}>
                        <span>3% (FHA)</span><span>20% (conv.)</span><span>50%</span>
                      </div>
                    </div>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: T.tx2 }}>Effective property tax</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: T.accentDk, fontVariantNumeric: 'tabular-nums' }}>{propTaxRate.toFixed(2)}%</span>
                      </div>
                      <input type="range" min={1.0} max={3.0} step={0.05} value={propTaxRate}
                        onChange={e => setPropTaxRate(Number(e.target.value))}
                        style={{ width: '100%', accentColor: T.accentDk, cursor: 'pointer', height: 4 }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: T.tx3, marginTop: 2 }}>
                        <span>1.0%</span><span>2.1% (ATX)</span><span>3.0%</span>
                      </div>
                    </div>
                  </Grid>
                </div>

                {/* Thesis line */}
                <div style={{ padding: '12px 20px', borderTop: `1px solid ${T.bd2}`, fontSize: 11.5, color: T.tx2, lineHeight: 1.5 }}>
                  <b style={{ color: T.tx }}>Read:</b>{' '}
                  {cto.premiumPct >= 100 ? (
                    <>Deeply locked out — owning costs <b style={{ color: T.chartPos }}>${fmtN(Math.round(cto.gapMo))}/mo more</b> than renting ({Math.abs(cto.premiumPct).toFixed(0)}% premium). Strongest captive-renter signal.</>
                  ) : cto.premiumPct >= 50 ? (
                    <>Moderately locked out — owning costs <b style={{ color: T.watchTx }}>${fmtN(Math.round(cto.gapMo))}/mo more</b> than renting ({Math.abs(cto.premiumPct).toFixed(0)}% premium). Solid captive-demand cushion.</>
                  ) : cto.premiumPct >= 0 ? (
                    <>Narrow gap — owning costs only <b>${fmtN(Math.round(cto.gapMo))}/mo more</b> ({Math.abs(cto.premiumPct).toFixed(0)}% premium). Buy/rent decision is more two-sided here; less captive-demand cushion.</>
                  ) : (
                    <>Owning is cheaper than renting by <b style={{ color: T.chartNeg }}>${fmtN(Math.round(Math.abs(cto.gapMo)))}/mo</b>. Rare and structurally weak for MF — renters have direct path to ownership.</>
                  )}
                </div>
              </Card>
            );
          })()}

          {/* Top owners + Property roster */}
          {topOwners.length > 0 && (
            <Card title={`Top owners in ${subName}`} subtitle="Aggregated from CoStar property data — top 5 by unit count" padding={16}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: T.fontFamily }}>
                <thead>
                  <tr style={{ background: T.bg3 }}>
                    {['#', 'Owner', 'Properties', 'Units', '% of submarket'].map((h, i) => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: i < 2 ? 'left' : 'right', fontSize: 9.5, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topOwners.map((o, i) => (
                    <tr key={i} style={{ borderTop: `1px solid ${T.bd2}` }}>
                      <td style={{ padding: '8px 10px', color: T.tx3, fontVariantNumeric: 'tabular-nums' }}>{i + 1}</td>
                      <td style={{ padding: '8px 10px', color: T.tx, fontWeight: 600 }}>{o.name}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: T.tx, fontVariantNumeric: 'tabular-nums' }}>{o.props}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: T.tx, fontVariantNumeric: 'tabular-nums' }}>{fmtN(o.units)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: T.tx2, fontVariantNumeric: 'tabular-nums' }}>{propCounts.u > 0 ? `${(o.units/propCounts.u*100).toFixed(1)}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          <Card
            title={`Property roster — ${subProps.length} Atlas-screened`}
            subtitle="Click a row to open the property card. Sorted by composite score."
            padding={0}
            titleInfo={DV.props}
          >
            <div style={{ maxHeight: 480, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, fontFamily: T.fontFamily }}>
                <thead>
                  <tr style={{ background: T.bgDark, position: 'sticky', top: 0 }}>
                    {['Property', 'Built', 'Units', 'Class', 'Rent', 'Vac', 'Conc', 'CS', 'Signal'].map((h, i) => (
                      <th key={h} style={{
                        padding: '10px 12px', textAlign: i === 0 ? 'left' : 'right',
                        fontSize: 9.5, fontWeight: 700, color: T.txLt,
                        textTransform: 'uppercase', letterSpacing: 0.6, whiteSpace: 'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {subProps.map((p, i) => (
                    <tr
                      key={i}
                      onClick={() => setSelectedProp(p)}
                      title="Open property card"
                      style={{ borderBottom: `1px solid ${T.bd2}`, background: i % 2 === 0 ? T.bg2 : T.bg3, cursor: 'pointer' }}
                      onMouseEnter={e => { e.currentTarget.style.background = T.accent; }}
                      onMouseLeave={e => { e.currentTarget.style.background = i % 2 === 0 ? T.bg2 : T.bg3; }}
                    >
                      <td style={{ padding: '8px 12px', color: T.tx, fontWeight: 500, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.sweet && <Target size={10} style={{ display: 'inline', marginRight: 4, color: T.accentDk }} />}
                        {LEASEUP_BY_MAIN[p.n] && <span title={`Lease-up · ${(LEASEUP_BY_MAIN[p.n].curOcc*100).toFixed(0)}% occ · ${LEASEUP_BY_MAIN[p.n].vel}/mo`} style={{ display: 'inline-block', fontSize: 9, fontWeight: 700, padding: '1px 5px', background: T.watchTx, color: T.txLt, borderRadius: 3, marginRight: 5, letterSpacing: 0.3 }}>◐ LU</span>}
                        {p.n}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.tx }}>{p.yb || '—'}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.tx }}>{p.u}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: T.tx }}>{p.cl || '—'}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.tx }}>{fmtRent(p.er)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                        color: p.v < 10 ? T.chartPos : p.v > 18 ? T.chartNeg : T.tx }}>{p.v != null ? p.v.toFixed(1) + '%' : '—'}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                        color: p.cn != null && p.cn > 10 ? T.chartNeg : T.tx }}>{p.cn != null ? `${p.cn.toFixed(1)}%` : '—'}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.accentDk, fontWeight: 700 }}>{p.cs}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}><Pill signal={p.sg} size="sm" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

const SubmarketCompareModal = ({ subNames, closeModal, layerW, opMode, subFactorW, leasesPerMo, preLeasedUC, stabThresh, removeSub, setSelectedSubModal, mortgageRate, downPct, propTaxRate }) => {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeModal(); };
    if (subNames && subNames.length >= 2) {
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }
    return undefined;
  }, [subNames, closeModal]);

  if (!subNames || subNames.length < 2) return null;

  const scoredSubs = buildScoredSubs(subFactorW);
  const subsRanked = [...scoredSubs].sort((a, b) => b.cs - a.cs);
  const totalSubs = scoredSubs.length;
  const cards = subNames.map(name => {
    const sub = scoredSubs.find(s => s.s === name);
    if (!sub) return null;
    const afford = SUB_AFFORD[name];
    return {
      sub,
      xtra: SUB_STATS[name] || {},
      desire: SUB_DESIRE[name],
      afford,
      series: subSeries(name),
      lu: subLeaseUpSummary(name, leasesPerMo, preLeasedUC, stabThresh),
      rank: subsRanked.findIndex(s => s.s === name) + 1,
      cto: afford && afford.medHomeVal && afford.medRent
        ? costToOwn(afford.medHomeVal, afford.medRent, mortgageRate, downPct, propTaxRate)
        : null,
    };
  }).filter(Boolean);
  if (cards.length < 2) return null;

  const palette = [T.chart1, T.chart2, T.chart3, T.accentDk];
  cards.forEach((c, i) => { c.color = palette[i % palette.length]; });

  const rows = [
    { section: 'Operating Fundamentals', label: 'Composite score', val: d => d.sub.cs, fmt: v => v, dir: 'high' },
    { section: 'Operating Fundamentals', label: 'Signal',          val: d => d.sub.cs >= 65 ? 'BUY' : d.sub.cs >= 50 ? 'WATCH' : 'AVOID', fmt: v => v, dir: 'mixed' },
    { section: 'Operating Fundamentals', label: 'Composite rank',  val: d => `#${d.rank} of ${totalSubs}`, fmt: v => v, dir: 'mixed' },
    { section: 'Operating Fundamentals', label: 'Vacancy',         val: d => d.sub.vac, fmt: v => v != null ? `${v.toFixed(1)}%` : '—', dir: 'low' },
    { section: 'Operating Fundamentals', label: 'Stabilized vacancy', val: d => d.xtra.stabVac, fmt: v => v != null ? `${v.toFixed(1)}%` : '—', dir: 'low' },
    { section: 'Operating Fundamentals', label: 'Vacancy gap (lease-up drag)', val: d => d.xtra.vacGap, fmt: v => v != null ? `${v > 0 ? '+' : ''}${v.toFixed(1)}p` : '—', dir: 'low' },
    { section: 'Operating Fundamentals', label: 'UC % of inventory', val: d => d.xtra.ucPct, fmt: v => v != null ? `${v.toFixed(1)}%` : '—', dir: 'low' },
    { section: 'Operating Fundamentals', label: 'T12 starts % of inv', val: d => d.xtra.t12StPct, fmt: v => v != null ? `${v.toFixed(1)}%` : '—', dir: 'low' },
    { section: 'Operating Fundamentals', label: 'Effective rent',  val: d => d.sub.rent, fmt: v => `$${fmtN(Math.round(v))}`, dir: 'mixed' },
    { section: 'Operating Fundamentals', label: 'ERG (T12 YoY)',   val: d => d.sub.erg, fmt: v => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`, dir: 'high' },
    { section: 'Operating Fundamentals', label: 'Peak-to-trough rent', val: d => d.xtra.ptotPct, fmt: v => v != null ? `${v.toFixed(1)}%` : '—', dir: 'low' },
    { section: 'Operating Fundamentals', label: 'A/D ratio (lifetime)', val: d => d.sub.uc === 0 ? null : d.sub.ad, fmt: v => v != null ? `${v.toFixed(2)}x` : '—', dir: 'high' },
    { section: 'Operating Fundamentals', label: 'Recovery (current vel)', val: d => d.lu?.stabMonths, fmt: v => v != null ? `${v} mos` : 'Clean', dir: 'low' },

    { section: 'Atlas Universe', label: 'Inventory (units)', val: d => d.sub.inv, fmt: v => fmtN(v), dir: 'mixed' },
    { section: 'Atlas Universe', label: 'Atlas-screened properties', val: d => (SUB_PROPS[d.sub.s]?.p || 0), fmt: v => fmtN(v), dir: 'high' },

    { section: 'Desirability', label: 'School score',  val: d => d.desire?.sc, fmt: v => v != null ? `${v.toFixed(1)} / 10` : '—', dir: 'high' },
    { section: 'Desirability', label: 'Walkability',    val: d => d.desire?.wk, fmt: v => v != null ? `${v.toFixed(0)} / 100` : '—', dir: 'high' },
    { section: 'Desirability', label: 'Total crime per 1k', val: d => d.desire?.tc, fmt: v => v != null ? `${v.toFixed(0)}` : '—', dir: 'low' },
    { section: 'Desirability', label: 'HiTech employment', val: d => d.desire?.ht, fmt: v => v != null ? `${v.toFixed(1)}%` : '—', dir: 'high' },
    { section: 'Desirability', label: 'Six-figure households', val: d => d.desire?.sf, fmt: v => v != null ? `${v.toFixed(0)}%` : '—', dir: 'high' },
    { section: 'Desirability', label: 'Median commute', val: d => d.desire?.ct, fmt: v => v != null ? `${v.toFixed(0)} min` : '—', dir: 'low' },

    { section: 'Affordability', label: 'Median household income', val: d => d.afford?.medIncome, fmt: v => v != null ? `$${fmtN(v)}` : '—', dir: 'high' },
    { section: 'Affordability', label: 'Rent-to-income',  val: d => d.afford?.ri, fmt: v => v != null ? `${v.toFixed(1)}%` : '—', dir: 'low' },
    { section: 'Affordability', label: 'Rent burden',     val: d => d.afford?.rb, fmt: v => v != null ? `${v.toFixed(1)}%` : '—', dir: 'low' },
    { section: 'Affordability', label: 'Median home value', val: d => d.afford?.medHomeVal, fmt: v => v != null ? fmt$(v) : '—', dir: 'mixed' },
    { section: 'Affordability', label: 'Price-to-rent',   val: d => d.afford?.priceToRent, fmt: v => v != null ? `${v.toFixed(1)}x` : '—', dir: 'high' },

    { section: 'Cost-to-Own (PITI+M)', label: 'Monthly P&I',           val: d => d.cto?.pi,        fmt: v => v != null ? `$${fmtN(Math.round(v))}` : '—', dir: 'mixed' },
    { section: 'Cost-to-Own (PITI+M)', label: 'Monthly property tax',  val: d => d.cto?.tax,       fmt: v => v != null ? `$${fmtN(Math.round(v))}` : '—', dir: 'mixed' },
    { section: 'Cost-to-Own (PITI+M)', label: 'Monthly insurance',     val: d => d.cto?.ins,       fmt: v => v != null ? `$${fmtN(Math.round(v))}` : '—', dir: 'mixed' },
    { section: 'Cost-to-Own (PITI+M)', label: 'Monthly maintenance',   val: d => d.cto?.maint,     fmt: v => v != null ? `$${fmtN(Math.round(v))}` : '—', dir: 'mixed' },
    { section: 'Cost-to-Own (PITI+M)', label: 'Total cost-to-own',     val: d => d.cto?.totalOwn,  fmt: v => v != null ? `$${fmtN(Math.round(v))}` : '—', dir: 'mixed' },
    { section: 'Cost-to-Own (PITI+M)', label: 'Monthly rent',          val: d => d.cto?.rent,      fmt: v => v != null ? `$${fmtN(Math.round(v))}` : '—', dir: 'mixed' },
    { section: 'Cost-to-Own (PITI+M)', label: 'Ownership premium',     val: d => d.cto?.gapMo,     fmt: v => v != null ? `${v > 0 ? '+' : ''}$${fmtN(Math.round(v))}/mo` : '—', dir: 'high' },
    { section: 'Cost-to-Own (PITI+M)', label: 'Ownership premium %',   val: d => d.cto?.premiumPct, fmt: v => v != null ? `${v > 0 ? '+' : ''}${v.toFixed(0)}%` : '—', dir: 'high' },
  ];

  const decoratedRows = rows.map(r => {
    const vals = cards.map(d => r.val(d));
    if (r.dir === 'mixed') return { ...r, vals, bestIdx: -1, worstIdx: -1 };
    const numeric = vals.map(v => (v == null || isNaN(v)) ? null : Number(v));
    const valid = numeric.map((v, i) => v != null ? { v, i } : null).filter(Boolean);
    if (valid.length < 2) return { ...r, vals, bestIdx: -1, worstIdx: -1 };
    const best = r.dir === 'high' ? valid.reduce((a, b) => b.v > a.v ? b : a) : valid.reduce((a, b) => b.v < a.v ? b : a);
    const worst = r.dir === 'high' ? valid.reduce((a, b) => b.v < a.v ? b : a) : valid.reduce((a, b) => b.v > a.v ? b : a);
    return { ...r, vals, bestIdx: best.i, worstIdx: best.i === worst.i ? -1 : worst.i };
  });

  const sections = [];
  for (const r of decoratedRows) {
    const last = sections[sections.length - 1];
    if (!last || last.name !== r.section) sections.push({ name: r.section, rows: [r] });
    else last.rows.push(r);
  }

  const longestSeries = cards.reduce((a, b) => b.series.length > a.series.length ? b : a, cards[0]);
  const rentChartData = longestSeries.series.map((row, i) => {
    const out = { q: row.q, fc: row.fc };
    cards.forEach(c => { out[`r_${c.sub.s}`] = c.series[i]?.r ?? null; });
    return out;
  });
  const fcStartIdx = rentChartData.findIndex(r => r.fc === 1);
  const fcStart = fcStartIdx >= 0 ? rentChartData[fcStartIdx].q : null;
  const fcEnd = rentChartData.length ? rentChartData[rentChartData.length - 1].q : null;

  return (
    <div onClick={closeModal} style={{
      position: 'fixed', inset: 0, background: 'rgba(9, 14, 65, 0.55)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 950, padding: 24, fontFamily: T.fontFamily,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: T.bg, maxWidth: 1280, width: '100%',
        maxHeight: '94vh', overflow: 'auto',
        borderRadius: T.radius, boxShadow: '0 20px 60px rgba(9, 14, 65, 0.4)',
      }}>
        {/* Hero */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 5,
          background: T.bgDark, color: T.txLt,
          padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          borderBottom: `1px solid ${T.bgDark2}`,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: T.accent, letterSpacing: 1.4, textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>
              Compare Submarkets · {cards.length} selected
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.3, lineHeight: 1.2 }}>
              {cards.map(c => c.sub.s).join('  vs  ')}
            </div>
            <div style={{ fontSize: 11, color: T.accent, marginTop: 6, opacity: 0.85 }}>
              Side-by-side: operating fundamentals · Atlas universe · desirability · affordability · cost-to-own (PITI+M) · rent trajectory overlay
            </div>
            <div style={{ fontSize: 10.5, color: T.accent, marginTop: 3, opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>
              Cost-to-own assumptions: {mortgageRate.toFixed(2)}% rate · {downPct.toFixed(0)}% down · {propTaxRate.toFixed(2)}% prop tax (adjust in Sub Deep Dive)
            </div>
          </div>
          <button onClick={closeModal} style={{
            background: 'transparent', border: `1px solid ${T.accent}`, borderRadius: T.radius,
            padding: '8px 12px', cursor: 'pointer', color: T.txLt, fontSize: 13,
            fontFamily: T.fontFamily, fontWeight: 700,
          }} title="Close (Esc)"><X size={16} /></button>
        </div>

        {/* Body */}
        <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>

          {}
          <Grid cols={cards.length} gap={14}>
            {cards.map((c, i) => (
              <div key={c.sub.s} style={{
                background: T.bg2, border: `1px solid ${T.bd2}`, borderRadius: T.radius,
                borderTop: `3px solid ${c.color}`, padding: '12px 14px',
                position: 'relative',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 9.5, color: T.tx2, letterSpacing: 0.5, fontWeight: 700, textTransform: 'uppercase' }}>Submarket {i + 1}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: T.tx, marginTop: 2 }}>{c.sub.s}</div>
                    <div style={{ fontSize: 10.5, color: T.tx2, marginTop: 2 }}>Rank #{c.rank} of {totalSubs}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: c.color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{c.sub.cs}</div>
                    <Pill signal={c.sub.cs >= 65 ? 'BUY' : c.sub.cs >= 50 ? 'WATCH' : 'AVOID'} size="sm" />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button
                    onClick={() => { closeModal(); setSelectedSubModal(c.sub.s); }}
                    style={{
                      flex: 1, padding: '4px 8px', fontSize: 10, fontWeight: 700,
                      background: T.bg3, color: T.accentDk, border: `1px solid ${T.bd2}`,
                      borderRadius: T.radius, cursor: 'pointer', fontFamily: T.fontFamily,
                    }}
                  >Open deep dive →</button>
                  <button
                    onClick={() => removeSub(c.sub.s)}
                    title="Remove from comparison"
                    style={{
                      padding: '4px 8px', fontSize: 11, fontWeight: 700,
                      background: 'transparent', color: T.tx3, border: `1px solid ${T.bd2}`,
                      borderRadius: T.radius, cursor: 'pointer', fontFamily: T.fontFamily,
                    }}
                  >×</button>
                </div>
              </div>
            ))}
          </Grid>

          {/* Comparison table */}
          <Card title="Side-by-Side Metrics" subtitle="Color-coded: green = best on this row · red = worst on this row · neutral when no winner is meaningful" padding={0}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: T.fontFamily }}>
              <colgroup>
                <col style={{ width: '28%' }} />
                {cards.map(c => <col key={c.sub.s} style={{ width: `${72 / cards.length}%` }} />)}
              </colgroup>
              <thead>
                <tr style={{ background: T.bg3 }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Metric</th>
                  {cards.map(c => (
                    <th key={c.sub.s} style={{
                      padding: '10px 14px', textAlign: 'right', fontSize: 10, fontWeight: 700,
                      color: c.color, textTransform: 'uppercase', letterSpacing: 0.5,
                      borderBottom: `2px solid ${c.color}`,
                    }}>{c.sub.s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sections.map((sec, si) => (
                  <React.Fragment key={sec.name}>
                    <tr>
                      <td colSpan={cards.length + 1} style={{
                        padding: '8px 14px', background: T.bgDark, color: T.txLt,
                        fontSize: 9.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase',
                      }}>{sec.name}</td>
                    </tr>
                    {sec.rows.map((r, ri) => (
                      <tr key={`${si}-${ri}`} style={{
                        borderBottom: `1px solid ${T.bd2}`,
                        background: ri % 2 === 0 ? T.bg2 : T.bg3,
                      }}>
                        <td style={{ padding: '8px 14px', color: T.tx2, fontWeight: 500 }}>{r.label}</td>
                        {cards.map((c, ci) => {
                          const isBest = ci === r.bestIdx;
                          const isWorst = ci === r.worstIdx;
                          return (
                            <td key={c.sub.s} style={{
                              padding: '8px 14px', textAlign: 'right',
                              fontVariantNumeric: 'tabular-nums', fontWeight: isBest || isWorst ? 700 : 500,
                              color: isBest ? T.buyTx : isWorst ? T.chartNeg : T.tx,
                              background: isBest ? T.buyBg : isWorst ? 'rgba(239, 68, 68, 0.06)' : 'transparent',
                            }}>{r.vals[ci] != null ? r.fmt(r.vals[ci]) : '—'}</td>
                          );
                        })}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Rent trajectory overlay */}
          <Card title="Rent Trajectory Overlay" subtitle={`Effective rent across ${cards.length} selected submarkets · CoStar quarterly · 16Q1 → 31Q1`} padding={16}>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={rentChartData} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke={T.chartGrid} />
                <XAxis dataKey="q" tick={{ fontSize: 9.5, fill: T.tx2 }} interval={7} />
                <YAxis tick={{ fontSize: 9.5, fill: T.tx2 }} tickFormatter={v => '$' + (v/1000).toFixed(1) + 'K'} />
                <ReTooltip
                  contentStyle={{ fontSize: 11, fontFamily: T.fontFamily, background: T.bg2, border: `1px solid ${T.bd}`, borderRadius: T.radius }}
                  formatter={(v, n) => v == null ? ['—', n] : ['$' + Math.round(v).toLocaleString(), n.replace('r_', '')]}
                />
                {fcStart && <ReferenceArea x1={fcStart} x2={fcEnd} fill={T.accent} fillOpacity={0.18} />}
                {cards.map(c => (
                  <Line
                    key={c.sub.s}
                    type="monotone"
                    dataKey={`r_${c.sub.s}`}
                    stroke={c.color}
                    strokeWidth={2}
                    dot={false}
                    name={c.sub.s}
                  />
                ))}
                <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} iconType="line" />
              </LineChart>
            </ResponsiveContainer>
            <div style={{ fontSize: 10.5, color: T.tx2, marginTop: 6 }}>
              Shaded region = forecast (26Q2+).
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [tab, setTab] = useState('exec');

  const [layerW, setLayerW] = useState([25, 40, 35]);
  const [opMode, setOpMode] = useState(false);
  const [zipFactorW, setZipFactorW] = useState(DEFAULT_ZIP_W);
  const [propFactorW, setPropFactorW] = useState(DEFAULT_PROP_W);
  const [subFactorW, setSubFactorW] = useState(DEFAULT_SUB_W);

  const [leasesPerMo, setLeasesPerMo] = useState(12);
  const [preLeasedUC, setPreLeasedUC] = useState(DEFAULT_PRELEASED_UC);
  const [stabThresh, setStabThresh] = useState(0.95);

  const [mortgageRate, setMortgageRate] = useState(DEFAULT_MORTGAGE_RATE);
  const [downPct, setDownPct] = useState(DEFAULT_DOWN_PCT);
  const [propTaxRate, setPropTaxRate] = useState(DEFAULT_PROP_TAX_RATE);

  const [jumpIntent, setJumpIntent] = useState(null);

  const [selectedProp, setSelectedProp] = useState(null);

  const [selectedSubModal, setSelectedSubModal] = useState(null);

  const [compareSubs, setCompareSubs] = useState([]);
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const toggleCompareSub = (name) => {
    setCompareSubs(prev => {
      if (prev.includes(name)) return prev.filter(n => n !== name);
      if (prev.length >= 3) return prev;
      return [...prev, name];
    });
  };
  const clearCompareSubs = () => { setCompareSubs([]); setCompareModalOpen(false); };

  const navigateTo = (kind, value) => {
    if (kind === 'prop') {
      if (typeof value === 'object' && value != null) {
        setSelectedProp(value);
        return;
      }
      const sp = buildScoredProps(layerW, opMode, zipFactorW, propFactorW, subFactorW);
      const match = sp.find(p => p.n === value);
      if (match) setSelectedProp(match);
      return;
    }
    setJumpIntent({ kind, value });
    if (kind === 'sub') setTab('sub');
    else if (kind === 'zip') setTab('zip');
  };

  const resetScoring = () => {
    setLayerW([25, 40, 35]);
    setOpMode(false);
    setZipFactorW(DEFAULT_ZIP_W);
    setPropFactorW(DEFAULT_PROP_W);
    setSubFactorW(DEFAULT_SUB_W);
  };

  const resetZipFactors = () => setZipFactorW(DEFAULT_ZIP_W);
  const resetPropFactors = () => setPropFactorW(DEFAULT_PROP_W);
  const resetSubFactors = () => setSubFactorW(DEFAULT_SUB_W);

  const scoringProps = {
    layerW, setLayerW,
    opMode, setOpMode,
    zipFactorW, setZipFactorW,
    propFactorW, setPropFactorW,
    subFactorW, setSubFactorW,
    resetScoring, resetZipFactors, resetPropFactors, resetSubFactors,
    jumpIntent, setJumpIntent, navigateTo,
    selectedProp, setSelectedProp,
    selectedSubModal, setSelectedSubModal,
    compareSubs, toggleCompareSub, clearCompareSubs,
    setCompareModalOpen,
    leasesPerMo, setLeasesPerMo,
    preLeasedUC, setPreLeasedUC,
    stabThresh, setStabThresh,
    mortgageRate, setMortgageRate,
    downPct, setDownPct,
    propTaxRate, setPropTaxRate,
  };

  const asOf = TODAY_LABEL;

  const renderTab = () => {
    switch (tab) {
      case 'exec':   return <ExecSummaryTab setTab={setTab} {...scoringProps} />;
      case 'supply': return <SupplyDemandTab />;
      case 'rent':   return <RentRevenueTab />;
      case 'fund':   return <FundamentalsTab />;
      case 'sub':    return <SubDeepDiveTab {...scoringProps} />;
      case 'zip':    return <ZipAnalysisTab {...scoringProps} />;
      case 'props':  return <PropertyPipelineTab {...scoringProps} />;
      case 'leaseup': return <LeaseUpTab {...scoringProps} />;
      case 'cap':    return <CapitalMarketsTab {...scoringProps} />;
      default:       return <ExecSummaryTab setTab={setTab} {...scoringProps} />;
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: T.bg,
      color: T.tx,
      fontFamily: T.fontFamily,
      fontSize: 13,
      lineHeight: 1.5,
    }}>
      <Header asOf={asOf} />
      <TabNav tab={tab} setTab={setTab} />
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px' }}>
        {renderTab()}
      </div>
      {/* Global property card modal — overlays any tab when a property is clicked */}
      <PropertyCardModal
        selectedProp={selectedProp}
        setSelectedProp={setSelectedProp}
        setSelectedSubModal={setSelectedSubModal}
        navigateTo={navigateTo}
        layerW={layerW}
        opMode={opMode}
        zipFactorW={zipFactorW}
        propFactorW={propFactorW}
        subFactorW={subFactorW}
        leasesPerMo={leasesPerMo}
        preLeasedUC={preLeasedUC}
        stabThresh={stabThresh}
      />
      {}
      <SubmarketDeepDiveModal
        subName={selectedSubModal}
        closeModal={() => setSelectedSubModal(null)}
        layerW={layerW}
        opMode={opMode}
        zipFactorW={zipFactorW}
        propFactorW={propFactorW}
        subFactorW={subFactorW}
        setSelectedProp={setSelectedProp}
        compareSubs={compareSubs}
        toggleCompareSub={toggleCompareSub}
        setCompareModalOpen={setCompareModalOpen}
        leasesPerMo={leasesPerMo}
        preLeasedUC={preLeasedUC}
        stabThresh={stabThresh}
        mortgageRate={mortgageRate}
        setMortgageRate={setMortgageRate}
        downPct={downPct}
        setDownPct={setDownPct}
        propTaxRate={propTaxRate}
        setPropTaxRate={setPropTaxRate}
        navigateTo={navigateTo}
      />
      {}
      <SubmarketCompareModal
        subNames={compareModalOpen ? compareSubs : null}
        closeModal={() => setCompareModalOpen(false)}
        layerW={layerW}
        opMode={opMode}
        subFactorW={subFactorW}
        leasesPerMo={leasesPerMo}
        preLeasedUC={preLeasedUC}
        stabThresh={stabThresh}
        removeSub={(name) => {
          toggleCompareSub(name);
          if (compareSubs.length <= 2) setCompareModalOpen(false);
        }}
        setSelectedSubModal={setSelectedSubModal}
        mortgageRate={mortgageRate}
        downPct={downPct}
        propTaxRate={propTaxRate}
      />
      {}
      {compareSubs.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 16, right: 16, zIndex: 1100,
          background: T.bgDark, color: T.txLt, borderRadius: T.radius,
          boxShadow: '0 8px 24px rgba(9, 14, 65, 0.35)',
          padding: '10px 14px', fontFamily: T.fontFamily,
          display: 'flex', alignItems: 'center', gap: 12, maxWidth: 540,
        }}>
          <div>
            <div style={{ fontSize: 9.5, color: T.accent, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700 }}>
              Comparison · {compareSubs.length} of 3
            </div>
            <div style={{ fontSize: 11, color: T.txLt, marginTop: 3, opacity: 0.9 }}>
              {compareSubs.join(' · ')}
            </div>
          </div>
          <button
            onClick={() => setCompareModalOpen(true)}
            disabled={compareSubs.length < 2}
            title={compareSubs.length < 2 ? 'Add at least 2 submarkets to compare' : 'Open comparison view'}
            style={{
              padding: '6px 12px', fontSize: 11, fontWeight: 700,
              background: compareSubs.length >= 2 ? T.accent : T.bgDark2,
              color: compareSubs.length >= 2 ? T.bgDark : T.tx3,
              border: 'none', borderRadius: T.radius,
              cursor: compareSubs.length >= 2 ? 'pointer' : 'not-allowed',
              fontFamily: T.fontFamily,
            }}
          >Open Comparison</button>
          <button
            onClick={clearCompareSubs}
            title="Clear all"
            style={{
              padding: '6px 10px', fontSize: 11, fontWeight: 700,
              background: 'transparent', color: T.accent,
              border: `1px solid ${T.accent}`, borderRadius: T.radius,
              cursor: 'pointer', fontFamily: T.fontFamily,
            }}
          >Clear</button>
        </div>
      )}
      <div style={{
        maxWidth: 1400, margin: '0 auto', padding: '16px 24px 32px',
        borderTop: `1px solid ${T.bd}`, marginTop: 32,
        fontSize: 11, color: T.tx3, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>Atlas Austin Dashboard v1 · Built for Dylan's internal screening use</div>
        <div>{PROPS.length} properties · {ZIPS.length} zips · {SUBS.length} submarkets · {SALES.total} transactions</div>
      </div>
    </div>
  );
}
