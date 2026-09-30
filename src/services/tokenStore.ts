/**
 * Store de tokens fora do React state.
 * Trocar o JWT não provoca re-render da árvore de UI.
 * O cliente HTTP sempre lê o valor atual via getAccessToken().
 *
 * Fase 3 do redesenho de sessão: access token SÓ em memória (nunca
 * localStorage/sessionStorage). F5 ou aba nova = refresh silencioso via
 * cookie HttpOnly (keepguard_refresh_token), não via storage do browser.
 * Múltiplas abas coordenam o refresh via Web Locks + BroadcastChannel, para
 * que só uma renove por vez e as outras recebam o resultado sem re-rodar
 * a chamada de rede.
 */

export const USER_STORAGE_KEY = 'keepguard_user';
export const LAST_REFRESH_STORAGE_KEY = 'keepguard_last_refresh_time';
export const REFRESH_COUNT_STORAGE_KEY = 'keepguard_refresh_count';

/** Renova X ms antes do exp do access token */
const REFRESH_SKEW_MS = 120_000;
const MIN_REFRESH_DELAY_MS = 5_000;
/** Fallback se o JWT não tiver claim exp */
const FALLBACK_REFRESH_MS = 10 * 60 * 1000;

const REFRESH_LOCK_NAME = 'kg-refresh';
const BROADCAST_CHANNEL_NAME = 'kg-auth';

type Listener = () => void;

// Access token e refresh token vivem só em memória desta aba. Nunca são
// persistidos — nem localStorage (permanente) nem sessionStorage (sobrevive
// a F5, mas ainda é lido por qualquer script na página, superfície de XSS).
let accessToken: string | null = null;
let refreshToken: string | null = null;
let lastRefreshTime: Date | null = null;
let refreshCount = 0;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let refreshInFlight: Promise<boolean> | null = null;
let version = 0;

const listeners = new Set<Listener>();
let sessionEndedHandler: (() => void) | null = null;

let broadcastChannel: BroadcastChannel | null = null;
function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    return null;
  }
  if (!broadcastChannel) {
    broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    broadcastChannel.onmessage = (event: MessageEvent) => {
      const msg = event.data as
        | { type: 'tokens-updated'; accessToken: string; refreshToken: string | null }
        | { type: 'session-ended' }
        | undefined;
      if (!msg) return;
      if (msg.type === 'tokens-updated') {
        applyTokens(msg.accessToken, msg.refreshToken, { broadcast: false });
        bumpRefreshMeta();
      } else if (msg.type === 'session-ended') {
        clearTokens({ notifySessionEnded: true, broadcast: false });
      }
    };
  }
  return broadcastChannel;
}

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

export function isTokenExpired(token: string): boolean {
  const expiresAt = getTokenExpiresAtMs(token);
  if (!expiresAt) return false;
  return Date.now() >= expiresAt;
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

/** Mantido por compatibilidade de import; ociosidade não pausa mais o refresh (ver runScheduledRefresh). */
export function markActivity(): void {
  // no-op intencional: a Fase 3 remove a regra de ociosidade. Chamadas
  // existentes a markActivity() continuam seguras, só não fazem mais nada.
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

/**
 * Não há mais nada para "hidratar" de storage — o access token começa
 * sempre nulo nesta aba, e quem restaura a sessão é o bootstrap silencioso
 * (ensureFreshToken via cookie HttpOnly), chamado pelo AuthContext.
 */
export function hydrateFromStorage(): { accessToken: string | null; refreshToken: string | null } {
  const savedRefresh = typeof window !== 'undefined' ? localStorage.getItem(LAST_REFRESH_STORAGE_KEY) : null;
  lastRefreshTime = savedRefresh ? new Date(savedRefresh) : null;
  const savedCount = typeof window !== 'undefined' ? localStorage.getItem(REFRESH_COUNT_STORAGE_KEY) : null;
  refreshCount = savedCount ? parseInt(savedCount, 10) || 0 : 0;
  notify();
  return { accessToken: null, refreshToken: null };
}

function applyTokens(nextAccess: string, nextRefresh: string | null, options?: { broadcast?: boolean }): void {
  accessToken = nextAccess || null;
  refreshToken = nextRefresh || null;
  notify();
  scheduleProactiveRefresh();

  if (options?.broadcast !== false && accessToken) {
    getBroadcastChannel()?.postMessage({
      type: 'tokens-updated',
      accessToken,
      refreshToken,
    });
  }
}

export function setTokens(nextAccess: string, nextRefresh?: string | null): void {
  applyTokens(nextAccess, nextRefresh ?? null);
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

export function clearTokens(options?: { notifySessionEnded?: boolean; broadcast?: boolean }): void {
  clearProactiveRefresh();
  accessToken = null;
  refreshToken = null;
  lastRefreshTime = null;
  refreshCount = 0;

  if (typeof window !== 'undefined') {
    localStorage.removeItem(USER_STORAGE_KEY);
    localStorage.removeItem(LAST_REFRESH_STORAGE_KEY);
    localStorage.removeItem(REFRESH_COUNT_STORAGE_KEY);
  }

  notify();

  if (options?.broadcast !== false) {
    getBroadcastChannel()?.postMessage({ type: 'session-ended' });
  }

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
  // Sem regra de ociosidade: aba em segundo plano, notebook fechado ou
  // usuário parado não impedem mais a renovação — é isso que fechava a
  // causa #2/#3 do diagnóstico de sessão (aba parada >1h derrubava a sessão).
  const ok = await ensureFreshToken({ force: true });
  if (!ok && !accessToken) {
    return;
  }
  scheduleProactiveRefresh();
}

/** Dispara refresh ao focar/voltar a ficar visível, cobrindo o tempo em que o timer não rodou (aba suspensa/notebook dormindo). */
function setupLifecycleRefreshTriggers(): void {
  if (typeof window === 'undefined') return;

  const maybeRefresh = () => {
    if (!accessToken) return;
    const expiresAt = getTokenExpiresAtMs(accessToken);
    if (expiresAt == null || expiresAt - Date.now() <= REFRESH_SKEW_MS) {
      void ensureFreshToken({ force: true });
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') maybeRefresh();
  });
  window.addEventListener('focus', maybeRefresh);
  window.addEventListener('online', maybeRefresh);
}

if (typeof window !== 'undefined') {
  setupLifecycleRefreshTriggers();
}

/**
 * Single-flight LOCAL (mesma aba) + Web Lock (entre abas): a primeira aba
 * que pedir o lock executa o refresh de rede; as demais aguardam o lock
 * liberar e então leem o token já atualizado (via BroadcastChannel, que
 * chega antes do lock ser liberado) em vez de repetir a chamada.
 */
export async function ensureFreshToken(options?: { force?: boolean }): Promise<boolean> {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  if (!options?.force && accessToken) {
    const expiresAt = getTokenExpiresAtMs(accessToken);
    if (expiresAt != null && expiresAt - Date.now() > REFRESH_SKEW_MS) {
      return true;
    }
  }

  if (!refreshExecutor) {
    console.error('tokenStore: refreshExecutor não configurado');
    return false;
  }

  refreshInFlight = runRefreshWithLock();
  return refreshInFlight;
}

async function runRefreshWithLock(): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.locks) {
      return await navigator.locks.request(REFRESH_LOCK_NAME, async () => doRefresh());
    }
    return await doRefresh();
  } finally {
    refreshInFlight = null;
  }
}

async function doRefresh(): Promise<boolean> {
  // Dentro do lock: outra aba pode já ter renovado enquanto esperávamos —
  // se o access token em memória ainda está válido, não bate a rede de novo.
  if (accessToken) {
    const expiresAt = getTokenExpiresAtMs(accessToken);
    if (expiresAt != null && expiresAt - Date.now() > REFRESH_SKEW_MS) {
      return true;
    }
  }

  const tokenToUse = refreshToken || accessToken || '';

  try {
    const res = await refreshExecutor!(tokenToUse);
    const newAccess = res.accessToken || res.token;
    const newRefresh = res.refreshToken || res.token || res.accessToken || tokenToUse;

    if (!newAccess) {
      return false;
    }

    applyTokens(newAccess, newRefresh);
    bumpRefreshMeta();
    return true;
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status;
    const errorCode = (err as { data?: { errorCode?: string; error?: string } })?.data?.errorCode
      || (err as { data?: { error?: string } })?.data?.error;

    console.error('Falha ao renovar token:', err);

    // Só encerra a sessão quando o PRÓPRIO refresh nega a credencial — um
    // 401 de outro endpoint não deve chegar aqui (ver customFetch).
    if (
      status === 401
      || errorCode === 'TOKEN_REVOKED'
      || errorCode === 'INVALID_TOKEN'
    ) {
      clearTokens({ notifySessionEnded: true });
    }
    return false;
  }
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
