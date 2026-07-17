/**
 * Trading dashboard — live P&L, engine status, and positions
 * from the relay server's /phone/trading-feed endpoint.
 *
 * Reuses SecureStore settings from My Browser (browser_relay_url / browser_relay_token).
 * Pull-to-refresh, auto-refresh every 30 s while focused + foregrounded.
 */
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  AppState,
  AppStateStatus,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';

// ─── Types ─────────────────────────────────────────────────────────────────

type VixRegime = 'calm' | 'normal' | 'elevated' | 'high';
type EngineStatus = 'live' | 'stale' | 'inferred-active' | 'no-heartbeat';

interface Sleeve {
  key: string;
  market: string;
  type: string;
  inPosition: boolean;
  action: string;
}

interface Position {
  name: string;
  epic: string;
  direction: string;
  size: number | null;
  openLevel: number | null;
  currentLevel: number | null;
  pl: number | null;
}

interface Feed {
  v: number;
  generatedAt: string;
  market: { vix: number | null; vixRegime: VixRegime };
  engine: {
    status: EngineStatus;
    runDate: string | null;
    expectedRunDate: string | null;
    dryRun: boolean;
    entriesBlocked: boolean;
    sleeves: Sleeve[];
  };
  account: {
    equity: number | null;
    cash: number | null;
    openPl: number | null;
    dayStartEquity: number | null;
    dayPl: number | null;
  };
  positions: Position[];
  system: {
    consecutiveFails: number | null;
    tickIntervalMin: number | null;
    tickHours: string | null;
  };
}

type ScreenState =
  | { phase: 'loading' }
  | { phase: 'unconfigured' }
  | { phase: 'unavailable' }
  | { phase: 'error'; message: string }
  | { phase: 'data'; feed: Feed };

// ─── Constants ──────────────────────────────────────────────────────────────

const STORE_URL_KEY = 'browser_relay_url';
const STORE_TOKEN_KEY = 'browser_relay_token';
const STALE_MS = 15 * 60 * 1000;
const REFRESH_MS = 30_000;

// ─── Formatting helpers ─────────────────────────────────────────────────────

function dec(v: number | null | undefined, dp = 2): string {
  if (v === null || v === undefined) return '—';
  return v.toFixed(dp);
}

function gbp(v: number): string {
  const abs = Math.abs(v);
  const s = abs.toFixed(2);
  const [int, frac] = s.split('.');
  return `£${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${ frac }`;
}

function signedGbp(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return `${v >= 0 ? '+' : '−'}${gbp(v)}`;
}

function plainGbp(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return gbp(v);
}

function plColor(v: number | null | undefined): string {
  if (v === null || v === undefined) return '#888';
  return v >= 0 ? '#5ce28e' : '#ff4444';
}

function engineColor(s: EngineStatus): string {
  if (s === 'live') return '#5ce28e';
  if (s === 'stale' || s === 'inferred-active') return '#f0b142';
  return '#555';
}

function vixRegimeColor(r: VixRegime): string {
  if (r === 'high') return '#ff4444';
  if (r === 'elevated') return '#f0b142';
  if (r === 'calm') return '#5ce28e';
  return '#888';
}

function sleeveDotColor(s: Sleeve): string {
  if (s.inPosition) return '#5ce28e';
  if (s.action && s.action !== 'no_signal') return '#00d4ff';
  return '#333';
}

function hhMM(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function checkStale(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() > STALE_MS;
}

// ─── Fetch ──────────────────────────────────────────────────────────────────

async function loadFeed(): Promise<ScreenState> {
  const [url, token] = await Promise.all([
    SecureStore.getItemAsync(STORE_URL_KEY),
    SecureStore.getItemAsync(STORE_TOKEN_KEY),
  ]);

  if (!url || !token) return { phase: 'unconfigured' };

  const res = await fetch(`${url}/phone/trading-feed`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 404) return { phase: 'unavailable' };
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data: Feed = await res.json();
  return { phase: 'data', feed: data };
}

// ─── UI components (no defaultProps — React 19 safe) ──────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={s.card}>{children}</View>;
}

function DataRow({
  label,
  children,
  border = true,
}: {
  label: string;
  children: React.ReactNode;
  border?: boolean;
}) {
  return (
    <View style={[s.row, border && s.rowBorder]}>
      <Text style={s.rowLabel}>{label}</Text>
      <View style={s.rowRight}>{children}</View>
    </View>
  );
}

function SystemSection({ engine }: { engine: Feed['engine'] }) {
  const color = engineColor(engine.status);
  return (
    <>
      <SectionHeader title="System" />
      <Card>
        {/* Engine status */}
        <View style={s.row}>
          <Text style={s.rowLabel}>Engine</Text>
          <View style={[s.statusPill, { borderColor: color }]}>
            <View style={[s.statusDot, { backgroundColor: color }]} />
            <Text style={[s.statusPillText, { color }]}>{engine.status}</Text>
          </View>
        </View>

        {/* Last run date */}
        {engine.runDate != null && (
          <DataRow label="Last run">
            <Text style={s.rowValue}>{engine.runDate}</Text>
          </DataRow>
        )}

        {/* Dry-run badge */}
        {engine.dryRun && (
          <View style={[s.row, s.rowBorder]}>
            <View style={s.badgeAmber}>
              <Text style={s.badgeText}>DRY RUN</Text>
            </View>
            <Text style={s.badgeNote}>Orders are simulated — not live</Text>
          </View>
        )}

        {/* Entries blocked warning */}
        {engine.entriesBlocked && (
          <View style={[s.row, s.rowBorder]}>
            <View style={s.badgeRed}>
              <Text style={s.badgeText}>ENTRIES BLOCKED</Text>
            </View>
            <Text style={s.badgeNote}>No new positions being opened</Text>
          </View>
        )}

        {/* Per-sleeve rows */}
        {engine.sleeves.length > 0 && (
          <View style={s.sleevesBlock}>
            {engine.sleeves.map((sleeve, i) => (
              <View
                key={sleeve.key}
                style={[s.sleeveRow, i < engine.sleeves.length - 1 && s.sleeveRowBorder]}
              >
                <View style={[s.sleeveDot, { backgroundColor: sleeveDotColor(sleeve) }]} />
                <Text style={s.sleeveMarket}>{sleeve.market}</Text>
                <Text style={s.sleeveType}>{sleeve.type}</Text>
                <Text style={s.sleeveStatus}>
                  {sleeve.inPosition
                    ? 'in position'
                    : sleeve.action && sleeve.action !== 'no_signal'
                    ? sleeve.action
                    : 'idle'}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Card>
    </>
  );
}

function MarketSection({ market }: { market: Feed['market'] }) {
  const regimeColor = vixRegimeColor(market.vixRegime);
  return (
    <>
      <SectionHeader title="Market" />
      <Card>
        <View style={s.vixBlock}>
          <Text style={s.vixNumber}>{dec(market.vix, 1)}</Text>
          <View>
            <Text style={s.vixLabel}>VIX</Text>
            <Text style={[s.vixRegimeText, { color: regimeColor }]}>{market.vixRegime}</Text>
          </View>
        </View>
      </Card>
    </>
  );
}

function AccountSection({ account }: { account: Feed['account'] }) {
  return (
    <>
      <SectionHeader title="Account" />
      <Card>
        <View style={s.equityBlock}>
          <Text style={s.equityLabel}>Equity</Text>
          <Text style={s.equityValue}>
            {account.equity !== null && account.equity !== undefined
              ? plainGbp(account.equity)
              : '—'}
          </Text>
          {account.dayPl !== null && account.dayPl !== undefined ? (
            <Text style={[s.dayPlValue, { color: plColor(account.dayPl) }]}>
              {signedGbp(account.dayPl)}
              <Text style={s.dayPlSuffix}> today</Text>
            </Text>
          ) : (
            <Text style={s.dayPlValue}>—</Text>
          )}
        </View>

        <DataRow label="Cash">
          <Text style={s.rowValue}>{plainGbp(account.cash)}</Text>
        </DataRow>
        <DataRow label="Open P/L" border>
          <Text style={[s.rowValue, { color: plColor(account.openPl) }]}>
            {signedGbp(account.openPl)}
          </Text>
        </DataRow>
      </Card>
    </>
  );
}

function PositionsSection({ positions }: { positions: Position[] }) {
  return (
    <>
      <SectionHeader title="Positions" />
      <Card>
        {positions.length === 0 ? (
          <Text style={s.emptyPositions}>No open positions</Text>
        ) : (
          positions.map((p, i) => (
            <View
              key={`${p.epic ?? 'pos'}-${i}`}
              style={[s.posRow, i > 0 && s.rowBorder]}
            >
              <View style={s.posTop}>
                <Text style={s.posName}>{p.name}</Text>
                <Text style={[s.posPl, { color: plColor(p.pl) }]}>
                  {signedGbp(p.pl)}
                </Text>
              </View>
              <View style={s.posMeta}>
                <Text
                  style={[
                    s.posDir,
                    { color: p.direction === 'BUY' ? '#5ce28e' : '#ff4444' },
                  ]}
                >
                  {p.direction === 'BUY' ? '↑ BUY' : '↓ SELL'}
                </Text>
                <Text style={s.posDetail}>
                  {dec(p.size, 2)} @ {dec(p.openLevel)} → {dec(p.currentLevel)}
                </Text>
              </View>
            </View>
          ))
        )}
      </Card>
    </>
  );
}

// ─── Main screen ────────────────────────────────────────────────────────────

export default function TradingScreen() {
  const [state, setState] = useState<ScreenState>({ phase: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (manual = false) => {
    if (AppState.currentState !== 'active' && !manual) return;
    if (manual) setRefreshing(true);
    try {
      const next = await loadFeed();
      setState(next);
    } catch (e: unknown) {
      setState({ phase: 'error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      if (manual) setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(() => load(), REFRESH_MS);
      const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
        if (next === 'active') load();
      });
      return () => {
        clearInterval(timer);
        sub.remove();
      };
    }, [load]),
  );

  const stale = state.phase === 'data' && checkStale(state.feed.generatedAt);

  return (
    <SafeAreaView style={s.container}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor="#00d4ff"
          />
        }
      >
        {/* ── Loading ── */}
        {state.phase === 'loading' && (
          <View style={s.centreState}>
            <Text style={s.dimText}>Loading…</Text>
          </View>
        )}

        {/* ── Unconfigured ── */}
        {state.phase === 'unconfigured' && (
          <View style={s.centreState}>
            <Text style={s.stateTitle}>Relay not configured</Text>
            <Text style={s.stateBody}>
              Open the Browser tab, tap the ⚙ gear icon, and set your relay URL and token.
            </Text>
          </View>
        )}

        {/* ── Feed not yet available ── */}
        {state.phase === 'unavailable' && (
          <View style={s.centreState}>
            <Text style={s.stateTitle}>Feed not available yet</Text>
            <Text style={s.stateBody}>
              The trading feed isn't ready. It updates every 5 min, Mon–Fri 07:00–21:55 UK time.
            </Text>
          </View>
        )}

        {/* ── Error ── */}
        {state.phase === 'error' && (
          <View style={s.centreState}>
            <Text style={s.errorTitle}>Connection error</Text>
            <Text style={s.errorBody}>{state.message}</Text>
          </View>
        )}

        {/* ── Dashboard ── */}
        {state.phase === 'data' && (
          <>
            {stale && (
              <View style={s.staleBanner}>
                <Text style={s.staleBannerText}>
                  Feed is stale — last updated at {hhMM(state.feed.generatedAt)}.
                  {'\n'}Feed updates every 5 min, 07:00–21:55 UK Mon–Fri.
                </Text>
              </View>
            )}

            <SystemSection engine={state.feed.engine} />
            <MarketSection market={state.feed.market} />
            <AccountSection account={state.feed.account} />
            <PositionsSection positions={state.feed.positions} />

            <View style={s.footer}>
              <Text style={s.footerUpdated}>Updated {hhMM(state.feed.generatedAt)}</Text>
              <Text style={s.footerNote}>Feed updates every 5 min, 07:00–21:55 UK Mon–Fri</Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40 },

  // Empty / loading states
  centreState: { paddingTop: 80, paddingHorizontal: 36, alignItems: 'center' },
  dimText: { color: '#555', fontSize: 14 },
  stateTitle: { color: '#ccc', fontSize: 17, fontWeight: '600', marginBottom: 10, textAlign: 'center' },
  stateBody: { color: '#555', fontSize: 14, textAlign: 'center', lineHeight: 21 },
  errorTitle: { color: '#ff4444', fontSize: 16, fontWeight: '600', marginBottom: 8, textAlign: 'center' },
  errorBody: { color: '#666', fontSize: 13, textAlign: 'center' },

  // Stale banner
  staleBanner: {
    backgroundColor: 'rgba(240,177,66,0.10)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,177,66,0.25)',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  staleBannerText: { color: '#f0b142', fontSize: 12, lineHeight: 18 },

  // Section header
  sectionHeader: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 6 },
  sectionTitle: {
    color: '#444',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // Card
  card: {
    backgroundColor: '#111',
    borderRadius: 12,
    marginHorizontal: 12,
    borderWidth: 1,
    borderColor: '#1e1e1e',
    overflow: 'hidden',
  },

  // Generic row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: '#1a1a1a' },
  rowLabel: { color: '#666', fontSize: 14 },
  rowRight: { alignItems: 'flex-end' },
  rowValue: { color: '#ccc', fontSize: 14 },

  // Engine status pill
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 6,
  },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  statusPillText: { fontSize: 12, fontWeight: '600' },

  // Badges (dryRun / entriesBlocked)
  badgeAmber: {
    backgroundColor: 'rgba(240,177,66,0.14)',
    borderWidth: 1,
    borderColor: '#f0b142',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeRed: {
    backgroundColor: 'rgba(255,68,68,0.14)',
    borderWidth: 1,
    borderColor: '#ff4444',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 10, fontWeight: '700', color: '#ddd', letterSpacing: 0.5 },
  badgeNote: { color: '#555', fontSize: 12, flex: 1, marginLeft: 10 },

  // Sleeves
  sleevesBlock: { borderTopWidth: 1, borderTopColor: '#1a1a1a' },
  sleeveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  sleeveRowBorder: { borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  sleeveDot: { width: 8, height: 8, borderRadius: 4 },
  sleeveMarket: { color: '#ccc', fontSize: 13, fontWeight: '500', minWidth: 60 },
  sleeveType: { color: '#555', fontSize: 13, flex: 1 },
  sleeveStatus: { color: '#444', fontSize: 12 },

  // VIX
  vixBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 20,
    gap: 16,
  },
  vixNumber: { color: '#fff', fontSize: 44, fontWeight: '700', lineHeight: 50 },
  vixLabel: { color: '#444', fontSize: 12 },
  vixRegimeText: { fontSize: 16, fontWeight: '600', textTransform: 'capitalize', marginTop: 2 },

  // Account
  equityBlock: {
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  equityLabel: { color: '#555', fontSize: 12, marginBottom: 4 },
  equityValue: { color: '#fff', fontSize: 32, fontWeight: '700' },
  dayPlValue: { fontSize: 17, fontWeight: '600', marginTop: 6 },
  dayPlSuffix: { fontWeight: '400', color: '#555', fontSize: 14 },

  // Positions
  emptyPositions: { color: '#444', fontSize: 14, padding: 16 },
  posRow: { paddingHorizontal: 14, paddingVertical: 12 },
  posTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  posName: { color: '#ccc', fontSize: 14, fontWeight: '500' },
  posPl: { fontSize: 14, fontWeight: '600' },
  posMeta: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  posDir: { fontSize: 12, fontWeight: '700' },
  posDetail: { color: '#444', fontSize: 12 },

  // Footer
  footer: { alignItems: 'center', paddingTop: 24, paddingBottom: 8, gap: 4 },
  footerUpdated: { color: '#444', fontSize: 12 },
  footerNote: { color: '#333', fontSize: 11 },
});
