import { useQuery } from '@tanstack/react-query';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import {
  getLeaderboard,
  type LeaderboardEntry,
} from '@/features/rankings/rankings.api';
import { useTheme } from '@/hooks/use-theme';

export default function RankingsScreen() {
  const theme = useTheme();
  const leaderboard = useQuery({
    queryKey: ['rankings', 'leaderboard', 'TOTAL', 100],
    queryFn: () => getLeaderboard('TOTAL', 100),
  });

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.scrollContent}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText type="subtitle">Rankings</ThemedText>
          <ThemedText themeColor="textSecondary">TOTAL TOP 100</ThemedText>
        </View>

        {leaderboard.isLoading ? (
          <StatusBlock title="Loading leaderboard" />
        ) : leaderboard.error ? (
          <StatusBlock
            title="Leaderboard request failed"
            detail={
              leaderboard.error instanceof Error
                ? leaderboard.error.message
                : undefined
            }
          />
        ) : leaderboard.data?.length ? (
          <View style={styles.list}>
            {leaderboard.data.map((entry) => (
              <RankingRow key={entry.userId} entry={entry} />
            ))}
          </View>
        ) : (
          <StatusBlock title="No ranking entries yet" />
        )}
      </SafeAreaView>
    </ScrollView>
  );
}

function RankingRow({ entry }: { entry: LeaderboardEntry }) {
  return (
    <ThemedView type="backgroundElement" style={styles.row}>
      <View style={styles.rankBadge}>
        <ThemedText type="smallBold">#{entry.rank}</ThemedText>
      </View>
      <View style={styles.rowBody}>
        <ThemedText type="smallBold">
          {entry.nickname ?? 'Unnamed user'}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {entry.score} points
        </ThemedText>
      </View>
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
    alignItems: 'center',
    gap: Spacing.three,
  },
  rankBadge: {
    width: 56,
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
