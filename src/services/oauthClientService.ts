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
  tenantId?: string;
  agents: CollectorAgent[];
}

export interface PaginatedOAuthClients {
  content: OAuthClient[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface SearchOAuthClientsParams {
  tenantId: string;
  clientId?: string;
  status?: string;
  page?: number;
  size?: number;
  sort?: string;
  dir?: string;
}

export interface CreateOAuthClientBody {
  tenantId: string;
  clientId: string;
  description?: string;
  authorities?: string[];
  tokenTtlSeconds?: number;
}

const base = `${BFF_CORE_URL}/api/v1/core/oauth/clients`;

function withTenant(tenantId: string, extra?: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  query.set('tenantId', tenantId);
  if (extra) {
    Object.entries(extra).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        query.set(key, String(value));
      }
    });
  }
  return query.toString();
}

export function searchOAuthClients(params: SearchOAuthClientsParams, token: string): Promise<PaginatedOAuthClients> {
  const { tenantId, ...rest } = params;
  return customFetch<PaginatedOAuthClients>(`${base}?${withTenant(tenantId, rest)}`, { method: 'GET' }, token);
}

export function getOAuthClient(id: string, tenantId: string, token: string): Promise<OAuthClientDetail> {
  return customFetch<OAuthClientDetail>(`${base}/${id}?${withTenant(tenantId)}`, { method: 'GET' }, token);
}

export function createOAuthClient(body: CreateOAuthClientBody, token: string): Promise<OAuthClient> {
  return customFetch<OAuthClient>(base, { method: 'POST', body: JSON.stringify(body) }, token);
}

export function blockOAuthClient(id: string, tenantId: string, token: string): Promise<OAuthClient> {
  return customFetch<OAuthClient>(`${base}/${id}/block?${withTenant(tenantId)}`, { method: 'POST' }, token);
}

export function unblockOAuthClient(id: string, tenantId: string, token: string): Promise<OAuthClient> {
  return customFetch<OAuthClient>(`${base}/${id}/unblock?${withTenant(tenantId)}`, { method: 'POST' }, token);
}

export function deleteOAuthClient(id: string, tenantId: string, token: string): Promise<void> {
  return customFetch<void>(`${base}/${id}?${withTenant(tenantId)}`, { method: 'DELETE' }, token);
}
