import { useState } from 'react';
import { Alert } from 'react-native';
import { useSession } from '../../features/auth/session-context';
import { AppButton, AppText, SurfaceCard } from './primitives';

export function OfflineStatus() {
  const { state, action, retryRecovery, leaveOffline } = useSession();
  const [failed, setFailed] = useState(false);
  if (state.status !== 'offline-workspace') return null;
  return <SurfaceCard>
    <AppText accessibilityLiveRegion="polite">오프라인 작업 공간</AppText>
    <AppText>이 기기에 저장된 일과입니다. 점수와 랭킹은 연결 후 갱신됩니다.</AppText>
    <AppButton disabled={action !== 'idle'} onPress={() => { retryRecovery().catch(() => undefined); }}>연결 다시 확인</AppButton>
    <AppButton disabled={action !== 'idle'} variant="ghost" onPress={() => {
      Alert.alert('이 기기에서 로그아웃할까요?', '저장된 일과는 같은 계정으로 다시 로그인하면 확인할 수 있습니다. 연결이 복구되면 이전 로그인을 서버에서도 종료합니다.', [
        { text: '취소', style: 'cancel' },
        { text: '로그아웃', onPress: () => { leaveOffline().then(done => setFailed(!done)).catch(() => setFailed(true)); } },
      ]);
    }}>다른 계정으로 로그인</AppButton>
    {failed ? <AppText>로그인 정보를 안전하게 정리하지 못했습니다. 다시 시도해 주세요.</AppText> : null}
  </SurfaceCard>;
}
