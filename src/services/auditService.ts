import { BFF_CORE_URL, customFetch } from './api';

export interface AuditActor {
  type: string;
  codeUser?: string;
  roles?: string[];
  clientIp?: string;
  deviceId?: string;
}

export interface AuditResource {
  type?: string;
  id?: string;
}

export interface AuditChange {
  field: string;
  before?: unknown;
  after?: unknown;
}

export interface AuditEvent {
  eventId: string;
  occurredAt: string;
  schemaVersion: number;
  sourceService: string;
  correlationId: string;
  requestId?: string;
  tenantId?: string;
  companyId?: string;
  actor: AuditActor;
  action: string;
  resource: AuditResource;
  outcome: string;
  reason?: string;
  changes?: AuditChange[];
  metadata?: Record<string, unknown>;
}

export interface AuditJourneyHop {
  eventId: string;
  occurredAt: string;
  sourceService: string;
  action: string;
  outcome: string;
}

export interface AuditDetail extends AuditEvent {
  journey?: AuditJourneyHop[];
}

export interface PaginatedAudits {
  content: AuditEvent[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface SearchAuditsParams {
  page?: number;
  size?: number;
  from?: string;
  to?: string;
  actorCodeUser?: string;
  action?: string;
  outcome?: string;
  resourceType?: string;
  resourceId?: string;
  correlationId?: string;
  sourceService?: string;
}

export function searchAudits(params: SearchAuditsParams, token: string): Promise<PaginatedAudits> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      query.set(key, String(value));
    }
  });
  return customFetch<PaginatedAudits>(
    `${BFF_CORE_URL}/api/v1/audits?${query.toString()}`,
    { method: 'GET' },
    token
  );
}

export function getAudit(eventId: string, token: string): Promise<AuditDetail> {
  return customFetch<AuditDetail>(
    `${BFF_CORE_URL}/api/v1/audits/${encodeURIComponent(eventId)}`,
    { method: 'GET' },
    token
  );
}
