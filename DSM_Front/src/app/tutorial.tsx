import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AppButton,
  AppText,
  PrototypeFrame,
  useDailyupPalette,
} from '@/components/dailyup/primitives';
import {
  APP_WIDTH,
  dailyupRadius,
  dailyupSpacing,
} from '@/constants/dailyup-theme';
import { tutorialPages } from '@/features/prototype/prototype-data';

export default function TutorialScreen() {
  const router = useRouter();
  const palette = useDailyupPalette();
  const { width } = useWindowDimensions();
  const isDesktopShowcase = Platform.OS === 'web' && width >= 700;
  const pageWidth = isDesktopShowcase ? APP_WIDTH : width;
  const scrollRef = useRef<ScrollView>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const lastIndex = tutorialPages.length - 1;

  const finish = () => router.replace('/(tabs)');

  const next = () => {
    if (pageIndex === lastIndex) {
      finish();
      return;
    }
    const nextIndex = pageIndex + 1;
    scrollRef.current?.scrollTo({ animated: true, x: nextIndex * pageWidth });
    setPageIndex(nextIndex);
  };

  const onMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPageIndex(Math.round(event.nativeEvent.contentOffset.x / pageWidth));
  };

  return (
    <PrototypeFrame>
      <SafeAreaView
        edges={Platform.OS === 'web' ? [] : ['top', 'bottom']}
        style={[styles.safeArea, { backgroundColor: palette.background }]}>
        <ScrollView
          contentContainerStyle={styles.pager}
          horizontal
          onMomentumScrollEnd={onMomentumScrollEnd}
          pagingEnabled
          ref={scrollRef}
          scrollEventThrottle={16}
          showsHorizontalScrollIndicator={false}>
          {tutorialPages.map((page) => (
            <View
              key={page.id}
              style={[
                styles.page,
                {
                  paddingTop: isDesktopShowcase ? 221 : 154,
                  width: pageWidth,
                },
              ]}>
              <View style={[styles.artTile, { backgroundColor: '#202630', borderColor: '#303846' }]}>
                <View style={[styles.artMark, { backgroundColor: palette.lime }]} />
              </View>
              <AppText style={styles.title} variant="screenTitle">
                {page.title}
              </AppText>
            </View>
          ))}
        </ScrollView>

        <View style={styles.controls}>
          <View accessibilityLabel={`${pageIndex + 1} / ${tutorialPages.length}`} style={styles.dots}>
            {tutorialPages.map((page, index) => (
              <View
                key={page.id}
                style={[
                  styles.dot,
                  {
                    backgroundColor: index === pageIndex ? palette.lime : palette.border,
                    width: index === pageIndex ? 18 : 6,
                  },
                ]}
              />
            ))}
          </View>
          <AppButton onPress={next}>
            {pageIndex === lastIndex ? '시작하기' : '다음'}
          </AppButton>
          <Pressable accessibilityRole="button" onPress={finish} style={styles.skip}>
            <AppText color={palette.muted} variant="label">
              건너뛰기
            </AppText>
          </Pressable>
        </View>
      </SafeAreaView>
    </PrototypeFrame>
  );
}

const styles = StyleSheet.create({
  artMark: {
    alignItems: 'center',
    borderRadius: 10,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  artTile: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    height: 79,
    justifyContent: 'center',
    width: 79,
  },
  controls: {
    alignSelf: 'center',
    bottom: 24,
    gap: dailyupSpacing.three,
    maxWidth: 320,
    paddingHorizontal: dailyupSpacing.five,
    position: 'absolute',
    width: '100%',
  },
  dot: {
    borderRadius: dailyupRadius.round,
    height: 6,
  },
  dots: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    marginBottom: dailyupSpacing.three,
  },
  page: {
    alignItems: 'center',
    minHeight: Platform.OS === 'web' ? 720 : undefined,
  },
  pager: {
    flexGrow: 1,
  },
  safeArea: {
    flex: 1,
    overflow: 'hidden',
  },
  skip: {
    alignItems: 'center',
    minHeight: 30,
    justifyContent: 'center',
  },
  title: {
    fontSize: 21,
    lineHeight: 29,
    marginTop: 22,
    textAlign: 'center',
  },
});
