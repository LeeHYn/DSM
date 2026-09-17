import * as Keychain from 'react-native-keychain';
import { LocalSessionStore } from './local-session-store';

const service = 'dsm.auth.local-session.v1';
export function createLocalSessionStore(): LocalSessionStore {
  return new LocalSessionStore({
    async read() {
      const value = await Keychain.getGenericPassword({ service });
      return value === false ? null : value.password;
    },
    async write(value) {
      await Keychain.setGenericPassword('local-session', value, {
        service, accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      const readback = await Keychain.getGenericPassword({ service });
      if (readback === false || readback.password !== value) {
        throw new Error('Local session storage failed');
      }
    },
  });
}
