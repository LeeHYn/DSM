function isPrivateDevelopmentHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '::1') {
    return true;
  }

  const octets = hostname.split('.').map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }

  return (
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}

export function getApiBaseUrl(
  raw = process.env.EXPO_PUBLIC_API_BASE_URL,
  isDevelopment = __DEV__,
): string {
  if (!raw) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL is required');
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('EXPO_PUBLIC_API_BASE_URL is unsafe');
  }

  const developmentHttp =
    isDevelopment &&
    url.protocol === 'http:' &&
    isPrivateDevelopmentHost(url.hostname);

  if (
    (url.protocol !== 'https:' && !developmentHttp) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL is unsafe');
  }

  return url.toString().replace(/\/+$/, '');
}
