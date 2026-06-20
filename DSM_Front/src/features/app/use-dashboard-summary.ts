import { useQuery } from '@tanstack/react-query';

import { getMyRanking } from '@/features/rankings/rankings.api';
import { getScoreSummary } from '@/features/scores/scores.api';
import { getMe } from '@/features/users/users.api';

export function useDashboardSummary() {
  const me = useQuery({ queryKey: ['me'], queryFn: getMe });
  const scoreSummary = useQuery({
    queryKey: ['scores', 'summary'],
    queryFn: getScoreSummary,
  });
  const totalRanking = useQuery({
    queryKey: ['rankings', 'me', 'TOTAL'],
    queryFn: () => getMyRanking('TOTAL'),
  });

  return { me, scoreSummary, totalRanking };
}
