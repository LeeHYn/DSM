import { Linking } from 'react-native';
import Config from 'react-native-config';

export type LegalLinkKind = 'privacy' | 'account-deletion';
type LegalConfigKey = 'PRIVACY_POLICY_URL' | 'ACCOUNT_DELETION_URL';
type OpenUrl = (url: string) => Promise<unknown>;

export function parseLegalUrl(
  raw: string | undefined,
  key: LegalConfigKey,
): string {
  if (!raw) {
    throw new Error(`${key} is required`);
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${key} is unsafe`);
  }

  if (
    url.protocol !== 'https:' ||
    !url.hostname ||
    url.username ||
    url.password
  ) {
    throw new Error(`${key} is unsafe`);
  }

  return url.toString();
}

export function getPrivacyPolicyUrl(
  raw = Config.PRIVACY_POLICY_URL,
): string {
  return parseLegalUrl(raw, 'PRIVACY_POLICY_URL');
}

export function getAccountDeletionUrl(
  raw = Config.ACCOUNT_DELETION_URL,
): string {
  return parseLegalUrl(raw, 'ACCOUNT_DELETION_URL');
}

export async function openLegalLink(
  kind: LegalLinkKind,
  openURL: OpenUrl = Linking.openURL,
): Promise<boolean> {
  try {
    const url =
      kind === 'privacy' ? getPrivacyPolicyUrl() : getAccountDeletionUrl();
    await openURL(url);
    return true;
  } catch {
    return false;
  }
}
