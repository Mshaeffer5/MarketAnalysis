// Market registry — DATA-DRIVEN.
//
// Adding a real market needs NO code changes here. You only touch the data folder:
//   1. Drop  src/markets/data/<id>.json  (same shape as austin.json; validate with
//      `npm run validate-market -- src/markets/data/<id>.json`).
//   2. Add a line to  src/markets/data/manifest.json:
//        { "id": "<id>", "name": "Charlotte, NC" }
// import.meta.glob auto-discovers every JSON in data/, so the new market's loader
// exists automatically and is lazy-loaded (its own chunk).

import manifest from './data/manifest.json';

const dataLoaders = import.meta.glob(['./data/*.json', '!./data/manifest.json']);

function loaderForPath(path) {
  const fn = dataLoaders[path];
  if (!fn) throw new Error(`No data file found at ${path}`);
  return fn(); // call the dynamic import to get a Promise
}

export const BUILTIN_MARKETS = manifest.map((m) => ({
  id: m.id,
  name: m.name,
  loader: () => loaderForPath(`./data/${m.id}.json`),
}));

export const blankLoader = () => loaderForPath('./data/_blank.json');

const LS_MARKETS = 'atlas.userMarkets.v1';
const LS_ACTIVE = 'atlas.activeMarket.v1';

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function getUserMarkets() {
  const list = readJSON(LS_MARKETS, []);
  return Array.isArray(list) ? list : [];
}

export function addUserMarket(name) {
  const list = getUserMarkets();
  const base = (name || 'market').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'market';
  let id = base;
  let n = 2;
  const taken = new Set([...BUILTIN_MARKETS.map((m) => m.id), ...list.map((m) => m.id)]);
  while (taken.has(id)) id = `${base}-${n++}`;
  const entry = { id, name: name || 'New Market' };
  list.push(entry);
  try { localStorage.setItem(LS_MARKETS, JSON.stringify(list)); } catch { /* ignore */ }
  return entry;
}

export function removeUserMarket(id) {
  const list = getUserMarkets().filter((m) => m.id !== id);
  try { localStorage.setItem(LS_MARKETS, JSON.stringify(list)); } catch { /* ignore */ }
}

export function getActiveMarketId() {
  return readJSON(LS_ACTIVE, null) || BUILTIN_MARKETS[0].id;
}

export function setActiveMarketId(id) {
  try { localStorage.setItem(LS_ACTIVE, JSON.stringify(id)); } catch { /* ignore */ }
}

export function getAllMarkets() {
  return [
    ...BUILTIN_MARKETS.map((m) => ({ id: m.id, name: m.name, builtin: true })),
    ...getUserMarkets().map((m) => ({ id: m.id, name: m.name, builtin: false })),
  ];
}

export async function loadMarketData(id) {
  const builtin = BUILTIN_MARKETS.find((m) => m.id === id);
  const mod = builtin ? await builtin.loader() : await blankLoader();
  return mod.default ?? mod;
}
