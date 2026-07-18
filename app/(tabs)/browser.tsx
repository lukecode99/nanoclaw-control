/**
 * Browser screen — "Bots" mode mirrors IG browser-bot sessions;
 * "My Browser" mode lets Nano drive the phone's WKWebView remotely.
 *
 * Requires constants/relay.ts with RELAY_BASE_URL (Tailscale URL) and APP_TOKEN.
 * "My Browser" settings (relay URL + token) are stored in expo-secure-store
 * and editable via the gear icon.
 */
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  GestureResponderEvent,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
// Native modules loaded defensively: Metro inline-requires defers module
// evaluation to first render of this screen, so a broken native module throws
// on tab/segment tap rather than at launch (builds 6-8 hard-crashed here).
// Capture the error and surface it on-screen instead of dying.
type WebViewMessageEvent = { nativeEvent: { data: string } };
let nativeLoadError: string | null = null;
function noteLoadError(mod: string, e: unknown) {
  const msg = `${mod}: ${e instanceof Error ? e.message : String(e)}`;
  nativeLoadError = nativeLoadError ? `${nativeLoadError} | ${msg}` : msg;
}
let WebView: any = null;
let useKeepAwakeSafe: () => void = () => {};
let SecureStore: {
  getItemAsync(k: string): Promise<string | null>;
  setItemAsync(k: string, v: string): Promise<void>;
} = { getItemAsync: async () => null, setItemAsync: async () => {} };
try { WebView = require('react-native-webview').default; } catch (e) { noteLoadError('react-native-webview', e); }
try { useKeepAwakeSafe = require('expo-keep-awake').useKeepAwake; } catch (e) { noteLoadError('expo-keep-awake', e); }
try { SecureStore = require('expo-secure-store'); } catch (e) { noteLoadError('expo-secure-store', e); }

import { APP_TOKEN, RELAY_BASE_URL } from '../../constants/relay';

// ─── Types: Bots mode ──────────────────────────────────────────────────────

interface BotInfo {
  name: string;
  url: string;
  title: string;
  isPaused: boolean;
  lastSeen: number;
}

interface BotState {
  screenshot: string | null;
  url: string;
  title: string;
  isPaused: boolean;
  pageWidth: number;
  pageHeight: number;
  lastSeen: number;
}

// ─── Types: My Browser mode ────────────────────────────────────────────────

interface RelayCmd {
  id: string;
  type: string;
  url?: string;
  code?: string;
  as?: 'base64' | 'text';
}

interface LogEntry {
  id: string;
  type: string;
  ok: boolean | null;
  ts: number;
}

type BrowserStatus = 'disconnected' | 'connected' | 'serving';

type PendingCmd = {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  chunks?: Array<string | undefined>;
  total?: number;
};

// ─── Bots mode helpers ─────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 800;
const BOTS_REFRESH_MS = 3000;

const BOT_AUTH: Record<string, string> = APP_TOKEN
  ? { Authorization: `Bearer ${APP_TOKEN}` }
  : {};

async function botsGet(path: string): Promise<Response> {
  return fetch(`${RELAY_BASE_URL}${path}`, { headers: BOT_AUTH });
}

async function botsPost(path: string, body: unknown): Promise<Response> {
  return fetch(`${RELAY_BASE_URL}${path}`, {
    method: 'POST',
    headers: { ...BOT_AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ─── Bots mode content ─────────────────────────────────────────────────────

function BotsContent() {
  const [bots, setBots] = useState<BotInfo[]>([]);
  const [selectedBot, setSelectedBot] = useState<string | null>(null);
  const [botState, setBotState] = useState<BotState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const imgLayout = useRef<{ width: number; height: number } | null>(null);
  const initialLoadDone = useRef(false);

  useEffect(() => {
    const fetchBots = async () => {
      try {
        const res = await botsGet('/bots');
        if (!res.ok) return;
        const data: BotInfo[] = await res.json();
        setBots(data);
        if (!initialLoadDone.current && data.length > 0) {
          initialLoadDone.current = true;
          setSelectedBot(data[0].name);
        }
      } catch {
        // network error — stay silent, keep existing list
      }
    };
    fetchBots();
    const t = setInterval(fetchBots, BOTS_REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    if (!selectedBot) {
      setBotState(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const poll = async () => {
      try {
        const res = await botsGet(`/poll/${selectedBot}`);
        if (res.ok) {
          const data: BotState = await res.json();
          setBotState(data);
          setError(null);
        } else if (res.status === 404) {
          setBotState(null);
          setError('Bot not connected');
        }
      } catch {
        setError('Connection error');
      } finally {
        setLoading(false);
      }
    };

    poll();
    pollTimerRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [selectedBot]);

  const sendCommand = useCallback(
    async (cmd: { type: string; x?: number; y?: number }) => {
      if (!selectedBot) return;
      try {
        await botsPost(`/cmd/${selectedBot}`, cmd);
      } catch {
        // swallow
      }
    },
    [selectedBot],
  );

  const handleTogglePause = () => {
    if (!botState) return;
    sendCommand({ type: botState.isPaused ? 'resume' : 'pause' });
    setBotState(prev => (prev ? { ...prev, isPaused: !prev.isPaused } : prev));
  };

  const handleImageTap = (e: GestureResponderEvent) => {
    if (!botState || !imgLayout.current) return;
    const { locationX, locationY } = e.nativeEvent;
    sendCommand({
      type: 'tap',
      x: locationX / imgLayout.current.width,
      y: locationY / imgLayout.current.height,
    });
  };

  const screenshotUri = botState?.screenshot
    ? `data:image/png;base64,${botState.screenshot}`
    : null;

  return (
    <>
      <View style={styles.pickerBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pickerList}
        >
          {bots.length === 0 ? (
            <Text style={styles.noBotsText}>No browser bots connected</Text>
          ) : (
            bots.map(bot => (
              <TouchableOpacity
                key={bot.name}
                style={[styles.botChip, selectedBot === bot.name && styles.botChipActive]}
                onPress={() => setSelectedBot(bot.name)}
                activeOpacity={0.7}
              >
                <View
                  style={[styles.botDot, bot.isPaused ? styles.dotPaused : styles.dotActive]}
                />
                <Text
                  style={[
                    styles.botChipText,
                    selectedBot === bot.name && styles.botChipTextActive,
                  ]}
                >
                  {bot.name}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </View>

      <View style={styles.screenView}>
        {!selectedBot ? (
          <View style={styles.emptyState}>
            <Ionicons name="globe-outline" size={48} color="#333" />
            <Text style={styles.emptyText}>Select a bot above</Text>
          </View>
        ) : loading && !botState ? (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color="#00d4ff" />
            <Text style={styles.emptyText}>Connecting to {selectedBot}…</Text>
          </View>
        ) : error ? (
          <View style={styles.emptyState}>
            <Ionicons name="warning-outline" size={48} color="#ff4444" />
            <Text style={[styles.emptyText, styles.errorText]}>{error}</Text>
          </View>
        ) : screenshotUri ? (
          <TouchableOpacity
            activeOpacity={0.95}
            onPress={handleImageTap}
            style={styles.imageTouchable}
          >
            <Image
              source={{ uri: screenshotUri }}
              style={styles.screenshot}
              resizeMode="contain"
              onLayout={e => {
                imgLayout.current = {
                  width: e.nativeEvent.layout.width,
                  height: e.nativeEvent.layout.height,
                };
              }}
            />
          </TouchableOpacity>
        ) : (
          <View style={styles.emptyState}>
            <ActivityIndicator size="small" color="#555" />
            <Text style={styles.emptyText}>Waiting for screenshot…</Text>
          </View>
        )}
      </View>

      <View style={styles.controlBar}>
        <View style={styles.urlRow}>
          <Ionicons name="globe-outline" size={13} color="#555" />
          <Text style={styles.urlText} numberOfLines={1}>
            {botState?.url || '—'}
          </Text>
        </View>
        <View style={styles.controlRow}>
          <Text style={styles.titleText} numberOfLines={1}>
            {botState?.title ?? ''}
          </Text>
          <TouchableOpacity
            style={[styles.pauseBtn, botState?.isPaused && styles.pauseBtnActive]}
            onPress={handleTogglePause}
            disabled={!selectedBot || !botState}
            activeOpacity={0.7}
          >
            <Ionicons
              name={botState?.isPaused ? 'play' : 'pause'}
              size={14}
              color={botState?.isPaused ? '#0a0a0a' : '#00d4ff'}
            />
            <Text
              style={[styles.pauseBtnText, botState?.isPaused && styles.pauseBtnTextActive]}
            >
              {botState?.isPaused ? 'Resume' : 'Pause'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
}

// ─── My Browser mode ───────────────────────────────────────────────────────

const CHUNK_SIZE = 1_400_000;
const STORE_URL_KEY = 'browser_relay_url';
const STORE_TOKEN_KEY = 'browser_relay_token';

function buildInjection(id: string, asyncExpression: string): string {
  // Wraps an async expression in a runner that posts chunked results back via postMessage.
  return `(async()=>{
  const __id=${JSON.stringify(id)};
  const __cs=${CHUNK_SIZE};
  function __post(ok,data,err){
    const s=ok?String(data==null?'':data):'';
    if(ok&&s.length>__cs){
      const tot=Math.ceil(s.length/__cs);
      for(let i=0;i<tot;i++){
        window.ReactNativeWebView.postMessage(JSON.stringify({__nc:true,id:__id,chunk:i,total:tot,data:s.slice(i*__cs,(i+1)*__cs)}));
      }
    } else {
      window.ReactNativeWebView.postMessage(JSON.stringify({__nc:true,id:__id,ok,data:ok?s:undefined,error:err}));
    }
  }
  try{const r=await(${asyncExpression});__post(true,r,undefined);}catch(e){__post(false,undefined,String(e));}
})();true;`;
}

function fetchExpression(url: string, as: 'base64' | 'text'): string {
  if (as === 'base64') {
    return `(async()=>{
  const r=await fetch(${JSON.stringify(url)},{credentials:'include'});
  const ab=await r.arrayBuffer();
  const b=new Uint8Array(ab);
  let s='';
  for(let i=0;i<b.length;i+=8192)s+=String.fromCharCode(...b.subarray(i,Math.min(i+8192,b.length)));
  return btoa(s);
})()`;
  }
  return `(async()=>{
  const r=await fetch(${JSON.stringify(url)},{credentials:'include'});
  return await r.text();
})()`;
}

// Mounted only when the KeepAwake diagnostic is enabled, so the native call
// happens on an explicit tap rather than on segment mount.
function KeepAwakeActivator() {
  useKeepAwakeSafe();
  return null;
}

function BrowserContent({ autoDiag }: { autoDiag?: string }) {
  // ── Diagnostic bisect (build 10): nothing native mounts automatically.
  // Each suspect is behind its own button — the tap that crashes names the culprit.
  const [diagKeepAwake, setDiagKeepAwake] = useState(false);
  const [diagWebView, setDiagWebView] = useState(false);
  const [diagSecure, setDiagSecure] = useState('untested');
  // Build 12: bisect INSIDE the WebView mount — bare vs +cookie props vs full.
  const [diagWVBare, setDiagWVBare] = useState(false);
  const [diagWVProps, setDiagWVProps] = useState(false);

  // CI smoke test: deep link nanoclaw-control://browser?auto=bare|props|full
  // triggers the same diagnostics without a human tap.
  useEffect(() => {
    if (autoDiag === 'bare') setDiagWVBare(true);
    else if (autoDiag === 'props') setDiagWVProps(true);
    else if (autoDiag === 'full') setDiagWebView(true);
  }, [autoDiag]);

  // ── Settings ──────────────────────────────────────────────────────────────
  const [relayUrl, setRelayUrl] = useState(RELAY_BASE_URL);
  const [relayToken, setRelayToken] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftUrl, setDraftUrl] = useState(RELAY_BASE_URL);
  const [draftToken, setDraftToken] = useState('');

  const testSecureStore = async () => {
    try {
      const [u, t] = await Promise.all([
        SecureStore.getItemAsync(STORE_URL_KEY),
        SecureStore.getItemAsync(STORE_TOKEN_KEY),
      ]);
      if (u) { setRelayUrl(u); setDraftUrl(u); }
      if (t !== null) { setRelayToken(t); setDraftToken(t); }
      setDiagSecure('ok');
    } catch (e) {
      setDiagSecure(`ERR ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const saveSettings = async () => {
    try {
      await Promise.all([
        SecureStore.setItemAsync(STORE_URL_KEY, draftUrl.trim()),
        SecureStore.setItemAsync(STORE_TOKEN_KEY, draftToken.trim()),
      ]);
    } catch {
      // keep going — settings still apply for this session even if persist fails
    }
    setRelayUrl(draftUrl.trim());
    setRelayToken(draftToken.trim());
    setSettingsOpen(false);
  };

  // ── Phone relay helpers ───────────────────────────────────────────────────

  const phoneGet = useCallback(
    (path: string, signal?: AbortSignal) =>
      fetch(`${relayUrl}${path}`, {
        headers: relayToken ? { Authorization: `Bearer ${relayToken}` } : {},
        signal,
      }),
    [relayUrl, relayToken],
  );

  const phonePost = useCallback(
    (path: string, body: unknown) =>
      fetch(`${relayUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(relayToken ? { Authorization: `Bearer ${relayToken}` } : {}),
        },
        body: JSON.stringify(body),
      }),
    [relayUrl, relayToken],
  );

  // ── WebView state ─────────────────────────────────────────────────────────
  const webRef = useRef<any>(null);
  const [webUrl, setWebUrl] = useState('about:blank');
  const [currentUrl, setCurrentUrl] = useState('about:blank');
  const [currentTitle, setCurrentTitle] = useState('');
  // Refs mirror currentUrl/Title so executeCommand stays referentially stable —
  // if it depended on the state, every navigate would tear down the polling
  // loop mid-command and the result would never be posted back.
  const currentUrlRef = useRef('about:blank');
  const currentTitleRef = useRef('');
  const navigatePendingRef = useRef<{
    resolve: (r: unknown) => void;
    reject: (e: Error) => void;
  } | null>(null);
  const pendingCmds = useRef(new Map<string, PendingCmd>());

  const handleLoadEnd = useCallback((e: { nativeEvent: { url: string; title?: string } }) => {
    const { url, title } = e.nativeEvent;
    setCurrentUrl(url);
    setCurrentTitle(title ?? '');
    currentUrlRef.current = url;
    currentTitleRef.current = title ?? '';
    if (navigatePendingRef.current) {
      navigatePendingRef.current.resolve({ url, title: title ?? '' });
      navigatePendingRef.current = null;
    }
  }, []);

  const handleMessage = useCallback((e: WebViewMessageEvent) => {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (!msg.__nc) return;

    const id = msg.id as string;
    const pending = pendingCmds.current.get(id);
    if (!pending) return;

    if (msg.chunk !== undefined) {
      const chunk = msg.chunk as number;
      const total = msg.total as number;
      if (!pending.chunks) {
        pending.chunks = new Array(total).fill(undefined);
        pending.total = total;
      }
      pending.chunks[chunk] = msg.data as string;
      const filled = pending.chunks.filter(c => c !== undefined).length;
      if (filled === pending.total) {
        pending.resolve(pending.chunks.join(''));
        pendingCmds.current.delete(id);
      }
    } else {
      if (msg.ok) pending.resolve(msg.data);
      else pending.reject(new Error((msg.error as string) ?? 'unknown'));
      pendingCmds.current.delete(id);
    }
  }, []);

  function injectAndWait(id: string, script: string, timeoutMs = 30_000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      pendingCmds.current.set(id, { resolve, reject });
      const timer = setTimeout(() => {
        if (pendingCmds.current.has(id)) {
          pendingCmds.current.delete(id);
          reject(new Error('timeout'));
        }
      }, timeoutMs);
      // wrap resolve/reject to clear timer
      const entry = pendingCmds.current.get(id)!;
      const origResolve = entry.resolve;
      const origReject = entry.reject;
      entry.resolve = (v) => { clearTimeout(timer); origResolve(v); };
      entry.reject = (e) => { clearTimeout(timer); origReject(e); };
      webRef.current?.injectJavaScript(script);
    });
  }

  // ── Command executor ──────────────────────────────────────────────────────
  const executeCommand = useCallback(
    async (cmd: RelayCmd): Promise<{ ok: boolean; data?: unknown; error?: string }> => {
      try {
        switch (cmd.type) {
          case 'navigate': {
            const result = await new Promise<unknown>((resolve, reject) => {
              navigatePendingRef.current = { resolve, reject };
              setWebUrl(cmd.url ?? 'about:blank');
              setTimeout(() => {
                if (navigatePendingRef.current) {
                  navigatePendingRef.current = null;
                  reject(new Error('navigate timeout'));
                }
              }, 30_000);
            });
            return { ok: true, data: result };
          }

          case 'extractHtml': {
            const html = await injectAndWait(
              cmd.id,
              buildInjection(cmd.id, 'document.documentElement.outerHTML'),
            );
            return { ok: true, data: html };
          }

          case 'extractText': {
            const text = await injectAndWait(
              cmd.id,
              buildInjection(cmd.id, 'document.body.innerText'),
            );
            return { ok: true, data: text };
          }

          case 'fetch': {
            const data = await injectAndWait(
              cmd.id,
              buildInjection(cmd.id, fetchExpression(cmd.url ?? '', cmd.as ?? 'text')),
              60_000,
            );
            return { ok: true, data };
          }

          case 'evalJs': {
            const result = await injectAndWait(
              cmd.id,
              buildInjection(cmd.id, `JSON.stringify(eval(${JSON.stringify(cmd.code ?? '')}))`),
            );
            return { ok: true, data: result };
          }

          case 'status':
            return {
              ok: true,
              data: { url: currentUrlRef.current, title: currentTitleRef.current },
            };

          default:
            return { ok: false, error: `unknown type: ${cmd.type}` };
        }
      } catch (e: unknown) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    [],
  );

  // ── Polling loop ──────────────────────────────────────────────────────────
  const [status, setStatus] = useState<BrowserStatus>('disconnected');
  const [log, setLog] = useState<LogEntry[]>([]);
  const [showLog, setShowLog] = useState(false);

  const addLog = useCallback((entry: LogEntry) => {
    setLog(prev => [entry, ...prev].slice(0, 20));
  }, []);

  useEffect(() => {
    let active = true;
    const ctrl = { abort: () => {} };

    async function run() {
      // hello handshake
      try { await phonePost('/phone/hello', { deviceName: 'Luke-iPhone' }); } catch {}
      setStatus('connected');

      while (active) {
        const abortCtrl = new AbortController();
        ctrl.abort = () => abortCtrl.abort();
        try {
          const res = await phoneGet('/phone/next-cmd?wait=25', abortCtrl.signal);
          if (!active) break;
          if (res.status === 204) {
            setStatus('connected');
            continue;
          }
          if (res.ok) {
            const item: RelayCmd = await res.json();
            if (!active) break;
            setStatus('serving');
            addLog({ id: item.id, type: item.type, ok: null, ts: Date.now() });
            const result = await executeCommand(item);
            if (!active) break;
            addLog({ id: item.id, type: item.type, ok: result.ok, ts: Date.now() });
            try {
              await phonePost('/phone/result', { id: item.id, ...result });
            } catch {}
            setStatus('connected');
          }
        } catch (e: unknown) {
          if (!active) break;
          const isAbort = e instanceof Error && e.name === 'AbortError';
          if (!isAbort) {
            setStatus('disconnected');
            await new Promise(r => setTimeout(r, 3000));
            if (!active) break;
            setStatus('connected');
          }
        }
      }
      setStatus('disconnected');
    }

    run();
    return () => {
      active = false;
      ctrl.abort();
    };
  }, [relayUrl, relayToken, phoneGet, phonePost, executeCommand, addLog]);

  // ── UI ────────────────────────────────────────────────────────────────────
  const statusColor =
    status === 'serving' ? '#f0b142' : status === 'connected' ? '#5ce28e' : '#555';
  const statusLabel =
    status === 'serving' ? 'serving' : status === 'connected' ? 'connected' : 'disconnected';

  return (
    <>
      {nativeLoadError && (
        <View style={styles.nativeErrorBanner}>
          <Text style={styles.nativeErrorText}>Native module error: {nativeLoadError}</Text>
        </View>
      )}

      {/* Diagnostic bisect row — tap each; the one that crashes is the culprit */}
      <View style={styles.diagRow}>
        <TouchableOpacity style={styles.diagBtn} onPress={() => setDiagKeepAwake(true)}>
          <Text style={styles.diagBtnText}>{diagKeepAwake ? 'KeepAwake ✓' : 'Test KeepAwake'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.diagBtn} onPress={testSecureStore}>
          <Text style={styles.diagBtnText} numberOfLines={1}>Store: {diagSecure}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.diagBtn} onPress={() => setDiagWVBare(true)}>
          <Text style={styles.diagBtnText}>{diagWVBare ? 'WV bare ✓' : '1. WV bare'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.diagBtn} onPress={() => setDiagWVProps(true)}>
          <Text style={styles.diagBtnText}>{diagWVProps ? 'WV props ✓' : '2. WV props'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.diagBtn} onPress={() => setDiagWebView(true)}>
          <Text style={styles.diagBtnText}>{diagWebView ? 'WV full ✓' : '3. WV full'}</Text>
        </TouchableOpacity>
      </View>
      {diagKeepAwake && <KeepAwakeActivator />}

      {/* Stage 1: bare WKWebView, no props beyond source */}
      {WebView && diagWVBare && (
        <WebView source={{ uri: 'about:blank' }} style={styles.diagWebView} />
      )}
      {/* Stage 2: bare + the JS/cookie/gesture props, still no ref or handlers */}
      {WebView && diagWVProps && (
        <WebView
          source={{ uri: 'about:blank' }}
          style={styles.diagWebView}
          javaScriptEnabled
          domStorageEnabled
          allowsBackForwardNavigationGestures
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
        />
      )}

      {/* Status row */}
      <View style={styles.browserStatusRow}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <Text style={[styles.statusLabel, { color: statusColor }]}>{statusLabel}</Text>
        <Text style={styles.browserUrl} numberOfLines={1}>
          {currentUrl === 'about:blank' ? '' : currentUrl}
        </Text>
        <TouchableOpacity onPress={() => setShowLog(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="list-outline" size={18} color={showLog ? '#00d4ff' : '#555'} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { setDraftUrl(relayUrl); setDraftToken(relayToken); setSettingsOpen(true); }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ marginLeft: 12 }}
        >
          <Ionicons name="settings-outline" size={18} color="#555" />
        </TouchableOpacity>
      </View>

      {/* WebView */}
      {WebView && diagWebView ? (
        <WebView
          ref={webRef}
          source={{ uri: webUrl }}
          style={styles.webView}
          onLoadEnd={handleLoadEnd as never}
          onMessage={handleMessage}
          javaScriptEnabled
          domStorageEnabled
          allowsBackForwardNavigationGestures
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
        />
      ) : (
        <View style={[styles.webView, styles.emptyState]}>
          <Text style={styles.emptyText}>
            {WebView ? 'WebView not mounted — tap Test WebView above' : 'WebView unavailable'}
          </Text>
        </View>
      )}

      {/* Activity log */}
      {showLog && (
        <View style={styles.logPanel}>
          <ScrollView style={styles.logScroll}>
            {log.length === 0 ? (
              <Text style={styles.logEmpty}>No commands yet</Text>
            ) : (
              log.map(entry => (
                <View key={`${entry.id}-${entry.ts}`} style={styles.logRow}>
                  <Text
                    style={[
                      styles.logDot,
                      { color: entry.ok === null ? '#888' : entry.ok ? '#5ce28e' : '#ff4444' },
                    ]}
                  >
                    ●
                  </Text>
                  <Text style={styles.logType}>{entry.type}</Text>
                  <Text style={styles.logId}>{entry.id.slice(0, 8)}</Text>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      )}

      {/* Settings modal */}
      <Modal
        visible={settingsOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSettingsOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.settingsModal}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <SafeAreaView style={styles.settingsInner}>
            <View style={styles.settingsHeader}>
              <Text style={styles.settingsTitle}>My Browser settings</Text>
              <TouchableOpacity onPress={() => setSettingsOpen(false)}>
                <Ionicons name="close" size={22} color="#888" />
              </TouchableOpacity>
            </View>

            <Text style={styles.settingsLabel}>Relay URL</Text>
            <TextInput
              style={styles.settingsInput}
              value={draftUrl}
              onChangeText={setDraftUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="https://…/browser-relay"
              placeholderTextColor="#444"
            />

            <Text style={styles.settingsLabel}>Phone token (APP_TOKEN)</Text>
            <TextInput
              style={styles.settingsInput}
              value={draftToken}
              onChangeText={setDraftToken}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              placeholder="Bearer token for /phone/* endpoints"
              placeholderTextColor="#444"
            />

            <TouchableOpacity style={styles.saveBtn} onPress={saveSettings}>
              <Text style={styles.saveBtnText}>Save & reconnect</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

// ─── Root screen ───────────────────────────────────────────────────────────

// expo-router route-level error boundary: a render-time JS error on this screen
// shows its message here instead of hard-crashing the app in release.
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <SafeAreaView style={[styles.container, styles.errorBoundaryWrap]}>
      <Text style={styles.errorBoundaryTitle}>Browser screen error</Text>
      <ScrollView style={styles.errorBoundaryScroll}>
        <Text style={styles.errorBoundaryText}>
          {String(error?.message ?? error)}
          {'\n\n'}
          {String(error?.stack ?? '')}
        </Text>
      </ScrollView>
      <TouchableOpacity style={styles.saveBtn} onPress={retry}>
        <Text style={styles.saveBtnText}>Retry</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

type Mode = 'bots' | 'browser';

export default function BrowserScreen() {
  const [mode, setMode] = useState<Mode>('bots');
  const params = useLocalSearchParams<{ auto?: string }>();
  const autoDiag = typeof params.auto === 'string' ? params.auto : undefined;

  useEffect(() => {
    if (autoDiag) setMode('browser');
  }, [autoDiag]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Segmented toggle */}
      <View style={styles.modeToggle}>
        {(['bots', 'browser'] as const).map(m => (
          <TouchableOpacity
            key={m}
            style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
            onPress={() => setMode(m)}
            activeOpacity={0.75}
          >
            <Text style={[styles.modeBtnText, mode === m && styles.modeBtnTextActive]}>
              {m === 'bots' ? 'Bots' : 'My Browser'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {mode === 'bots' ? <BotsContent /> : <BrowserContent autoDiag={autoDiag} />}
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },

  // Mode toggle
  modeToggle: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    height: 44,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 4,
  },
  modeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  modeBtnActive: { borderColor: '#00d4ff', backgroundColor: '#001f2a' },
  modeBtnText: { color: '#555', fontSize: 14, fontWeight: '500' },
  modeBtnTextActive: { color: '#00d4ff' },

  // Bots: picker
  pickerBar: {
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    height: 48,
    justifyContent: 'center',
  },
  pickerList: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  noBotsText: { color: '#444', fontSize: 13 },
  botChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#111',
  },
  botChipActive: { borderColor: '#00d4ff', backgroundColor: '#001f2a' },
  botDot: { width: 7, height: 7, borderRadius: 3.5 },
  dotActive: { backgroundColor: '#00e676' },
  dotPaused: { backgroundColor: '#ff9800' },
  botChipText: { color: '#888', fontSize: 13, fontWeight: '500' },
  botChipTextActive: { color: '#00d4ff' },

  // Bots: screenshot area
  screenView: { flex: 1, backgroundColor: '#111' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  emptyText: { color: '#555', fontSize: 14 },
  errorText: { color: '#ff4444' },
  imageTouchable: { flex: 1 },
  screenshot: { flex: 1, width: '100%', height: '100%' },

  // Bots: controls
  controlBar: {
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 6,
  },
  urlRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  urlText: { flex: 1, color: '#555', fontSize: 12 },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleText: { flex: 1, color: '#888', fontSize: 13, marginRight: 12 },
  pauseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#00d4ff',
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  pauseBtnActive: { backgroundColor: '#00d4ff', borderColor: '#00d4ff' },
  pauseBtnText: { color: '#00d4ff', fontSize: 13, fontWeight: '600' },
  pauseBtnTextActive: { color: '#0a0a0a' },

  // My Browser
  browserStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    gap: 8,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontSize: 12, fontWeight: '500', minWidth: 76 },
  browserUrl: { flex: 1, color: '#444', fontSize: 11 },
  webView: { flex: 1 },

  // Activity log
  logPanel: {
    maxHeight: 160,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
    backgroundColor: '#080808',
  },
  logScroll: { padding: 10 },
  logEmpty: { color: '#444', fontSize: 12 },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  logDot: { fontSize: 10 },
  logType: { color: '#888', fontSize: 12, flex: 1 },
  logId: { color: '#444', fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  // Diagnostic bisect row
  diagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  diagBtn: {
    flexBasis: '30%',
    flexGrow: 1,
    borderWidth: 1,
    borderColor: '#f0b142',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  diagBtnText: { color: '#f0b142', fontSize: 11, fontWeight: '600' },
  diagWebView: { height: 44, backgroundColor: '#111' },

  // Native-load error banner + route error boundary
  nativeErrorBanner: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#2a1414',
    borderBottomWidth: 1,
    borderBottomColor: '#3a1a1a',
  },
  nativeErrorText: { color: '#ff6b6b', fontSize: 11 },
  errorBoundaryWrap: { padding: 24 },
  errorBoundaryTitle: { color: '#ff4444', fontSize: 15, fontWeight: '600', marginVertical: 12 },
  errorBoundaryScroll: { maxHeight: 320, marginBottom: 16 },
  errorBoundaryText: {
    color: '#ccc',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  // Settings modal
  settingsModal: { flex: 1, backgroundColor: '#0a0a0a' },
  settingsInner: { flex: 1, paddingHorizontal: 20 },
  settingsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 24,
  },
  settingsTitle: { color: '#ccc', fontSize: 17, fontWeight: '600' },
  settingsLabel: { color: '#888', fontSize: 13, marginBottom: 6 },
  settingsInput: {
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 8,
    padding: 12,
    color: '#ddd',
    fontSize: 14,
    backgroundColor: '#111',
    marginBottom: 20,
  },
  saveBtn: {
    backgroundColor: '#00d4ff',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnText: { color: '#0a0a0a', fontWeight: '700', fontSize: 15 },
});
