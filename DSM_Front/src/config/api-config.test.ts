import { getApiBaseUrl } from './api-config';

jest.mock('react-native-config', () => ({
  API_BASE_URL: 'http://10.0.2.2:3000/',
}));

it('reads the Android emulator API URL from native config by default', () => {
  expect(getApiBaseUrl()).toBe('http://10.0.2.2:3000');
});

it('normalizes a private development URL', () => {
  expect(getApiBaseUrl('http://192.168.0.10:3000/', true)).toBe(
    'http://192.168.0.10:3000',
  );
});

it('normalizes an IPv6 loopback development URL', () => {
  expect(getApiBaseUrl('http://[::1]:3000/', true)).toBe(
    'http://[::1]:3000',
  );
});

it('allows public HTTPS in production', () => {
  expect(getApiBaseUrl('https://api.example.com/', false)).toBe(
    'https://api.example.com',
  );
});

it.each([
  ['not a URL', true],
  ['http://example.com', true],
  ['http://api.example.com', false],
  ['https://user:pass@example.com', false],
  ['https://api.example.com?token=x', false],
  ['https://api.example.com#fragment', false],
  ['https://api.example.com?', false],
  ['https://api.example.com#', false],
])('rejects unsafe base URL %p', (raw, isDevelopment) => {
  expect(() => getApiBaseUrl(raw, isDevelopment)).toThrow(
    /API_BASE_URL/,
  );
});
