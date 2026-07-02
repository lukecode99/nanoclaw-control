/**
 * Browser relay screen — mirrors a live browser-bot session to the iOS app.
 *
 * Requires constants/relay.ts (gitignored) with RELAY_BASE_URL and APP_TOKEN.
 *
 * NOTE: RELAY_BASE_URL must be HTTPS. The NanoClaw webhook server at
 * lukenano.duckdns.org:3000 needs an SSL proxy (nginx / Cloudflare tunnel)
 * before this will work on a real device due to iOS App Transport Security.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  GestureResponderEvent,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { APP_TOKEN, RELAY_BASE_URL } from '../../constants/relay';

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

const POLL_INTERVAL_MS = 800;
const BOTS_REFRESH_MS = 3000;

const AUTH_HEADERS: Record<string, string> = APP_TOKEN
  ? { Authorization: `Bearer ${APP_TOKEN}` }
  : {};

async function relayGet(path: string): Promise<Response> {
  return fetch(`${RELAY_BASE_URL}${path}`, { headers: AUTH_HEADERS });
}

async function relayPost(path: string, body: unknown): Promise<Response> {
  return fetch(`${RELAY_BASE_URL}${path}`, {
    method: 'POST',
    headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export default function BrowserScreen() {
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
        const res = await relayGet('/bots');
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
        const res = await relayGet(`/poll/${selectedBot}`);
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
        await relayPost(`/cmd/${selectedBot}`, cmd);
      } catch {
        // swallow — bot will catch it on next poll
      }
    },
    [selectedBot],
  );

  const handleTogglePause = () => {
    if (!botState) return;
    sendCommand({ type: botState.isPaused ? 'resume' : 'pause' });
    // Optimistic update
    setBotState(prev => prev ? { ...prev, isPaused: !prev.isPaused } : prev);
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
    <SafeAreaView style={styles.container}>
      {/* ── Bot picker ── */}
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
                <View style={[styles.botDot, bot.isPaused ? styles.dotPaused : styles.dotActive]} />
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

      {/* ── Screenshot view ── */}
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

      {/* ── URL bar + controls ── */}
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
            <Text style={[styles.pauseBtnText, botState?.isPaused && styles.pauseBtnTextActive]}>
              {botState?.isPaused ? 'Resume' : 'Pause'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },

  // Bot picker
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

  // Screenshot area
  screenView: { flex: 1, backgroundColor: '#111' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  emptyText: { color: '#555', fontSize: 14 },
  errorText: { color: '#ff4444' },
  imageTouchable: { flex: 1 },
  screenshot: { flex: 1, width: '100%', height: '100%' },

  // Controls
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
  controlRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
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
});
