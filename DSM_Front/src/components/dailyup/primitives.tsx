import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, {
  type ComponentProps,
  type PropsWithChildren,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  type TextProps,
  type TextStyle,
  useWindowDimensions,
  View,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  APP_HEIGHT,
  APP_WIDTH,
  dailyupColors,
  dailyupFonts,
  dailyupMotion,
  dailyupRadius,
  dailyupSpacing,
  SHOWCASE_BACKGROUND,
  type DailyupPalette,
} from '@/constants/dailyup-theme';
import { usePrototype } from '@/features/prototype/prototype-context';

export type DailyupIconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

type AppTextVariant =
  | 'body'
  | 'button'
  | 'caption'
  | 'label'
  | 'metric'
  | 'muted'
  | 'screenTitle'
  | 'sectionTitle';

type AppTextProps = TextProps & {
  color?: string;
  variant?: AppTextVariant;
};

const textVariants = StyleSheet.create<Record<AppTextVariant, TextStyle>>({
  body: {
    fontFamily: dailyupFonts.regular,
    fontSize: 14,
    lineHeight: 21,
  },
  button: {
    fontFamily: dailyupFonts.bold,
    fontSize: 14,
    lineHeight: 20,
  },
  caption: {
    fontFamily: dailyupFonts.medium,
    fontSize: 11,
    lineHeight: 16,
  },
  label: {
    fontFamily: dailyupFonts.semiBold,
    fontSize: 12,
    lineHeight: 18,
  },
  metric: {
    fontFamily: dailyupFonts.extraBold,
    fontSize: 28,
    lineHeight: 34,
  },
  muted: {
    fontFamily: dailyupFonts.regular,
    fontSize: 13,
    lineHeight: 19,
  },
  screenTitle: {
    fontFamily: dailyupFonts.bold,
    fontSize: 20,
    lineHeight: 28,
  },
  sectionTitle: {
    fontFamily: dailyupFonts.bold,
    fontSize: 15,
    lineHeight: 22,
  },
});

export function useDailyupPalette(): DailyupPalette {
  const { theme } = usePrototype();
  return dailyupColors[theme];
}

export function AppText({
  color,
  style,
  variant = 'body',
  ...props
}: AppTextProps) {
  const palette = useDailyupPalette();
  return (
    <Text
      {...props}
      style={[textVariants[variant], { color: color ?? palette.text }, style]}
    />
  );
}

export function Icon({
  color,
  name,
  size = 20,
}: {
  color?: string;
  name: DailyupIconName;
  size?: number;
}) {
  const palette = useDailyupPalette();
  return <MaterialCommunityIcons color={color ?? palette.text} name={name} size={size} />;
}

export function SurfaceCard({
  children,
  style,
  ...props
}: PropsWithChildren<ViewProps>) {
  const palette = useDailyupPalette();
  return (
    <View
      {...props}
      style={[
        styles.surfaceCard,
        { backgroundColor: palette.surface, borderColor: palette.border },
        style,
      ]}>
      {children}
    </View>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

type AppButtonProps = PropsWithChildren<{
  accessibilityLabel?: string;
  disabled?: boolean;
  icon?: DailyupIconName;
  onPress: () => void;
  style?: ViewStyle;
  variant?: ButtonVariant;
}>;

export function AppButton({
  accessibilityLabel,
  children,
  disabled = false,
  icon,
  onPress,
  style,
  variant = 'primary',
}: AppButtonProps) {
  const palette = useDailyupPalette();
  const colors = {
    danger: {
      background: 'transparent',
      border: palette.danger,
      foreground: palette.danger,
    },
    ghost: {
      background: 'transparent',
      border: 'transparent',
      foreground: palette.muted,
    },
    primary: {
      background: palette.lime,
      border: palette.lime,
      foreground: palette.textOnLime,
    },
    secondary: {
      background: palette.surfaceRaised,
      border: palette.border,
      foreground: palette.text,
    },
  }[variant];

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: colors.background,
          borderColor: colors.border,
          opacity: disabled ? 0.38 : pressed ? 0.72 : 1,
        },
        style,
      ]}>
      {icon ? <Icon color={colors.foreground} name={icon} size={18} /> : null}
      <AppText color={colors.foreground} variant="button">
        {children}
      </AppText>
    </Pressable>
  );
}

export function IconButton({
  accessibilityLabel,
  disabled = false,
  name,
  onPress,
  size = 20,
  style,
}: {
  accessibilityLabel: string;
  disabled?: boolean;
  name: DailyupIconName;
  onPress: () => void;
  size?: number;
  style?: ViewStyle;
}) {
  const palette = useDailyupPalette();
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        {
          backgroundColor: palette.surface,
          borderColor: palette.border,
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        },
        style,
      ]}>
      <Icon color={palette.text} name={name} size={size} />
    </Pressable>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: PropsWithChildren<{ tone?: 'gold' | 'lime' | 'neutral' }>) {
  const palette = useDailyupPalette();
  const badgeColors = {
    gold: { background: palette.gold, foreground: palette.textOnLime },
    lime: { background: `${palette.lime}20`, foreground: palette.lime },
    neutral: { background: palette.surfaceRaised, foreground: palette.muted },
  }[tone];

  return (
    <View style={[styles.badge, { backgroundColor: badgeColors.background }]}>
      <AppText color={badgeColors.foreground} style={styles.badgeText} variant="caption">
        {children}
      </AppText>
    </View>
  );
}

export function AppToggle({
  accessibilityLabel,
  onValueChange,
  value,
}: {
  accessibilityLabel: string;
  onValueChange: (value: boolean) => void;
  value: boolean;
}) {
  const palette = useDailyupPalette();
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => onValueChange(!value)}
      style={[
        styles.toggle,
        { backgroundColor: value ? palette.lime : palette.surfaceRaised },
      ]}>
      <View
        style={[
          styles.toggleThumb,
          {
            backgroundColor: value ? palette.textOnLime : palette.muted,
            transform: [{ translateX: value ? 15 : 0 }],
          },
        ]}
      />
    </Pressable>
  );
}

export function ScreenHeader({
  action,
  eyebrow,
  title,
}: {
  action?: React.ReactNode;
  eyebrow?: string;
  title: string;
}) {
  const palette = useDailyupPalette();
  return (
    <View style={styles.screenHeader}>
      <View style={styles.headerCopy}>
        {eyebrow ? (
          <AppText color={palette.muted} variant="caption">
            {eyebrow}
          </AppText>
        ) : null}
        <AppText variant="screenTitle">{title}</AppText>
      </View>
      {action}
    </View>
  );
}

function FakeAndroidStatusBar() {
  const palette = useDailyupPalette();
  return (
    <View style={[styles.fakeStatus, { backgroundColor: palette.statusBar }]}>
      <AppText style={styles.fakeTime} variant="caption">
        9:30
      </AppText>
      <View style={styles.statusIcons}>
        <Icon color={palette.text} name="wifi" size={13} />
        <Icon color={palette.text} name="signal" size={13} />
        <Icon color={palette.text} name="battery" size={14} />
      </View>
    </View>
  );
}

function GlobalToast() {
  const { toastMessage } = usePrototype();
  const palette = useDailyupPalette();
  const translateY = useRef(new Animated.Value(12)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        duration: dailyupMotion.fast,
        toValue: toastMessage ? 1 : 0,
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(translateY, {
        duration: dailyupMotion.fast,
        toValue: toastMessage ? 0 : 12,
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start();
  }, [opacity, toastMessage, translateY]);

  if (!toastMessage) {
    return null;
  }

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={[
        styles.toast,
        {
          backgroundColor: palette.text,
          opacity,
          transform: [{ translateY }],
        },
      ]}>
      <AppText color={palette.background} style={styles.toastText} variant="label">
        {toastMessage}
      </AppText>
    </Animated.View>
  );
}

function DeviceContent({ children }: PropsWithChildren) {
  const palette = useDailyupPalette();
  return (
    <View style={[styles.deviceContent, { backgroundColor: palette.background }]}>
      {Platform.OS === 'web' ? <FakeAndroidStatusBar /> : null}
      <SafeAreaView edges={Platform.OS === 'web' ? [] : ['top']} style={styles.safeContent}>
        {children}
      </SafeAreaView>
      <GlobalToast />
    </View>
  );
}

export function PrototypeFrame({ children }: PropsWithChildren) {
  const { height, width } = useWindowDimensions();
  const showDevice = Platform.OS === 'web' && width >= 700 && height >= 500;
  const scale = useMemo(() => Math.min(1.14, (width - 80) / APP_WIDTH), [width]);

  if (!showDevice) {
    return <DeviceContent>{children}</DeviceContent>;
  }

  const scaledWidth = APP_WIDTH * scale;
  const scaledHeight = APP_HEIGHT * scale;

  return (
    <View style={styles.showcase}>
      <AppText color="#77757E" style={styles.showcaseCaption} variant="caption">
        데일리업 · Phase 1 프로토타입
      </AppText>
      <View style={{ height: scaledHeight, marginTop: 76, width: scaledWidth }}>
        <View
          style={[
            styles.deviceFrame,
            {
              height: APP_HEIGHT,
              left: (scaledWidth - APP_WIDTH) / 2,
              top: (scaledHeight - APP_HEIGHT) / 2,
              transform: [{ scale }],
              width: APP_WIDTH,
            },
          ]}>
          <DeviceContent>{children}</DeviceContent>
        </View>
      </View>
    </View>
  );
}

export function Divider() {
  const palette = useDailyupPalette();
  return <View style={[styles.divider, { backgroundColor: palette.border }]} />;
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: dailyupRadius.round,
    minHeight: 22,
    justifyContent: 'center',
    paddingHorizontal: 9,
  },
  badgeText: {
    fontFamily: dailyupFonts.bold,
  },
  button: {
    alignItems: 'center',
    borderRadius: dailyupRadius.medium,
    borderWidth: 1,
    flexDirection: 'row',
    gap: dailyupSpacing.two,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: dailyupSpacing.four,
  },
  deviceContent: {
    flex: 1,
    overflow: 'hidden',
  },
  deviceFrame: {
    borderColor: '#4A4A50',
    borderRadius: 14,
    borderWidth: 5,
    overflow: 'hidden',
    position: 'absolute',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  fakeStatus: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 42,
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  fakeTime: {
    fontFamily: dailyupFonts.bold,
    fontSize: 10,
  },
  headerCopy: {
    flex: 1,
    gap: 3,
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: dailyupRadius.round,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  safeContent: {
    flex: 1,
  },
  screenHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 58,
  },
  showcase: {
    alignItems: 'center',
    backgroundColor: SHOWCASE_BACKGROUND,
    flex: 1,
    justifyContent: 'flex-start',
    minHeight: 500,
    minWidth: 700,
    overflow: 'hidden',
    width: '100%',
  },
  showcaseCaption: {
    left: 0,
    letterSpacing: 0.2,
    position: 'absolute',
    right: 0,
    textAlign: 'center',
    top: 44,
  },
  statusIcons: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
  },
  surfaceCard: {
    borderRadius: dailyupRadius.large,
    borderWidth: 1,
  },
  toast: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: dailyupRadius.medium,
    bottom: 82,
    elevation: 8,
    maxWidth: 314,
    minHeight: 42,
    paddingHorizontal: dailyupSpacing.four,
    position: 'absolute',
    zIndex: 50,
  },
  toastText: {
    textAlign: 'center',
  },
  toggle: {
    borderRadius: dailyupRadius.round,
    height: 23,
    justifyContent: 'center',
    padding: 3,
    width: 38,
  },
  toggleThumb: {
    borderRadius: dailyupRadius.round,
    height: 17,
    width: 17,
  },
});
