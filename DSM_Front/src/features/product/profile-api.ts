import type { AuthenticatedClient } from '../../lib/api/authenticated-client';

export type Profile = {
  userId: string;
  nickname: string;
  profileImageUrl: string | null;
};

export type UpdateProfileInput = {
  nickname?: string;
  imageBase64?: string | null;
};

const base64Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const jpegPrefix = 'data:image/jpeg;base64,';

function nickname(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid nickname');
  const trimmed = value.trim();
  const length = Array.from(trimmed).length;
  if (length < 1 || length > 20) throw new Error('Invalid nickname');
  return trimmed;
}

function base64Size(value: string, maxBytes: number): number {
  if (
    value.length === 0 || value.length > Math.ceil(maxBytes / 3) * 4 ||
    value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  ) throw new Error('Invalid profile image');
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const last = base64Alphabet.indexOf(value[value.length - padding - 1]);
  const bytes = value.length / 4 * 3 - padding;
  if (
    bytes > maxBytes ||
    (padding === 2 && last % 16 !== 0) || (padding === 1 && last % 4 !== 0)
  ) throw new Error('Invalid profile image');
  return bytes;
}

function byteAt(value: string, index: number): number {
  const bit = index * 8;
  const position = Math.floor(bit / 6);
  const pair = base64Alphabet.indexOf(value[position]) * 64 +
    base64Alphabet.indexOf(value[position + 1]);
  return Math.floor(pair / 2 ** (4 - bit % 6)) % 256;
}

function imageUrl(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error('Invalid profile image');
  // Older provider records can contain HTTP avatars. Keep profile editing
  // available without rendering their insecure remote image.
  if (/^http:\/\//i.test(value)) return null;
  if (value.startsWith(jpegPrefix)) {
    const encoded = value.slice(jpegPrefix.length);
    const bytes = base64Size(encoded, 16 * 1024);
    // Validate the envelope and JPEG markers; the server owns image decoding.
    if (
      bytes < 4 || !encoded.startsWith('/9j/') ||
      byteAt(encoded, bytes - 2) !== 255 || byteAt(encoded, bytes - 1) !== 217
    ) throw new Error('Invalid profile image');
    return value;
  }
  // React Native's URL implementation lacks hostname/protocol getters.
  if (!/^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::[0-9]{1,5})?(?:[/?#][^\s\\]*)?$/i.test(value)) {
    throw new Error('Invalid profile image');
  }
  return value;
}

export function createProfileApi(client: AuthenticatedClient, userId: string) {
  if (!userId || userId !== userId.trim()) throw new Error('Invalid profile owner');
  const validate = (value: unknown): Profile => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Invalid profile');
    }
    const v = value as Record<string, unknown>;
    // Existing provider names predate the edit limit and must remain readable.
    if (
      v.userId !== userId || typeof v.nickname !== 'string' ||
      v.nickname.length === 0 || v.nickname.length > 1024
    ) throw new Error('Invalid profile');
    return { userId, nickname: v.nickname, profileImageUrl: imageUrl(v.profileImageUrl) };
  };
  return {
    get: (): Promise<Profile> => client.request({ path: '/profile', validate }),
    async update(input: UpdateProfileInput): Promise<Profile> {
      const body: { nickname?: string; imageBase64?: string | null } = {};
      if (input.nickname !== undefined) body.nickname = nickname(input.nickname);
      if (input.imageBase64 !== undefined) {
        if (input.imageBase64 !== null) {
          if (typeof input.imageBase64 !== 'string') throw new Error('Invalid profile image');
          base64Size(input.imageBase64, 48 * 1024);
        }
        body.imageBase64 = input.imageBase64;
      }
      if (Object.keys(body).length === 0) throw new Error('Empty profile update');
      return client.request({ path: '/profile', method: 'PATCH', body, validate });
    },
  };
}
