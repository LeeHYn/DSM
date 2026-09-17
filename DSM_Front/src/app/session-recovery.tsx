import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import {
  AppButton,
  AppText,
  PrototypeFrame,
} from '@/components/dailyup/primitives';
import { dailyupSpacing } from '@/constants/dailyup-theme';
import { useSession } from '@/features/auth/session-context';

export default function SessionRecoveryScreen() {
  const { action, retryRecovery, state, leaveOffline } = useSession();
  const [exitFailed, setExitFailed] = useState(false);
  const storageFailure = state.status === 'storage-error';
  const title = storageFailure
    ? '보안 저장소를 정리하지 못했어요'
    : '인터넷 연결을 확인해 주세요';

  return (
    <PrototypeFrame>
      <View style={styles.container}>
        <AppText variant="screenTitle">{title}</AppText>
        <AppText variant="muted">
          {storageFailure
            ? '다시 시도해 로컬 로그인 정보를 안전하게 정리해 주세요.'
            : '연결이 복구되면 세션을 다시 확인할 수 있어요.'}
        </AppText>
        <AppButton
          disabled={action === 'recovering'}
          onPress={() => void retryRecovery()}>
          다시 시도
        </AppButton>
        {!storageFailure ? <>
          <AppButton disabled={action !== 'idle'} variant="secondary" onPress={() => {
            Alert.alert('이 기기에서 로그아웃할까요?', '로그인 화면으로 이동합니다. 연결이 복구되면 이전 로그인을 서버에서도 종료합니다.', [
              { text: '취소', style: 'cancel' },
              { text: '로그아웃', onPress: () => {
                leaveOffline().then(done => setExitFailed(!done)).catch(() => setExitFailed(true));
              } },
            ]);
          }}>다른 계정으로 로그인</AppButton>
          {exitFailed ? <AppText>로그인 정보를 안전하게 정리하지 못했습니다. 다시 시도해 주세요.</AppText> : null}
        </> : null}
      </View>
    </PrototypeFrame>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: dailyupSpacing.three,
    justifyContent: 'center',
    paddingHorizontal: dailyupSpacing.five,
  },
});
