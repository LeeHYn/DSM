import 'react-native-get-random-values';
import { TurboModuleRegistry, type TurboModule } from 'react-native';
import { createAsyncStorage } from '@react-native-async-storage/async-storage';
import { v4 as uuidV4 } from 'uuid';
import {
  OfflineTaskStorage,
  OfflineTaskStorageError,
  type StringStorage,
} from './task-offline-storage';

const accounts = new Map<string, OfflineTaskStorage>();
let backing: StringStorage | undefined;

/** Keep live writers for at most ten accounts; never evict unsaved or pending work. */
export function getOfflineTaskStorage(userId: string): OfflineTaskStorage {
  const existing = accounts.get(userId);
  if (existing) return existing;
  if (accounts.size >= 10) throw new OfflineTaskStorageError('limit');
  try {
    backing ??= createAsyncStorage('dsm_tasks_v1');
    const storage = new OfflineTaskStorage(backing, userId);
    accounts.set(userId, storage);
    return storage;
  } catch (error) {
    if (error instanceof OfflineTaskStorageError) throw error;
    throw new OfflineTaskStorageError('read');
  }
}

interface NativeEntropy extends TurboModule {
  getRandomBase64(byteLength: number): string;
}

export class TaskMutationIdError extends Error {
  constructor() {
    super('Task identifier could not be generated');
    this.name = 'TaskMutationIdError';
  }

  toJSON() {
    return { name: this.name, message: this.message };
  }
}

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function createTaskMutationId(): string {
  try {
    const runtime = globalThis as typeof globalThis & {
      RN$Bridgeless?: boolean;
      nativeCallSyncHook?: unknown;
    };
    if (__DEV__ && runtime.RN$Bridgeless !== true &&
      typeof runtime.nativeCallSyncHook === 'undefined') {
      throw new TaskMutationIdError();
    }
    // Direct native input avoids both polyfill fallbacks and crypto.randomUUID shortcuts.
    const native = TurboModuleRegistry.getEnforcing<NativeEntropy>('RNGetRandomValues');
    const encoded = native.getRandomBase64(16);
    if (typeof encoded !== 'string' || !/^[A-Za-z0-9+/]{21}[AQgw]==$/.test(encoded)) {
      throw new TaskMutationIdError();
    }
    const random = new Uint8Array(16);
    for (let i = 0; i < random.length; i++) {
      const bit = i * 8;
      const position = Math.floor(bit / 6);
      const pair = alphabet.indexOf(encoded[position]) * 64 +
        alphabet.indexOf(encoded[position + 1]);
      random[i] = Math.floor(pair / (2 ** (4 - bit % 6))) % 256;
    }
    const id = uuidV4({ random });
    if (typeof id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      throw new TaskMutationIdError();
    }
    return id;
  } catch {
    throw new TaskMutationIdError();
  }
}
