/**
 * Store de tokens fora do React state.
 * Trocar o JWT não provoca re-render da árvore de UI.
 * O cliente HTTP sempre lê o valor atual via getAccessToken().
 */

export const TOKEN_STORAGE_KEY = 'keepguard_access_token';
export const REFRESH_STORAGE_KEY = 'keepguard_refresh_token';
export const USER_STORAGE_KEY = 'keepguard_user';
export const LAST_REFRESH_STORAGE_KEY = 'keepguard_last_refresh_time';
export const REFRESH_COUNT_STORAGE_KEY = 'keepguard_refresh_count';

/** Renova X ms antes do exp do access token */
const REFRESH_SKEW_MS = 60_000;
const MIN_REFRESH_DELAY_MS = 5_000;
/** Se o usuário ficou inativo além disso, o job adia o refresh até nova atividade */
const IDLE_THRESHOLD_MS = 5 * 60 * 1000;
const IDLE_RETRY_MS = 30_000;
/** Fallback se o JWT não tiver claim exp */
const FALLBACK_REFRESH_MS = 10 * 60 * 1000;

type Listener = () => void;

let accessToken: string | null = null;
let refreshToken: string | null = null;
let lastRefreshTime: Date | null = null;
let refreshCount = 0;
let lastActivityAt = Date.now();
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let refreshInFlight: Promise<boolean> | null = null;
let version = 0;

const listeners = new Set<Listener>();
let sessionEndedHandler: (() => void) | null = null;

/** Injeta a chamada HTTP de refresh (evita ciclo api ↔ tokenStore ↔ authService) */
type RefreshExecutor = (token: string) => Promise<{
  accessToken?: string;
  token?: string;
  refreshToken?: string;
  expiresIn?: number;
  expiresInSeconds?: number;
}>;

let refreshExecutor: RefreshExecutor | null = null;

export function parseJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const jsonPayload = decodeURIComponent(
      atob(padded)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getTokenExpiresAtMs(token: string): number | null {
  const claims = parseJwtPayload(token);
  const exp = claims?.exp;
  if (typeof exp !== 'number') return null;
  return exp * 1000;
}

function notify() {
  version += 1;
  listeners.forEach((l) => l());
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getVersion(): number {
  return version;
}

export function setRefreshExecutor(executor: RefreshExecutor): void {
  refreshExecutor = executor;
}

export function onSessionEnded(handler: (() => void) | null): void {
  sessionEndedHandler = handler;
}

export function markActivity(): void {
  lastActivityAt = Date.now();
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function getRefreshToken(): string | null {
  return refreshToken;
}

export function getLastRefreshTime(): Date | null {
  return lastRefreshTime;
}

export function getRefreshCount(): number {
  return refreshCount;
}

export function hydrateFromStorage(): { accessToken: string | null; refreshToken: string | null } {
  if (typeof window === 'undefined') {
    return { accessToken: null, refreshToken: null };
  }
  accessToken = localStorage.getItem(TOKEN_STORAGE_KEY);
  refreshToken = localStorage.getItem(REFRESH_STORAGE_KEY);
  const savedRefresh = localStorage.getItem(LAST_REFRESH_STORAGE_KEY);
  lastRefreshTime = savedRefresh ? new Date(savedRefresh) : null;
  const savedCount = localStorage.getItem(REFRESH_COUNT_STORAGE_KEY);
  refreshCount = savedCount ? parseInt(savedCount, 10) || 0 : 0;
  notify();
  return { accessToken, refreshToken };
}

export function setTokens(nextAccess: string, nextRefresh?: string | null): void {
  accessToken = nextAccess || null;
  if (nextRefresh !== undefined) {
    refreshToken = nextRefresh || null;
  }

  if (typeof window !== 'undefined') {
    if (accessToken) {
      localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
    if (refreshToken) {
      localStorage.setItem(REFRESH_STORAGE_KEY, refreshToken);
    } else {
      localStorage.removeItem(REFRESH_STORAGE_KEY);
    }
  }

  notify();
  scheduleProactiveRefresh();
}

function bumpRefreshMeta(): void {
  lastRefreshTime = new Date();
  refreshCount += 1;
  if (typeof window !== 'undefined') {
    localStorage.setItem(LAST_REFRESH_STORAGE_KEY, lastRefreshTime.toISOString());
    localStorage.setItem(REFRESH_COUNT_STORAGE_KEY, String(refreshCount));
  }
  notify();
}

/** Chamado no login: zera métricas de refresh sem disparar logout */
export function resetRefreshMeta(): void {
  lastRefreshTime = null;
  refreshCount = 0;
  if (typeof window !== 'undefined') {
    localStorage.removeItem(LAST_REFRESH_STORAGE_KEY);
    localStorage.setItem(REFRESH_COUNT_STORAGE_KEY, '0');
  }
  notify();
}

export function clearTokens(options?: { notifySessionEnded?: boolean }): void {
  clearProactiveRefresh();
  accessToken = null;
  refreshToken = null;
  lastRefreshTime = null;
  refreshCount = 0;

  if (typeof window !== 'undefined') {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(REFRESH_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    localStorage.removeItem(LAST_REFRESH_STORAGE_KEY);
    localStorage.removeItem(REFRESH_COUNT_STORAGE_KEY);
  }

  notify();

  if (options?.notifySessionEnded !== false) {
    sessionEndedHandler?.();
  }
}

export function clearProactiveRefresh(): void {
  if (refreshTimer !== null) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

function computeRefreshDelayMs(token: string): number {
  const expiresAt = getTokenExpiresAtMs(token);
  if (expiresAt == null) {
    return FALLBACK_REFRESH_MS;
  }
  const delay = expiresAt - Date.now() - REFRESH_SKEW_MS;
  return Math.max(MIN_REFRESH_DELAY_MS, delay);
}

export function scheduleProactiveRefresh(): void {
  clearProactiveRefresh();
  if (!accessToken) return;

  const delay = computeRefreshDelayMs(accessToken);
  refreshTimer = setTimeout(() => {
    void runScheduledRefresh();
  }, delay);
}

async function runScheduledRefresh(): Promise<void> {
  const inactiveFor = Date.now() - lastActivityAt;
  if (inactiveFor >= IDLE_THRESHOLD_MS) {
    // Usuário idle: não renova agora; tenta de novo em breve se voltar a atividade
    refreshTimer = setTimeout(() => {
      void runScheduledRefresh();
    }, IDLE_RETRY_MS);
    return;
  }

  const ok = await ensureFreshToken({ force: true });
  if (!ok && !accessToken) {
    return;
  }
  scheduleProactiveRefresh();
}

/**
 * Single-flight: várias chamadas (401 paralelos + job) compartilham a mesma Promise.
 * @param force — true para o job agendado (renova mesmo se ainda não estiver perto do exp)
 */
export async function ensureFreshToken(options?: { force?: boolean }): Promise<boolean> {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  const currentAccess = accessToken;
  const tokenToUse = refreshToken || currentAccess;
  if (!tokenToUse) {
    return false;
  }

  if (!options?.force && currentAccess) {
    const expiresAt = getTokenExpiresAtMs(currentAccess);
    if (expiresAt != null && expiresAt - Date.now() > REFRESH_SKEW_MS) {
      return true;
    }
  }

  if (!refreshExecutor) {
    console.error('tokenStore: refreshExecutor não configurado');
    return false;
  }

  refreshInFlight = (async () => {
    try {
      const res = await refreshExecutor!(tokenToUse);
      const newAccess = res.accessToken || res.token;
      const newRefresh = res.refreshToken || res.token || res.accessToken || tokenToUse;

      if (!newAccess) {
        return false;
      }

      setTokens(newAccess, newRefresh);
      bumpRefreshMeta();
      lastActivityAt = Date.now();
      return true;
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      const errorCode = (err as { data?: { errorCode?: string; error?: string } })?.data?.errorCode
        || (err as { data?: { error?: string } })?.data?.error;

      console.error('Falha ao renovar token:', err);

      if (
        status === 401
        || errorCode === 'TOKEN_REVOKED'
        || errorCode === 'INVALID_TOKEN'
      ) {
        clearTokens({ notifySessionEnded: true });
      }
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

let cachedMetaSnapshot: {
  accessToken: string | null;
  lastRefreshTime: Date | null;
  refreshCount: number;
  version: number;
} | null = null;

/** Snapshot estável para useSyncExternalStore (tela de credenciais / debug) */
export function getTokenMetaSnapshot(): {
  accessToken: string | null;
  lastRefreshTime: Date | null;
  refreshCount: number;
  version: number;
} {
  if (!cachedMetaSnapshot || cachedMetaSnapshot.version !== version) {
    cachedMetaSnapshot = {
      accessToken,
      lastRefreshTime,
      refreshCount,
      version,
    };
  }
  return cachedMetaSnapshot;
}
