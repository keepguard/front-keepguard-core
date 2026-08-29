import { BFF_CORE_URL, customFetch } from './api';

export interface GuardianIncidentListItem {
  id: string;
  namespace: string;
  serviceName: string;
  podName: string;
  status: string;
  severity: string;
  k8sConclusion?: string;
  errorReason?: string;
  occurrencesCount: number;
  emailSent: boolean;
  lastSeenAt?: string;
  createdAt?: string;
  normalizedAt?: string;
}

export interface PaginatedIncidents {
  content: GuardianIncidentListItem[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface SearchIncidentsParams {
  page?: number;
  size?: number;
  from?: string;
  to?: string;
  status?: string;
  severity?: string;
  serviceName?: string;
  namespace?: string;
  k8sConclusion?: string;
  q?: string;
  sort?: string;
  dir?: string;
}

export interface SuggestionDTO {
  id: string;
  actionType: string;
  label: string;
  risk: string;
  enabled: boolean;
  disabledReason?: string;
  aiRationale?: string;
}

export interface IncidentDetail {
  incident: GuardianIncidentListItem;
  aiRootCause?: string;
  aiSummary?: string;
  aiRecommendedAction?: string;
  investigationSource?: string;
  correlationId?: string;
  healthyStreak?: number;
  capturedLogsSnippet?: string;
  evidence?: { id: string; kind: string; payloadJson: string; createdAt: string }[];
  suggestions?: SuggestionDTO[];
  executions?: { id: string; actorUserId?: string; outcome: string; errorMessage?: string; createdAt: string }[];
  deliveries?: { email: string; outcome: string; kind?: string; sentAt: string }[];
  timeline?: { eventType: string; detail?: string; createdAt: string }[];
}

export interface AlertRecipient {
  id: string;
  email: string;
  enabled: boolean;
  label?: string;
}

export function searchIncidents(params: SearchIncidentsParams, token: string): Promise<PaginatedIncidents> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      query.set(key, String(value));
    }
  });
  return customFetch<PaginatedIncidents>(
    `${BFF_CORE_URL}/api/v1/core/guardian/incidents?${query.toString()}`,
    { method: 'GET' },
    token
  );
}

export function getIncident(id: string, token: string): Promise<IncidentDetail> {
  return customFetch<IncidentDetail>(
    `${BFF_CORE_URL}/api/v1/core/guardian/incidents/${encodeURIComponent(id)}`,
    { method: 'GET' },
    token
  );
}

export function executeIncidentAction(
  id: string,
  suggestionId: string,
  confirmation: string | undefined,
  token: string
): Promise<unknown> {
  return customFetch(
    `${BFF_CORE_URL}/api/v1/core/guardian/incidents/${encodeURIComponent(id)}/actions`,
    {
      method: 'POST',
      body: JSON.stringify({ suggestionId, confirmation }),
    },
    token
  );
}

export function listAlertRecipients(token: string): Promise<AlertRecipient[]> {
  return customFetch<AlertRecipient[]>(
    `${BFF_CORE_URL}/api/v1/core/guardian/alert-recipients`,
    { method: 'GET' },
    token
  );
}

export function upsertAlertRecipient(
  payload: { email: string; label?: string; enabled?: boolean },
  token: string
): Promise<AlertRecipient> {
  return customFetch<AlertRecipient>(
    `${BFF_CORE_URL}/api/v1/core/guardian/alert-recipients`,
    { method: 'PUT', body: JSON.stringify(payload) },
    token
  );
}

export function patchAlertRecipient(id: string, enabled: boolean, token: string): Promise<AlertRecipient> {
  return customFetch<AlertRecipient>(
    `${BFF_CORE_URL}/api/v1/core/guardian/alert-recipients/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify({ enabled }) },
    token
  );
}
