import { BFF_CORE_URL, customFetch } from './api';

export interface KnowledgeAskSource {
  kind: string;
  key?: string;
  documentId?: string;
  sourceAgentId?: string;
  agentName?: string;
  collectedAt?: string;
  excerpt?: string;
}

export interface KnowledgeAskAudit {
  documentIds: string[];
  checks: string[];
}

export interface KnowledgeFreshness {
  lastCollectionAt?: string;
  ageMinutes: number;
  status: string;
  failed: boolean;
  errorMessage?: string;
  agentId?: string;
  agentName?: string;
}

export interface KnowledgeAskResponse {
  intent: string;
  mode: string;
  answer: string;
  observedAt?: string;
  stale: boolean;
  conflict: boolean;
  convergence: boolean;
  unknown: boolean;
  sources: KnowledgeAskSource[];
  ageMinutes?: number;
  audit?: KnowledgeAskAudit;
  disclaimer?: string;
  freshness?: KnowledgeFreshness;
}

export interface KnowledgeAskRequest {
  question: string;
  context?: string;
}

export function askKnowledge(body: KnowledgeAskRequest, token: string): Promise<KnowledgeAskResponse> {
  return customFetch<KnowledgeAskResponse>(
    `${BFF_CORE_URL}/api/v1/core/knowledge/ask`,
    { method: 'POST', body: JSON.stringify(body) },
    token,
  );
}
