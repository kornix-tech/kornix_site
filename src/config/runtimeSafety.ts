const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const allowPrivateMockRuntime = import.meta.env.VITE_ALLOW_PRIVATE_MOCK_RUNTIME === 'true';

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  return (
    parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}

export function isLocalRuntimeHost(hostname = window.location.hostname): boolean {
  if (LOCAL_HOSTS.has(hostname)) {
    return true;
  }

  return allowPrivateMockRuntime && (hostname.endsWith('.local') || isPrivateIpv4(hostname));
}

export function isMockRuntimeAllowed(): boolean {
  return isLocalRuntimeHost();
}
