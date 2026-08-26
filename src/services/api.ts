import { getDeviceInfo } from '../utils/deviceUtils';

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

export const DEFAULT_TENANT_ID = import.meta.env.VITE_DEFAULT_TENANT_ID || 'f7fc7350-b9fc-4e54-9c58-ac9385b23ae3';
export const DEFAULT_CLIENT_ID = 'keepguard-web';

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

export async function customFetch<T>(
  url: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const correlationId = generateUUID();
  const deviceInfo = getDeviceInfo();
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-Tenant-Id': DEFAULT_TENANT_ID,
    'X-Client-Id': DEFAULT_CLIENT_ID,
    'X-Client-ID': DEFAULT_CLIENT_ID,
    'X-Correlation-ID': correlationId,
    'X-Device-Id': deviceInfo.deviceId,
    'X-Device-Name': deviceInfo.deviceName,
    'X-Device-Type': deviceInfo.deviceType,
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
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
    // Se for 401 (Não autorizado / Token Revogado / Sessão encerrada), limpa a sessão local e avisa a aplicação
    if (response.status === 401 || data?.error === 'TOKEN_REVOKED') {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('keepguard_access_token');
        localStorage.removeItem('keepguard_refresh_token');
        localStorage.removeItem('keepguard_user');
        localStorage.removeItem('keepguard_last_refresh_time');
        localStorage.removeItem('keepguard_refresh_count');
        window.dispatchEvent(new CustomEvent('keepguard_auth_unauthorized', { detail: data }));
      }
    }

    const errorMessage = data?.message || data?.detail || data?.error || `Erro HTTP ${response.status}`;
    const errorObj = new Error(errorMessage) as any;
    errorObj.status = response.status;
    errorObj.data = data;
    throw errorObj;
  }

  return data as T;
}
