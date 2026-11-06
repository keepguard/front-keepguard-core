/** Regras puras das telas de dinheiro do backoffice (Plano Cobrança, C3). */
import type { BillingRefund, BillingSettings } from '../services/billingService';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function brl(cents: number): string {
  return BRL.format(cents / 100);
}

export function signedBrl(cents: number): string {
  return `${cents > 0 ? '+' : '−'}${brl(Math.abs(cents))}`;
}

const MAX_CENTS = 99_999_999_999;

/**
 * Lê valor digitado em reais sem passar por float. Aceita `1234`, `1234,5`, `1.234,56` e `R$ 10,00`.
 * `12.50` é recusado: ponto só separa milhar, e lê-lo como 1250 ou 12,50 seria adivinhar dinheiro.
 */
export function parseBrlToCents(text: string): number | null {
  const clean = text.replace(/R\$/gi, '').replace(/\s/g, '');
  const match = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(clean);
  if (!match) return null;
  const cents = Number(match[1].replace(/\./g, '')) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents <= MAX_CENTS ? cents : null;
}

/** Vale para saldo, reserva e fatura: em `OFF` nada novo aparece (P1). */
export function isFinancialActive(settings: BillingSettings | null): boolean {
  return settings?.financialMode === 'ON' || settings?.financialMode === 'DRAINING';
}

/** Mesma regra do billing para `/credits`: modo ativo e `credit_enabled`. Nunca por dedução. */
export function isCreditActive(settings: BillingSettings | null): boolean {
  return isFinancialActive(settings) && settings?.creditEnabled === true;
}

/**
 * A escrita nasce desligada (§3): só `coreWriteEnabled === true` em `GET /billing-settings` destrava.
 * Campo ausente vale desligado; ainda assim, um `403 CORE_WRITE_DISABLED` trava de novo.
 */
export function isCoreWriteEnabled(settings: BillingSettings | null): boolean {
  return settings?.coreWriteEnabled === true;
}

const ENTRY_LABELS: Record<string, string> = {
  UPGRADE_SURPLUS: 'Sobra de upgrade',
  OVERPAID: 'Pago acima do valor',
  UNUSED_PREPAID: 'Pago e não usado',
  PAID_AFTER_CLOSE: 'Pago depois de encerrar',
  OPERATOR_GRANT: 'Crédito lançado por operador',
  REFUND_TO_CREDIT: 'Estorno em crédito',
  REFUND_RESTORE: 'Crédito devolvido por estorno',
  COUPON_FLOOR_EXCESS: 'Sobra de cupom',
  REFERRAL_REWARD: 'Crédito de indicação',
  INVOICE_RESERVE: 'Reserva para fatura',
  INVOICE_RESERVE_RELEASE: 'Devolução de reserva',
  INVOICE_USE: 'Uso em fatura',
  EXPIRATION: 'Vencimento',
  OPERATOR_REVERSAL: 'Correção (lançamento contrário)',
  REFERRAL_REVERSAL: 'Retirada de crédito de indicação',
  CLAWBACK: 'Retirada por estorno',
  DISPUTE_HOLD: 'Retido por contestação',
  DISPUTE_HOLD_RELEASE: 'Fim da retenção',
  ERASURE: 'Remoção por pedido de exclusão',
};

export function creditEntryLabel(type: string): string {
  return ENTRY_LABELS[type] ?? type;
}

export function actorLabel(actor?: string | null): string {
  if (!actor) return '—';
  if (actor.toLowerCase() === 'system') return 'Sistema';
  return actor.length > 14 ? `${actor.slice(0, 8)}…${actor.slice(-4)}` : actor;
}

export function shortDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR');
}

/** Vence no fim do dia escolhido, no fuso da operação (America/Sao_Paulo, §3). */
export function dateInputToExpiry(value: string): string | undefined {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59-03:00` : undefined;
}

export function intervalAdjective(value?: string | null): string {
  switch (value) {
    case 'month': return 'mensal';
    case 'quarter': return 'trimestral';
    case 'semiannual': return 'semestral';
    case 'year': return 'anual';
    case 'lifetime': return 'vitalício';
    default: return value ?? '';
  }
}

/** Fatura antiga não tem `paidAmountCents`: vale `amountCents` (§6.10). */
export function paidCents(invoice: { paidAmountCents?: number | null; amountCents: number }): number {
  return invoice.paidAmountCents ?? invoice.amountCents;
}

/** Soma do que já foi pedido e não recusado: o limite é o mesmo do `REFUND_EXCEEDS_PAID`. */
export function requestedRefundsCents(refunds: BillingRefund[]): number {
  return refunds.filter((r) => r.status !== 'REJECTED').reduce((sum, r) => sum + r.amountCents, 0);
}

export function doneRefundsCents(refunds: BillingRefund[]): number {
  return refunds.filter((r) => r.status === 'DONE').reduce((sum, r) => sum + r.amountCents, 0);
}

export type MoneyErrorKind =
  /** Lista do bff-core sem esta company: trava a escrita e a consulta segue. */
  | 'write_disabled'
  /** Resposta definitiva: guardada pelo billing, tentar de novo exige chave nova. */
  | 'definitive'
  /** Em curso: a mesma chave continua válida. */
  | 'in_progress'
  /** O pedido ficou registrado e o billing confere sozinho: não repetir. */
  | 'registered'
  /** Sem resposta certa (rede ou 5xx): repete o mesmo pedido, com a mesma chave. */
  | 'uncertain';

export interface MoneyError {
  code: string;
  status: number;
  kind: MoneyErrorKind;
  title: string;
  text: string;
  /** Erro de um campo do formulário. */
  field?: 'amount' | 'reason';
}

const KNOWN: Record<string, Omit<MoneyError, 'code' | 'status' | 'kind'> & { kind?: MoneyErrorKind }> = {
  CORE_WRITE_DISABLED: {
    kind: 'write_disabled',
    title: 'Escrita desligada nesta fase',
    text: 'Nada foi gravado. Dá para consultar tudo; os botões de gravar ficam travados até a liberação de segurança.',
  },
  SELF_ACTION_FORBIDDEN: {
    title: 'Esta conta é a sua.',
    text: 'Nenhum operador faz esta ação para si mesmo. Peça a outra pessoa da operação.',
  },
  DAILY_CAP_EXCEEDED: {
    title: 'O teto de hoje foi atingido.',
    text: 'Nada foi gravado. O limite por company volta amanhã, ou peça para a operação rever.',
  },
  CREDIT_AMOUNT_INVALID: { title: 'Valor inválido.', text: 'Informe um valor maior que zero.', field: 'amount' },
  CREDIT_REASON_REQUIRED: { title: 'Falta o motivo.', text: 'Escreva o motivo.', field: 'reason' },
  CREDIT_NOTHING_TO_REVERSE: {
    title: 'Nada para retirar.',
    text: 'O lançamento já não tem saldo. O extrato foi atualizado.',
  },
  FEATURE_DISABLED: { title: 'Recurso desligado nesta company.', text: 'Nada foi gravado.' },
  INVOICE_NOT_REFUNDABLE: {
    title: 'Esta fatura não pode ser estornada.',
    text: 'Ela não está paga, ou há contestação aberta. Nada foi gravado.',
  },
  REFUND_EXCEEDS_PAID: {
    title: 'O valor passa do que foi pago.',
    text: 'Outro estorno pode ter entrado antes. Confira o limite atualizado.',
    field: 'amount',
  },
  REFUND_FUNDED_UPGRADE: {
    title: 'O valor avança sobre um upgrade já pago.',
    text: 'Baixe o valor ou confirme estornar acima do limite.',
    field: 'amount',
  },
  REFUND_IN_PROGRESS: {
    title: 'Já existe estorno em andamento no Asaas.',
    text: 'Não precisa pedir de novo. Acompanhe na lista de estornos.',
  },
  REFUND_REASON_REQUIRED: { title: 'Falta o motivo.', text: 'Escreva o motivo do estorno.', field: 'reason' },
  GATEWAY_UNAVAILABLE: {
    kind: 'registered',
    title: 'O Asaas não respondeu.',
    text: 'O pedido ficou registrado e a conferência olha o Asaas antes de repetir. Não precisa pedir de novo agora.',
  },
  IDEMPOTENCY_KEY_REUSED: {
    title: 'Pedido diferente com a mesma chave.',
    text: 'Nada foi gravado. Envie de novo para gerar um pedido novo.',
  },
  REQUEST_IN_PROGRESS: {
    kind: 'in_progress',
    title: 'Este pedido ainda está em curso.',
    text: 'Espere alguns segundos e confira o resultado antes de tentar de novo.',
  },
  SESSION_REQUIRED: {
    title: 'A sessão não foi reconhecida.',
    text: 'Nada foi gravado. Entre de novo e repita.',
  },
};

/** Traduz o erro de uma escrita. `error` no corpo é o código estável (§3). */
export function classifyMoneyError(error: unknown): MoneyError {
  const raw = error as { status?: number; data?: { error?: string; message?: string }; message?: string } | null;
  const status = raw?.status ?? 0;
  const code = raw?.data?.error ?? '';
  const serverText = raw?.data?.message ?? '';
  if (code === 'REFUND_REJECTED_BY_GATEWAY' || code === 'GATEWAY_REJECTED') {
    return {
      code,
      status,
      kind: 'definitive',
      title: 'O Asaas recusou o estorno.',
      text: `${serverText || 'Sem detalhe do Asaas.'} Nada mudou no saldo nem na fatura. Você pode tentar de novo mais tarde.`,
    };
  }
  const known = KNOWN[code];
  if (known) return { code, status, kind: 'definitive', ...known };
  if (status === 0 || status >= 500) {
    return {
      code: code || 'SEM_RESPOSTA',
      status,
      kind: 'uncertain',
      title: 'Não deu para confirmar o resultado.',
      text: 'O pedido pode ter chegado ou não. Tentar de novo repete o mesmo pedido, sem duplicar.',
    };
  }
  return {
    code,
    status,
    kind: 'definitive',
    title: 'O pedido foi recusado.',
    text: serverText || 'Nada foi gravado. Confira os dados e tente de novo.',
  };
}
