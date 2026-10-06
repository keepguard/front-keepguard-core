/**
 * Cliente do Agent Ordens (bff-invest → ms-mt5-operations). Contrato fixo em
 * docs/specs/SPEC-002-contrato-api.md (§3 JSON, §4 rotas do BFF) — qualquer divergência é bug.
 * O motor só PROPÕE; nada é executado sem o Confirmar humano (2º clique no modal).
 */
import { BFF_INVEST_URL, customFetch } from './api';
import { getAccessToken } from './tokenStore';

const AGENT_BASE = `${BFF_INVEST_URL}/api/v1/invest/trade/agent`;

// ── Tipos do contrato ─────────────────────────────────────────────────────────

export type AgentConta = 'DEMO' | 'REAL';
export type ProposalFamilia = 'COMPRA' | 'VENDA' | 'STOP' | 'EMERGENCIA' | 'ALERTA';
export type ProposalTipo =
  | 'ABRIR_COMPRA'
  | 'ADICIONAR_COMPRA'
  | 'ENCERRAR_TRAILING'
  | 'ENCERRAR_TETO'
  | 'ENCERRAR_EMERGENCIA'
  | 'PROTEGER'
  | 'REFAZER_STOP'
  | 'CANCELAR_ORFA'
  | 'ALERTA_ORFA'
  | 'ALERTA_NOTICIA';
export type ProposalEstado = 'ABERTA' | 'SEM_SALDO' | 'AGUARDANDO_SALDO' | 'INVALIDADA';
export type OrdemAcao = 'DEAL' | 'PENDING' | 'SLTP' | 'REMOVE';

export interface ProposalOrdem {
  acao: OrdemAcao;
  /** Tipo MT5 (BUY_LIMIT, SELL_STOP_LIMIT, ...). */
  tipo: string;
  preco: number | null;
  stopLimit: number | null;
  volume: number;
  validade: string;
}

export interface ProposalProtecao {
  tipo: string;
  disparo: number;
  limite: number | null;
}

export interface ProposalRisco {
  valor: number;
  pctCapital: number;
}

export interface ProposalJev {
  disponivel: boolean;
  regime?: { valor: string; confianca: number } | null;
  qualidade?: { nivel: number; confianca: number } | null;
  noticia?: { prob: number; aviso: boolean } | null;
  evento?: { prob: number; suspende: boolean } | null;
}

export interface ProposalAlteracao {
  campo: string;
  antes: unknown;
  depois: unknown;
  em: string;
}

export interface Proposal {
  id: string;
  chave: string;
  versao: number;
  conta: AgentConta;
  familia: ProposalFamilia;
  tipo: ProposalTipo;
  ticker: string;
  simbolo: string;
  nivelPiramide: number | null;
  ordem: ProposalOrdem | null;
  protecao: ProposalProtecao | null;
  precoReferencia: number | null;
  ultimoPreco: number | null;
  cotacaoEm: string | null;
  distanciaAtr: number | null;
  risco: ProposalRisco | null;
  valorOrdem: number | null;
  pctDisponivel: number | null;
  pctInvestidoDepois: number | null;
  motivo: string;
  d1Data: string | null;
  diasAberta: number;
  validaAte: string | null;
  preNegociacao: boolean;
  estado: ProposalEstado;
  motivoEstado: string | null;
  estatisticaAtivo: { sinais: number; acerto: number; rMedio: number } | null;
  jev: ProposalJev | null;
  alteracoes: ProposalAlteracao[];
  criadoEm: string;
  atualizadoEm: string;
}

export interface AgentEngine {
  estado: 'ATIVO' | 'PAUSADO';
  motivo: string | null;
  desde: string | null;
  /** codeUser ou "IA". */
  por: string | null;
}

export interface AgentCapital {
  capitalTrade: number;
  investido: number;
  reservado: number;
  disponivel: number;
  reservaMinima: number;
  pctInvestido: number;
  riscoAbertoPct?: number;
  estresseGapPct?: number;
}

export type FamiliaContadores = Record<ProposalFamilia, number>;

export interface ProposalsResponse {
  conta: AgentConta;
  asOf: string;
  engine: AgentEngine;
  capital: AgentCapital;
  contadores: FamiliaContadores;
  items: Proposal[];
}

export interface Execucao {
  ordemTipo: string;
  simbolo: string;
  volumePedido: number;
  volumeExecutado: number;
  precoMedio: number | null;
  retcode: number;
  ticket: number | null;
  comment: string;
  latenciaMs: number;
}

export type ExecucaoStatus = 'AGENDADA' | 'EXECUTADA' | 'PARCIAL' | 'REJEITADA' | 'FALHOU' | 'INCERTO' | 'NAO_ENVIADA' | 'CONFIRMANDO';

export interface DecisionResponse {
  proposalId: string;
  decisao: 'CONFIRMADA' | 'CANCELADA';
  status?: ExecucaoStatus;
  execucoes?: Execucao[];
  mensagem?: string;
}

export interface HistoryItem {
  proposalId: string;
  tipo: ProposalTipo;
  familia: ProposalFamilia;
  ticker: string;
  decisao: 'CONFIRMADA' | 'CANCELADA';
  status: ExecucaoStatus | null;
  decididoPor: string;
  decididoEm: string;
  motivoCancelamento: string | null;
  snapshot: Proposal | null;
  settingsVersion: number;
  execucoes: Execucao[];
}

export interface Paged<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/** `proposal_events` — formato livre no contrato; a tela só lista. */
export type ProposalEvent = Record<string, unknown>;

/** JSON do usuário (SPEC-002 §6.1). */
export interface TradingSettings {
  schemaVersion: number;
  modoQuantidade: string;
  capital: { capitalTrade: number; maxPctInvestido: number; reservaMinima: number };
  porOperacao: { riscoPorTradePct: number; maxPctPorCompra: number; valorMaximoOrdem: number };
  concentracao: { maxPctPorAtivo: number; maxPctPorSetor: number; maxPosicoes: number; maxEntradasDia: number };
  risco: { riscoAbertoMaxPct: number; estresseGapPct: number; liquidezMinADV: number; custoPorAcao: number };
  perdas: { diariaPct: number; mensalPct: number; drawdownPicoPct: number; stopsSeguidos: number; stopsPorAtivo30d: number };
  piramide: { habilitada: boolean; kAtr: number; maxAdicoes: number };
  ativos: { permitidos: string[]; bloqueados: string[] };
  notificacoes: { canais: string[]; silencioForaDoPregao: boolean };
}

export interface SettingsResponse {
  conta: AgentConta;
  version: number;
  settings: TradingSettings;
  /** Mesma forma de `settings`, com os valores máximos (o usuário só pode apertar). */
  tetos: Partial<TradingSettings>;
  efetiva: TradingSettings;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface SettingsPreview {
  ticker: string;
  preco: number;
  quantidade: number;
  simbolo: string;
  valor: number;
  pctDisponivel: number;
  pctInvestidoAntes: number;
  pctInvestidoDepois: number;
  risco: ProposalRisco;
  /** Regra que definiu a quantidade (ex.: "riscoPorTradePct"). */
  limitante: string;
}

/** Relatório pós-pregão — formato não fixado no contrato. */
export type DailyReport = Record<string, unknown>;

// ── Erros ─────────────────────────────────────────────────────────────────────

export type AgentErrorCode =
  | 'PROPOSTA_ATUALIZADA'
  | 'PROPOSTA_INVALIDADA'
  | 'QUANTIDADE_AUMENTOU'
  | 'SETTINGS_VERSION_MISMATCH'
  | 'SETTINGS_ACIMA_DO_TETO'
  | 'PROPOSTA_EXPIRADA'
  | 'MOTOR_PAUSADO'
  | 'EXECUCAO_NAO_AUTORIZADA'
  | 'CONTA_REAL_BLOQUEADA'
  | 'MT5_ACCOUNT_NOT_FOUND'
  | 'GATEWAY_UNAVAILABLE';

export class AgentApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly correlationId: string | null;
  /** Versão nova da proposta (só em 409 PROPOSTA_ATUALIZADA). */
  readonly proposal: Proposal | null;
  /** Campos acima do teto (só em 422 SETTINGS_ACIMA_DO_TETO). */
  readonly campos: string[];

  constructor(init: {
    status: number;
    code: string | null;
    message: string;
    correlationId?: string | null;
    proposal?: Proposal | null;
    campos?: string[];
  }) {
    super(init.message);
    this.name = 'AgentApiError';
    this.status = init.status;
    this.code = init.code;
    this.correlationId = init.correlationId ?? null;
    this.proposal = init.proposal ?? null;
    this.campos = init.campos ?? [];
  }
}

function friendlyMessage(status: number, code: string | null, serverMessage: string | undefined): string {
  switch (code) {
    case 'PROPOSTA_ATUALIZADA':
      return 'A proposta mudou enquanto você olhava. Confira a versão nova antes de confirmar.';
    case 'PROPOSTA_INVALIDADA':
      return serverMessage ? `A proposta não vale mais: ${serverMessage}` : 'A proposta não vale mais: a condição que a gerou sumiu.';
    case 'QUANTIDADE_AUMENTOU':
      return 'O recálculo deu uma quantidade maior que a mostrada. Nada foi enviado — atualize e confira de novo.';
    case 'SETTINGS_VERSION_MISMATCH':
      return 'As configurações foram alteradas em outro lugar. Recarregue antes de salvar para não sobrescrever.';
    case 'SETTINGS_ACIMA_DO_TETO':
      return 'Algum valor passou do teto do sistema. Você só pode apertar os limites, nunca afrouxar.';
    case 'PROPOSTA_EXPIRADA':
      return 'A proposta expirou. Nada foi enviado; aguarde o próximo ciclo do motor.';
    case 'MOTOR_PAUSADO':
      return 'O motor está pausado. Retome o motor antes de confirmar ordens.';
    case 'EXECUCAO_NAO_AUTORIZADA':
      return 'Seu usuário não tem permissão para executar ordens (fora da lista autorizada).';
    case 'CONTA_REAL_BLOQUEADA':
      return 'A conta REAL está bloqueada pelo sistema. Só a DEMO pode operar agora.';
    case 'MT5_ACCOUNT_NOT_FOUND':
      return 'Você ainda não vinculou uma conta MT5. Vincule no menu Corretora.';
    case 'GATEWAY_UNAVAILABLE':
      return 'O terminal MT5 não respondeu. Nada foi confirmado — tente de novo em instantes.';
    default:
      break;
  }
  switch (status) {
    case 409:
      return serverMessage || 'A proposta mudou de estado. Atualize a tabela e confira.';
    case 410:
      return 'A proposta expirou. Nada foi enviado.';
    case 423:
      return 'O motor está pausado. Retome antes de continuar.';
    case 403:
      return 'Você não tem permissão para esta ação.';
    case 404:
      return serverMessage || 'Não encontrado.';
    case 0:
      return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
    default:
      return serverMessage || `Erro inesperado (HTTP ${status}).`;
  }
}

/** Converte o erro do customFetch (Error com .status/.data) em AgentApiError com mensagem PT-BR. */
export function toAgentError(err: unknown): AgentApiError {
  if (err instanceof AgentApiError) return err;
  const e = err as {
    status?: number;
    data?: { code?: string; error?: string; message?: string; correlationId?: string; proposal?: Proposal; campos?: string[] };
    message?: string;
    correlationId?: string;
  };
  const status = typeof e?.status === 'number' ? e.status : 0;
  const code = e?.data?.code || e?.data?.error || null;
  const serverMessage = e?.data?.message || (status ? e?.message : undefined);
  return new AgentApiError({
    status,
    code,
    message: friendlyMessage(status, code, serverMessage),
    correlationId: e?.data?.correlationId || e?.correlationId || null,
    proposal: e?.data?.proposal ?? null,
    campos: Array.isArray(e?.data?.campos) ? e.data!.campos : [],
  });
}

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  try {
    return await customFetch<T>(url, init, getAccessToken() || undefined);
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') throw err;
    throw toAgentError(err);
  }
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

// ── Rotas (§4 do contrato) ───────────────────────────────────────────────────

export function getProposals(conta: AgentConta, signal?: AbortSignal): Promise<ProposalsResponse> {
  return call<ProposalsResponse>(`${AGENT_BASE}/proposals${qs({ conta })}`, { method: 'GET', signal });
}

/** Envia `Idempotency-Key: "{id}:{versao}"` — repetir o clique devolve a mesma resposta 200. */
export function confirmProposal(id: string, versao: number): Promise<DecisionResponse> {
  return call<DecisionResponse>(`${AGENT_BASE}/proposals/${encodeURIComponent(id)}/confirm`, {
    method: 'POST',
    headers: { 'Idempotency-Key': `${id}:${versao}` },
    body: JSON.stringify({ versao }),
  });
}

export function cancelProposal(id: string, versao: number, motivo?: string): Promise<DecisionResponse> {
  const body: { versao: number; motivo?: string } = { versao };
  if (motivo && motivo.trim()) body.motivo = motivo.trim();
  return call<DecisionResponse>(`${AGENT_BASE}/proposals/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export interface HistoryQuery {
  conta: AgentConta;
  /** YYYY-MM-DD */
  desde?: string;
  /** YYYY-MM-DD */
  ate?: string;
  ticker?: string;
  limit?: number;
  offset?: number;
}

export function getHistory(q: HistoryQuery, signal?: AbortSignal): Promise<Paged<HistoryItem>> {
  return call<Paged<HistoryItem>>(
    `${AGENT_BASE}/history${qs({ conta: q.conta, desde: q.desde, ate: q.ate, ticker: q.ticker, limit: q.limit, offset: q.offset })}`,
    { method: 'GET', signal },
  );
}

export function getEvents(
  q: { conta: AgentConta; proposalId?: string; limit?: number; offset?: number },
  signal?: AbortSignal,
): Promise<Paged<ProposalEvent>> {
  return call<Paged<ProposalEvent>>(
    `${AGENT_BASE}/events${qs({ conta: q.conta, proposalId: q.proposalId, limit: q.limit, offset: q.offset })}`,
    { method: 'GET', signal },
  );
}

export function getSettings(conta: AgentConta, signal?: AbortSignal): Promise<SettingsResponse> {
  return call<SettingsResponse>(`${AGENT_BASE}/settings${qs({ conta })}`, { method: 'GET', signal });
}

/** Concorrência otimista: `If-Match` com a `version` lida. 409 SETTINGS_VERSION_MISMATCH se mudou. */
export function updateSettings(conta: AgentConta, version: number, settings: TradingSettings): Promise<SettingsResponse> {
  return call<SettingsResponse>(`${AGENT_BASE}/settings${qs({ conta })}`, {
    method: 'PUT',
    headers: { 'If-Match': String(version) },
    body: JSON.stringify(settings),
  });
}

export function getSettingsPreview(conta: AgentConta, ticker: string, signal?: AbortSignal): Promise<SettingsPreview> {
  return call<SettingsPreview>(`${AGENT_BASE}/settings/preview${qs({ conta, ticker })}`, { method: 'GET', signal });
}

export function getEngine(conta: AgentConta, signal?: AbortSignal): Promise<AgentEngine> {
  return call<AgentEngine>(`${AGENT_BASE}/engine${qs({ conta })}`, { method: 'GET', signal });
}

export function pauseEngine(conta: AgentConta, motivo: string): Promise<unknown> {
  return call<unknown>(`${AGENT_BASE}/engine/pause${qs({ conta })}`, {
    method: 'POST',
    body: JSON.stringify({ motivo }),
  });
}

export function resumeEngine(conta: AgentConta): Promise<unknown> {
  return call<unknown>(`${AGENT_BASE}/engine/resume${qs({ conta })}`, { method: 'POST', body: '{}' });
}

/** Encerra as posições do sistema e cancela as ordens dele. Exige o texto "ZERAR". */
export function zerarEngine(conta: AgentConta, confirmacao: string): Promise<unknown> {
  return call<unknown>(`${AGENT_BASE}/engine/zerar${qs({ conta })}`, {
    method: 'POST',
    body: JSON.stringify({ confirmacao }),
  });
}

export function getDailyReport(conta: AgentConta, data?: string, signal?: AbortSignal): Promise<DailyReport> {
  return call<DailyReport>(`${AGENT_BASE}/report/daily${qs({ conta, data })}`, { method: 'GET', signal });
}
