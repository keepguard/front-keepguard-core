/** Só para os testes de dinheiro do backoffice. */
import type { BillingEntitlement, BillingInvoice, BillingSettings } from '../../../services/billingService';

export const OPERATOR = 'aaaaaaaa-0000-4000-8000-00000000000a';
export const PERSON = '00000000-0000-4000-8000-000000000001';

export const httpError = (status: number, error?: string, message?: string) =>
  Object.assign(new Error(message ?? error ?? 'erro'), { status, data: { error, message } });

export const settingsOf = (over: Partial<BillingSettings> = {}): BillingSettings => ({
  companyId: 'c',
  financialMode: 'ON',
  creditEnabled: true,
  couponEnabled: false,
  referralEnabled: false,
  catalogEnabled: false,
  reportsEnabled: false,
  ...over,
});

export const entitlementRow: BillingEntitlement = {
  companyId: 'c',
  userId: PERSON,
  status: 'active',
  planCode: 'ECHOUNO-PRO',
  interval: 'month',
  currentPeriodEnd: '2026-11-12T12:00:00Z',
  allowsProduct: true,
  payerName: 'Pessoa de Exemplo',
  payerEmail: 'pessoa@exemplo.com',
};

export const paidCard: BillingInvoice = {
  id: 'f0000000-0000-4000-8000-000000000042',
  companyId: 'c',
  payerUserId: PERSON,
  payerName: 'Pessoa de Exemplo',
  payerEmail: 'pessoa@exemplo.com',
  amountCents: 5790,
  currency: 'BRL',
  status: 'paid',
  paymentMethod: 'credit_card',
  paidAt: '2026-10-12T12:14:00Z',
  dueAt: '2026-10-12T12:00:00Z',
  paidAmountCents: 5790,
  refundedCents: 0,
  cardLast4: '1234',
  cardBrand: 'Visa',
  breakdown: {
    baseCents: 9700,
    lines: [
      { kind: 'COUPON', amountCents: -2910, description: 'Cupom VOLTA30' },
      { kind: 'CREDIT', amountCents: -1000, description: 'Crédito' },
    ],
    chargedCents: 5790,
    adjustmentStatus: 'APPLIED',
  },
};

export const paidPix: BillingInvoice = {
  ...paidCard,
  id: 'f0000000-0000-4000-8000-000000000043',
  amountCents: 9700,
  paidAmountCents: 9700,
  paymentMethod: 'pix',
  cardLast4: null,
  cardBrand: null,
  breakdown: { baseCents: 9700, lines: [], chargedCents: 9700, adjustmentStatus: 'SKIPPED' },
};
