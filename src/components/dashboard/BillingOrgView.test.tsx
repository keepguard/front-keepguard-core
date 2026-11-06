import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { authMock, billingMock } from './billing/billingMoneyMocks';
import { entitlementRow, httpError, paidCard, PERSON, settingsOf } from './billing/testSupport';
import { BillingOrgView } from './BillingOrgView';

vi.mock('../../services/billingService', () => billingMock);
vi.mock('../../services/analystService', () => ({}));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => authMock }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ addToast: () => {} }) }));
vi.mock('./PixQr', () => ({ PixQr: () => null }));

const page = <T,>(items: T[]) => ({ items, page: 0, size: 20, totalElements: items.length, totalPages: 1 });

function renderView(route = '/admin/billing') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <BillingOrgView />
    </MemoryRouter>,
  );
}

const headers = () => within(document.querySelector('.desktop-table-view table') as HTMLElement)
  .getAllByRole('columnheader').map((th) => th.textContent);

beforeEach(() => {
  billingMock.searchBillingInvoices.mockResolvedValue(page([paidCard]));
  billingMock.searchBillingEntitlements.mockResolvedValue(page([entitlementRow]));
  billingMock.listBillingPlans.mockResolvedValue([]);
  billingMock.getBillingCredits.mockResolvedValue({ balanceCents: 0, reservedCents: 0, availableCents: 0, items: [], page: 0, size: 20, total: 0 });
  billingMock.getBillingAccount.mockRejectedValue(httpError(404));
  billingMock.getBillingInvoice.mockResolvedValue(paidCard);
  billingMock.listBillingInvoiceRefunds.mockResolvedValue([]);
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const OFF_CASES: Array<[string, () => void]> = [
  ['em OFF', () => billingMock.getBillingSettings.mockResolvedValue(settingsOf({ financialMode: 'OFF', creditEnabled: false }))],
  ['sem rota no bff (404)', () => billingMock.getBillingSettings.mockRejectedValue(httpError(404))],
  ['sem permissão de operador (403)', () => billingMock.getBillingSettings.mockRejectedValue(httpError(403))],
];

describe.each(OFF_CASES)('company desligada: %s', (_name, arrange) => {
  beforeEach(() => { arrange(); });

  const settled = () => waitFor(() => expect(billingMock.getBillingSettings).toHaveBeenCalled());

  it('Transações igual a hoje', async () => {
    renderView();
    await settled();
    await screen.findByRole('cell', { name: 'Pago' });
    expect(headers()).toEqual(['Status', 'Valor', 'Método', 'Pagador', 'Vencimento', 'Pagamento', 'NF', 'Id']);
    expect(screen.queryByText('Ver detalhes')).toBeNull();
    expect(document.querySelector('.bm-pill')).toBeNull();
    expect(document.querySelector('.mobile-cards-container')).toBeNull();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Transações', 'Assinantes', 'Planos', 'Configurações']);
  });

  it('detalhe da fatura igual a hoje: sem conta, sem Estornar e sem chamada nova', async () => {
    renderView();
    await settled();
    await userEvent.click(await screen.findByRole('button', { name: `Ver detalhes da fatura ${paidCard.id}` }));
    expect(await screen.findByRole('heading', { name: 'Detalhes da transação' })).toBeTruthy();
    expect(screen.queryByText('Conta')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Estornar' })).toBeNull();
    expect(screen.queryByText('Escrita desligada nesta fase')).toBeNull();
    expect(document.querySelector('.bm-invoice')).toBeNull();
    expect(billingMock.getBillingInvoice).not.toHaveBeenCalled();
    expect(billingMock.listBillingInvoiceRefunds).not.toHaveBeenCalled();
  });

  it('Assinantes igual a hoje: sem página do assinante', async () => {
    renderView();
    await settled();
    await userEvent.click(screen.getByRole('tab', { name: 'Assinantes' }));
    await screen.findByText('Pessoa de Exemplo');
    expect(headers()).toEqual(['Usuário', 'Plano', 'Intervalo', 'Status', 'Período']);
    expect(screen.queryByText('Abrir assinante')).toBeNull();
    expect(document.querySelector('.bm-pill')).toBeNull();
  });

  it('endereço com ?assinante= não abre o extrato', async () => {
    renderView(`/admin/billing?assinante=${PERSON}`);
    await settled();
    await screen.findByRole('cell', { name: 'Pago' });
    expect(screen.queryByText('Lançar crédito')).toBeNull();
    expect(billingMock.getBillingCredits).not.toHaveBeenCalled();
  });
});

describe('company ligada', () => {
  beforeEach(() => { billingMock.getBillingSettings.mockResolvedValue(settingsOf()); });

  it('nenhuma aba nova nesta fase, mesmo com as outras chaves ligadas', async () => {
    billingMock.getBillingSettings.mockResolvedValue(settingsOf({ couponEnabled: true, referralEnabled: true, reportsEnabled: true, catalogEnabled: true }));
    renderView();
    await screen.findByText('Ver detalhes', { selector: 'td button' });
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Transações', 'Assinantes', 'Planos', 'Configurações']);
  });

  it('abre a página como subpágina de Assinantes e volta', async () => {
    renderView();
    await userEvent.click(screen.getByRole('tab', { name: 'Assinantes' }));
    const open = await screen.findAllByRole('button', { name: 'Abrir assinante' });
    await userEvent.click(open[0]);
    expect(await screen.findByText('Sem lançamentos de crédito')).toBeTruthy();
    expect(billingMock.getBillingCredits).toHaveBeenCalledWith({ userId: PERSON, page: 0, size: 20 }, 'token-de-teste');
    expect(screen.getByRole('tab', { name: 'Assinantes' }).getAttribute('aria-selected')).toBe('true');
    const trail = screen.getByRole('navigation', { name: 'Trilha' });
    expect(trail.textContent).toContain('Pessoa de Exemplo');
    await userEvent.click(within(trail).getByRole('button', { name: 'Assinantes' }));
    expect(await screen.findAllByRole('button', { name: 'Abrir assinante' })).toBeTruthy();
    expect(screen.queryByText('Sem lançamentos de crédito')).toBeNull();
  });

  it('coreWriteEnabled falso também trava', async () => {
    billingMock.getBillingSettings.mockResolvedValue(settingsOf({ coreWriteEnabled: false }));
    renderView(`/admin/billing?assinante=${PERSON}`);
    expect(await screen.findByText('Escrita desligada nesta fase')).toBeTruthy();
  });

  it('nasce com a escrita desligada', async () => {
    renderView(`/admin/billing?assinante=${PERSON}`);
    expect(await screen.findByText('Escrita desligada nesta fase')).toBeTruthy();
    expect(await screen.findByText('Sem lançamentos de crédito')).toBeTruthy();
    screen.getAllByRole('button', { name: 'Lançar crédito' }).forEach((b) => expect((b as HTMLButtonElement).disabled).toBe(true));
  });

  it('modo ligado sem credit_enabled: fatura nova, sem extrato', async () => {
    billingMock.getBillingSettings.mockResolvedValue(settingsOf({ creditEnabled: false }));
    renderView();
    expect(await screen.findAllByText('Ver detalhes')).toBeTruthy();
    await userEvent.click(screen.getByRole('tab', { name: 'Assinantes' }));
    await screen.findByText('Pessoa de Exemplo');
    expect(screen.queryByText('Abrir assinante')).toBeNull();
  });

  it('com coreWriteEnabled, a escrita abre; o servidor ainda pode travar', async () => {
    billingMock.getBillingSettings.mockResolvedValue(settingsOf({ coreWriteEnabled: true }));
    billingMock.grantBillingCredit.mockRejectedValue(httpError(403, 'CORE_WRITE_DISABLED'));
    renderView(`/admin/billing?assinante=${PERSON}`);
    await screen.findByText('Sem lançamentos de crédito');
    expect(screen.queryByText('Escrita desligada nesta fase')).toBeNull();
    await userEvent.click(screen.getAllByRole('button', { name: 'Lançar crédito' })[0]);
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/Valor/), '10');
    await userEvent.type(within(dialog).getByLabelText(/Motivo/), 'x');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lançar crédito' }));
    await within(dialog).findByRole('alert');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(await screen.findByText('Escrita desligada nesta fase')).toBeTruthy();
    screen.getAllByRole('button', { name: 'Lançar crédito' }).forEach((b) => expect((b as HTMLButtonElement).disabled).toBe(true));
  });
});
