import {
  getAccountDeletionUrl,
  getPrivacyPolicyUrl,
  openLegalLink,
  parseLegalUrl,
} from './legal-links';

jest.mock('react-native-config', () => ({
  PRIVACY_POLICY_URL: 'https://legal.example.invalid/privacy',
  ACCOUNT_DELETION_URL:
    'https://legal.example.invalid/privacy#account-deletion',
}));

it('reads and normalizes both legal URLs from native config', () => {
  expect(getPrivacyPolicyUrl()).toBe(
    'https://legal.example.invalid/privacy',
  );
  expect(getAccountDeletionUrl()).toBe(
    'https://legal.example.invalid/privacy#account-deletion',
  );
});

it('allows a prominent account deletion anchor', () => {
  expect(
    parseLegalUrl(
      'https://www.example.com/privacy#delete-account',
      'ACCOUNT_DELETION_URL',
    ),
  ).toBe('https://www.example.com/privacy#delete-account');
});

it.each([
  undefined,
  '',
  'not-a-url',
  'http://www.example.com/privacy',
  'https://user:password@www.example.com/privacy',
  ['java', 'script:alert(1)'].join(''),
])('rejects an unsafe public legal URL without echoing it', (raw) => {
  expect(() => parseLegalUrl(raw, 'PRIVACY_POLICY_URL')).toThrow(
    /PRIVACY_POLICY_URL/,
  );
  try {
    parseLegalUrl(raw, 'PRIVACY_POLICY_URL');
  } catch (error) {
    if (raw) {
      expect(String(error)).not.toContain(raw);
    }
  }
});

it('opens a validated legal URL', async () => {
  const openURL = jest.fn().mockResolvedValue(undefined);

  await expect(openLegalLink('privacy', openURL)).resolves.toBe(true);

  expect(openURL).toHaveBeenCalledWith(
    'https://legal.example.invalid/privacy',
  );
});

it('returns a safe failure when the platform cannot open the URL', async () => {
  const openURL = jest.fn().mockRejectedValue(new Error('platform detail'));

  await expect(openLegalLink('account-deletion', openURL)).resolves.toBe(false);
});
