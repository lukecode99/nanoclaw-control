import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const WORKER_URL = 'https://nano-worker.nanoluke521.workers.dev';
const POLL_INTERVAL = 4000;

type Message = {
  id: string;
  sender: 'user' | 'nano';
  content: string;
  timestamp: string;
};

export default function ChatScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const lastTimestampRef = useRef<string | null>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`${WORKER_URL}/messages`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { messages: Message[] };
      const msgs = data.messages || [];
      setMessages(msgs);
      if (msgs.length > 0) {
        lastTimestampRef.current = msgs[msgs.length - 1].timestamp;
      }
      setError(null);
    } catch (err) {
      setError('Could not load messages. Retrying…');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;

    setInput('');
    setSending(true);

    // Optimistic update
    const optimisticId = `optimistic-${Date.now()}`;
    const optimistic: Message = {
      id: optimisticId,
      sender: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);

    try {
      const res = await fetch(`${WORKER_URL}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Refresh messages to get server-confirmed version
      await fetchMessages();
    } catch (err) {
      // Remove optimistic message on failure
      setMessages(prev => prev.filter(m => m.id !== optimisticId));
      setError('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const renderItem = ({ item }: { item: Message }) => (
    <View style={[styles.bubble, item.sender === 'user' ? styles.userBubble : styles.nanoBubble]}>
      {item.sender === 'nano' && (
        <Text style={styles.senderLabel}>Nano</Text>
      )}
      <Text style={styles.messageText}>{item.content}</Text>
      <Text style={styles.timeText}>{formatTime(item.timestamp)}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={88}
      >
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#00d4ff" />
            <Text style={styles.loadingText}>Connecting to Nano…</Text>
          </View>
        ) : (
          <>
            {error && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={item => item.id}
              renderItem={renderItem}
              contentContainerStyle={styles.messageList}
              ListEmptyComponent={
                <View style={styles.centered}>
                  <Text style={styles.emptyText}>No messages yet. Say hello to Nano!</Text>
                </View>
              }
            />
          </>
        )}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Message Nano…"
            placeholderTextColor="#555"
            returnKeyType="send"
            onSubmitEditing={sendMessage}
            multiline
            editable={!sending}
          />
          <TouchableOpacity style={styles.sendBtn} onPress={sendMessage} disabled={sending}>
            {sending ? (
              <ActivityIndicator size="small" color="#00d4ff" />
            ) : (
              <Ionicons name="arrow-up-circle" size={36} color="#00d4ff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { color: '#555', marginTop: 12, fontSize: 14 },
  emptyText: { color: '#555', fontSize: 14, textAlign: 'center' },
  errorBanner: {
    backgroundColor: '#2a0a0a',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#5a1a1a',
  },
  errorText: { color: '#ff6b6b', fontSize: 13 },
  messageList: { padding: 16, gap: 12 },
  bubble: {
    maxWidth: '80%',
    borderRadius: 16,
    padding: 12,
    gap: 4,
  },
  nanoBubble: {
    backgroundColor: '#1a1a2e',
    alignSelf: 'flex-start',
    borderTopLeftRadius: 4,
  },
  userBubble: {
    backgroundColor: '#003d55',
    alignSelf: 'flex-end',
    borderTopRightRadius: 4,
  },
  senderLabel: {
    color: '#00d4ff',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  messageText: { color: '#e8e8e8', fontSize: 15, lineHeight: 21 },
  timeText: { color: '#555', fontSize: 11, alignSelf: 'flex-end' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
    backgroundColor: '#0a0a0a',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 15,
    maxHeight: 120,
  },
  sendBtn: { paddingBottom: 2 },
});
