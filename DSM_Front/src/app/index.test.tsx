import { act, fireEvent, render, screen } from '@testing-library/react-native';

import LoginScreen from './index';

const mockReplace = jest.fn();
const mockShowToast = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('@/features/prototype/prototype-context', () => ({
  usePrototype: () => ({
    showToast: mockShowToast,
    theme: 'dark',
    toastMessage: null,
  }),
}));

afterEach(() => {
  jest.useRealTimers();
});

it('does not simulate authentication without a provider token', async () => {
  jest.useFakeTimers();

  await render(<LoginScreen />);

  await fireEvent.press(
    screen.getByRole('button', { name: 'Google로 계속하기' }),
  );
  await act(async () => {
    jest.advanceTimersByTime(680);
  });
  await fireEvent.press(
    screen.getByRole('button', { name: 'Kakao로 계속하기' }),
  );

  expect(mockReplace).not.toHaveBeenCalled();
  expect(mockShowToast).toHaveBeenCalledWith(
    '소셜 로그인 연결은 다음 단계에서 제공됩니다.',
  );
});
