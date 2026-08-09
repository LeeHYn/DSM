import { render, screen, within } from '@testing-library/react-native';

import type { SessionSnapshot, SessionState } from './session-controller';
import { SessionProvider } from './session-context';
import { getSessionRouteGuards, SessionStack } from './session-routing';

jest.mock('expo-router', () => {
  const React = require('react');
  const { Text: NativeText, View: NativeView } = require('react-native');

  function Stack({ children, screenOptions }: any) {
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

  Stack.Protected = function Protected({ guard, children }: any) {
    return React.createElement(
      NativeView,
      {
        accessibilityState: { disabled: !guard },
        testID: 'session-route-guard',
      },
      children,
    );
  };
  Stack.Screen = function Screen({ name }: any) {
    return React.createElement(
      NativeText,
      { testID: `session-route-${name}` },
      name,
    );
  };

  return { Stack };
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

it('renders no navigator while the session is bootstrapping', async () => {
  await render(
    <SessionProvider
      controller={createController({ status: 'bootstrapping' })}>
      <SessionStack screenOptions={{ headerShown: false }} />
    </SessionProvider>,
  );

  expect(screen.queryByTestId('session-stack')).toBeNull();
});

it('declares each route once under its session guard and preserves root options', async () => {
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
  expect(screen.getAllByTestId('session-route-guard')).toHaveLength(4);
  expect(screen.getAllByTestId('session-route-index')).toHaveLength(1);
  expect(screen.getAllByTestId('session-route-explore')).toHaveLength(1);
  expect(screen.getAllByTestId('session-route-session-recovery')).toHaveLength(1);
  expect(screen.getAllByTestId('session-route-tutorial')).toHaveLength(1);
  expect(screen.getAllByTestId('session-route-(tabs)')).toHaveLength(1);

  const guards = screen.getAllByTestId('session-route-guard');
  expect(guards.map((guard) => guard.props.accessibilityState)).toEqual([
    { disabled: true },
    { disabled: true },
    { disabled: false },
    { disabled: true },
  ]);
  expect(within(guards[0]).getByTestId('session-route-index')).toBeOnTheScreen();
  expect(within(guards[0]).getByTestId('session-route-explore')).toBeOnTheScreen();
  expect(
    within(guards[1]).getByTestId('session-route-session-recovery'),
  ).toBeOnTheScreen();
  expect(within(guards[2]).getByTestId('session-route-tutorial')).toBeOnTheScreen();
  expect(within(guards[3]).getByTestId('session-route-(tabs)')).toBeOnTheScreen();
});
