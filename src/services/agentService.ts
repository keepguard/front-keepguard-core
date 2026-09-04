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

export interface CollectorLastExecution {
  id: string;
  startedAt: string;
  finishedAt?: string | null;
  status: string;
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
  lastExecution?: CollectorLastExecution | null;
}

export interface PaginatedCollectorAgents {
  content: CollectorAgent[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  summary?: CollectorAgentSummary;
}

export interface CollectorAgentSummary {
  total: number;
  enabled: number;
  disabled: number;
}

export interface SearchCollectorAgentsParams {
  q?: string;
  enabled?: string;
  collectorType?: string;
  dataSourceId?: string;
  lastExecutionStatus?: string;
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
      lastExecutionStatus: params.lastExecutionStatus,
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

export interface CollectorAgentRunResult {
  status: string;
  agentId: string;
}

/** Enfileira uma coleta real (ignora a agenda). Aparece no histórico. */
export function runCollectorAgent(id: string, token: string): Promise<CollectorAgentRunResult> {
  return customFetch<CollectorAgentRunResult>(`${base}/${id}/run`, {
    method: 'POST',
    body: JSON.stringify({}),
  }, token);
}

export type CollectorBulkAction = 'run' | 'enable' | 'disable' | 'delete';

export interface CollectorBulkFailedItem {
  id: string;
  error: string;
}

export interface CollectorBulkResult {
  bulkId: string;
  action: CollectorBulkAction | string;
  requested: number;
  succeeded: string[];
  failed: CollectorBulkFailedItem[];
}

export interface CollectorBulkProgress {
  id: string;
  action: CollectorBulkAction | string;
  status: string;
  commands: { total: number; succeeded: number; failed: number };
  collections?: { pending: number; running: number; succeeded: number; failed: number };
}

export function bulkCollectorAgents(
  action: CollectorBulkAction,
  ids: string[],
  token: string,
): Promise<CollectorBulkResult> {
  return customFetch<CollectorBulkResult>(`${base}/bulk`, {
    method: 'POST',
    body: JSON.stringify({ action, ids }),
  }, token);
}

export function getCollectorBulkOperation(id: string, token: string): Promise<CollectorBulkProgress> {
  return customFetch<CollectorBulkProgress>(`${base}/bulk-operations/${id}`, { method: 'GET' }, token);
}

export async function getCollectorActiveBulkOperation(token: string): Promise<CollectorBulkProgress | null> {
  try {
    return await customFetch<CollectorBulkProgress>(`${base}/bulk-operations/active`, { method: 'GET' }, token);
  } catch (error: unknown) {
    const status = (error as { status?: number } | null)?.status;
    if (status === 404) return null;
    throw error;
  }
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

export interface ExecutionPayloadItem {
  kind: 'snapshot' | 'document' | string;
  id: string;
  contentType?: string;
  fileName?: string;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  previewText?: string;
}

export function getExecutionPayloads(executionId: string, token: string): Promise<ExecutionPayloadItem[]> {
  return customFetch<ExecutionPayloadItem[]>(
    `${BFF_CORE_URL}/api/v1/core/collector/executions/${executionId}/payloads`,
    { method: 'GET' },
    token,
  );
}

export interface CollectorDataSourceVariable {
  key: string;
  label: string;
  required?: boolean;
  placeholder?: string;
}

export type DataSourceScope = 'company';

export interface CollectorRateLimit {
  maxRequestsPerMinute: number;
  maxConcurrent: number;
  minIntervalMs: number;
  burst: number;
}

/** Corpo JSON da API do collector (snake_case interno). */
export interface CollectorRateLimitPayload {
  max_requests_per_minute: number;
  max_concurrent: number;
  min_interval_ms: number;
  burst: number;
}

export const DEFAULT_COLLECTOR_RATE_LIMIT: CollectorRateLimit = {
  maxRequestsPerMinute: 20,
  maxConcurrent: 2,
  minIntervalMs: 500,
  burst: 5,
};

function positiveInt(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

export function parseCollectorRateLimit(raw: unknown): CollectorRateLimit {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_COLLECTOR_RATE_LIMIT };
  }
  const row = raw as Record<string, unknown>;
  return {
    maxRequestsPerMinute: positiveInt(
      row.maxRequestsPerMinute ?? row.max_requests_per_minute,
      DEFAULT_COLLECTOR_RATE_LIMIT.maxRequestsPerMinute,
    ),
    maxConcurrent: positiveInt(
      row.maxConcurrent ?? row.max_concurrent,
      DEFAULT_COLLECTOR_RATE_LIMIT.maxConcurrent,
    ),
    minIntervalMs: positiveInt(
      row.minIntervalMs ?? row.min_interval_ms,
      DEFAULT_COLLECTOR_RATE_LIMIT.minIntervalMs,
    ),
    burst: positiveInt(row.burst, DEFAULT_COLLECTOR_RATE_LIMIT.burst),
  };
}

export function toCollectorRateLimitPayload(limit: CollectorRateLimit): CollectorRateLimitPayload {
  return {
    max_requests_per_minute: limit.maxRequestsPerMinute,
    max_concurrent: limit.maxConcurrent,
    min_interval_ms: limit.minIntervalMs,
    burst: limit.burst,
  };
}

export interface CollectorDataSource {
  id: string;
  code?: string;
  companyId?: string;
  scope?: DataSourceScope | string;
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
  enabled?: boolean;
  rateLimit?: CollectorRateLimit | CollectorRateLimitPayload | Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateCollectorDataSourceBody {
  name: string;
  slug: string;
  description?: string;
  websiteUrl?: string;
  collectorType: string;
  nameTemplate?: string;
  descriptionTemplate?: string;
  promptTemplate?: string;
  defaultContext?: string;
  defaultSchedule: CollectorSchedule;
  configTemplate: Record<string, unknown>;
  variables?: CollectorDataSourceVariable[];
  notes?: string;
  enabled?: boolean;
  rateLimit?: CollectorRateLimitPayload;
}

export interface UpdateCollectorDataSourceBody {
  name?: string;
  slug?: string;
  description?: string;
  websiteUrl?: string;
  nameTemplate?: string;
  descriptionTemplate?: string;
  promptTemplate?: string;
  defaultContext?: string;
  defaultSchedule?: CollectorSchedule;
  configTemplate?: Record<string, unknown>;
  variables?: CollectorDataSourceVariable[];
  notes?: string;
  rateLimit?: CollectorRateLimitPayload;
}

const dataSourcesBase = `${BFF_CORE_URL}/api/v1/core/collector/data-sources`;

export function listCollectorDataSources(
  token: string,
  opts?: { includeDisabled?: boolean },
): Promise<CollectorDataSource[]> {
  const query = opts?.includeDisabled ? '?includeDisabled=true' : '';
  return customFetch<CollectorDataSource[]>(
    `${dataSourcesBase}${query}`,
    { method: 'GET' },
    token,
  );
}

export function getCollectorDataSource(id: string, token: string): Promise<CollectorDataSource> {
  return customFetch<CollectorDataSource>(`${dataSourcesBase}/${id}`, { method: 'GET' }, token);
}

export function createCollectorDataSource(body: CreateCollectorDataSourceBody, token: string): Promise<CollectorDataSource> {
  return customFetch<CollectorDataSource>(dataSourcesBase, { method: 'POST', body: JSON.stringify(body) }, token);
}

export function updateCollectorDataSource(id: string, body: UpdateCollectorDataSourceBody, token: string): Promise<CollectorDataSource> {
  return customFetch<CollectorDataSource>(`${dataSourcesBase}/${id}`, { method: 'PUT', body: JSON.stringify(body) }, token);
}

export function enableCollectorDataSource(id: string, token: string): Promise<CollectorDataSource> {
  return customFetch<CollectorDataSource>(`${dataSourcesBase}/${id}/enable`, { method: 'POST' }, token);
}

export function disableCollectorDataSource(id: string, token: string): Promise<CollectorDataSource> {
  return customFetch<CollectorDataSource>(`${dataSourcesBase}/${id}/disable`, { method: 'POST' }, token);
}

export function deleteCollectorDataSource(id: string, token: string): Promise<void> {
  return customFetch<void>(`${dataSourcesBase}/${id}`, { method: 'DELETE' }, token);
}

export type PropagateFieldGroup = 'url' | 'headers' | 'method_body' | 'type_config';

export interface PropagateAgentPreview {
  agentId: string;
  agentName: string;
  ticker: string;
  beforeUrl: string;
  afterUrl: string;
  changed: boolean;
  skipReason?: string;
}

export interface PropagateDataSourceResult {
  totalLinked: number;
  updated: number;
  skipped: number;
  failed: number;
  dryRun: boolean;
  previews: PropagateAgentPreview[];
  errors?: string[];
}

export interface PropagateCollectorDataSourceBody {
  fields: PropagateFieldGroup[];
  dryRun?: boolean;
  limit?: number;
}

export function propagateCollectorDataSource(
  id: string,
  body: PropagateCollectorDataSourceBody,
  token: string,
): Promise<PropagateDataSourceResult> {
  return customFetch<PropagateDataSourceResult>(
    `${dataSourcesBase}/${id}/propagate`,
    { method: 'POST', body: JSON.stringify(body) },
    token,
  );
}
