import { getApiBaseUrl } from '../../config/api-config';
import { createAuthenticatedClient } from '../../lib/api/authenticated-client';
import { createAuthApi } from '../../lib/api/auth-api';
import { createHttpClient } from '../../lib/api/http-client';
import { TokenStoreCoordinator } from './token-store-coordinator';
import { SessionController } from './session-controller';
import { createRefreshTokenStore } from './token-store';
import { createLocalSessionStore } from './local-session-keychain';

function createSessionRuntime() {
  const http = createHttpClient({ baseUrl: getApiBaseUrl() });
  const authApi = createAuthApi(http);
  const store = createRefreshTokenStore();
  let controller!: SessionController;
  const coordinator = new TokenStoreCoordinator(store, () => controller.getEpoch());
  const client = createAuthenticatedClient(http, {
    getAccessToken: () => controller.getAccessToken(),
    getEpoch: () => controller.getEpoch(),
    refreshAccessToken: () => controller.refreshAccessToken(),
    onUnauthorized: () => controller.endUnauthorizedSession(),
  });
  controller = new SessionController({ authApi, authenticatedClient: client,
    tokenStore: coordinator, localSession: createLocalSessionStore() });
  return { controller, client };
}

let runtime: ReturnType<typeof createSessionRuntime> | undefined;
/** Headless and UI entrypoints must never create independent credential writers. */
export function getSessionRuntime(): ReturnType<typeof createSessionRuntime> {
  return runtime ??= createSessionRuntime();
}
