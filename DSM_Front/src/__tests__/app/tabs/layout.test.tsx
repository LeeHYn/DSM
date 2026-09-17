import { render, screen } from '@testing-library/react-native';
import TabLayout from '../../../app/(tabs)/_layout';
const mockSession = { state: { status: 'authenticated' } };
jest.mock('@/features/auth/session-context', () => ({ useSession: () => mockSession }));
jest.mock('@/features/prototype/prototype-context', () => ({ usePrototype: () => ({ theme: 'dark' }) }));
jest.mock('@/features/product/product-context', () => ({ ProductProvider: ({ children }: { children: unknown }) => children }));
jest.mock('@/components/dailyup/task-sheets', () => ({ TaskSheets: () => null }));
jest.mock('@/components/dailyup/notification-task-bridge', () => ({ NotificationTaskBridge: () => null }));
jest.mock('../../../app/(tabs)/index', () => {
  const React = require('react'); const { Text } = require('react-native');
  return () => React.createElement(Text, null, 'local-home');
});
jest.mock('../../../app/(tabs)/ranking', () => {
  const React = require('react'); const { Text } = require('react-native');
  return () => React.createElement(Text, null, 'remote-ranking');
});
jest.mock('../../../app/(tabs)/mypage', () => {
  const React = require('react'); const { Text } = require('react-native');
  return () => React.createElement(Text, null, 'remote-profile');
});
jest.mock('../../../app/session-recovery', () => {
  const React = require('react'); const { Text } = require('react-native');
  return () => React.createElement(Text, null, 'verify-session');
});
jest.mock('@react-navigation/bottom-tabs', () => {
  const React = require('react');
  return { createBottomTabNavigator: () => ({
    Navigator: ({ children }: { children: unknown }) => children,
    Screen: ({ component }: { component: unknown }) => React.createElement(component),
  }) };
});
test('retains the local home while remote account and ranking screens require an authenticated session', async () => {
  mockSession.state.status = 'authenticated';
  const view = await render(<TabLayout />);
  expect(screen.getByText('remote-profile')).toBeOnTheScreen();
  mockSession.state.status = 'offline-workspace';
  await view.rerender(<TabLayout />);
  expect(screen.getByText('local-home')).toBeOnTheScreen();
  expect(screen.queryByText('remote-ranking')).toBeNull();
  expect(screen.queryByText('remote-profile')).toBeNull();
  expect(screen.getAllByText('verify-session')).toHaveLength(2);
  mockSession.state.status = 'authenticated';
  await view.rerender(<TabLayout />);
  expect(screen.getByText('remote-ranking')).toBeOnTheScreen();
});
