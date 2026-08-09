import type { ComponentProps } from 'react';
import { Stack } from 'expo-router';

import type { SessionState } from './session-controller';
import { useSession } from './session-context';

export type SessionRouteGuards = {
  unauthenticated: boolean;
  recovery: boolean;
  onboarding: boolean;
  authenticated: boolean;
};

export type SessionStackProps = Omit<ComponentProps<typeof Stack>, 'children'>;

export function getSessionRouteGuards(
  status: SessionState['status'],
): SessionRouteGuards {
  return {
    unauthenticated: status === 'unauthenticated',
    recovery: status === 'offline' || status === 'storage-error',
    onboarding: status === 'onboarding',
    authenticated: status === 'authenticated',
  };
}

export function SessionStack(props: SessionStackProps) {
  const { state } = useSession();

  if (state.status === 'bootstrapping') {
    return null;
  }

  const guards = getSessionRouteGuards(state.status);

  return (
    <Stack {...props}>
      <Stack.Protected guard={guards.unauthenticated}>
        <Stack.Screen name="index" />
        <Stack.Screen name="explore" />
      </Stack.Protected>
      <Stack.Protected guard={guards.recovery}>
        <Stack.Screen name="session-recovery" />
      </Stack.Protected>
      <Stack.Protected guard={guards.onboarding}>
        <Stack.Screen name="tutorial" />
      </Stack.Protected>
      <Stack.Protected guard={guards.authenticated}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
    </Stack>
  );
}
