import { getDeviceInfo } from '../utils/deviceUtils';
import { peekPublicClientNetwork, prefetchPublicClientIp } from '../utils/publicIp';
import {
  clearTokens,
  ensureFreshToken,
  getAccessToken,
  parseJwtPayload,
} from './tokenStore';

// Determina automaticamente a URL do BFF com base no host atual
const isProductionDomain = typeof window !== 'undefined' &&
  (window.location.hostname.endsWith('keepguard.com.br') || window.location.hostname === '31.97.175.92');

const defaultBffUrl = isProductionDomain ? 'https://api.keepguard.com.br' : 'http://localhost:8381';
const defaultCoreUrl = isProductionDomain ? 'https://api.keepguard.com.br' : 'http://localhost:8382';

export const BFF_AUTH_URL = import.meta.env.VITE_BFF_AUTH_URL && import.meta.env.VITE_BFF_AUTH_URL !== 'http://localhost:8381'
  ? import.meta.env.VITE_BFF_AUTH_URL
  : defaultBffUrl;

export const BFF_CORE_URL = import.meta.env.VITE_BFF_CORE_URL && import.meta.env.VITE_BFF_CORE_URL !== 'http://localhost:8382'
  ? import.meta.env.VITE_BFF_CORE_URL
  : defaultCoreUrl;

const defaultInvestUrl = isProductionDomain ? 'https://api.keepguard.com.br' : 'http://localhost:8383';

export const BFF_INVEST_URL = import.meta.env.VITE_BFF_INVEST_URL && import.meta.env.VITE_BFF_INVEST_URL !== 'http://localhost:8383'
  ? import.meta.env.VITE_BFF_INVEST_URL
  : defaultInvestUrl;

export const DEFAULT_TENANT_ID = import.meta.env.VITE_DEFAULT_TENANT_ID || 'f7fc7350-b9fc-4e54-9c58-ac9385b23ae3';
export const DEFAULT_CLIENT_ID = 'keepguard-web';

function tenantIdFromAccessToken(): string | undefined {
  const token = getAccessToken();
  if (!token) return undefined;
  const claims = parseJwtPayload(token);
  if (typeof claims?.tenant_id === 'string' && claims.tenant_id.trim()) {
    return claims.tenant_id.trim();
  }
  if (typeof claims?.tenantId === 'string' && claims.tenantId.trim()) {
    return claims.tenantId.trim();
  }
  return undefined;
}

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function isAuthBootstrapPath(url: string): boolean {
  const path = url.split('?')[0];
  return (
    path.includes('/api/v1/auth/login')
    || path.includes('/api/v1/auth/refresh')
    || path.includes('/api/v1/auth/logout')
    || path.includes('/api/v1/auth/change-password')
    || path.includes('/api/v1/auth/forgot-password')
    || path.includes('/api/v1/auth/reset-password')
    || path.includes('/api/v1/auth/device/challenge/')
    || path.includes('/api/v1/register/')
  );
}

function isMeProfilePath(url: string): boolean {
  return url.split('?')[0].endsWith('/api/v1/users/me');
}

type CustomFetchOptions = RequestInit & {
  /** Evita loop: refresh/login e retry já feito */
  skipAuthRefresh?: boolean;
};

/**
 * Cliente HTTP central.
 * - Lê o JWT atual do tokenStore (variável global) na hora da chamada.
 * - Em 401: tenta refresh single-flight e repete a request uma vez.
 * - Só encerra a sessão se o refresh falhar.
 */
export async function customFetch<T>(
  url: string,
  options: CustomFetchOptions = {},
  token?: string
): Promise<T> {
  const { skipAuthRefresh, ...fetchOptions } = options;
  const correlationId = generateUUID();
  const deviceInfo = getDeviceInfo();
  prefetchPublicClientIp();
  const publicNetwork = peekPublicClientNetwork();

  const tenantId = tenantIdFromAccessToken() || DEFAULT_TENANT_ID;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-Tenant-Id': tenantId,
    'X-Client-Id': DEFAULT_CLIENT_ID,
    'X-Correlation-ID': correlationId,
    'X-Device-Id': deviceInfo.deviceId,
    'X-Device-Name': deviceInfo.deviceName,
    'X-Device-Type': deviceInfo.deviceType,
    ...(fetchOptions.headers as Record<string, string>),
  };
  if (url.startsWith(BFF_INVEST_URL) || url.includes('/bff-invest')) {
    headers['X-Company-Id'] = tenantId;
  }

  if (publicNetwork?.ip) {
    headers['X-Public-IP'] = publicNetwork.ip;
  }
  if (publicNetwork?.location && (url.includes('/api/v1/auth/') || url.includes('/users/me/sessions'))) {
    headers['X-Public-Location'] = encodeURIComponent(publicNetwork.location);
  }

  // Sempre preferir o token atual do store (não o snapshot preso no closure do componente)
  const bearer = getAccessToken() ?? token;
  if (bearer) {
    headers['Authorization'] = `Bearer ${bearer}`;
  }

  const response = await fetch(url, {
    ...fetchOptions,
    headers,
  });

  const contentType = response.headers.get('content-type');
  let data: any = null;
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    const text = await response.text();
    data = text ? { message: text } : {};
  }

  if (!response.ok) {
    const isMeProfile = isMeProfilePath(url);
    const isBootstrap = isAuthBootstrapPath(url);
    const shouldAttemptRefresh =
      !skipAuthRefresh
      && !isBootstrap
      && !isMeProfile
      && (response.status === 401 || data?.error === 'TOKEN_REVOKED');

    if (shouldAttemptRefresh) {
      const refreshed = await ensureFreshToken({ force: true });
      if (refreshed) {
        return customFetch<T>(url, { ...options, skipAuthRefresh: true }, getAccessToken() ?? undefined);
      }
      // ensureFreshToken já limpa tokens se o refresh foi rejeitado
      if (!getAccessToken() && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('keepguard_auth_unauthorized', { detail: data }));
      }
    } else if (
      !isMeProfile
      && !isBootstrap
      && (response.status === 401 || data?.error === 'TOKEN_REVOKED')
      && skipAuthRefresh
    ) {
      // Retry já feito e ainda 401 → encerra sessão
      clearTokens({ notifySessionEnded: true });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('keepguard_auth_unauthorized', { detail: data }));
      }
    }

    const responseCorrelationId =
      response.headers.get('X-Correlation-ID') ||
      data?.correlationId ||
      data?.traceId ||
      headers['X-Correlation-ID'];

    const errorMessage = data?.message || data?.detail || data?.error || `Erro HTTP ${response.status}`;
    const errorObj = new Error(errorMessage) as any;
    errorObj.status = response.status;
    errorObj.data = data;
    errorObj.correlationId = responseCorrelationId;
    throw errorObj;
  }

  return data as T;
}
