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
  | 'market'
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
  market: '/mercado',
  marketAnalyze: '/mercado/analisar',
  marketWatchlist: '/mercado/watchlist',
  audits: '/auditoria',
  llm: '/llm',
  templates: '/templates',
  account: '/conta',
  settings: '/configuracao',
} as const;

export const ROUTES: RouteMeta[] = [
  { path: PATHS.market, tab: 'market', title: 'Mercado' },
  { path: PATHS.sessions, tab: 'sessions', title: 'Minhas sessões' },
  { path: PATHS.blacklist, tab: 'blacklist', title: 'Meus bloqueios' },
  { path: PATHS.tenantSessions, tab: 'tenant-sessions', title: 'Sessões da organização' },
  { path: PATHS.adminBlacklist, tab: 'admin-blacklist', title: 'Bloqueios da organização' },
  { path: PATHS.connections, tab: 'connections', title: 'Conexões' },
  { path: PATHS.guardian, tab: 'guardian', title: 'Guardian' },
  { path: PATHS.clientSystem, tab: 'client-system', title: 'Client system' },
  { path: PATHS.agents, tab: 'agents', title: 'Agents' },
  { path: PATHS.agentIncidents, tab: 'agent-incidents', title: 'Incidentes' },
  { path: PATHS.dataSources, tab: 'data-sources', title: 'Fontes de dados' },
  { path: PATHS.knowledge, tab: 'knowledge', title: 'Conhecimento' },
  { path: PATHS.marketAnalyze, tab: 'market-analyze', title: 'Analisar ativo' },
  { path: PATHS.audits, tab: 'audits', title: 'Auditoria' },
  { path: PATHS.llm, tab: 'llm', title: 'LLM' },
  { path: PATHS.templates, tab: 'templates', title: 'Galeria de Templates' },
  { path: PATHS.account, tab: 'account', title: 'Conta' },
  { path: PATHS.settings, tab: 'settings', title: 'Configuração' },
];

const PATH_BY_TAB = new Map<string, string>(ROUTES.map((route) => [route.tab, route.path]));
const META_BY_PATH = new Map<string, RouteMeta>(ROUTES.map((route) => [route.path, route]));

const TAB_ALIASES: Record<string, AppTab> = {
  identity: 'account',
  security: 'market',
  overview: 'market',
};

export function pathFromTab(tab: string | null | undefined): string {
  if (!tab) return PATHS.market;
  const canonical = TAB_ALIASES[tab] || (tab as AppTab);
  return PATH_BY_TAB.get(canonical) || PATHS.market;
}

export function tabFromPath(pathname: string): AppTab {
  return META_BY_PATH.get(pathname)?.tab || 'market';
}

export function routeMetaFromPath(pathname: string): RouteMeta | undefined {
  return META_BY_PATH.get(pathname);
}
