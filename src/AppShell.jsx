import React, { useEffect, useState, useCallback } from 'react';
import { Plus, X, MapPin, Lock, ChevronDown } from 'lucide-react';
import Dashboard, { hydrate } from './Dashboard.jsx';
import {
  getAllMarkets,
  getActiveMarketId,
  setActiveMarketId,
  addUserMarket,
  removeUserMarket,
  loadMarketData,
} from './markets/index.js';

// Mirror of the dashboard's navy Atlas palette so the chrome matches the content.
const C = {
  navy: '#090E41',
  navy2: '#0F176D',
  ink: '#FFFFFF',
  accent: '#AFCBFF',
  accent2: '#7BA9FF',
  dim: '#8B92A8',
  amberBg: '#FDF4E3',
  amberTx: '#8B5A1A',
  amberBd: '#EED9A8',
  font: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif',
};

const AUTH_TODO_KEY = 'atlas.authReminderDismissed.v1';

export default function AppShell() {
  const [markets, setMarkets] = useState(() => getAllMarkets());
  const [activeId, setActiveId] = useState(() => getActiveMarketId());
  const [loadedId, setLoadedId] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [authDismissed, setAuthDismissed] = useState(
    () => {
      try { return localStorage.getItem(AUTH_TODO_KEY) === '1'; } catch { return false; }
    }
  );

  // Guard against a market id that no longer exists (e.g. removed).
  useEffect(() => {
    if (!markets.some((m) => m.id === activeId)) {
      const fallback = markets[0]?.id;
      if (fallback) setActiveId(fallback);
    }
  }, [markets, activeId]);

  // Lazy-load + hydrate the active market before rendering the dashboard.
  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    setLoadedId(null);
    loadMarketData(activeId)
      .then((data) => {
        if (cancelled) return;
        hydrate(data);
        setActiveMarketId(activeId);
        setLoadedId(activeId);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load market data:', err);
        setLoadError(err?.message || String(err));
      });
    return () => { cancelled = true; };
  }, [activeId]);

  const handleAdd = useCallback(() => {
    const name = window.prompt(
      'Name the new market (e.g. "Dallas, TX").\n\nIt starts as a blank dashboard with the same layout but no data. ' +
      'To populate it, add a JSON data file later (see src/markets/index.js).'
    );
    if (!name || !name.trim()) return;
    const entry = addUserMarket(name.trim());
    setMarkets(getAllMarkets());
    setActiveId(entry.id);
  }, []);

  const handleRemove = useCallback((e, id) => {
    e.stopPropagation();
    if (!window.confirm('Remove this market from the switcher? (Built-in data files are not deleted.)')) return;
    removeUserMarket(id);
    const next = getAllMarkets();
    setMarkets(next);
    if (activeId === id) setActiveId(next[0]?.id);
  }, [activeId]);

  const dismissAuth = useCallback(() => {
    try { localStorage.setItem(AUTH_TODO_KEY, '1'); } catch { /* ignore */ }
    setAuthDismissed(true);
  }, []);

  return (
    <div style={{ fontFamily: C.font, minHeight: '100vh', background: '#EDF0F8' }}>
      {/* ── Market switcher bar ───────────────────────────────────────────── */}
      <div
        style={{
          background: C.navy,
          color: C.ink,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '0 24px',
          height: 52,
          position: 'sticky',
          top: 0,
          zIndex: 1000,
          boxShadow: '0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, letterSpacing: 0.4, fontSize: 14 }}>
          <MapPin size={16} color={C.accent} />
          ATLAS&nbsp;<span style={{ color: C.accent, fontWeight: 600 }}>Market Dashboard</span>
        </div>

        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.14)' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', flex: 1 }}>
          {markets.map((m) => {
            const active = m.id === activeId;
            return (
              <button
                key={m.id}
                onClick={() => setActiveId(m.id)}
                title={m.builtin ? 'Built-in market' : 'Blank market (no data yet)'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  border: 'none',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  padding: '6px 12px',
                  borderRadius: 4,
                  fontSize: 13,
                  fontWeight: active ? 700 : 500,
                  background: active ? C.accent : 'rgba(255,255,255,0.08)',
                  color: active ? C.navy : C.ink,
                  transition: 'background 0.12s',
                }}
              >
                {m.name}
                {!m.builtin && (
                  <span style={{ fontSize: 10, opacity: 0.7, fontWeight: 600 }}>· blank</span>
                )}
                {!m.builtin && (
                  <span
                    role="button"
                    aria-label="Remove market"
                    onClick={(e) => handleRemove(e, m.id)}
                    style={{ display: 'inline-flex', marginLeft: 2, opacity: 0.7 }}
                  >
                    <X size={13} />
                  </span>
                )}
              </button>
            );
          })}

          <button
            onClick={handleAdd}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              border: '1px dashed rgba(255,255,255,0.35)',
              background: 'transparent',
              color: C.accent,
              cursor: 'pointer',
              padding: '5px 12px',
              borderRadius: 4,
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            <Plus size={14} /> Add market
          </button>
        </div>
      </div>

      {/* ── Deferred password-protection reminder ─────────────────────────── */}
      {!authDismissed && (
        <div
          style={{
            background: C.amberBg,
            color: C.amberTx,
            border: `1px solid ${C.amberBd}`,
            borderLeft: 'none',
            borderRight: 'none',
            padding: '8px 24px',
            fontSize: 12.5,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Lock size={14} />
          <span style={{ flex: 1 }}>
            <strong>Reminder:</strong> password protection is <strong>not enabled yet</strong>. Anyone with the URL can
            view this dashboard. When you're ready to lock it down, see <code>TODO.md</code> for the recommended options.
          </span>
          <button
            onClick={dismissAuth}
            style={{
              border: `1px solid ${C.amberBd}`,
              background: 'transparent',
              color: C.amberTx,
              cursor: 'pointer',
              borderRadius: 4,
              padding: '3px 10px',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Active market dashboard ───────────────────────────────────────── */}
      {loadError ? (
        <div style={{ padding: 48, color: '#8B2F2F', textAlign: 'center' }}>
          Failed to load market data: {loadError}
        </div>
      ) : loadedId === activeId ? (
        // key forces a clean remount (and re-read of the freshly hydrated data)
        // whenever the market changes.
        <Dashboard key={activeId} />
      ) : (
        <div style={{ padding: 64, textAlign: 'center', color: C.dim, fontSize: 14 }}>
          Loading market…
        </div>
      )}
    </div>
  );
}
