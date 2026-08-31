import { BFF_CORE_URL, customFetch } from './api';

export const COLLECTOR_SERVICE_CLIENT_ID = 'srv-data-collector';

export type CollectorType = 'API_REST' | 'HTML_SCRAPER' | 'DOCUMENT_FETCHER';

export interface CollectorSchedule {
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  intervalMinutes: number;
  timezone: string;
}

export interface CollectorAgent {
  id: string;
  code: string;
  companyId: string;
  name: string;
  description?: string;
  collectorType: CollectorType | string;
  collectorConfig: Record<string, unknown>;
  prompt?: string;
  schedule: CollectorSchedule;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface PaginatedCollectorAgents {
  content: CollectorAgent[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface SearchCollectorAgentsParams {
  q?: string;
  enabled?: string;
  collectorType?: string;
  page?: number;
  size?: number;
  sort?: string;
  dir?: string;
}

export interface CreateCollectorAgentBody {
  name: string;
  description?: string;
  collectorType: string;
  collectorConfig: Record<string, unknown>;
  prompt?: string;
  schedule: CollectorSchedule;
  enabled?: boolean;
}

export interface UpdateCollectorAgentBody {
  name?: string;
  description?: string;
  collectorConfig?: Record<string, unknown>;
  prompt?: string;
  schedule?: CollectorSchedule;
}

const base = `${BFF_CORE_URL}/api/v1/core/collector/agents`;

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

export function searchCollectorAgents(params: SearchCollectorAgentsParams, token: string): Promise<PaginatedCollectorAgents> {
  return customFetch<PaginatedCollectorAgents>(
    `${base}${toQuery({
      q: params.q,
      enabled: params.enabled,
      collectorType: params.collectorType,
      page: params.page,
      size: params.size,
      sort: params.sort,
      dir: params.dir,
    })}`,
    { method: 'GET' },
    token,
  );
}

export function getCollectorAgent(id: string, token: string): Promise<CollectorAgent> {
  return customFetch<CollectorAgent>(`${base}/${id}`, { method: 'GET' }, token);
}

export function createCollectorAgent(body: CreateCollectorAgentBody, token: string): Promise<CollectorAgent> {
  return customFetch<CollectorAgent>(base, { method: 'POST', body: JSON.stringify(body) }, token);
}

export function updateCollectorAgent(id: string, body: UpdateCollectorAgentBody, token: string): Promise<CollectorAgent> {
  return customFetch<CollectorAgent>(`${base}/${id}`, { method: 'PUT', body: JSON.stringify(body) }, token);
}

export function enableCollectorAgent(id: string, token: string): Promise<CollectorAgent> {
  return customFetch<CollectorAgent>(`${base}/${id}/enable`, { method: 'POST' }, token);
}

export function disableCollectorAgent(id: string, token: string): Promise<CollectorAgent> {
  return customFetch<CollectorAgent>(`${base}/${id}/disable`, { method: 'POST' }, token);
}

export function deleteCollectorAgent(id: string, token: string): Promise<void> {
  return customFetch<void>(`${base}/${id}`, { method: 'DELETE' }, token);
}
