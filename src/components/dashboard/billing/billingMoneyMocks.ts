import { vi } from 'vitest';
import { OPERATOR } from './testSupport';

/** Mantém os tipos e troca só o que fala com a rede. */
export const billingMock = {
  getBillingSettings: vi.fn(),
  getBillingCredits: vi.fn(),
  grantBillingCredit: vi.fn(),
  reverseBillingCredit: vi.fn(),
  getBillingAccount: vi.fn(),
  getBillingInvoice: vi.fn(),
  listBillingInvoiceRefunds: vi.fn(),
  previewBillingRefund: vi.fn(),
  createBillingRefund: vi.fn(),
  searchBillingInvoices: vi.fn(),
  searchBillingEntitlements: vi.fn(),
  listBillingPlans: vi.fn(),
};

export const authMock = {
  isAuthenticated: true,
  getAccessToken: () => 'token-de-teste',
  user: { codeUser: OPERATOR, roles: ['ROLE_ADMIN'] },
};
