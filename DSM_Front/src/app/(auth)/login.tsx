import { Redirect } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { SocialProvider } from '@/features/auth/auth.api';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth/auth-context';

const PROVIDERS: SocialProvider[] = ['GOOGLE', 'KAKAO', 'APPLE'];

export default function LoginScreen() {
  const theme = useTheme();
  const { status, signInWithProviderToken } = useAuth();
  const [provider, setProvider] = useState<SocialProvider>('GOOGLE');
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status === 'signedIn') {
    return <Redirect href="/(app)" />;
  }

  const canSubmit = token.trim().length > 0 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await signInWithProviderToken(provider, token.trim());
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Login request failed.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardAvoidingView}>
          <View style={styles.content}>
            <View style={styles.header}>
              <ThemedText type="subtitle">DSM Login</ThemedText>
              <ThemedText themeColor="textSecondary">
                Provider token으로 백엔드 인증 연동을 확인합니다.
              </ThemedText>
            </View>

            <View style={styles.providerRow}>
              {PROVIDERS.map((item) => {
                const selected = item === provider;
                return (
                  <Pressable
                    key={item}
                    onPress={() => setProvider(item)}
                    style={({ pressed }) => [
                      styles.providerButton,
                      {
                        backgroundColor: selected
                          ? theme.text
                          : theme.backgroundElement,
                        opacity: pressed ? 0.75 : 1,
                      },
                    ]}>
                    <ThemedText
                      type="smallBold"
                      style={{ color: selected ? theme.background : theme.text }}>
                      {item}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.form}>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                multiline
                onChangeText={setToken}
                placeholder="Social provider token"
                placeholderTextColor={theme.textSecondary}
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.backgroundElement,
                    color: theme.text,
                  },
                ]}
                value={token}
              />

              {error ? (
                <ThemedText type="small" style={styles.errorText}>
                  {error}
                </ThemedText>
              ) : null}

              <Pressable
                disabled={!canSubmit}
                onPress={handleSubmit}
                style={({ pressed }) => [
                  styles.submitButton,
                  {
                    backgroundColor: theme.text,
                    opacity: !canSubmit ? 0.45 : pressed ? 0.78 : 1,
                  },
                ]}>
                {submitting ? (
                  <ActivityIndicator color={theme.background} />
                ) : (
                  <ThemedText
                    type="smallBold"
                    style={{ color: theme.background }}>
                    Sign in
                  </ThemedText>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 520,
  },
  header: {
    gap: Spacing.two,
  },
  providerRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  providerButton: {
    flex: 1,
    alignItems: 'center',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
  },
  form: {
    gap: Spacing.three,
  },
  input: {
    borderRadius: Spacing.two,
    minHeight: 132,
    padding: Spacing.three,
    textAlignVertical: 'top',
    fontSize: 16,
    lineHeight: 22,
  },
  errorText: {
    color: '#d92d20',
  },
  submitButton: {
    minHeight: 48,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
