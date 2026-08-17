import type { ComponentProps } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import AppTabs from '@/app/(tabs)/_layout';
import LoginScreen from '@/app/index';
import SessionRecoveryScreen from '@/app/session-recovery';
import TutorialScreen from '@/app/tutorial';

import type { SessionState } from './session-controller';
import { useSession } from './session-context';

export type SessionRouteGuards = {
  unauthenticated: boolean;
  recovery: boolean;
  onboarding: boolean;
  authenticated: boolean;
};

export type SessionRouteName =
  | 'Login'
  | 'SessionRecovery'
  | 'Tutorial'
  | 'AppTabs';

export type SessionStackParamList = {
  Login: undefined;
  SessionRecovery: undefined;
  Tutorial: undefined;
  AppTabs: undefined;
};

const Stack = createNativeStackNavigator<SessionStackParamList>();

export type SessionStackProps = Omit<
  ComponentProps<typeof Stack.Navigator>,
  'children'
>;

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

export function getSessionRouteName(
  status: SessionState['status'],
): SessionRouteName | null {
  if (status === 'bootstrapping') {
    return null;
  }
  if (status === 'unauthenticated') {
    return 'Login';
  }
  if (status === 'offline' || status === 'storage-error') {
    return 'SessionRecovery';
  }
  if (status === 'onboarding') {
    return 'Tutorial';
  }
  return 'AppTabs';
}

export function SessionStack(props: SessionStackProps) {
  const { state } = useSession();
  const routeName = getSessionRouteName(state.status);

  if (routeName === null) {
    return null;
  }

  return (
    <Stack.Navigator {...props} key={routeName} initialRouteName={routeName}>
      {routeName === 'Login' ? (
        <Stack.Screen component={LoginScreen} name="Login" />
      ) : null}
      {routeName === 'SessionRecovery' ? (
        <Stack.Screen
          component={SessionRecoveryScreen}
          name="SessionRecovery"
        />
      ) : null}
      {routeName === 'Tutorial' ? (
        <Stack.Screen component={TutorialScreen} name="Tutorial" />
      ) : null}
      {routeName === 'AppTabs' ? (
        <Stack.Screen component={AppTabs} name="AppTabs" />
      ) : null}
    </Stack.Navigator>
  );
}
