import { useQuery } from '@tanstack/react-query';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { getTasksByDate, type Task } from '@/features/tasks/tasks.api';
import { useTheme } from '@/hooks/use-theme';

function getTodayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function TasksScreen() {
  const theme = useTheme();
  const today = getTodayDateKey();
  const tasks = useQuery({
    queryKey: ['tasks', today],
    queryFn: () => getTasksByDate(today),
  });

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.scrollContent}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText type="subtitle">Tasks</ThemedText>
          <ThemedText themeColor="textSecondary">{today}</ThemedText>
        </View>

        {tasks.isLoading ? (
          <StatusBlock title="Loading tasks" />
        ) : tasks.error ? (
          <StatusBlock
            title="Task request failed"
            detail={
              tasks.error instanceof Error ? tasks.error.message : undefined
            }
          />
        ) : tasks.data?.length ? (
          <View style={styles.list}>
            {tasks.data.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </View>
        ) : (
          <StatusBlock title="No tasks for today" />
        )}
      </SafeAreaView>
    </ScrollView>
  );
}

function TaskRow({ task }: { task: Task }) {
  return (
    <ThemedView type="backgroundElement" style={styles.row}>
      <View style={styles.rowBody}>
        <ThemedText type="smallBold">{task.title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {task.difficulty} · {task.status}
        </ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {new Date(task.startAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </ThemedText>
    </ThemedView>
  );
}

function StatusBlock({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}) {
  return (
    <ThemedView type="backgroundElement" style={styles.statusBlock}>
      <ThemedText type="smallBold">{title}</ThemedText>
      {detail ? (
        <ThemedText type="small" themeColor="textSecondary">
          {detail}
        </ThemedText>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
  },
  safeArea: {
    width: '100%',
    maxWidth: MaxContentWidth,
    padding: Spacing.four,
    gap: Spacing.four,
  },
  header: {
    gap: Spacing.two,
  },
  list: {
    gap: Spacing.two,
  },
  row: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  rowBody: {
    flex: 1,
    gap: Spacing.one,
  },
  statusBlock: {
    borderRadius: Spacing.two,
    gap: Spacing.two,
    padding: Spacing.four,
  },
});
