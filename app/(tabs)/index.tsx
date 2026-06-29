import React, { useState } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Message = {
  id: string;
  text: string;
  sender: 'user' | 'nano';
  time: string;
};

const MOCK_MESSAGES: Message[] = [
  {
    id: '1',
    sender: 'nano',
    text: 'Hello! I\'m Nano, your AI assistant. How can I help you today?',
    time: '12:41 PM',
  },
  {
    id: '2',
    sender: 'user',
    text: 'Can you check the latest trades on IG?',
    time: '12:42 PM',
  },
  {
    id: '3',
    sender: 'nano',
    text: 'Sure — pulling your IG positions now. I\'ll report back in a moment.',
    time: '12:42 PM',
  },
  {
    id: '4',
    sender: 'nano',
    text: 'Done. You have 3 open positions: BTCUSD (+1.2%), EURUSD (-0.3%), and AAPL (+0.8%). Total P&L today: +£142.',
    time: '12:43 PM',
  },
];

export default function ChatScreen() {
  const [messages, setMessages] = useState<Message[]>(MOCK_MESSAGES);
  const [input, setInput] = useState('');

  const sendMessage = () => {
    if (!input.trim()) return;
    const newMsg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: input.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages(prev => [...prev, newMsg]);
    setInput('');
  };

  const renderItem = ({ item }: { item: Message }) => (
    <View style={[styles.bubble, item.sender === 'user' ? styles.userBubble : styles.nanoBubble]}>
      {item.sender === 'nano' && (
        <Text style={styles.senderLabel}>Nano</Text>
      )}
      <Text style={styles.messageText}>{item.text}</Text>
      <Text style={styles.timeText}>{item.time}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={88}
      >
        <FlatList
          data={messages}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.messageList}
        />
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
          />
          <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}>
            <Ionicons name="arrow-up-circle" size={36} color="#00d4ff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  flex: { flex: 1 },
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
