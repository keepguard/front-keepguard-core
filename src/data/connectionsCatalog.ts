export type ConnectionGroup = 'gateway' | 'microservice' | 'worker' | 'infra';

export const CONNECTION_GROUP_LABELS: Record<ConnectionGroup, string> = {
  gateway: 'Gateway',
  microservice: 'Microsserviço',
  worker: 'Worker',
  infra: 'Infraestrutura',
};

export function isConnectionGroup(value: string): value is ConnectionGroup {
  return value in CONNECTION_GROUP_LABELS;
}
