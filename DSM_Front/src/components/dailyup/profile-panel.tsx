import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, StyleSheet, TextInput, View } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { useAuthenticatedClient, useSession } from '@/features/auth/session-context';
import { createProfileApi, type Profile, type UpdateProfileInput } from '@/features/product/profile-api';
import { ApiError } from '@/lib/api/api-error';
import { AppButton, AppText, Icon, SurfaceCard, useDailyupPalette } from './primitives';

type PhotoDraft = { base64: string | null; uri: string | null };

export function ProfilePanel({ userId }: { userId: string }) {
  const client = useAuthenticatedClient();
  const { epoch } = useSession();
  const palette = useDailyupPalette();
  const api = useMemo(() => createProfileApi(client, userId), [client, userId]);
  // Each API/session generation owns its liveness and synchronous operation lock.
  const scope = useMemo(() => ({ api, epoch, active: false, busy: false }), [api, epoch]);
  const [loaded, setLoaded] = useState<{ scope: typeof scope; profile: Profile } | null>(null);
  const [retry, setRetry] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState('');
  const [photo, setPhoto] = useState<PhotoDraft>();
  const [busy, setBusy] = useState<'save' | 'pick' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [failedImage, setFailedImage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    scope.active = true;
    scope.busy = false;
    setLoaded(null);
    setLoadError(false);
    setEditing(false);
    setPhoto(undefined);
    setNickname('');
    setBusy(null);
    setError('');
    setNotice('');
    setFailedImage(null);
    scope.api.get().then(
      profile => { if (active) setLoaded({ scope, profile }); },
      () => { if (active) setLoadError(true); },
    );
    return () => { active = false; scope.active = false; };
  }, [scope, retry]);

  const profile = loaded?.scope === scope ? loaded.profile : null;
  const changedNickname = profile !== null && nickname !== profile.nickname;
  const normalizedNickname = nickname.trim();
  const nicknameLength = Array.from(normalizedNickname).length;
  const withinEditLimit = nicknameLength >= 1 && nicknameLength <= 20;
  const validNickname = !changedNickname || withinEditLimit;
  const keepingLegacyNickname = !changedNickname && (!withinEditLimit || nickname !== normalizedNickname);
  const changedPhoto = photo !== undefined && photo.uri !== profile?.profileImageUrl;
  const changed = changedNickname || changedPhoto;
  const preview = editing && photo !== undefined ? photo.uri : profile?.profileImageUrl;

  function resetDraft() {
    if (!scope.active || scope.busy || !profile) return;
    setNickname(profile.nickname);
    setPhoto(undefined);
    setError('');
    setNotice('');
    setFailedImage(null);
    setEditing(false);
  }

  function cancel() {
    if (!scope.active || scope.busy || !profile) return;
    if (nickname !== profile.nickname || photo !== undefined) {
      Alert.alert('프로필 수정을 취소할까요?', '저장하지 않은 변경 사항이 사라집니다.', [
        { text: '계속 수정', style: 'cancel' },
        { text: '변경 취소', style: 'destructive', onPress: resetDraft },
      ]);
    } else resetDraft();
  }

  async function selectPhoto() {
    if (!scope.active || scope.busy || !profile) return;
    scope.busy = true;
    setBusy('pick');
    setError('');
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo', selectionLimit: 1, maxWidth: 128,
        maxHeight: 128, quality: 0.7, includeBase64: true,
      });
      if (!scope.active || result.didCancel) return;
      if (result.errorCode) throw new Error('Photo picker failed');
      const asset = result.assets?.[0];
      if (
        result.assets?.length !== 1 || !asset?.base64 ||
        asset.base64.length > 65536 || asset.base64.length % 4 !== 0 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(asset.base64) ||
        (asset.type !== 'image/jpeg' && asset.type !== 'image/png')
      ) {
        setError('48KB 이하의 JPEG 또는 PNG 사진을 선택해 주세요.');
        return;
      }
      setPhoto({ base64: asset.base64, uri: `data:${asset.type};base64,${asset.base64}` });
      setFailedImage(null);
    } catch {
      if (scope.active) setError('사진을 선택하지 못했습니다. 다시 시도해 주세요.');
    } finally {
      scope.busy = false;
      if (scope.active) setBusy(null);
    }
  }

  async function save() {
    if (!scope.active || scope.busy || !profile || !validNickname || !changed) return;
    scope.busy = true;
    setBusy('save');
    setError('');
    const input: UpdateProfileInput = {};
    if (changedNickname) input.nickname = normalizedNickname;
    if (changedPhoto) input.imageBase64 = photo?.base64;
    try {
      const saved = await scope.api.update(input);
      if (!scope.active) return;
      setLoaded({ scope, profile: saved });
      setNickname(saved.nickname);
      setPhoto(undefined);
      setEditing(false);
      setFailedImage(null);
      setNotice('프로필을 저장했습니다.');
    } catch (failure) {
      if (scope.active) {
        setError(failure instanceof ApiError && failure.status === 409
          ? '이미 사용 중인 닉네임입니다. 다른 이름을 입력해 주세요.'
          : '프로필을 저장하지 못했습니다. 입력 내용을 확인하고 다시 시도해 주세요.');
      }
    } finally {
      scope.busy = false;
      if (scope.active) setBusy(null);
    }
  }

  return <SurfaceCard style={styles.card}>
    <AppText accessibilityRole="header" variant="sectionTitle">내 프로필</AppText>
    {!profile ? loadError ? <>
      <AppText>프로필을 불러오지 못했습니다.</AppText>
      <AppButton onPress={() => setRetry(value => value + 1)}>프로필 다시 시도</AppButton>
    </> : <AppText>프로필 조회 중…</AppText> : <>
      <View style={styles.identity}>
        {preview && preview !== failedImage ? <Image
          accessibilityLabel="프로필 사진" accessible
          source={{ uri: preview }} style={styles.avatar}
          onError={() => { if (scope.active) setFailedImage(preview); }}
        /> : <View accessible accessibilityLabel="기본 프로필 사진" style={[styles.avatar, styles.fallback, { backgroundColor: palette.surfaceRaised }]}>
          <Icon name="account-outline" size={36} />
        </View>}
        {!editing ? <AppText variant="sectionTitle">{profile.nickname}</AppText> : null}
      </View>
      {editing ? <>
        <AppText variant="label">닉네임</AppText>
        <TextInput
          accessibilityLabel="닉네임" value={nickname} editable={!busy}
          onChangeText={value => { if (scope.active && !scope.busy) { setNickname(value); setError(''); } }}
          autoCapitalize="none" autoCorrect={false}
          style={[styles.input, { color: palette.text, borderColor: palette.border }]}
        />
        <AppText color={validNickname ? palette.muted : palette.danger}>
          {keepingLegacyNickname
            ? '기존 닉네임을 유지합니다. 변경할 때는 1~20자로 입력해 주세요.'
            : validNickname ? `${nicknameLength}/20자` : '닉네임은 1~20자로 입력해 주세요.'}
        </AppText>
        <View style={styles.actions}>
          <AppButton disabled={!!busy} variant="secondary" onPress={() => { selectPhoto(); }}>사진 선택</AppButton>
          <AppButton disabled={!!busy || !preview} variant="ghost" onPress={() => {
            if (!scope.active || scope.busy) return;
            setPhoto({ base64: null, uri: null }); setError('');
          }}>사진 삭제</AppButton>
        </View>
        {busy ? <AppText accessibilityLiveRegion="polite">{busy === 'save' ? '프로필 저장 중…' : '사진 선택 중…'}</AppText> : null}
        <AppButton disabled={!!busy || !validNickname || !changed} onPress={() => { save(); }}>프로필 저장</AppButton>
        <AppButton disabled={!!busy} variant="ghost" onPress={cancel}>수정 취소</AppButton>
      </> : <AppButton variant="secondary" onPress={() => {
        if (!scope.active || scope.busy) return;
        resetDraft(); setEditing(true);
      }}>프로필 수정</AppButton>}
      {error ? <AppText accessibilityLiveRegion="polite" color={palette.danger}>{error}</AppText> : null}
      {notice ? <AppText accessibilityLiveRegion="polite" color={palette.success}>{notice}</AppText> : null}
    </>}
  </SurfaceCard>;
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  identity: { alignItems: 'center', flexDirection: 'row', gap: 16 },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
