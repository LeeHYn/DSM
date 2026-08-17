import { render, screen } from '@testing-library/react-native';

import type { SessionSnapshot, SessionState } from './session-controller';
import { SessionProvider } from './session-context';
import {
  getSessionRouteGuards,
  getSessionRouteName,
  SessionStack,
} from './session-routing';

jest.mock('@/app/(tabs)/_layout', () => () => null);
jest.mock('@/app/index', () => () => null);
jest.mock('@/app/session-recovery', () => () => null);
jest.mock('@/app/tutorial', () => () => null);

jest.mock('@react-navigation/native-stack', () => {
  const React = require('react');
  const { Text: NativeText, View: NativeView } = require('react-native');

  function Navigator({ children, screenOptions }: any) {
    return React.createElement(
      NativeView,
      {
        accessibilityLabel:
          screenOptions?.headerShown === false
            ? 'root-options-preserved'
            : 'root-options-missing',
        testID: 'session-stack',
      },
      children,
    );
  }

  function Screen({ name }: any) {
    return React.createElement(
      NativeText,
      { testID: `session-route-${name}` },
      name,
    );
  }

  return {
    createNativeStackNavigator: () => ({ Navigator, Screen }),
  };
});

function createController(state: SessionState) {
  const snapshot: SessionSnapshot = {
    action: 'idle',
    error: null,
    state,
  };

  return {
    bootstrap: jest.fn().mockResolvedValue(undefined),
    completeOnboarding: jest.fn().mockResolvedValue(undefined),
    endUnauthorizedSession: jest.fn().mockResolvedValue(undefined),
    getAccessToken: jest.fn().mockReturnValue(null),
    getEpoch: jest.fn().mockReturnValue(0),
    getSnapshot: jest.fn(() => snapshot),
    logout: jest.fn().mockResolvedValue(undefined),
    refreshAccessToken: jest.fn().mockResolvedValue('access'),
    retryRecovery: jest.fn().mockResolvedValue(undefined),
    signIn: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn(() => jest.fn()),
  };
}

it.each([
  ['bootstrapping', [false, false, false, false]],
  ['unauthenticated', [true, false, false, false]],
  ['offline', [false, true, false, false]],
  ['storage-error', [false, true, false, false]],
  ['onboarding', [false, false, true, false]],
  ['authenticated', [false, false, false, true]],
])('maps %s to one route group', (status, expected) => {
  const guards = getSessionRouteGuards(status as SessionState['status']);

  expect([
    guards.unauthenticated,
    guards.recovery,
    guards.onboarding,
    guards.authenticated,
  ]).toEqual(expected);
});

it.each([
  ['bootstrapping', null],
  ['unauthenticated', 'Login'],
  ['offline', 'SessionRecovery'],
  ['storage-error', 'SessionRecovery'],
  ['onboarding', 'Tutorial'],
  ['authenticated', 'AppTabs'],
])('maps %s to the single active native route %s', (status, expected) => {
  expect(getSessionRouteName(status as SessionState['status'])).toBe(expected);
});

it('renders no navigator while the session is bootstrapping', async () => {
  await render(
    <SessionProvider
      controller={createController({ status: 'bootstrapping' })}>
      <SessionStack screenOptions={{ headerShown: false }} />
    </SessionProvider>,
  );

  expect(screen.queryByTestId('session-stack')).toBeNull();
});

it('renders only the active native route and preserves root options', async () => {
  await render(
    <SessionProvider
      controller={createController({
        status: 'onboarding',
        userId: 'user-1',
        onboardingCompletedAt: null,
      })}>
      <SessionStack screenOptions={{ headerShown: false }} />
    </SessionProvider>,
  );

  expect(await screen.findByLabelText('root-options-preserved')).toBeOnTheScreen();
  expect(screen.getByTestId('session-route-Tutorial')).toBeOnTheScreen();
  expect(screen.queryByTestId('session-route-Login')).toBeNull();
  expect(screen.queryByTestId('session-route-SessionRecovery')).toBeNull();
  expect(screen.queryByTestId('session-route-AppTabs')).toBeNull();
});
