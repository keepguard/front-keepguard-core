import { BFF_CORE_URL, customFetch } from './api';

const BILLING_BASE = `${BFF_CORE_URL}/api/v1/core/billing`;

export interface BillingEntitlement {
  companyId: string;
  userId: string;
  status: string;
  planCode?: string | null;
  interval?: string | null;
  quotas?: Record<string, number> | null;
  quotasJson?: string | null;
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
  enabled: boolean;
  quotas?: Record<string, number> | null;
  quotasJson?: string | null;
  trialDays: number;
  prices: BillingPlanPrice[];
}

export interface SaveBillingPlan {
  code: string;
  name: string;
  enabled: boolean;
  quotasJson?: string;
  trialDays: number;
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
  pixPayload?: string | null;
  nfId?: string | null;
  nfUrl?: string | null;
  issuedAt?: string | null;
  dueAt?: string | null;
  paidAt?: string | null;
  graceEndsAt?: string | null;
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
  },
  token: string,
): Promise<BillingSubscription> {
  return customFetch<BillingSubscription>(`${BILLING_BASE}/subscriptions`, {
    method: 'POST',
    body: JSON.stringify(body),
  }, token);
}

export function cancelBillingSubscription(id: string, token: string): Promise<BillingSubscription> {
  return customFetch<BillingSubscription>(`${BILLING_BASE}/subscriptions/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
  }, token);
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

