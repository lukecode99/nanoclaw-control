import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type TaskStatus = 'queued' | 'in-progress' | 'completed';

type Task = {
  id: string;
  title: string;
  agent: string;
  status: TaskStatus;
  phase: string;
  started: string;
};

const MOCK_TASKS: Task[] = [
  {
    id: '1',
    title: 'Build NanoClaw Control iOS app Phase 1',
    agent: 'worker',
    status: 'in-progress',
    phase: 'Creating Expo project',
    started: '12:49 PM',
  },
  {
    id: '2',
    title: 'Fetch IG daily P&L summary',
    agent: 'ig-bot',
    status: 'completed',
    phase: 'Done',
    started: '09:00 AM',
  },
  {
    id: '3',
    title: 'Monitor open EPC leads',
    agent: 'worker',
    status: 'queued',
    phase: 'Pending',
    started: '—',
  },
];

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bg: string; icon: string }> = {
  queued: { label: 'Queued', color: '#888', bg: '#222', icon: 'time-outline' },
  'in-progress': { label: 'In Progress', color: '#00d4ff', bg: '#003d55', icon: 'sync-outline' },
  completed: { label: 'Completed', color: '#00cc88', bg: '#003322', icon: 'checkmark-circle-outline' },
};

export default function QueueScreen() {
  const renderTask = ({ item }: { item: Task }) => {
    const statusCfg = STATUS_CONFIG[item.status];
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.taskTitle} numberOfLines={2}>{item.title}</Text>
          <View style={[styles.badge, { backgroundColor: statusCfg.bg }]}>
            <Ionicons name={statusCfg.icon as any} size={12} color={statusCfg.color} />
            <Text style={[styles.badgeText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
          </View>
        </View>
        <View style={styles.cardMeta}>
          <View style={styles.metaItem}>
            <Ionicons name="person-outline" size={13} color="#555" />
            <Text style={styles.metaText}>{item.agent}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="git-branch-outline" size={13} color="#555" />
            <Text style={styles.metaText}>{item.phase}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={13} color="#555" />
            <Text style={styles.metaText}>{item.started}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={MOCK_TASKS}
        keyExtractor={item => item.id}
        renderItem={renderTask}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Text style={styles.sectionHeader}>Active Tasks ({MOCK_TASKS.length})</Text>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  list: { padding: 16, gap: 12 },
  sectionHeader: {
    color: '#555',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#111',
    borderRadius: 14,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#1e1e1e',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  taskTitle: {
    flex: 1,
    color: '#e8e8e8',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
  cardMeta: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { color: '#555', fontSize: 12 },
});
