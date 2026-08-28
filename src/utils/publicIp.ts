const CACHE_KEY = 'keepguard_public_ip';
const CACHE_TTL_MS = 60 * 60 * 1000;
const LOOKUP_TIMEOUT_MS = 2500;

let inFlight: Promise<string | null> | null = null;

function isPublicIp(ip: string): boolean {
  const value = ip.trim();
  if (!value) {
    return false;
  }
  if (value.includes(':')) {
    const lower = value.toLowerCase();
    return lower !== '::1' && !lower.startsWith('fc') && !lower.startsWith('fd') && !lower.startsWith('fe80');
  }
  const parts = value.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10 || a === 127) {
    return false;
  }
  if (a === 192 && b === 168) {
    return false;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return false;
  }
  if (a === 169 && b === 254) {
    return false;
  }
  return true;
}

function readCache(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { ip?: string; at?: number };
    if (!parsed.ip || !parsed.at || Date.now() - parsed.at > CACHE_TTL_MS) {
      return null;
    }
    return isPublicIp(parsed.ip) ? parsed.ip : null;
  } catch {
    return null;
  }
}

function writeCache(ip: string) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ip, at: Date.now() }));
  } catch {
    // ignore quota / private mode
  }
}

async function fetchJsonIp(url: string, ipField: 'ip' | 'query' = 'ip'): Promise<string | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    const ip = typeof data?.[ipField] === 'string' ? data[ipField] : null;
    if (data?.success === false) {
      return null;
    }
    return ip && isPublicIp(ip) ? ip : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

async function lookupPublicIp(): Promise<string | null> {
  const [ipv4, fallback] = await Promise.all([
    fetchJsonIp('https://api4.ipify.org?format=json'),
    fetchJsonIp('https://ipwho.is/?fields=success,ip'),
  ]);
  if (ipv4 && !ipv4.includes(':')) {
    return ipv4;
  }
  if (fallback && !fallback.includes(':')) {
    return fallback;
  }
  return ipv4 || fallback;
}

export function prefetchPublicClientIp(): void {
  void getPublicClientIp();
}

export async function getPublicClientIp(): Promise<string | null> {
  const cached = readCache();
  if (cached) {
    return cached;
  }
  if (inFlight) {
    return inFlight;
  }
  inFlight = lookupPublicIp().then((ip) => {
    if (ip) {
      writeCache(ip);
    }
    return ip;
  }).finally(() => {
    inFlight = null;
  });
  return inFlight;
}
