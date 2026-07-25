import { getApiBaseUrl } from './api-config';

it('normalizes a private development URL', () => {
  expect(getApiBaseUrl('http://192.168.0.10:3000/', true)).toBe(
    'http://192.168.0.10:3000',
  );
});

it('allows public HTTPS in production', () => {
  expect(getApiBaseUrl('https://api.example.com/', false)).toBe(
    'https://api.example.com',
  );
});

it.each([
  [undefined, true],
  ['not a URL', true],
  ['http://example.com', true],
  ['http://api.example.com', false],
  ['https://user:pass@example.com', false],
  ['https://api.example.com?token=x', false],
  ['https://api.example.com#fragment', false],
])('rejects unsafe base URL %p', (raw, isDevelopment) => {
  expect(() => getApiBaseUrl(raw, isDevelopment)).toThrow(
    /EXPO_PUBLIC_API_BASE_URL/,
  );
});
