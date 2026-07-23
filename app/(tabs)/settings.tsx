/**
 * Settings — switch Nano's model on demand.
 *
 * Reads the current model and available options from the relay's
 * GET /phone/model, and applies a switch via POST /phone/set-model
 * (host-side `ncl groups config update` + restart — un-gated as owner).
 *
 * Reuses SecureStore settings from My Browser (browser_relay_url /
 * browser_relay_token). React-19 safe: no defaultProps anywhere.
 */
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';

// ─── Constants ──────────────────────────────────────────────────────────────

const STORE_URL_KEY = 'browser_relay_url';
const STORE_TOKEN_KEY = 'browser_relay_token';

interface ModelOption {
  id: string;
  label: string;
}

interface ModelInfo {
  current: string;
  currentLabel: string;
  options: ModelOption[];
}

type ScreenState =
  | { phase: 'loading' }
  | { phase: 'unconfigured' }
  | { phase: 'error'; message: string }
  | { phase: 'data'; info: ModelInfo };

// ─── Fetch ──────────────────────────────────────────────────────────────────

async function readCreds(): Promise<{ url: string; token: string } | null> {
  const [url, token] = await Promise.all([
    SecureStore.getItemAsync(STORE_URL_KEY),
    SecureStore.getItemAsync(STORE_TOKEN_KEY),
  ]);
  if (!url || !token) return null;
  return { url, token };
}

async function loadModel(): Promise<ScreenState> {
  const creds = await readCreds();
  if (!creds) return { phase: 'unconfigured' };

  const res = await fetch(`${creds.url}/phone/model`, {
    headers: { Authorization: `Bearer ${creds.token}` },
  });
  if (res.status === 404) {
    return { phase: 'error', message: 'Relay is running an older build without model support. Redeploy the relay.' };
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const info: ModelInfo = await res.json();
  return { phase: 'data', info };
}

// ─── Main screen ────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const [state, setState] = useState<ScreenState>({ phase: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      setState(await loadModel());
    } catch (e: unknown) {
      setState({ phase: 'error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      if (manual) setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const applySwitch = useCallback(
    async (opt: ModelOption) => {
      const creds = await readCreds();
      if (!creds) {
        setNotice({ kind: 'err', text: 'Relay not configured.' });
        return;
      }
      setSwitching(opt.id);
      setNotice(null);
      try {
        const res = await fetch(`${creds.url}/phone/set-model`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${creds.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: opt.id }),
        });
        const data = await res.json().catch(() => ({}));

        if (res.status === 409 && data.gated) {
          setNotice({ kind: 'warn', text: `Host CLI gated the switch (needs a direct DB write). Nano still on the old model.` });
        } else if (res.ok && data.changed === false) {
          setNotice({ kind: 'ok', text: `Already on ${opt.label}.` });
        } else if (res.ok && data.ok) {
          setNotice({ kind: 'ok', text: `Switched to ${opt.label}. Nano is restarting — back in ~30s.` });
        } else {
          setNotice({ kind: 'err', text: data.error || `Switch failed (HTTP ${res.status}).` });
        }
      } catch (e: unknown) {
        setNotice({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
      } finally {
        setSwitching(null);
        // Refresh current model after a beat so the UI reflects the new state.
        setTimeout(() => load(), 1500);
      }
    },
    [load],
  );

  const confirmSwitch = useCallback(
    (opt: ModelOption, current: string) => {
      if (opt.id === current) return;
      Alert.alert(
        `Switch Nano to ${opt.label}?`,
        'This changes Nano’s model and restarts it. Nano will be offline for ~30 seconds.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: `Switch to ${opt.label}`, style: 'destructive', onPress: () => applySwitch(opt) },
        ],
      );
    },
    [applySwitch],
  );

  return (
    <SafeAreaView style={s.container}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#00d4ff" />
        }
      >
        {state.phase === 'loading' && (
          <View style={s.centreState}>
            <ActivityIndicator color="#00d4ff" />
          </View>
        )}

        {state.phase === 'unconfigured' && (
          <View style={s.centreState}>
            <Text style={s.stateTitle}>Relay not configured</Text>
            <Text style={s.stateBody}>
              Open the Browser tab, tap the ⚙ gear icon, and set your relay URL and token.
            </Text>
          </View>
        )}

        {state.phase === 'error' && (
          <View style={s.centreState}>
            <Text style={s.errorTitle}>Couldn't load model</Text>
            <Text style={s.errorBody}>{state.message}</Text>
          </View>
        )}

        {state.phase === 'data' && (
          <>
            {notice && (
              <View
                style={[
                  s.notice,
                  notice.kind === 'ok' && s.noticeOk,
                  notice.kind === 'warn' && s.noticeWarn,
                  notice.kind === 'err' && s.noticeErr,
                ]}
              >
                <Text style={s.noticeText}>{notice.text}</Text>
              </View>
            )}

            <Text style={s.sectionTitle}>NANO MODEL</Text>
            <View style={s.card}>
              {state.info.options.map((opt, i) => {
                const isCurrent = opt.id === state.info.current;
                const isBusy = switching === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    activeOpacity={isCurrent ? 1 : 0.6}
                    disabled={isCurrent || switching !== null}
                    onPress={() => confirmSwitch(opt, state.info.current)}
                    style={[s.optRow, i > 0 && s.optRowBorder]}
                  >
                    <View style={s.optLeft}>
                      <View style={[s.radio, isCurrent && s.radioOn]}>
                        {isCurrent && <View style={s.radioDot} />}
                      </View>
                      <Text style={[s.optLabel, isCurrent && s.optLabelCurrent]}>{opt.label}</Text>
                    </View>
                    {isBusy ? (
                      <ActivityIndicator color="#00d4ff" size="small" />
                    ) : isCurrent ? (
                      <Text style={s.currentTag}>CURRENT</Text>
                    ) : (
                      <Text style={s.chevron}>›</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={s.footnote}>
              Switching restarts Nano (~30s offline). Model changes apply immediately on the
              next turn. Pull down to refresh.
            </Text>
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

  centreState: { paddingTop: 80, paddingHorizontal: 36, alignItems: 'center' },
  stateTitle: { color: '#ccc', fontSize: 17, fontWeight: '600', marginBottom: 10, textAlign: 'center' },
  stateBody: { color: '#555', fontSize: 14, textAlign: 'center', lineHeight: 21 },
  errorTitle: { color: '#ff4444', fontSize: 16, fontWeight: '600', marginBottom: 8, textAlign: 'center' },
  errorBody: { color: '#666', fontSize: 13, textAlign: 'center' },

  notice: {
    marginHorizontal: 12,
    marginTop: 16,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  noticeOk: { backgroundColor: 'rgba(92,226,142,0.10)', borderColor: 'rgba(92,226,142,0.35)' },
  noticeWarn: { backgroundColor: 'rgba(240,177,66,0.10)', borderColor: 'rgba(240,177,66,0.35)' },
  noticeErr: { backgroundColor: 'rgba(255,68,68,0.10)', borderColor: 'rgba(255,68,68,0.35)' },
  noticeText: { color: '#ddd', fontSize: 13, lineHeight: 19 },

  sectionTitle: {
    color: '#444',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 6,
  },

  card: {
    backgroundColor: '#111',
    borderRadius: 12,
    marginHorizontal: 12,
    borderWidth: 1,
    borderColor: '#1e1e1e',
    overflow: 'hidden',
  },

  optRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  optRowBorder: { borderTopWidth: 1, borderTopColor: '#1a1a1a' },
  optLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: '#00d4ff' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#00d4ff' },
  optLabel: { color: '#aaa', fontSize: 16 },
  optLabelCurrent: { color: '#fff', fontWeight: '600' },
  currentTag: { color: '#00d4ff', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  chevron: { color: '#444', fontSize: 22, fontWeight: '300' },

  footnote: {
    color: '#444',
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 18,
    paddingTop: 18,
  },
});
