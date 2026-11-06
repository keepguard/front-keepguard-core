import { BFF_CORE_URL, customFetch } from './api';

const BILLING_BASE = `${BFF_CORE_URL}/api/v1/core/billing`;

export interface BillingEntitlement {
  companyId: string;
  userId: string;
  status: string;
  planCode?: string | null;
  interval?: string | null;
  graceEndsAt?: string | null;
  currentPeriodEnd?: string | null;
  updatedAt?: string | null;
  allowsProduct: boolean;
  payerName?: string | null;
  payerEmail?: string | null;
}

export interface BillingPlanPrice {
  interval: string;
  amountCents: number;
  currency: string;
}

export interface BillingPlan {
  id: string;
  companyId: string;
  code: string;
  name: string;
  level?: number;
  enabled: boolean;
  trialDays: number;
  isPublic?: boolean;
  isLifetime?: boolean;
  prices: BillingPlanPrice[];
}

export interface SaveBillingPlan {
  code: string;
  name: string;
  level?: number;
  enabled: boolean;
  trialDays: number;
  isPublic?: boolean;
  isLifetime?: boolean;
  prices: BillingPlanPrice[];
}

export interface BillingGatewayAccount {
  companyId: string;
  gateway: string;
  primary?: boolean;
  apiKeyMasked: string;
  webhookConfigured: boolean;
  createdAt?: string;
  rotatedAt?: string;
}

export interface BillingGatewayAccountList {
  items: BillingGatewayAccount[];
}

export interface BillingSubscription {
  id: string;
  companyId: string;
  payerUserId: string;
  planCode: string;
  interval: string;
  paymentMethod: string;
  status: string;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  scheduledPlanCode?: string | null;
  scheduledInterval?: string | null;
  scheduledChangeAt?: string | null;
  sessionId?: string | null;
  deviceId?: string | null;
  deviceName?: string | null;
  deviceType?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface BillingInvoice {
  id: string;
  companyId: string;
  payerUserId: string;
  payerName?: string | null;
  payerEmail?: string | null;
  subscriptionId?: string | null;
  amountCents: number;
  currency: string;
  status: string;
  paymentMethod?: string | null;
  bankSlipUrl?: string | null;
  invoiceUrl?: string | null;
  pixPayload?: string | null;
  nfId?: string | null;
  nfUrl?: string | null;
  issuedAt?: string | null;
  dueAt?: string | null;
  paidAt?: string | null;
  graceEndsAt?: string | null;
  /** §6.12: faturas antigas e companies em OFF trazem estes campos nulos. */
  paidAmountCents?: number | null;
  refundedCents?: number | null;
  cardLast4?: string | null;
  cardBrand?: string | null;
  disputeStatus?: 'OPEN' | 'WON' | 'LOST' | null;
  disputeOpenedAt?: string | null;
  breakdown?: BillingInvoiceBreakdown | null;
}

export interface BillingInvoiceBreakdownLine {
  kind: string;
  amountCents: number;
  description: string;
}

export interface BillingInvoiceBreakdown {
  baseCents: number;
  lines: BillingInvoiceBreakdownLine[];
  chargedCents: number;
  adjustmentStatus?: string | null;
}

export interface BillingPage<T> {
  items: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export type BillingInvoiceSearch = {
  page?: number;
  size?: number;
  status?: string;
  paymentMethod?: string;
  payerUserId?: string;
  q?: string;
  from?: string;
  to?: string;
};

export type BillingEntitlementSearch = {
  page?: number;
  size?: number;
  status?: string;
  planCode?: string;
  q?: string;
  hasPlan?: boolean;
};

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { status?: number }).status === 404;
}

export function getBillingEntitlement(token: string): Promise<BillingEntitlement> {
  return customFetch<BillingEntitlement>(`${BILLING_BASE}/entitlement`, { method: 'GET' }, token);
}

export function listBillingPlans(token: string): Promise<BillingPlan[]> {
  return customFetch<BillingPlan[]>(`${BILLING_BASE}/plans`, { method: 'GET' }, token);
}

export function saveBillingPlan(body: SaveBillingPlan, token: string): Promise<BillingPlan> {
  return customFetch<BillingPlan>(`${BILLING_BASE}/plans`, {
    method: 'POST',
    body: JSON.stringify(body),
  }, token);
}

export function patchBillingPlan(code: string, body: SaveBillingPlan, token: string): Promise<BillingPlan> {
  return customFetch<BillingPlan>(`${BILLING_BASE}/plans/${encodeURIComponent(code)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  }, token);
}

export function deleteBillingPlan(code: string, token: string): Promise<void> {
  return customFetch<void>(`${BILLING_BASE}/plans/${encodeURIComponent(code)}`, {
    method: 'DELETE',
  }, token);
}

export async function listBillingGatewayAccounts(token: string): Promise<BillingGatewayAccountList> {
  return customFetch<BillingGatewayAccountList>(`${BILLING_BASE}/gateway-accounts`, { method: 'GET' }, token);
}

export async function getBillingGatewayAccount(token: string): Promise<BillingGatewayAccount | null> {
  try {
    return await customFetch<BillingGatewayAccount>(`${BILLING_BASE}/gateway-account`, { method: 'GET' }, token);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export function putBillingGatewayAccount(apiKey: string, webhookToken: string, token: string): Promise<BillingGatewayAccount> {
  return putBillingGatewayAccountByGateway('asaas', apiKey, webhookToken, token);
}

export function putBillingGatewayAccountByGateway(
  gateway: string,
  apiKey: string,
  webhookToken: string,
  token: string,
): Promise<BillingGatewayAccount> {
  return customFetch<BillingGatewayAccount>(`${BILLING_BASE}/gateway-accounts/${encodeURIComponent(gateway)}`, {
    method: 'PUT',
    body: JSON.stringify({ apiKey, webhookToken }),
  }, token);
}

export function setPrimaryBillingGateway(gateway: string, token: string): Promise<BillingGatewayAccount> {
  return customFetch<BillingGatewayAccount>(`${BILLING_BASE}/gateway-accounts/${encodeURIComponent(gateway)}/primary`, {
    method: 'POST',
  }, token);
}

export async function getBillingSubscription(token: string): Promise<BillingSubscription | null> {
  try {
    return await customFetch<BillingSubscription>(`${BILLING_BASE}/subscription`, { method: 'GET' }, token);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export function createBillingSubscription(
  body: {
    planCode: string;
    interval: string;
    paymentMethod: string;
    payerCpfCnpj?: string;
    creditCardToken?: string;
    sessionId?: string;
    deviceId?: string;
    deviceName?: string;
    deviceType?: string;
    ipAddress?: string;
    userAgent?: string;
  },
  token: string,
): Promise<BillingSubscription> {
  return customFetch<BillingSubscription>(`${BILLING_BASE}/subscriptions`, {
    method: 'POST',
    body: JSON.stringify(body),
  }, token);
}

/**
 * Sem `immediate`, o cancelamento é agendado para o fim da vigência já paga — o corte
 * na hora é privilégio de operação e o bff-core descarta o flag de quem não for admin.
 */
export function cancelBillingSubscription(
  id: string,
  token: string,
  immediate = false,
): Promise<BillingSubscription> {
  const suffix = immediate ? '?immediate=true' : '';
  return customFetch<BillingSubscription>(
    `${BILLING_BASE}/subscriptions/${encodeURIComponent(id)}/cancel${suffix}`,
    { method: 'POST' },
    token,
  );
}

export interface BillingPlanChangePreview {
  type: 'upgrade' | 'downgrade' | 'same';
  currentPlanCode: string;
  currentInterval: string;
  targetPlanCode: string;
  targetInterval: string;
  targetAmountCents: number;
  creditCents: number;
  chargeCents: number;
  currency: string;
  effectiveAt?: string | null;
  immediate: boolean;
}

export function previewBillingPlanChange(
  id: string,
  planCode: string,
  interval: string,
  token: string,
): Promise<BillingPlanChangePreview> {
  const query = new URLSearchParams({ planCode, interval }).toString();
  return customFetch<BillingPlanChangePreview>(
    `${BILLING_BASE}/subscriptions/${encodeURIComponent(id)}/change-preview?${query}`,
    { method: 'GET' },
    token,
  );
}

export function changeBillingPlan(
  id: string,
  body: { planCode: string; interval: string },
  token: string,
): Promise<BillingSubscription> {
  return customFetch<BillingSubscription>(
    `${BILLING_BASE}/subscriptions/${encodeURIComponent(id)}/change-plan`,
    { method: 'POST', body: JSON.stringify(body) },
    token,
  );
}

export function clearBillingScheduledChange(id: string, token: string): Promise<BillingSubscription> {
  return customFetch<BillingSubscription>(
    `${BILLING_BASE}/subscriptions/${encodeURIComponent(id)}/scheduled-change`,
    { method: 'DELETE' },
    token,
  );
}

function toQuery(params: Record<string, string | number | boolean | undefined>): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === '') return;
    query.set(key, String(value));
  });
  const encoded = query.toString();
  return encoded ? `?${encoded}` : '';
}

export async function searchBillingInvoices(
  params: BillingInvoiceSearch,
  token: string,
): Promise<BillingPage<BillingInvoice>> {
  return customFetch<BillingPage<BillingInvoice>>(
    `${BILLING_BASE}/invoices${toQuery({
      page: params.page ?? 0,
      size: params.size ?? 20,
      status: params.status,
      paymentMethod: params.paymentMethod,
      payerUserId: params.payerUserId,
      q: params.q,
      from: params.from,
      to: params.to,
    })}`,
    { method: 'GET' },
    token,
  );
}

export async function listBillingInvoices(token: string, payerUserId?: string): Promise<BillingInvoice[]> {
  const page = await searchBillingInvoices({ page: 0, size: 20, payerUserId }, token);
  return page.items || [];
}

export function searchBillingEntitlements(
  params: BillingEntitlementSearch,
  token: string,
): Promise<BillingPage<BillingEntitlement>> {
  return customFetch<BillingPage<BillingEntitlement>>(
    `${BILLING_BASE}/entitlements${toQuery({
      page: params.page ?? 0,
      size: params.size ?? 20,
      status: params.status,
      planCode: params.planCode,
      q: params.q,
      hasPlan: params.hasPlan,
    })}`,
    { method: 'GET' },
    token,
  );
}

const BILLING_ENTITLEMENT_EVENT = 'keepguard:billing-entitlement-updated';

export function notifyBillingEntitlement(entitlement: BillingEntitlement | null): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(BILLING_ENTITLEMENT_EVENT, { detail: entitlement }));
  }
}

export function onBillingEntitlement(callback: (entitlement: BillingEntitlement | null) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => {
    const customEvent = e as CustomEvent<BillingEntitlement | null>;
    callback(customEvent.detail ?? null);
  };
  window.addEventListener(BILLING_ENTITLEMENT_EVENT, handler);
  return () => window.removeEventListener(BILLING_ENTITLEMENT_EVENT, handler);
}

export function grantLifetimeSubscription(
  data: { targetUserId: string; planCode: string },
  token: string,
): Promise<BillingSubscription> {
  return customFetch<BillingSubscription>(
    `${BILLING_BASE}/subscriptions/grant-lifetime`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
    token,
  );
}

export interface BillingUserSummary {
  id: string;
  codeUser?: string;
  username?: string;
  email: string;
  status: string;
  emailVerified?: boolean;
}

export function lookupBillingUser(query: string, token: string): Promise<BillingUserSummary> {
  return customFetch<BillingUserSummary>(
    `${BILLING_BASE}/users/lookup?q=${encodeURIComponent(query.trim())}`,
    { method: 'GET' },
    token,
  );
}

/* ===== Plano Cobrança, C3 (contrato §3, §6.10, §6.12, §14.3) ===== */

export type BillingFinancialMode = 'OFF' | 'ON' | 'DRAINING';

/** Só os campos que as telas usam. Sem linha na company, o billing responde tudo desligado. */
export interface BillingSettings {
  companyId: string;
  financialMode: BillingFinancialMode;
  creditEnabled: boolean;
  couponEnabled: boolean;
  referralEnabled: boolean;
  catalogEnabled: boolean;
  reportsEnabled: boolean;
}

export function getBillingSettings(token: string): Promise<BillingSettings> {
  return customFetch<BillingSettings>(`${BILLING_BASE}/billing-settings`, { method: 'GET' }, token);
}

export interface BillingCreditItem {
  id: string;
  type: string;
  amountCents: number;
  reference?: { type: string; id: string } | null;
  expiresAt?: string | null;
  publicText?: string | null;
  createdAt: string;
  /** Só saem para operador e serviço. */
  reason?: string | null;
  actor?: string | null;
  /** §14.3: só em lote (lançamento positivo). */
  remainingCents?: number | null;
  reversedCents?: number | null;
  blocked?: boolean | null;
}

export interface BillingCreditStatement {
  balanceCents: number;
  reservedCents: number;
  availableCents: number;
  nextExpiry?: { amountCents: number; expiresAt: string } | null;
  items: BillingCreditItem[];
  page: number;
  size: number;
  total: number;
}

export function getBillingCredits(
  params: { userId: string; page?: number; size?: number },
  token: string,
): Promise<BillingCreditStatement> {
  return customFetch<BillingCreditStatement>(
    `${BILLING_BASE}/credits${toQuery({ userId: params.userId, page: params.page ?? 0, size: params.size ?? 20 })}`,
    { method: 'GET' },
    token,
  );
}

export function grantBillingCredit(
  body: { userId: string; amountCents: number; reason: string; publicText?: string; expiresAt?: string },
  idempotencyKey: string,
  token: string,
): Promise<BillingCreditItem> {
  return customFetch<BillingCreditItem>(`${BILLING_BASE}/credits`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(body),
  }, token);
}

export function reverseBillingCredit(
  id: string,
  body: { reason: string },
  idempotencyKey: string,
  token: string,
): Promise<BillingCreditItem> {
  return customFetch<BillingCreditItem>(`${BILLING_BASE}/credits/${encodeURIComponent(id)}/reverse`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(body),
  }, token);
}

export interface BillingAccount {
  entitlement?: BillingEntitlement | null;
  subscription?: BillingSubscription | null;
  availableCents?: number;
  reservedCents?: number;
  openDisputes?: Array<{ invoiceId: string; openedAt: string }>;
}

export function getBillingAccount(userId: string, token: string): Promise<BillingAccount> {
  return customFetch<BillingAccount>(`${BILLING_BASE}/billing-accounts/${encodeURIComponent(userId)}`, { method: 'GET' }, token);
}

export function getBillingInvoice(id: string, token: string): Promise<BillingInvoice> {
  return customFetch<BillingInvoice>(`${BILLING_BASE}/invoices/${encodeURIComponent(id)}`, { method: 'GET' }, token);
}

export type BillingRefundMethod = 'GATEWAY' | 'CREDIT';
export type BillingRefundStatus = 'REQUESTED' | 'AWAITING_AUTHORIZATION' | 'PROCESSING' | 'DONE' | 'REJECTED';

export interface BillingRefund {
  id: string;
  invoiceId?: string;
  amountCents: number;
  method: BillingRefundMethod;
  origin?: 'OPERATOR' | 'GATEWAY_PANEL';
  status: BillingRefundStatus;
  reason?: string | null;
  restoreCredit?: boolean;
  requestedBy?: string | null;
  createdAt?: string | null;
  doneAt?: string | null;
}

/** A forma da lista não está fixada no contrato (§6.10): aceita vetor ou `{items}`. */
export async function listBillingInvoiceRefunds(invoiceId: string, token: string): Promise<BillingRefund[]> {
  const data = await customFetch<BillingRefund[] | { items?: BillingRefund[] }>(
    `${BILLING_BASE}/invoices/${encodeURIComponent(invoiceId)}/refunds`,
    { method: 'GET' },
    token,
  );
  return Array.isArray(data) ? data : data?.items ?? [];
}

export interface BillingRefundPreview {
  refundableCents: number;
  clawbackCents: number;
  derivedLots?: Array<{ entryId: string; type: string; remainingCents: number }>;
  usedNotRecoverableCents?: number;
  creditRestoredCents?: number;
  /** 0 quando a fatura não bancou upgrade. */
  fundedUpgradeLimitCents?: number | null;
  requiresAcknowledge?: boolean;
}

export function previewBillingRefund(
  invoiceId: string,
  params: { amountCents: number; method: BillingRefundMethod },
  token: string,
): Promise<BillingRefundPreview> {
  return customFetch<BillingRefundPreview>(
    `${BILLING_BASE}/invoices/${encodeURIComponent(invoiceId)}/refund-preview${toQuery(params)}`,
    { method: 'GET' },
    token,
  );
}

export function createBillingRefund(
  invoiceId: string,
  body: {
    amountCents: number;
    method: BillingRefundMethod;
    reason: string;
    restoreCredit: boolean;
    acknowledgeUpgradeFunding?: boolean;
  },
  idempotencyKey: string,
  token: string,
): Promise<BillingRefund> {
  return customFetch<BillingRefund>(`${BILLING_BASE}/invoices/${encodeURIComponent(invoiceId)}/refunds`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(body),
  }, token);
}
