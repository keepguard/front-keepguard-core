export type AppTab =
  | 'overview'
  | 'sessions'
  | 'blacklist'
  | 'tenant-sessions'
  | 'admin-blacklist'
  | 'connections'
  | 'guardian'
  | 'client-system'
  | 'agents'
  | 'agent-incidents'
  | 'data-sources'
  | 'knowledge'
  | 'market-analyze'
  | 'audits'
  | 'llm'
  | 'templates'
  | 'account'
  | 'settings';

export type RouteMeta = {
  path: string;
  tab: AppTab;
  title: string;
};

export const ROUTES: RouteMeta[] = [
  { path: '/', tab: 'overview', title: 'Visão Geral' },
  { path: '/sessoes', tab: 'sessions', title: 'Minhas sessões' },
  { path: '/bloqueios', tab: 'blacklist', title: 'Meus bloqueios' },
  { path: '/admin/sessoes', tab: 'tenant-sessions', title: 'Sessões da organização' },
  { path: '/admin/bloqueios', tab: 'admin-blacklist', title: 'Bloqueios da organização' },
  { path: '/conexoes', tab: 'connections', title: 'Conexões' },
  { path: '/guardian', tab: 'guardian', title: 'Guardian' },
  { path: '/client-system', tab: 'client-system', title: 'Client system' },
  { path: '/agents', tab: 'agents', title: 'Agents' },
  { path: '/agents/incidentes', tab: 'agent-incidents', title: 'Incidentes' },
  { path: '/fontes', tab: 'data-sources', title: 'Fontes de dados' },
  { path: '/conhecimento', tab: 'knowledge', title: 'Conhecimento' },
  { path: '/mercado/analisar', tab: 'market-analyze', title: 'Analisar ativo' },
  { path: '/auditoria', tab: 'audits', title: 'Auditoria' },
  { path: '/llm', tab: 'llm', title: 'LLM' },
  { path: '/templates', tab: 'templates', title: 'Galeria de Templates' },
  { path: '/conta', tab: 'account', title: 'Conta' },
  { path: '/configuracao', tab: 'settings', title: 'Configuração' },
];

const PATH_BY_TAB = new Map<string, string>(ROUTES.map((route) => [route.tab, route.path]));
const META_BY_PATH = new Map<string, RouteMeta>(ROUTES.map((route) => [route.path, route]));

const TAB_ALIASES: Record<string, AppTab> = {
  identity: 'account',
  security: 'overview',
};

export function pathFromTab(tab: string | null | undefined): string {
  if (!tab) return '/';
  const canonical = TAB_ALIASES[tab] || (tab as AppTab);
  return PATH_BY_TAB.get(canonical) || '/';
}

export function tabFromPath(pathname: string): AppTab {
  return META_BY_PATH.get(pathname)?.tab || 'overview';
}

export function routeMetaFromPath(pathname: string): RouteMeta | undefined {
  return META_BY_PATH.get(pathname);
}

export const PATHS = {
  overview: '/',
  sessions: '/sessoes',
  blacklist: '/bloqueios',
  tenantSessions: '/admin/sessoes',
  adminBlacklist: '/admin/bloqueios',
  connections: '/conexoes',
  guardian: '/guardian',
  clientSystem: '/client-system',
  agents: '/agents',
  agentIncidents: '/agents/incidentes',
  dataSources: '/fontes',
  knowledge: '/conhecimento',
  marketAnalyze: '/mercado/analisar',
  audits: '/auditoria',
  llm: '/llm',
  templates: '/templates',
  account: '/conta',
  settings: '/configuracao',
} as const;
