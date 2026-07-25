export type TaskDifficulty = '낮음' | '보통' | '높음';
export type TaskCategory = '건강' | '학업' | '생활';
export type PrototypeScreenState = 'normal' | 'loading' | 'empty' | 'error' | 'offline';
export type RankingPeriod = '일간' | '주간' | '누적';

export type PrototypeTask = {
  id: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  category: TaskCategory;
  difficulty: TaskDifficulty;
  completed: boolean;
  notificationEnabled: boolean;
  shouldFailOnce?: boolean;
};

export type RankingEntry = {
  rank: number;
  nickname: string;
  tier: 'MASTER' | 'DIAMOND' | 'GOLD' | 'SILVER';
  score: number;
  avatarColor: string;
};

export const HOME_DATE = '2026년 7월 19일 일요일';

export const tutorialPages = [
  {
    id: 'tasks',
    title: '일과 등록과 완료',
    description: '오늘 할 일을 등록하고\n하나씩 완료해 보세요.',
    icon: 'check-circle' as const,
  },
  {
    id: 'score',
    title: '난이도와 일일 점수 상한',
    description: '난이도에 따라 점수를 얻고\n하루 최대 900점까지 쌓을 수 있어요.',
    icon: 'chart-bar' as const,
  },
  {
    id: 'ranking',
    title: '랭킹과 6단계 티어',
    description: '꾸준히 점수를 쌓아\n더 높은 티어에 도전해 보세요.',
    icon: 'trophy' as const,
  },
] as const;

export const initialTasks: PrototypeTask[] = [
  {
    id: 'task-1',
    title: '아침 운동',
    description: '가볍게 스트레칭하고 30분 달리기',
    startTime: '07:00',
    endTime: '08:00',
    category: '건강',
    difficulty: '낮음',
    completed: true,
    notificationEnabled: true,
  },
  {
    id: 'task-2',
    title: '수학 과제',
    description: '수학 문제집 4단원 마무리',
    startTime: '09:00',
    endTime: '11:00',
    category: '학업',
    difficulty: '높음',
    completed: false,
    notificationEnabled: true,
  },
  {
    id: 'task-3',
    title: '영어 단어 복습',
    description: '이번 주 단어 50개 복습',
    startTime: '13:00',
    endTime: '14:00',
    category: '학업',
    difficulty: '보통',
    completed: false,
    notificationEnabled: false,
    shouldFailOnce: true,
  },
];

export const rankingData: Record<RankingPeriod, RankingEntry[]> = {
  일간: [
    { rank: 1, nickname: '민준', tier: 'MASTER', score: 890, avatarColor: '#E59645' },
    { rank: 2, nickname: '서연', tier: 'DIAMOND', score: 845, avatarColor: '#5E8FD7' },
    { rank: 3, nickname: '도윤', tier: 'DIAMOND', score: 810, avatarColor: '#8D6FD1' },
    { rank: 4, nickname: '하은', tier: 'GOLD', score: 790, avatarColor: '#D66A80' },
    { rank: 5, nickname: '시우', tier: 'GOLD', score: 755, avatarColor: '#4FA88B' },
  ],
  주간: [
    { rank: 1, nickname: '서연', tier: 'MASTER', score: 5840, avatarColor: '#5E8FD7' },
    { rank: 2, nickname: '민준', tier: 'MASTER', score: 5670, avatarColor: '#E59645' },
    { rank: 3, nickname: '하은', tier: 'DIAMOND', score: 5410, avatarColor: '#D66A80' },
    { rank: 4, nickname: '도윤', tier: 'DIAMOND', score: 5220, avatarColor: '#8D6FD1' },
    { rank: 5, nickname: '시우', tier: 'GOLD', score: 4980, avatarColor: '#4FA88B' },
  ],
  누적: [
    { rank: 1, nickname: '민준', tier: 'MASTER', score: 68450, avatarColor: '#E59645' },
    { rank: 2, nickname: '하은', tier: 'MASTER', score: 63120, avatarColor: '#D66A80' },
    { rank: 3, nickname: '서연', tier: 'DIAMOND', score: 58940, avatarColor: '#5E8FD7' },
    { rank: 4, nickname: '도윤', tier: 'DIAMOND', score: 52780, avatarColor: '#8D6FD1' },
    { rank: 5, nickname: '시우', tier: 'GOLD', score: 46300, avatarColor: '#4FA88B' },
  ],
};

export const myRankingByPeriod: Record<
  RankingPeriod,
  { rank: number; percentile: number; score: number }
> = {
  일간: { rank: 12, percentile: 32, score: 100 },
  주간: { rank: 9, percentile: 24, score: 730 },
  누적: { rank: 18, percentile: 41, score: 12450 },
};
