import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { launchImageLibrary, type ImagePickerResponse } from 'react-native-image-picker';
import { createHttpClient } from '@/lib/api/http-client';
import { ProfilePanel } from './profile-panel';

const profile = { userId: 'u', nickname: '기존 이름', profileImageUrl: null as string | null };
const jpeg = '/9j/2Q==';
const mockFetch = jest.fn();
let mockClient = createHttpClient({ baseUrl: 'https://api.example.invalid', fetchImpl: mockFetch });
let mockEpoch = 1;
jest.mock('@/features/auth/session-context', () => ({
  useAuthenticatedClient: () => mockClient,
  useSession: () => ({ epoch: mockEpoch }),
}));
jest.mock('@/features/prototype/prototype-context', () => ({ usePrototype: () => ({ theme: 'dark' }) }));
jest.mock('react-native-image-picker', () => ({ launchImageLibrary: jest.fn() }));

function response(value: unknown = profile, status = 200): Response {
  return { ok: status < 400, status, text: async () => JSON.stringify(value) } as Response;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
async function edit() {
  await screen.findByText(profile.nickname);
  await fireEvent.press(screen.getByText('프로필 수정'));
}
beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockReset();
  jest.mocked(launchImageLibrary).mockReset();
  mockEpoch = 1;
  mockClient = createHttpClient({ baseUrl: 'https://api.example.invalid', fetchImpl: mockFetch });
  mockFetch.mockResolvedValue(response());
  jest.mocked(launchImageLibrary).mockResolvedValue({ didCancel: true });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test('shows loading, loaded nickname, and an accessible default avatar', async () => {
  const pending = deferred<Response>();
  mockFetch.mockReturnValueOnce(pending.promise);
  await render(<ProfilePanel userId="u" />);
  expect(screen.getByText('프로필 조회 중…')).toBeOnTheScreen();
  await act(() => pending.resolve(response()));
  expect(screen.getByText(profile.nickname)).toBeOnTheScreen();
  expect(screen.getByLabelText('기본 프로필 사진')).toBeOnTheScreen();
});

test('retries an initial load error', async () => {
  mockFetch.mockRejectedValueOnce(new Error('offline'));
  await render(<ProfilePanel userId="u" />);
  await screen.findByText('프로필을 불러오지 못했습니다.');
  await fireEvent.press(screen.getByText('프로필 다시 시도'));
  await screen.findByText(profile.nickname);
  expect(mockFetch).toHaveBeenCalledTimes(2);
});

test('saves a trimmed nickname and replaces the form with the server profile', async () => {
  await render(<ProfilePanel userId="u" />);
  await edit();
  await fireEvent.changeText(screen.getByLabelText('닉네임'), '  새로운 이름  ');
  mockFetch.mockResolvedValueOnce(response({ ...profile, nickname: '새로운 이름' }));
  await fireEvent.press(screen.getByText('프로필 저장'));
  await screen.findByText('프로필을 저장했습니다.');
  expect(screen.getByText('새로운 이름')).toBeOnTheScreen();
  expect(mockFetch.mock.calls[1][1]).toEqual(expect.objectContaining({ method: 'PATCH', body: '{"nickname":"새로운 이름"}' }));
});

test.each(['', '   ', '😀'.repeat(21)])('blocks invalid nickname input %s', async value => {
  await render(<ProfilePanel userId="u" />);
  await edit();
  await fireEvent.changeText(screen.getByLabelText('닉네임'), value);
  expect(screen.getByText('닉네임은 1~20자로 입력해 주세요.')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: '프로필 저장' })).toBeDisabled();
  await fireEvent.press(screen.getByText('프로필 저장'));
  expect(mockFetch).toHaveBeenCalledTimes(1);
});

test('accepts twenty Unicode code points and retains drafts after nickname conflict', async () => {
  await render(<ProfilePanel userId="u" />);
  await edit();
  const nickname = '😀'.repeat(20);
  await fireEvent.changeText(screen.getByLabelText('닉네임'), nickname);
  mockFetch.mockResolvedValueOnce(response({ statusCode: 409 }, 409));
  await fireEvent.press(screen.getByText('프로필 저장'));
  await screen.findByText('이미 사용 중인 닉네임입니다. 다른 이름을 입력해 주세요.');
  expect(screen.getByLabelText('닉네임')).toHaveDisplayValue(nickname);
  mockFetch.mockResolvedValueOnce(response({ ...profile, nickname }));
  await fireEvent.press(screen.getByText('프로필 저장'));
  await screen.findByText('프로필을 저장했습니다.');
});

test('selects a bounded photo, previews the base64 data, and saves it', async () => {
  await render(<ProfilePanel userId="u" />);
  await edit();
  jest.mocked(launchImageLibrary).mockResolvedValueOnce({ assets: [{ type: 'image/jpeg', base64: jpeg, uri: 'file:///ignored.jpg' }] });
  await fireEvent.press(screen.getByText('사진 선택'));
  expect(launchImageLibrary).toHaveBeenCalledWith({ mediaType: 'photo', selectionLimit: 1, maxWidth: 128, maxHeight: 128, quality: 0.7, includeBase64: true });
  expect(screen.getByLabelText('프로필 사진').props.source).toEqual({ uri: `data:image/jpeg;base64,${jpeg}` });
  mockFetch.mockResolvedValueOnce(response({ ...profile, profileImageUrl: `data:image/jpeg;base64,${jpeg}` }));
  await fireEvent.press(screen.getByText('프로필 저장'));
  expect(mockFetch.mock.calls[1][1].body).toBe(JSON.stringify({ imageBase64: jpeg }));
  await screen.findByText('프로필을 저장했습니다.');
});

test('explicitly removes a stored photo with null', async () => {
  mockFetch.mockResolvedValueOnce(response({ ...profile, profileImageUrl: 'https://images.example.invalid/photo.jpg' }));
  await render(<ProfilePanel userId="u" />);
  await edit();
  await fireEvent.press(screen.getByText('사진 삭제'));
  expect(screen.getByLabelText('기본 프로필 사진')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('프로필 저장'));
  expect(mockFetch.mock.calls[1][1].body).toBe('{"imageBase64":null}');
});

test('picker cancellation preserves an existing photo draft', async () => {
  await render(<ProfilePanel userId="u" />);
  await edit();
  jest.mocked(launchImageLibrary).mockResolvedValueOnce({ assets: [{ type: 'image/png', base64: 'iVBORw0KGgo=' }] });
  await fireEvent.press(screen.getByText('사진 선택'));
  await fireEvent.press(screen.getByText('사진 선택'));
  expect(screen.getByLabelText('프로필 사진').props.source.uri).toBe('data:image/png;base64,iVBORw0KGgo=');
  expect(screen.queryByText('사진을 선택하지 못했습니다. 다시 시도해 주세요.')).toBeNull();
});

test.each([
  { assets: [{ type: 'image/jpeg', base64: 'A'.repeat(65540) }] },
  { assets: [{ type: 'image/gif', base64: 'R0lGODlh' }] },
  { assets: [{ type: 'image/jpeg' }] },
  { assets: [{ type: 'image/jpeg', base64: 'bad$$' }] },
])('rejects unusable photo selections without changing the draft', async selection => {
  await render(<ProfilePanel userId="u" />);
  await edit();
  await fireEvent.changeText(screen.getByLabelText('닉네임'), '작성 중');
  jest.mocked(launchImageLibrary).mockResolvedValueOnce(selection);
  await fireEvent.press(screen.getByText('사진 선택'));
  await screen.findByText('48KB 이하의 JPEG 또는 PNG 사진을 선택해 주세요.');
  expect(screen.getByLabelText('닉네임')).toHaveDisplayValue('작성 중');
  expect(screen.getByLabelText('기본 프로필 사진')).toBeOnTheScreen();
});

test('keeps drafts and provides a safe message on native picker failure', async () => {
  await render(<ProfilePanel userId="u" />);
  await edit();
  jest.mocked(launchImageLibrary).mockResolvedValueOnce({ errorCode: 'permission', errorMessage: 'internal provider path' });
  await fireEvent.press(screen.getByText('사진 선택'));
  await screen.findByText('사진을 선택하지 못했습니다. 다시 시도해 주세요.');
  expect(screen.queryByText('internal provider path')).toBeNull();
});

test('blocks duplicate save and picker launches while save is pending', async () => {
  await render(<ProfilePanel userId="u" />);
  await edit();
  await fireEvent.changeText(screen.getByLabelText('닉네임'), '저장 대기');
  const pending = deferred<Response>();
  mockFetch.mockReturnValueOnce(pending.promise);
  const save = screen.getByText('프로필 저장');
  const pick = screen.getByText('사진 선택');
  await act(async () => {
    await fireEvent.press(save);
    await fireEvent.press(save);
    await fireEvent.press(pick);
  });
  expect(mockFetch).toHaveBeenCalledTimes(2);
  expect(launchImageLibrary).not.toHaveBeenCalled();
  expect(screen.getByLabelText('닉네임')).toHaveProp('editable', false);
  await act(() => pending.resolve(response({ ...profile, nickname: '저장 대기' })));
});

test('blocks duplicate picker launches and save while selecting a photo', async () => {
  await render(<ProfilePanel userId="u" />);
  await edit();
  await fireEvent.changeText(screen.getByLabelText('닉네임'), '작성 중');
  const pending = deferred<ImagePickerResponse>();
  jest.mocked(launchImageLibrary).mockReturnValueOnce(pending.promise);
  const pick = screen.getByText('사진 선택');
  const save = screen.getByText('프로필 저장');
  await act(async () => {
    await fireEvent.press(pick);
    await fireEvent.press(pick);
    await fireEvent.press(save);
  });
  expect(launchImageLibrary).toHaveBeenCalledTimes(1);
  expect(mockFetch).toHaveBeenCalledTimes(1);
  await act(() => pending.resolve({ didCancel: true }));
  expect(screen.getByLabelText('닉네임')).toHaveDisplayValue('작성 중');
});

test('confirms cancellation of dirty edits and only discards on confirmation', async () => {
  await render(<ProfilePanel userId="u" />);
  await edit();
  await fireEvent.changeText(screen.getByLabelText('닉네임'), '수정 중');
  await fireEvent.press(screen.getByText('수정 취소'));
  const buttons = jest.mocked(Alert.alert).mock.calls[0][2];
  await act(() => buttons?.find(button => button.style === 'cancel')?.onPress?.());
  expect(screen.getByLabelText('닉네임')).toHaveDisplayValue('수정 중');
  await fireEvent.press(screen.getByText('수정 취소'));
  await act(() => jest.mocked(Alert.alert).mock.calls[1][2]?.find(button => button.style === 'destructive')?.onPress?.());
  expect(screen.queryByLabelText('닉네임')).toBeNull();
  expect(screen.getByText(profile.nickname)).toBeOnTheScreen();
});

test.each(['owner', 'epoch', 'client'] as const)('ignores a stale save after %s changes', async change => {
  const view = await render(<ProfilePanel userId="u" />);
  await edit();
  await fireEvent.changeText(screen.getByLabelText('닉네임'), '이전 저장');
  const pending = deferred<Response>();
  mockFetch.mockReturnValueOnce(pending.promise);
  await fireEvent.press(screen.getByText('프로필 저장'));
  const userId = change === 'owner' ? 'other' : 'u';
  if (change === 'epoch') mockEpoch += 1;
  if (change === 'client') mockClient = createHttpClient({ baseUrl: 'https://api.example.invalid', fetchImpl: mockFetch });
  mockFetch.mockResolvedValueOnce(response({ ...profile, userId, nickname: '새 세션' }));
  await view.rerender(<ProfilePanel userId={userId} />);
  await screen.findByText('새 세션');
  await act(() => pending.resolve(response({ ...profile, nickname: '이전 저장' })));
  expect(screen.getByText('새 세션')).toBeOnTheScreen();
  expect(screen.queryByText('이전 저장')).toBeNull();
  expect(screen.queryByText('프로필을 저장했습니다.')).toBeNull();
});

test('ignores a late picker result after owner changes', async () => {
  const view = await render(<ProfilePanel userId="u" />);
  await edit();
  const pending = deferred<ImagePickerResponse>();
  jest.mocked(launchImageLibrary).mockReturnValueOnce(pending.promise);
  await fireEvent.press(screen.getByText('사진 선택'));
  mockFetch.mockResolvedValueOnce(response({ ...profile, userId: 'other', nickname: '다른 사용자' }));
  await view.rerender(<ProfilePanel userId="other" />);
  await screen.findByText('다른 사용자');
  await act(() => pending.resolve({ assets: [{ type: 'image/jpeg', base64: jpeg }] }));
  expect(screen.queryByLabelText('프로필 사진')).toBeNull();
  expect(screen.getByText('다른 사용자')).toBeOnTheScreen();
});

test('unmounts safely with a pending save and never reuses its result', async () => {
  const view = await render(<ProfilePanel userId="u" />);
  await edit();
  await fireEvent.changeText(screen.getByLabelText('닉네임'), '이전 저장');
  const pending = deferred<Response>();
  mockFetch.mockReturnValueOnce(pending.promise);
  await fireEvent.press(screen.getByText('프로필 저장'));
  await view.unmount();
  await render(<ProfilePanel userId="u" />);
  await screen.findByText(profile.nickname);
  await act(() => pending.resolve(response({ ...profile, nickname: '이전 저장' })));
  expect(screen.getByText(profile.nickname)).toBeOnTheScreen();
  expect(screen.queryByText('이전 저장')).toBeNull();
});

test('ignores a stale initial load after the owner changes', async () => {
  const pending = deferred<Response>();
  mockFetch.mockReturnValueOnce(pending.promise);
  const view = await render(<ProfilePanel userId="u" />);
  mockFetch.mockResolvedValueOnce(response({ ...profile, userId: 'other', nickname: '현재 사용자' }));
  await view.rerender(<ProfilePanel userId="other" />);
  await screen.findByText('현재 사용자');
  await act(() => pending.resolve(response()));
  expect(screen.getByText('현재 사용자')).toBeOnTheScreen();
  expect(screen.queryByText(profile.nickname)).toBeNull();
});

test('retains both nickname and photo drafts after a network failure', async () => {
  await render(<ProfilePanel userId="u" />);
  await edit();
  await fireEvent.changeText(screen.getByLabelText('닉네임'), '작성 중');
  jest.mocked(launchImageLibrary).mockResolvedValueOnce({ assets: [{ type: 'image/jpeg', base64: jpeg }] });
  await fireEvent.press(screen.getByText('사진 선택'));
  mockFetch.mockRejectedValueOnce(new Error('offline'));
  await fireEvent.press(screen.getByText('프로필 저장'));
  await screen.findByText('프로필을 저장하지 못했습니다. 입력 내용을 확인하고 다시 시도해 주세요.');
  expect(screen.getByLabelText('닉네임')).toHaveDisplayValue('작성 중');
  expect(screen.getByLabelText('프로필 사진').props.source.uri).toBe(`data:image/jpeg;base64,${jpeg}`);
  expect(screen.getByRole('button', { name: '프로필 저장' })).not.toBeDisabled();
});

test('uses a fallback when a stored remote avatar cannot load', async () => {
  mockFetch.mockResolvedValueOnce(response({ ...profile, profileImageUrl: 'https://images.example.invalid/missing.jpg' }));
  await render(<ProfilePanel userId="u" />);
  await screen.findByLabelText('프로필 사진');
  await fireEvent(screen.getByLabelText('프로필 사진'), 'error');
  expect(screen.getByLabelText('기본 프로필 사진')).toBeOnTheScreen();
  expect(screen.getByText(profile.nickname)).toBeOnTheScreen();
});

test('cancels an unchanged form without asking to discard changes', async () => {
  await render(<ProfilePanel userId="u" />);
  await edit();
  await fireEvent.press(screen.getByText('수정 취소'));
  expect(Alert.alert).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('닉네임')).toBeNull();
});

test.each(['abcdefghijklmn_123456', '  기존 이름  ', '   '])(
  'preserves an unchanged legacy nickname when saving only a photo', async nickname => {
    const existing = { ...profile, nickname };
    mockFetch.mockResolvedValueOnce(response(existing));
    await render(<ProfilePanel userId="u" />);
    await screen.findByText(nickname);
    await fireEvent.press(screen.getByText('프로필 수정'));
    expect(screen.getByLabelText('닉네임')).toHaveDisplayValue(nickname);
    expect(screen.getByText('기존 닉네임을 유지합니다. 변경할 때는 1~20자로 입력해 주세요.')).toBeOnTheScreen();
    jest.mocked(launchImageLibrary).mockResolvedValueOnce({ assets: [{ type: 'image/jpeg', base64: jpeg }] });
    await fireEvent.press(screen.getByText('사진 선택'));
    expect(screen.getByRole('button', { name: '프로필 저장' })).not.toBeDisabled();
    mockFetch.mockResolvedValueOnce(response({ ...existing, profileImageUrl: `data:image/jpeg;base64,${jpeg}` }));
    await fireEvent.press(screen.getByText('프로필 저장'));
    await screen.findByText('프로필을 저장했습니다.');
    expect(screen.getByText(nickname)).toBeOnTheScreen();
    expect(mockFetch.mock.calls[1][1].body).toBe(JSON.stringify({ imageBase64: jpeg }));
  },
);

test.each(['anotherlegacyname_123456', '   '])('blocks an invalid changed nickname even with a valid photo draft', async nickname => {
  mockFetch.mockResolvedValueOnce(response({ ...profile, nickname: 'abcdefghijklmn_123456' }));
  await render(<ProfilePanel userId="u" />);
  await screen.findByText('abcdefghijklmn_123456');
  await fireEvent.press(screen.getByText('프로필 수정'));
  await fireEvent.changeText(screen.getByLabelText('닉네임'), nickname);
  jest.mocked(launchImageLibrary).mockResolvedValueOnce({ assets: [{ type: 'image/jpeg', base64: jpeg }] });
  await fireEvent.press(screen.getByText('사진 선택'));
  expect(screen.getByText('닉네임은 1~20자로 입력해 주세요.')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: '프로필 저장' })).toBeDisabled();
  await fireEvent.press(screen.getByText('프로필 저장'));
  expect(mockFetch).toHaveBeenCalledTimes(1);
});

test('normalizes a legacy nickname only after the nickname input actually changes', async () => {
  mockFetch.mockResolvedValueOnce(response({ ...profile, nickname: '  기존 이름  ' }));
  await render(<ProfilePanel userId="u" />);
  await screen.findByText('  기존 이름  ');
  await fireEvent.press(screen.getByText('프로필 수정'));
  expect(screen.getByRole('button', { name: '프로필 저장' })).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('닉네임'), '  새 이름  ');
  mockFetch.mockResolvedValueOnce(response({ ...profile, nickname: '새 이름' }));
  await fireEvent.press(screen.getByText('프로필 저장'));
  await screen.findByText('새 이름');
  expect(mockFetch.mock.calls[1][1].body).toBe('{"nickname":"새 이름"}');
});
