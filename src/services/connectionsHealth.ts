import { BFF_CORE_URL, customFetch } from './api';

export interface ConnectionServiceStatus {
  id: string;
  name: string;
  description: string;
  group: string;
  endpoint: string;
  status: 'healthy' | 'unhealthy';
  latencyMs: number;
  httpStatus?: number;
}

export interface ConnectionsHealthSnapshot {
  checkedAt: string;
  expiresAt: string;
  ttlSeconds: number;
  cached: boolean;
  services: ConnectionServiceStatus[];
}

export function getConnectionsHealth(token: string): Promise<ConnectionsHealthSnapshot> {
  return customFetch<ConnectionsHealthSnapshot>(
    `${BFF_CORE_URL}/api/v1/core/connections/health`,
    { method: 'GET' },
    token
  );
}
