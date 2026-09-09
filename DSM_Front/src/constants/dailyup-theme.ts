import type { TextStyle } from 'react-native';

export type ThemeMode = 'dark' | 'light';

export type DailyupPalette = {
  background: string;
  border: string;
  danger: string;
  gold: string;
  lime: string;
  limeTint: string;
  muted: string;
  overlay: string;
  statusBar: string;
  success: string;
  surface: string;
  surfaceRaised: string;
  text: string;
  textOnLime: string;
};

export const dailyupColors: Record<ThemeMode, DailyupPalette> = {
  dark: {
    background: '#090D15',
    border: '#293139',
    danger: '#FF4D5F',
    gold: '#F6B73C',
    lime: '#9BEA47',
    limeTint: '#1E3A0F',
    muted: '#8A9099',
    overlay: 'rgba(0, 0, 0, 0.64)',
    statusBar: '#17171D',
    success: '#27AE60',
    surface: '#172127',
    surfaceRaised: '#1D262C',
    text: '#F4F5F7',
    textOnLime: '#122006',
  },
  light: {
    background: '#F5F7F8',
    border: '#DCE1E5',
    danger: '#D9364A',
    gold: '#C78615',
    lime: '#74C72C',
    limeTint: '#E7F7D7',
    muted: '#69717A',
    overlay: 'rgba(10, 18, 24, 0.45)',
    statusBar: '#F1F3F5',
    success: '#27AE60',
    surface: '#FFFFFF',
    surfaceRaised: '#EEF1F3',
    text: '#111820',
    textOnLime: '#102004',
  },
};

export const dailyupFonts = {
  regular: 'sans-serif',
  medium: 'sans-serif-medium',
  semiBold: 'sans-serif-medium',
  bold: 'sans-serif-medium',
  extraBold: 'sans-serif-black',
} as const satisfies Record<string, NonNullable<TextStyle['fontFamily']>>;

export const dailyupSpacing = {
  one: 4,
  two: 8,
  three: 12,
  four: 16,
  five: 20,
  six: 24,
  seven: 28,
  eight: 32,
} as const;

export const dailyupRadius = {
  small: 10,
  medium: 14,
  large: 18,
  sheet: 24,
  round: 999,
} as const;

export const dailyupMotion = {
  fast: 160,
  normal: 220,
  toast: 2400,
} as const;

export const SHOWCASE_BACKGROUND = '#07060B';
export const APP_WIDTH = 360;
export const APP_HEIGHT = 720;
