import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useDashboardSummary } from '@/features/app/use-dashboard-summary';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth/auth-context';

export default function DashboardScreen() {
  const theme = useTheme();
  const { signOut } = useAuth();
  const { me, scoreSummary, totalRanking } = useDashboardSummary();
  const isLoading =
    me.isLoading || scoreSummary.isLoading || totalRanking.isLoading;
  const error = me.error ?? scoreSummary.error ?? totalRanking.error;

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.scrollContent}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <View>
            <ThemedText type="subtitle">DSM</ThemedText>
            <ThemedText themeColor="textSecondary">
              {me.data?.nickname ?? '오늘의 루틴을 준비해요'}
            </ThemedText>
          </View>
          <ThemedText type="linkPrimary" onPress={() => void signOut()}>
            Sign out
          </ThemedText>
        </View>

        {isLoading ? (
          <StatusBlock title="Loading dashboard" />
        ) : error ? (
          <StatusBlock
            title="Dashboard request failed"
            detail={error instanceof Error ? error.message : undefined}
          />
        ) : (
          <View style={styles.grid}>
            <SummaryCard
              label="Total score"
              value={String(scoreSummary.data?.totalScore ?? 0)}
            />
            <SummaryCard
              label="Tier"
              value={scoreSummary.data?.tier ?? me.data?.tier ?? '-'}
            />
            <SummaryCard
              label="Total ranking"
              value={
                totalRanking.data
                  ? `${totalRanking.data.rank} / ${totalRanking.data.totalUsers}`
                  : '-'
              }
            />
            <SummaryCard
              label="Top percentile"
              value={
                totalRanking.data
                  ? `${totalRanking.data.percentile.toFixed(2)}%`
                  : '-'
              }
            />
          </View>
        )}
      </SafeAreaView>
    </ScrollView>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="subtitle" style={styles.cardValue}>
        {value}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  card: {
    flexGrow: 1,
    flexBasis: 220,
    minHeight: 132,
    borderRadius: Spacing.two,
    padding: Spacing.four,
    justifyContent: 'space-between',
  },
  cardValue: {
    fontSize: 28,
    lineHeight: 34,
  },
  statusBlock: {
    borderRadius: Spacing.two,
    gap: Spacing.two,
    padding: Spacing.four,
  },
});
