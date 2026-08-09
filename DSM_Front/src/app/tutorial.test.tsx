import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { SessionAction } from '@/features/auth/session-controller';
import { ApiError } from '@/lib/api/api-error';
import { PrototypeProvider } from '@/features/prototype/prototype-context';
import { tutorialPages } from '@/features/prototype/prototype-data';

import TutorialScreen from './tutorial';

const mockUseSession = jest.fn();

jest.mock('@/features/auth/session-context', () => ({
  useSession: () => mockUseSession(),
}));

function makeOnboardingSession(
  completeOnboarding: jest.MockedFunction<() => Promise<void>>,
  error: ApiError | null = null,
  action: SessionAction = 'idle',
) {
  return {
    state: {
      status: 'onboarding' as const,
      userId: 'user-1',
      onboardingCompletedAt: null,
    },
    action,
    error,
    completeOnboarding,
    logout: jest.fn(),
    retryRecovery: jest.fn(),
    signIn: jest.fn(),
  };
}

describe('TutorialScreen', () => {
  beforeEach(() => {
    mockUseSession.mockReset();
  });

  it.each(['시작하기', '건너뛰기'])(
    '%s persists canonical onboarding completion',
    async (label) => {
      const completeOnboarding = jest.fn().mockResolvedValue(undefined);
      mockUseSession.mockReturnValue(
        makeOnboardingSession(completeOnboarding),
      );
      await render(
        <PrototypeProvider>
          <TutorialScreen />
        </PrototypeProvider>,
      );

      if (label === '시작하기') {
        for (let index = 1; index < tutorialPages.length; index += 1) {
          await fireEvent.press(screen.getByRole('button', { name: '다음' }));
        }
      }
      await fireEvent.press(screen.getByRole('button', { name: label }));

      await waitFor(() =>
        expect(completeOnboarding).toHaveBeenCalledTimes(1),
      );
    },
  );

  it('consumes a rejected completion request and permits a later retry', async () => {
    const completeOnboarding = jest
      .fn()
      .mockRejectedValueOnce(new Error('completion-rejection-sentinel'))
      .mockResolvedValueOnce(undefined);
    mockUseSession.mockReturnValue(
      makeOnboardingSession(completeOnboarding),
    );
    await render(
      <PrototypeProvider>
        <TutorialScreen />
      </PrototypeProvider>,
    );

    await fireEvent.press(screen.getByRole('button', { name: '건너뛰기' }));
    await waitFor(() =>
      expect(completeOnboarding).toHaveBeenCalledTimes(1),
    );
    await fireEvent.press(screen.getByRole('button', { name: '건너뛰기' }));

    await waitFor(() =>
      expect(completeOnboarding).toHaveBeenCalledTimes(2),
    );
  });

  it.each(['network', 'timeout'] as const)(
    'shows safe retry copy for a %s completion failure',
    async (kind) => {
      mockUseSession.mockReturnValue(
        makeOnboardingSession(
          jest.fn().mockResolvedValue(undefined),
          new ApiError(kind, 'diagnostic-message-sentinel', {
            cause: 'response-body-sentinel',
          }),
        ),
      );
      await render(
        <PrototypeProvider>
          <TutorialScreen />
        </PrototypeProvider>,
      );

      expect(
        screen.getByText('완료 상태를 저장하지 못했어요. 다시 시도해 주세요.'),
      ).toBeOnTheScreen();
      expect(screen.queryByText(/diagnostic-message-sentinel/)).toBeNull();
      expect(screen.queryByText(/response-body-sentinel/)).toBeNull();
    },
  );

  it('does not show retry copy for a non-retryable completion failure', async () => {
    mockUseSession.mockReturnValue(
      makeOnboardingSession(
        jest.fn().mockResolvedValue(undefined),
        new ApiError('http', 'diagnostic-message-sentinel'),
      ),
    );
    await render(
      <PrototypeProvider>
        <TutorialScreen />
      </PrototypeProvider>,
    );

    expect(
      screen.queryByText('완료 상태를 저장하지 못했어요. 다시 시도해 주세요.'),
    ).toBeNull();
  });

  it('disables both completion controls while onboarding completion is pending', async () => {
    mockUseSession.mockReturnValue(
      makeOnboardingSession(
        jest.fn().mockResolvedValue(undefined),
        null,
        'completing-onboarding',
      ),
    );
    await render(
      <PrototypeProvider>
        <TutorialScreen />
      </PrototypeProvider>,
    );

    for (let index = 1; index < tutorialPages.length; index += 1) {
      await fireEvent.press(screen.getByRole('button', { name: '다음' }));
    }

    expect(screen.getByRole('button', { name: '시작하기' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '건너뛰기' })).toBeDisabled();
  });
});
