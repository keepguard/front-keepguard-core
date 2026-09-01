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
  context?: string;
  collectorType: CollectorType | string;
  collectorConfig: Record<string, unknown>;
  prompt?: string;
  schedule: CollectorSchedule;
  enabled: boolean;
  dataSourceId?: string;
  dataSourceSlug?: string;
  dataSourceName?: string;
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
  dataSourceId?: string;
  page?: number;
  size?: number;
  sort?: string;
  dir?: string;
}

export interface CreateCollectorAgentBody {
  name: string;
  description?: string;
  context?: string;
  collectorType: string;
  collectorConfig: Record<string, unknown>;
  prompt?: string;
  schedule: CollectorSchedule;
  enabled?: boolean;
  dataSourceId?: string;
}

export interface UpdateCollectorAgentBody {
  name?: string;
  description?: string;
  context?: string;
  collectorConfig?: Record<string, unknown>;
  prompt?: string;
  schedule?: CollectorSchedule;
  dataSourceId?: string;
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
      dataSourceId: params.dataSourceId,
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

export interface CollectorAgentTestPreview {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  previewTruncated: boolean;
  previewText?: string;
}

export interface CollectorAgentTestResult {
  success: boolean;
  agentId: string;
  collectorType: string;
  itemsCollected: number;
  durationMs: number;
  error?: string | null;
  preview: CollectorAgentTestPreview[];
}

export function testCollectorAgent(id: string, token: string): Promise<CollectorAgentTestResult> {
  return customFetch<CollectorAgentTestResult>(`${base}/${id}/test`, {
    method: 'POST',
    body: JSON.stringify({}),
  }, token);
}

export interface CollectorExecution {
  id: string;
  agentId: string;
  startedAt: string;
  finishedAt?: string | null;
  status: string;
  itemsCollected: number;
  itemsUploaded: number;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export function listCollectorAgentExecutions(id: string, token: string): Promise<CollectorExecution[]> {
  return customFetch<CollectorExecution[]>(`${base}/${id}/executions?limit=50`, { method: 'GET' }, token);
}

export interface CollectorDataSourceVariable {
  key: string;
  label: string;
  required?: boolean;
  placeholder?: string;
}

export interface CollectorDataSource {
  id: string;
  slug: string;
  name: string;
  description?: string;
  websiteUrl?: string;
  collectorType: CollectorType | string;
  nameTemplate?: string;
  descriptionTemplate?: string;
  promptTemplate?: string;
  defaultContext?: string;
  defaultSchedule?: CollectorSchedule;
  configTemplate?: Record<string, unknown> | null;
  variables?: CollectorDataSourceVariable[];
  notes?: string;
}

export function listCollectorDataSources(token: string): Promise<CollectorDataSource[]> {
  return customFetch<CollectorDataSource[]>(
    `${BFF_CORE_URL}/api/v1/core/collector/data-sources`,
    { method: 'GET' },
    token,
  );
}
