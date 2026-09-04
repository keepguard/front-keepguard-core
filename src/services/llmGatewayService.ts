import { BFF_CORE_URL, customFetch } from './api';

const LLM_BASE = `${BFF_CORE_URL}/api/v1/core/llm`;

export interface LlmUsage {
  id: string;
  occurredAt: string;
  companyId?: string;
  tenantId?: string;
  sourceService?: string;
  feature?: string;
  providerId?: string;
  providerType: string;
  model?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd?: number;
  outcome: string;
  latencyMs: number;
  correlationId?: string;
  requestId?: string;
  errorCode?: string;
}

export interface PaginatedLlmUsage {
  content: LlmUsage[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface SearchLlmUsageParams {
  page?: number;
  size?: number;
  from?: string;
  to?: string;
  companyId?: string;
  providerType?: string;
  model?: string;
  feature?: string;
  sourceService?: string;
  outcome?: string;
  sort?: string;
  dir?: string;
}

export interface LlmProvider {
  id: string;
  name: string;
  providerType: string;
  baseUrl?: string;
  modelDefault?: string;
  apiKeyEnvRef: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertLlmProvider {
  name: string;
  providerType: string;
  baseUrl?: string;
  modelDefault?: string;
  apiKeyEnvRef: string;
  enabled?: boolean;
}

export interface LlmAlertRule {
  id: string;
  name: string;
  metric: string;
  window: string;
  threshold: number;
  groupBy: string;
  enabled: boolean;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertLlmAlertRule {
  name: string;
  metric: string;
  window: string;
  threshold: number;
  groupBy: string;
  enabled?: boolean;
}

export interface LlmAlertFiring {
  id: string;
  ruleId: string;
  firedAt: string;
  windowKey: string;
  metricValue: number;
  threshold: number;
  payload?: Record<string, unknown>;
}

export interface PaginatedLlmAlertFirings {
  content: LlmAlertFiring[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface LlmCompleteRequest {
  providerId?: string;
  model?: string;
  messages: Array<{ role: string; content: string }>;
  maxTokens?: number;
  temperature?: number;
  feature?: string;
  companyId?: string;
  correlationId?: string;
  sourceService?: string;
}

export interface LlmCompleteResponse {
  content: string;
  usage: LlmUsage;
  model: string;
  providerType: string;
  requestId?: string;
}

function withQuery(url: string, params: object): string {
  const query = new URLSearchParams();
  Object.entries(params as Record<string, unknown>).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      query.set(key, String(value));
    }
  });
  const qs = query.toString();
  return qs ? `${url}?${qs}` : url;
}

export function searchLlmUsage(params: SearchLlmUsageParams, token: string): Promise<PaginatedLlmUsage> {
  return customFetch<PaginatedLlmUsage>(withQuery(`${LLM_BASE}/usage`, params), { method: 'GET' }, token);
}

export function getLlmUsage(id: string, token: string): Promise<LlmUsage> {
  return customFetch<LlmUsage>(`${LLM_BASE}/usage/${encodeURIComponent(id)}`, { method: 'GET' }, token);
}

export function listLlmProviders(token: string): Promise<LlmProvider[]> {
  return customFetch<LlmProvider[]>(`${LLM_BASE}/providers`, { method: 'GET' }, token);
}

export function createLlmProvider(body: UpsertLlmProvider, token: string): Promise<LlmProvider> {
  return customFetch<LlmProvider>(`${LLM_BASE}/providers`, { method: 'POST', body: JSON.stringify(body) }, token);
}

export function updateLlmProvider(id: string, body: UpsertLlmProvider, token: string): Promise<LlmProvider> {
  return customFetch<LlmProvider>(
    `${LLM_BASE}/providers/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(body) },
    token
  );
}

export function setLlmProviderEnabled(id: string, enabled: boolean, token: string): Promise<LlmProvider> {
  const action = enabled ? 'enable' : 'disable';
  return customFetch<LlmProvider>(
    `${LLM_BASE}/providers/${encodeURIComponent(id)}/${action}`,
    { method: 'POST' },
    token
  );
}

export function completeLlm(body: LlmCompleteRequest, token: string): Promise<LlmCompleteResponse> {
  return customFetch<LlmCompleteResponse>(`${LLM_BASE}/complete`, { method: 'POST', body: JSON.stringify(body) }, token);
}

export function listLlmAlertRules(token: string): Promise<LlmAlertRule[]> {
  return customFetch<LlmAlertRule[]>(`${LLM_BASE}/alert-rules`, { method: 'GET' }, token);
}

export function createLlmAlertRule(body: UpsertLlmAlertRule, token: string): Promise<LlmAlertRule> {
  return customFetch<LlmAlertRule>(`${LLM_BASE}/alert-rules`, { method: 'POST', body: JSON.stringify(body) }, token);
}

export function updateLlmAlertRule(id: string, body: UpsertLlmAlertRule, token: string): Promise<LlmAlertRule> {
  return customFetch<LlmAlertRule>(
    `${LLM_BASE}/alert-rules/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(body) },
    token
  );
}

export function setLlmAlertRuleEnabled(id: string, enabled: boolean, token: string): Promise<LlmAlertRule> {
  const action = enabled ? 'enable' : 'disable';
  return customFetch<LlmAlertRule>(
    `${LLM_BASE}/alert-rules/${encodeURIComponent(id)}/${action}`,
    { method: 'POST' },
    token
  );
}

export function listLlmAlertFirings(params: { page?: number; size?: number }, token: string): Promise<PaginatedLlmAlertFirings> {
  return customFetch<PaginatedLlmAlertFirings>(
    withQuery(`${LLM_BASE}/alert-firings`, params),
    { method: 'GET' },
    token
  );
}
