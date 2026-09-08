import { BFF_CORE_URL, customFetch } from './api';

const BILLING_BASE = `${BFF_CORE_URL}/api/v1/core/billing`;

export interface BillingEntitlement {
  companyId: string;
  userId: string;
  status: string;
  planCode?: string | null;
  interval?: string | null;
  quotasJson?: string | null;
  graceEndsAt?: string | null;
  currentPeriodEnd?: string | null;
  allowsProduct: boolean;
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
  apiKeyMasked: string;
  webhookConfigured: boolean;
  createdAt?: string;
  rotatedAt?: string;
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
  subscriptionId?: string | null;
  amountCents: number;
  currency: string;
  status: string;
  paymentMethod?: string | null;
  bankSlipUrl?: string | null;
  pixPayload?: string | null;
  issuedAt?: string | null;
  dueAt?: string | null;
  paidAt?: string | null;
  graceEndsAt?: string | null;
}

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

export async function getBillingGatewayAccount(token: string): Promise<BillingGatewayAccount | null> {
  try {
    return await customFetch<BillingGatewayAccount>(`${BILLING_BASE}/gateway-account`, { method: 'GET' }, token);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export function putBillingGatewayAccount(apiKey: string, webhookToken: string, token: string): Promise<BillingGatewayAccount> {
  return customFetch<BillingGatewayAccount>(`${BILLING_BASE}/gateway-account`, {
    method: 'PUT',
    body: JSON.stringify({ apiKey, webhookToken }),
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
  body: { planCode: string; interval: string; paymentMethod: string },
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

export function listBillingInvoices(token: string): Promise<BillingInvoice[]> {
  return customFetch<BillingInvoice[]>(`${BILLING_BASE}/invoices`, { method: 'GET' }, token);
}
