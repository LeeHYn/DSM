const mockStore = { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() };
const mockCreateStore = jest.fn(() => mockStore);
const mockLocal = jest.fn(() => ({}));
jest.mock('../../config/api-config', () => ({ getApiBaseUrl: () => 'http://127.0.0.1:3000' }));
jest.mock('./token-store', () => ({ createRefreshTokenStore: () => mockCreateStore() }));
jest.mock('./local-session-keychain', () => ({ createLocalSessionStore: () => mockLocal() }));
import { getSessionRuntime } from './session-runtime';

test('foreground and headless callers share controller/client without reading tokens on construction', () => {
  expect(mockCreateStore).not.toHaveBeenCalled();
  const foreground = getSessionRuntime();
  const headless = getSessionRuntime();
  expect(headless).toBe(foreground);
  expect(mockCreateStore).toHaveBeenCalledTimes(1);
  expect(mockLocal).toHaveBeenCalledTimes(1);
  expect(mockStore.getItem).not.toHaveBeenCalled();
  expect(foreground.controller.getSnapshot().state.status).toBe('bootstrapping');
  expect(foreground.controller.getAccessToken()).toBeNull();
});
