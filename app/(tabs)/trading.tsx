import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function TradingScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconWrapper}>
          <Ionicons name="bar-chart" size={56} color="#00d4ff" />
        </View>
        <Text style={styles.title}>Trading Dashboard</Text>
        <Text style={styles.subtitle}>Coming soon</Text>
        <Text style={styles.description}>
          Live P&amp;L, open positions, and trade history will appear here once the IG Markets integration is live.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  card: {
    backgroundColor: '#111',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderColor: '#1e1e1e',
    width: '100%',
    maxWidth: 360,
  },
  iconWrapper: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#003d55',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: {
    color: '#e8e8e8',
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    color: '#00d4ff',
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  description: {
    color: '#555',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 4,
  },
});
