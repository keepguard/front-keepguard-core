import { Info, OctagonAlert, Shield, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';
import type {
  Proposal,
  ProposalEstado,
  ProposalFamilia,
  ProposalOrdem,
  ProposalProtecao,
  ProposalTipo,
} from '../../../services/agentOrdersService';

/** Família → cor + ícone + rótulo (SPEC-002 §4.1 A). A cor nunca aparece sozinha. */
export const FAMILIA_META: Record<ProposalFamilia, { label: string; plural: string; icon: LucideIcon; tone: string; prioridade: number }> = {
  EMERGENCIA: { label: 'Emergência', plural: 'emergência', icon: OctagonAlert, tone: 'emergency', prioridade: 1 },
  VENDA: { label: 'Venda', plural: 'venda', icon: TrendingDown, tone: 'sell', prioridade: 2 },
  STOP: { label: 'Stop', plural: 'stop', icon: Shield, tone: 'stop', prioridade: 3 },
  COMPRA: { label: 'Compra', plural: 'compra', icon: TrendingUp, tone: 'buy', prioridade: 4 },
  ALERTA: { label: 'Alerta', plural: 'alerta', icon: Info, tone: 'alert', prioridade: 5 },
};

export const FAMILIAS_ORDEM: ProposalFamilia[] = ['EMERGENCIA', 'VENDA', 'STOP', 'COMPRA', 'ALERTA'];

export const TIPO_LABEL: Record<ProposalTipo, string> = {
  ABRIR_COMPRA: 'Abrir compra',
  ADICIONAR_COMPRA: 'Comprar mais',
  ENCERRAR_TRAILING: 'Vender (stop móvel)',
  ENCERRAR_TETO: 'Vender (teto)',
  ENCERRAR_EMERGENCIA: 'Encerrar já',
  PROTEGER: 'Proteger posição',
  REFAZER_STOP: 'Refazer stop',
  CANCELAR_ORFA: 'Cancelar ordem órfã',
  ALERTA_ORFA: 'Ordem órfã',
  ALERTA_NOTICIA: 'Notícia relevante',
};

export const ESTADO_LABEL: Record<ProposalEstado, string> = {
  ABERTA: 'Aberta',
  SEM_SALDO: 'Sem saldo',
  AGUARDANDO_SALDO: 'Aguardando saldo',
  INVALIDADA: 'Invalidada',
};

const ORDEM_TIPO_LABEL: Record<string, string> = {
  BUY: 'Compra a mercado',
  SELL: 'Venda a mercado',
  BUY_LIMIT: 'Compra limitada',
  SELL_LIMIT: 'Venda limitada',
  BUY_STOP: 'Compra stop',
  SELL_STOP: 'Venda stop',
  BUY_STOP_LIMIT: 'Compra stop limite',
  SELL_STOP_LIMIT: 'Venda stop limite',
};

export function ordemTipoLabel(tipo: string): string {
  return ORDEM_TIPO_LABEL[tipo] ?? tipo;
}

export function isConfirmavel(p: Proposal): boolean {
  return p.estado === 'ABERTA' && p.familia !== 'ALERTA' && p.ordem != null;
}

export function isInativa(p: Proposal): boolean {
  return p.estado !== 'ABERTA';
}

/** Ordem padrão: ativas primeiro por prioridade da família, depois validade restante; inativas no fim. */
export function sortProposals(items: Proposal[]): Proposal[] {
  const t = (iso: string | null) => (iso ? new Date(iso).getTime() : Number.POSITIVE_INFINITY);
  return [...items].sort((a, b) => {
    const ia = isInativa(a) ? 1 : 0;
    const ib = isInativa(b) ? 1 : 0;
    if (ia !== ib) return ia - ib;
    const pa = FAMILIA_META[a.familia]?.prioridade ?? 9;
    const pb = FAMILIA_META[b.familia]?.prioridade ?? 9;
    if (pa !== pb) return pa - pb;
    return t(a.validaAte) - t(b.validaAte);
  });
}

export function money(v: number | null | undefined): string {
  if (typeof v !== 'number' || Number.isNaN(v)) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function price(v: number | null | undefined): string {
  if (typeof v !== 'number' || Number.isNaN(v)) return '—';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function pct(v: number | null | undefined, digits = 1): string {
  if (typeof v !== 'number' || Number.isNaN(v)) return '—';
  return `${v.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

export function qty(v: number | null | undefined): string {
  if (typeof v !== 'number' || Number.isNaN(v)) return '—';
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
}

export function timeOnly(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

/** Linha principal da ordem: "Compra limitada · 40 × 36,42". */
export function ordemResumo(o: ProposalOrdem): string {
  if (o.acao === 'REMOVE') return `Cancelar ${ordemTipoLabel(o.tipo).toLowerCase()} · ${qty(o.volume)} un.`;
  if (o.acao === 'SLTP') return `Ajustar stop da posição · ${qty(o.volume)} un.`;
  const preco = o.preco != null ? ` × ${price(o.preco)}` : ' a mercado';
  const limite = o.stopLimit != null ? ` (limite ${price(o.stopLimit)})` : '';
  return `${ordemTipoLabel(o.tipo)} · ${qty(o.volume)}${preco}${limite}`;
}

export function protecaoResumo(p: ProposalProtecao): string {
  const limite = p.limite != null ? ` / limite ${price(p.limite)}` : '';
  return `Stop: disparo ${price(p.disparo)}${limite}`;
}

const CAMPO_LABEL: Record<string, string> = {
  'protecao.disparo': 'stop',
  'protecao.limite': 'limite do stop',
  'ordem.preco': 'preço',
  'ordem.stopLimit': 'limite',
  'ordem.volume': 'quantidade',
  validaAte: 'validade',
  estado: 'estado',
};

function fmtValor(v: unknown): string {
  if (typeof v === 'number') return Number.isInteger(v) ? qty(v) : price(v);
  if (v == null) return '—';
  return String(v);
}

/** "stop 35,60 → 35,80" para a(s) alteração(ões) mais recente(s) — §4.1 C. */
export function alteracoesRecentes(p: Proposal): string[] {
  if (!p.alteracoes || p.alteracoes.length === 0) return [];
  const ultima = p.alteracoes.reduce((acc, a) => (a.em > acc ? a.em : acc), p.alteracoes[0].em);
  return p.alteracoes
    .filter((a) => a.em === ultima)
    .map((a) => `${CAMPO_LABEL[a.campo] ?? a.campo} ${fmtValor(a.antes)} → ${fmtValor(a.depois)}`);
}

/** Contagem regressiva legível: "12 min", "1 h 05", "45 s", "vencida". */
export function countdown(validaAte: string | null, nowMs: number): { text: string; urgent: boolean; expired: boolean } {
  if (!validaAte) return { text: 'até resolver', urgent: false, expired: false };
  const diff = Math.floor((new Date(validaAte).getTime() - nowMs) / 1000);
  if (diff <= 0) return { text: 'vencida', urgent: true, expired: true };
  if (diff < 60) return { text: `${diff} s`, urgent: true, expired: false };
  const min = Math.floor(diff / 60);
  if (min < 60) return { text: `${min} min`, urgent: min < 5, expired: false };
  const h = Math.floor(min / 60);
  if (h < 24) return { text: `${h} h ${String(min % 60).padStart(2, '0')}`, urgent: false, expired: false };
  const d = Math.floor(h / 24);
  return { text: `${d} ${d === 1 ? 'dia' : 'dias'}`, urgent: false, expired: false };
}

export const REGIME_LABEL: Record<string, string> = {
  ALTA: 'Alta',
  BAIXA: 'Baixa',
  LATERAL: 'Lateral',
  VOLATIL: 'Volátil',
};
