type StorageWriteSpy = {
  setItem: jest.Mock;
};

function loadRefreshTokenStoreModule(): typeof import('./token-store.web') {
  return jest.requireActual<typeof import('./token-store.web')>('./token-store.web');
}

describe('createRefreshTokenStore (web)', () => {
  const originalStorageDescriptors = new Map<
    'localStorage' | 'sessionStorage',
    PropertyDescriptor | undefined
  >();

  beforeEach(() => {
    jest.resetModules();

    for (const storageName of ['localStorage', 'sessionStorage'] as const) {
      originalStorageDescriptors.set(
        storageName,
        Object.getOwnPropertyDescriptor(globalThis, storageName),
      );
    }
  });

  afterEach(() => {
    for (const storageName of ['localStorage', 'sessionStorage'] as const) {
      const originalDescriptor = originalStorageDescriptors.get(storageName);

      if (originalDescriptor) {
        Object.defineProperty(globalThis, storageName, originalDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, storageName);
      }
    }
  });

  it('stores tokens in module memory, clears deterministically, and never writes browser storage', async () => {
    const localStorage: StorageWriteSpy = { setItem: jest.fn() };
    const sessionStorage: StorageWriteSpy = { setItem: jest.fn() };

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: localStorage,
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: sessionStorage,
    });

    const { createRefreshTokenStore } = loadRefreshTokenStoreModule();
    const store = createRefreshTokenStore();

    await store.write('record.secret');
    await expect(store.read()).resolves.toBe('record.secret');
    await store.clear();
    await expect(store.read()).resolves.toBeNull();
    expect(localStorage.setItem).not.toHaveBeenCalled();
    expect(sessionStorage.setItem).not.toHaveBeenCalled();
  });

  it('shares module-memory state between store instances', async () => {
    const { createRefreshTokenStore } = loadRefreshTokenStoreModule();
    const writer = createRefreshTokenStore();
    const reader = createRefreshTokenStore();

    await writer.write('record.secret');

    await expect(reader.read()).resolves.toBe('record.secret');
  });

  it('starts empty after module reload', async () => {
    const { createRefreshTokenStore } = loadRefreshTokenStoreModule();

    await createRefreshTokenStore().write('record.secret');
    jest.resetModules();
    const reloaded = loadRefreshTokenStoreModule();

    await expect(reloaded.createRefreshTokenStore().read()).resolves.toBeNull();
  });
});
