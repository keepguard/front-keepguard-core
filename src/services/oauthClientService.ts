import { BFF_CORE_URL, customFetch } from './api';

export interface OAuthClient {
  id: string;
  companyId: string;
  clientId: string;
  clientSecret?: string;
  authorities: string[];
  status: 'ACTIVE' | 'BLOCKED' | string;
  tokenTtlSeconds: number;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CollectorAgent {
  id: string;
  code: string;
  companyId: string;
  name: string;
  description?: string;
  collectorType: string;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface OAuthClientDetail extends OAuthClient {
  agents: CollectorAgent[];
  agentsLoadError?: string;
}

export interface PaginatedOAuthClients {
  content: OAuthClient[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface SearchOAuthClientsParams {
  clientId?: string;
  status?: string;
  page?: number;
  size?: number;
  sort?: string;
  dir?: string;
}

export interface CreateOAuthClientBody {
  clientId: string;
  description?: string;
  authorities?: string[];
  tokenTtlSeconds?: number;
}

const base = `${BFF_CORE_URL}/api/v1/core/oauth/clients`;

function toQuery(params?: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        query.set(key, String(value));
      }
    });
  }
  const encoded = query.toString();
  return encoded ? `?${encoded}` : '';
}

export function searchOAuthClients(params: SearchOAuthClientsParams, token: string): Promise<PaginatedOAuthClients> {
  return customFetch<PaginatedOAuthClients>(`${base}${toQuery(params)}`, { method: 'GET' }, token);
}

export function getOAuthClient(id: string, token: string): Promise<OAuthClientDetail> {
  return customFetch<OAuthClientDetail>(`${base}/${id}`, { method: 'GET' }, token);
}

export function createOAuthClient(body: CreateOAuthClientBody, token: string): Promise<OAuthClient> {
  return customFetch<OAuthClient>(base, { method: 'POST', body: JSON.stringify(body) }, token);
}

export function blockOAuthClient(id: string, token: string): Promise<OAuthClient> {
  return customFetch<OAuthClient>(`${base}/${id}/block`, { method: 'POST' }, token);
}

export function unblockOAuthClient(id: string, token: string): Promise<OAuthClient> {
  return customFetch<OAuthClient>(`${base}/${id}/unblock`, { method: 'POST' }, token);
}

export function deleteOAuthClient(id: string, token: string): Promise<void> {
  return customFetch<void>(`${base}/${id}`, { method: 'DELETE' }, token);
}
