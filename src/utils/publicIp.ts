const CACHE_KEY = 'keepguard_public_net_v1';
const CACHE_TTL_MS = 60 * 60 * 1000;
const LOOKUP_TIMEOUT_MS = 2500;

export type PublicClientNetwork = {
  ip: string;
  location: string | null;
};

let inFlight: Promise<PublicClientNetwork | null> | null = null;

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

function readCache(): PublicClientNetwork | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { ip?: string; location?: string | null; at?: number };
    if (!parsed.ip || !parsed.at || Date.now() - parsed.at > CACHE_TTL_MS) {
      return null;
    }
    if (!isPublicIp(parsed.ip)) {
      return null;
    }
    return {
      ip: parsed.ip,
      location: typeof parsed.location === 'string' && parsed.location.trim() ? parsed.location.trim() : null,
    };
  } catch {
    return null;
  }
}

function writeCache(network: PublicClientNetwork) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ...network, at: Date.now() }));
  } catch {
    // ignore quota / private mode
  }
}

async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    if (data && typeof data === 'object' && data.success === false) {
      return null;
    }
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

async function fetchJsonIp(url: string, ipField: 'ip' | 'query' = 'ip'): Promise<string | null> {
  const data = await fetchJson(url);
  const ip = typeof data?.[ipField] === 'string' ? data[ipField] : null;
  return ip && isPublicIp(ip) ? ip : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function localizeCountry(country: string, countryCode: string): string {
  if (countryCode.toUpperCase() === 'BR' || country.toLowerCase() === 'brazil' || country.toLowerCase() === 'brasil') {
    return 'Brasil';
  }
  return country;
}

export function formatPublicLocation(
  city?: string,
  region?: string,
  country?: string,
  countryCode?: string
): string | null {
  const localizedCountry = localizeCountry(text(country), text(countryCode));
  const parts: string[] = [];
  const cityName = text(city);
  const regionName = text(region);
  if (cityName) {
    parts.push(cityName);
  }
  if (regionName && regionName.toLowerCase() !== cityName.toLowerCase()) {
    parts.push(regionName);
  }
  if (
    localizedCountry
    && localizedCountry.toLowerCase() !== cityName.toLowerCase()
    && localizedCountry.toLowerCase() !== regionName.toLowerCase()
  ) {
    parts.push(localizedCountry);
  }
  return parts.length > 0 ? parts.join(', ') : null;
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

async function lookupLocation(ip: string): Promise<string | null> {
  const geojs = await fetchJson(`https://get.geojs.io/v1/ip/geo/${encodeURIComponent(ip)}.json`);
  const fromGeojs = formatPublicLocation(
    text(geojs?.city),
    text(geojs?.region),
    text(geojs?.country),
    text(geojs?.country_code)
  );
  if (fromGeojs) {
    return fromGeojs;
  }
  const ipwho = await fetchJson(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,city,region,country,country_code`);
  return formatPublicLocation(
    text(ipwho?.city),
    text(ipwho?.region),
    text(ipwho?.country),
    text(ipwho?.country_code)
  );
}

async function lookupPublicNetwork(): Promise<PublicClientNetwork | null> {
  const ip = await lookupPublicIp();
  if (!ip) {
    return null;
  }
  const location = await lookupLocation(ip);
  return { ip, location };
}

export function prefetchPublicClientIp(): void {
  void getPublicClientNetwork();
}

export async function getPublicClientIp(): Promise<string | null> {
  const network = await getPublicClientNetwork();
  return network?.ip ?? null;
}

export async function getPublicClientNetwork(): Promise<PublicClientNetwork | null> {
  const cached = readCache();
  if (cached) {
    return cached;
  }
  if (inFlight) {
    return inFlight;
  }
  inFlight = lookupPublicNetwork().then((network) => {
    if (network) {
      writeCache(network);
    }
    return network;
  }).finally(() => {
    inFlight = null;
  });
  return inFlight;
}
