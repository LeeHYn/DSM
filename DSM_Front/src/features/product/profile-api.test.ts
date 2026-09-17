import { createAuthenticatedClient } from '../../lib/api/authenticated-client';
import { createHttpClient } from '../../lib/api/http-client';
import { createProfileApi, type UpdateProfileInput } from './profile-api';

const profile = { userId: 'owner', nickname: '사용자', profileImageUrl: null };
// Minimal JPEG marker fixture; actual image decoding belongs to the server.
const jpeg = '/9j/2Q==';
const dataUrl = `data:image/jpeg;base64,${jpeg}`;

function setup(value: unknown = profile, status = 200) {
  const fetchImpl = jest.fn(async (_url: string, _init?: RequestInit) => ({
    ok: status < 400,
    status,
    text: async () => JSON.stringify(value),
  }) as Response);
  const client = createAuthenticatedClient(
    createHttpClient({ baseUrl: 'https://api.example.invalid', fetchImpl }),
    {
      getAccessToken: () => 'synthetic-access',
      refreshAccessToken: jest.fn(),
      onUnauthorized: jest.fn(),
    },
  );
  return { api: createProfileApi(client, profile.userId), client, fetchImpl };
}

test('gets the current authenticated owner profile at the exact endpoint', async () => {
  const { api, fetchImpl } = setup();
  await expect(api.get()).resolves.toEqual(profile);
  expect(fetchImpl).toHaveBeenCalledWith('https://api.example.invalid/profile', expect.objectContaining({
    method: 'GET', body: undefined,
    headers: expect.objectContaining({ Authorization: 'Bearer synthetic-access' }),
  }));
});

it.each([
  [{ nickname: '  새 이름  ' }, { nickname: '새 이름' }],
  [{ imageBase64: null }, { imageBase64: null }],
  [{ imageBase64: jpeg }, { imageBase64: jpeg }],
  [{ nickname: '새 이름', imageBase64: undefined }, { nickname: '새 이름' }],
  [{ nickname: '😀'.repeat(20), imageBase64: null }, { nickname: '😀'.repeat(20), imageBase64: null }],
])('patches only supplied fields and preserves explicit image removal', async (input, body) => {
  const { api, fetchImpl } = setup();
  await expect(api.update(input)).resolves.toEqual(profile);
  expect(fetchImpl).toHaveBeenCalledWith('https://api.example.invalid/profile', expect.objectContaining({
    method: 'PATCH', body: JSON.stringify(body),
  }));
});

it.each([null, dataUrl, 'https://images.example.invalid/avatar.jpg', `data:image/jpeg;base64,${Buffer.concat([Buffer.from([255, 216, 255]), Buffer.alloc(16379), Buffer.from([255, 217])]).toString('base64')}`])(
  'accepts bounded server JPEG or a legacy HTTPS URL without fetching the image', async profileImageUrl => {
    const value = { ...profile, profileImageUrl };
    const { api, fetchImpl } = setup(value);
    await expect(api.get()).resolves.toEqual(value);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  },
);

it.each([
  null, [], {}, { ...profile, userId: 'another' }, { ...profile, userId: '' },
  { ...profile, nickname: '' }, { ...profile, nickname: null },
  { ...profile, nickname: 42 }, { ...profile, nickname: 'a'.repeat(1025) },
  { ...profile, nickname: '😀'.repeat(513) },
  { ...profile, profileImageUrl: undefined },
  ...['', ' https://image.invalid/a', 'https://image.invalid/a b',
    // eslint-disable-next-line no-script-url -- Deliberately invalid image URL fixture.
    'javascript:alert(1)', 'file:///a', 'https://', 'data:image/png;base64,iVBORw0KGgo=',
    'data:image/jpeg;base64,AAAA', 'data:image/jpeg;base64,/9j/',
    'data:image/jpeg;base64,/9j/2R==', `${dataUrl}\n`,
    `data:image/jpeg;base64,${Buffer.concat([Buffer.from([255, 216, 255]), Buffer.alloc(16380), Buffer.from([255, 217])]).toString('base64')}`,
  ].map(profileImageUrl => ({ ...profile, profileImageUrl })),
])('rejects malformed or foreign response payloads on both read and write', async value => {
  await expect(setup(value).api.get()).rejects.toMatchObject({ kind: 'protocol' });
  await expect(setup(value).api.update({ nickname: '유효' })).rejects.toMatchObject({ kind: 'protocol' });
});

it.each([
  {}, { nickname: '' }, { nickname: ' \n ' }, { nickname: '😀'.repeat(21) },
  { nickname: null }, { imageBase64: '' }, { imageBase64: 'not-base64' },
  { imageBase64: dataUrl }, { imageBase64: 'A'.repeat(65540) },
  { imageBase64: 'AAAA====' }, { imageBase64: '/9j/2R==' },
])('rejects invalid input before issuing an HTTP request', async input => {
  const { api, fetchImpl } = setup();
  await expect(api.update(input as UpdateProfileInput)).rejects.toThrow();
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('keeps nickname conflict status available for the caller to correct and retry', async () => {
  await expect(setup({ statusCode: 409, message: 'Nickname already exists' }, 409).api.update({ nickname: '중복' }))
    .rejects.toMatchObject({ kind: 'http', status: 409 });
});

test('replaces an existing HTTP provider avatar with a safe editable fallback', async () => {
  const { api, fetchImpl } = setup({ ...profile, profileImageUrl: 'http://images.example.invalid/legacy.jpg' });
  await expect(api.get()).resolves.toEqual(profile);
  await expect(api.update({ imageBase64: null })).resolves.toEqual(profile);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

test('rejects an empty expected owner', () => {
  expect(() => createProfileApi(setup().client, '')).toThrow();
});

it.each([
  'abcdefghijklmn_123456',
  '기존 사용자 이름'.repeat(30),
  ' leading and trailing ',
  '   ',
  'a'.repeat(1024),
  '😀'.repeat(512),
])('preserves a legacy nickname on GET and image-only PATCH', async nickname => {
  const value = { ...profile, nickname };
  const { api, fetchImpl } = setup(value);
  await expect(api.get()).resolves.toEqual(value);
  await expect(api.update({ imageBase64: jpeg })).resolves.toEqual(value);
  expect(fetchImpl).toHaveBeenLastCalledWith('https://api.example.invalid/profile', expect.objectContaining({
    method: 'PATCH', body: JSON.stringify({ imageBase64: jpeg }),
  }));
});

test('still rejects a newly supplied 21-character nickname even when it matches a legacy name', async () => {
  const nickname = 'abcdefghijklmn_123456';
  const { api, fetchImpl } = setup({ ...profile, nickname });
  await expect(api.update({ nickname })).rejects.toThrow('Invalid nickname');
  expect(fetchImpl).not.toHaveBeenCalled();
});
