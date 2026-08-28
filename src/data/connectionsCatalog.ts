export type ConnectionGroup = 'gateway' | 'microservice' | 'worker' | 'infra';

export interface ConnectionTarget {
  id: string;
  name: string;
  description: string;
  group: ConnectionGroup;
  /** Caminho same-origin, proxied pelo Vite/nginx. */
  path: string;
  /** Endpoint real, só para exibição. */
  endpoint: string;
  /** 401/403 conta como online (serviço no ar, auth exigida). */
  treatAuthAsUp?: boolean;
}

export const CONNECTION_GROUP_LABELS: Record<ConnectionGroup, string> = {
  gateway: 'Gateway',
  microservice: 'Microsserviço',
  worker: 'Worker',
  infra: 'Infraestrutura',
};

export const CONNECTION_TARGETS: ConnectionTarget[] = [
  {
    id: 'front-keepguard-core',
    name: 'Frontend',
    description: 'Painel KeepGuard servido pelo nginx.',
    group: 'gateway',
    path: '/connections-health/front',
    endpoint: '/healthz',
  },
  {
    id: 'bff-auth',
    name: 'BFF Auth',
    description: 'Autenticação, sessões e tokens de acesso.',
    group: 'gateway',
    path: '/connections-health/bff-auth',
    endpoint: 'GET /health',
  },
  {
    id: 'bff-core',
    name: 'BFF Core',
    description: 'Cadastro, consentimentos e serviços de núcleo.',
    group: 'gateway',
    path: '/connections-health/bff-core',
    endpoint: 'GET /health',
  },
  {
    id: 'ms-auth',
    name: 'MS Auth',
    description: 'Identidade, roles e ciclo de vida da conta.',
    group: 'microservice',
    path: '/connections-health/ms-auth',
    endpoint: 'GET /actuator/health/liveness',
  },
  {
    id: 'ms-communication',
    name: 'MS Communication',
    description: 'Notificações e canais de comunicação.',
    group: 'microservice',
    path: '/connections-health/ms-communication',
    endpoint: 'GET /actuator/health/liveness',
  },
  {
    id: 'ms-company',
    name: 'MS Company',
    description: 'Tenants, empresas e provisionamento.',
    group: 'microservice',
    path: '/connections-health/ms-company',
    endpoint: 'GET /actuator/health/liveness',
  },
  {
    id: 'ms-user',
    name: 'MS User',
    description: 'Perfil e cadastro de usuários.',
    group: 'microservice',
    path: '/connections-health/ms-user',
    endpoint: 'GET /actuator/health/liveness',
  },
  {
    id: 'ms-user-consents',
    name: 'MS User Consents',
    description: 'Consentimentos e documentos LGPD.',
    group: 'microservice',
    path: '/connections-health/ms-user-consents',
    endpoint: 'GET /actuator/health/liveness',
  },
  {
    id: 'srv-email-sender',
    name: 'SRV Email Sender',
    description: 'Worker de envio de e-mail.',
    group: 'worker',
    path: '/connections-health/srv-email-sender',
    endpoint: 'GET /health',
  },
  {
    id: 'srv-token-manager',
    name: 'SRV Token Manager',
    description: 'Gestão de tokens OAuth de provedores.',
    group: 'worker',
    path: '/connections-health/srv-token-manager',
    endpoint: 'GET /health',
  },
  {
    id: 'srv-sms-sender',
    name: 'SRV SMS Sender',
    description: 'Worker de envio assíncrono de SMS.',
    group: 'worker',
    path: '/connections-health/srv-sms-sender',
    endpoint: 'GET /health',
  },
  {
    id: 'mock-sms-gateway',
    name: 'Mock SMS Gateway',
    description: 'Gateway simulado de SMS (ambiente local).',
    group: 'worker',
    path: '/connections-health/mock-sms-gateway',
    endpoint: 'GET /health',
  },
  {
    id: 'minio',
    name: 'MinIO',
    description: 'Object storage de avatares, documentos e consents.',
    group: 'infra',
    path: '/connections-health/minio',
    endpoint: 'GET /minio/health/live',
  },
  {
    id: 'rabbitmq',
    name: 'RabbitMQ',
    description: 'Filas de notificação e workers.',
    group: 'infra',
    path: '/connections-health/rabbitmq',
    endpoint: 'GET :15672/api/health/checks/alarms',
    treatAuthAsUp: true,
  },
  {
    id: 'prometheus',
    name: 'Prometheus',
    description: 'Coleta de métricas da stack.',
    group: 'infra',
    path: '/connections-health/prometheus',
    endpoint: 'GET /-/healthy',
  },
  {
    id: 'grafana',
    name: 'Grafana',
    description: 'Dashboards de observabilidade.',
    group: 'infra',
    path: '/connections-health/grafana',
    endpoint: 'GET /api/health',
  },
];
