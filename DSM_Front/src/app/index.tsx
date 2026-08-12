import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  AppText,
  PrototypeFrame,
  useDailyupPalette,
} from '@/components/dailyup/primitives';
import {
  dailyupFonts,
  dailyupRadius,
  dailyupSpacing,
} from '@/constants/dailyup-theme';
import {
  googleSignInAdapter,
  isGoogleProviderError,
} from '@/features/auth/google-sign-in';
import { useSession } from '@/features/auth/session-context';
import { usePrototype } from '@/features/prototype/prototype-context';

function SocialButton({
  disabled = false,
  label,
  onPress,
  provider,
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
  provider: 'apple' | 'google' | 'kakao';
}) {
  const palette = useDailyupPalette();
  const isKakao = provider === 'kakao';
  const buttonBackground = isKakao ? '#FEE500' : palette.surfaceRaised;
  const foreground = isKakao ? '#191919' : palette.text;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.socialButton,
        {
          backgroundColor: buttonBackground,
          borderColor: isKakao ? buttonBackground : palette.border,
          opacity: disabled ? 0.38 : pressed ? 0.74 : 1,
        },
      ]}>
      {provider === 'google' ? (
        <View style={styles.googleMark}>
          <MaterialCommunityIcons color="#4285F4" name="google" size={19} />
        </View>
      ) : (
        <MaterialCommunityIcons
          color={foreground}
          name={provider === 'kakao' ? 'chat' : 'apple'}
          size={20}
        />
      )}
      <AppText color={foreground} style={styles.socialLabel} variant="button">
        {label}
      </AppText>
    </Pressable>
  );
}

export default function LoginScreen() {
  const palette = useDailyupPalette();
  const { showToast } = usePrototype();
  const { action, error, signIn } = useSession();
  const [isGooglePending, setIsGooglePending] = useState(false);
  const googleRequestInFlightRef = useRef(false);
  const lastSessionErrorRef = useRef<unknown>(null);
  const providerButtonsDisabled =
    isGooglePending || action === 'signing-in';

  useEffect(() => {
    if (error === null) {
      lastSessionErrorRef.current = null;
      return;
    }
    if (lastSessionErrorRef.current === error) {
      return;
    }

    lastSessionErrorRef.current = error;
    showToast('로그인에 실패했습니다. 다시 시도해 주세요.');
  }, [error, showToast]);

  const handleGooglePress = async () => {
    if (googleRequestInFlightRef.current || action === 'signing-in') {
      return;
    }

    googleRequestInFlightRef.current = true;
    setIsGooglePending(true);
    try {
      const result = await googleSignInAdapter.acquireIdToken();
      if (result.status === 'success') {
        await signIn('GOOGLE', result.idToken);
      }
    } catch (providerError) {
      const message =
        isGoogleProviderError(providerError) &&
        providerError.kind === 'configuration'
          ? 'Google 로그인 설정이 필요합니다.'
          : 'Google 로그인에 실패했습니다. 다시 시도해 주세요.';
      showToast(message);
    } finally {
      googleRequestInFlightRef.current = false;
      setIsGooglePending(false);
    }
  };

  const explainProviderStep = () => {
    showToast('소셜 로그인 연결은 다음 단계에서 제공됩니다.');
  };

  return (
    <PrototypeFrame>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}>
        <View style={styles.brandBlock}>
          <View style={[styles.logo, { backgroundColor: palette.lime }]}>
            <AppText color={palette.textOnLime} style={styles.logoText}>
              D
            </AppText>
          </View>
          <AppText style={styles.brandName} variant="screenTitle">
            데일리업
          </AppText>
          <AppText color={palette.muted} style={styles.description} variant="muted">
            일과를 완료하고 점수를 쌓아{'\n'}랭킹에 도전하세요
          </AppText>
        </View>

        <View style={styles.socialStack}>
          <SocialButton
            disabled={providerButtonsDisabled}
            label="Google로 계속하기"
            onPress={() => void handleGooglePress()}
            provider="google"
          />
          <SocialButton
            disabled={providerButtonsDisabled}
            label="Kakao로 계속하기"
            onPress={explainProviderStep}
            provider="kakao"
          />
          <SocialButton
            disabled
            label="Apple로 계속하기 · 준비 중"
            onPress={() => undefined}
            provider="apple"
          />
        </View>

        <View style={styles.legal}>
          <Pressable onPress={() => showToast('이용약관은 준비 중입니다.')}>
            <AppText color={palette.muted} style={styles.legalText} variant="caption">
              이용약관
            </AppText>
          </Pressable>
          <View style={[styles.legalDot, { backgroundColor: palette.border }]} />
          <Pressable onPress={() => showToast('개인정보처리방침은 준비 중입니다.')}>
            <AppText color={palette.muted} style={styles.legalText} variant="caption">
              개인정보처리방침
            </AppText>
          </Pressable>
        </View>
      </ScrollView>
    </PrototypeFrame>
  );
}

const styles = StyleSheet.create({
  brandBlock: {
    alignItems: 'center',
  },
  brandName: {
    fontSize: 21,
    lineHeight: 29,
    marginTop: 10,
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 60,
  },
  description: {
    lineHeight: 21,
    marginTop: dailyupSpacing.one,
    textAlign: 'center',
  },
  googleMark: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: dailyupRadius.round,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  legal: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: dailyupSpacing.three,
    justifyContent: 'center',
    marginBottom: dailyupSpacing.five,
    marginTop: dailyupSpacing.five,
  },
  legalDot: {
    borderRadius: dailyupRadius.round,
    height: 3,
    width: 3,
  },
  legalText: {
    textDecorationLine: 'underline',
  },
  logo: {
    alignItems: 'center',
    borderRadius: 14,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  logoText: {
    fontFamily: dailyupFonts.extraBold,
    fontSize: 27,
    lineHeight: 32,
  },
  socialButton: {
    alignItems: 'center',
    borderRadius: dailyupRadius.medium,
    borderWidth: 1,
    flexDirection: 'row',
    gap: dailyupSpacing.three,
    height: 50,
    justifyContent: 'center',
    paddingHorizontal: dailyupSpacing.four,
  },
  socialLabel: {
    fontFamily: dailyupFonts.bold,
    fontSize: 12,
  },
  socialStack: {
    gap: dailyupSpacing.three,
    marginTop: 18,
  },
});
