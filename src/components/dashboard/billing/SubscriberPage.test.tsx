import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { billingMock, authMock } from './billingMoneyMocks';
import { entitlementRow, httpError, PERSON, OPERATOR } from './testSupport';
import { SubscriberPage } from './SubscriberPage';
import { BillingFeaturesContext, type BillingFeatures } from './useBillingFeatures';
import type { BillingCreditStatement } from '../../../services/billingService';

vi.mock('../../../services/billingService', () => billingMock);
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => authMock }));

const statement: BillingCreditStatement = {
  balanceCents: 2880,
  reservedCents: 1000,
  availableCents: 1880,
  nextExpiry: { amountCents: 1940, expiresAt: '2027-11-06T12:00:00Z' },
  page: 0,
  size: 20,
  total: 3,
  items: [
    {
      id: 'e1', type: 'OPERATOR_GRANT', amountCents: 1940, createdAt: '2026-10-12T12:00:00Z',
      reason: 'Cortesia combinada no atendimento.', actor: OPERATOR, publicText: 'Cortesia', remainingCents: 940, reversedCents: 0,
    },
    {
      id: 'e2', type: 'OPERATOR_GRANT', amountCents: 5000, createdAt: '2026-11-02T12:00:00Z',
      reason: 'Compensação.', actor: OPERATOR, publicText: 'Crédito da equipe', remainingCents: 0, reversedCents: 5000,
    },
    { id: 'e3', type: 'INVOICE_RESERVE', amountCents: -1000, createdAt: '2026-10-20T12:00:00Z', actor: 'system', publicText: 'Reservado' },
  ],
};

let markWriteDisabled = vi.fn();

function renderPage(over: Partial<BillingFeatures> = {}, userId = PERSON) {
  const features: BillingFeatures = {
    loading: false, settings: null, creditOn: true, financialOn: true, writeOpen: true, markWriteDisabled, ...over,
  };
  return render(
    <BillingFeaturesContext.Provider value={features}>
      <SubscriberPage userId={userId} row={entitlementRow} onBack={() => {}} />
    </BillingFeaturesContext.Provider>,
  );
}

const tableRow = (text: string) => within(document.querySelector('.desktop-table-view') as HTMLElement).getByText(text).closest('tr') as HTMLElement;

beforeEach(() => {
  markWriteDisabled = vi.fn();
  billingMock.getBillingCredits.mockResolvedValue(statement);
  billingMock.getBillingAccount.mockRejectedValue(httpError(404));
  billingMock.grantBillingCredit.mockResolvedValue({ id: 'n', type: 'OPERATOR_GRANT', amountCents: 2000, createdAt: 'x' });
  billingMock.reverseBillingCredit.mockResolvedValue({ id: 'r', type: 'OPERATOR_REVERSAL', amountCents: -940, createdAt: 'x' });
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('extrato', () => {
  it('escrita desligada: consulta segue e os botões ficam travados', async () => {
    renderPage({ writeOpen: false });
    expect(await screen.findByText('Escrita desligada nesta fase')).toBeTruthy();
    expect(await screen.findByText('Extrato imutável')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Lançar crédito' }) as HTMLButtonElement).disabled).toBe(true);
    screen.getAllByRole('button', { name: 'Lançar contrário' }).forEach((b) => expect((b as HTMLButtonElement).disabled).toBe(true));
    expect(screen.getAllByText('Compensação.').length).toBeGreaterThan(0);
    expect(billingMock.grantBillingCredit).not.toHaveBeenCalled();
  });

  it('mostra saldos, restante, revertido e o que o cliente vê', async () => {
    renderPage();
    await screen.findByText('Extrato imutável');
    expect(screen.getByText(/18,80/)).toBeTruthy();
    const lot = tableRow('Cortesia combinada no atendimento.');
    expect(lot.textContent).toContain('Restante:');
    expect(lot.textContent).toContain('Cliente vê: Cortesia');
    const reversed = tableRow('Compensação.');
    expect(reversed.textContent).toContain('Revertido:');
    expect(reversed.textContent).toContain('Já corrigido');
    expect(within(reversed).queryByRole('button')).toBeNull();
  });

  it('linha sem motivo não inventa: automático e por Sistema', async () => {
    renderPage();
    await screen.findByText('Extrato imutável');
    const reserve = tableRow('Reserva para fatura');
    expect(reserve.textContent).toContain('Automático');
    expect(reserve.textContent).toContain('Por: Sistema');
    expect(within(reserve).queryByRole('button')).toBeNull();
  });

  it('sem restante vindo do billing, não oferece reverter', async () => {
    billingMock.getBillingCredits.mockResolvedValue({
      ...statement,
      items: [{ id: 'e9', type: 'OPERATOR_GRANT', amountCents: 500, createdAt: '2026-10-12T12:00:00Z', reason: 'Sem campo novo', actor: OPERATOR }],
    });
    renderPage();
    await screen.findByText('Extrato imutável');
    expect(screen.queryByRole('button', { name: 'Lançar contrário' })).toBeNull();
  });

  it('vazio', async () => {
    billingMock.getBillingCredits.mockResolvedValue({ balanceCents: 0, reservedCents: 0, availableCents: 0, items: [], page: 0, size: 20, total: 0 });
    renderPage({ writeOpen: false });
    expect(await screen.findByText('Sem lançamentos de crédito')).toBeTruthy();
    screen.getAllByRole('button', { name: 'Lançar crédito' }).forEach((b) => expect((b as HTMLButtonElement).disabled).toBe(true));
  });

  it('erro: avisa, oferece tentar de novo e não mostra saldo inventado', async () => {
    billingMock.getBillingCredits.mockRejectedValueOnce(httpError(502));
    renderPage();
    expect((await screen.findByRole('alert')).textContent).toContain('Não foi possível carregar o extrato.');
    expect(screen.queryByText('Disponível')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Extrato imutável')).toBeTruthy();
  });

  it('carregando', async () => {
    billingMock.getBillingCredits.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect((await screen.findByRole('status')).textContent).toContain('Carregando o extrato');
  });

  it('própria conta: avisa e tira as ações, mesmo com escrita ligada', async () => {
    renderPage({}, OPERATOR);
    await screen.findByText('Extrato imutável');
    expect(screen.getByText('Esta é a sua própria conta.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Lançar crédito' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Lançar contrário' })).toBeNull();
  });
});

describe('Lançar crédito', () => {
  const open = async () => {
    renderPage();
    await screen.findByText('Extrato imutável');
    await userEvent.click(screen.getByRole('button', { name: 'Lançar crédito' }));
    return screen.getByRole('dialog');
  };
  const submit = (dialog: HTMLElement) => userEvent.click(within(dialog).getByRole('button', { name: /Lançar crédito|Tentar de novo/ }));

  it('valida antes de gastar a chamada', async () => {
    const dialog = await open();
    await submit(dialog);
    expect(within(dialog).getByText('Informe um valor maior que zero, como 19,40.')).toBeTruthy();
    expect(within(dialog).getByText('Escreva o motivo.')).toBeTruthy();
    expect(billingMock.grantBillingCredit).not.toHaveBeenCalled();
  });

  it('lança em centavos, com a prévia certa e chave de idempotência', async () => {
    const dialog = await open();
    await userEvent.type(within(dialog).getByLabelText(/Valor/), '20,50');
    await userEvent.type(within(dialog).getByLabelText(/Motivo/), 'Instabilidade');
    expect(within(dialog).getByText('Disponível depois').nextSibling?.textContent).toContain('39,30');
    await submit(dialog);
    await waitFor(() => expect(billingMock.grantBillingCredit).toHaveBeenCalledTimes(1));
    const [body, key] = billingMock.grantBillingCredit.mock.calls[0];
    expect(body).toEqual({ userId: PERSON, amountCents: 2050, reason: 'Instabilidade' });
    expect(key).toMatch(/[0-9a-f-]{36}/);
    expect(await screen.findByText(/lançado\./)).toBeTruthy();
    expect(billingMock.getBillingCredits).toHaveBeenCalledTimes(2);
  });

  it('403 CORE_WRITE_DISABLED: aviso claro e trava a escrita', async () => {
    billingMock.grantBillingCredit.mockRejectedValue(httpError(403, 'CORE_WRITE_DISABLED'));
    const dialog = await open();
    await userEvent.type(within(dialog).getByLabelText(/Valor/), '10');
    await userEvent.type(within(dialog).getByLabelText(/Motivo/), 'x');
    await submit(dialog);
    expect((await within(dialog).findByRole('alert')).textContent).toContain('403 CORE_WRITE_DISABLED');
    expect(markWriteDisabled).toHaveBeenCalled();
    expect((within(dialog).getByRole('button', { name: 'Lançar crédito' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('sem resposta: congela e repete com a mesma chave; recusa definitiva troca a chave', async () => {
    billingMock.grantBillingCredit
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(httpError(429, 'DAILY_CAP_EXCEEDED'))
      .mockResolvedValueOnce({ id: 'n', type: 'OPERATOR_GRANT', amountCents: 1000, createdAt: 'x' });
    const dialog = await open();
    await userEvent.type(within(dialog).getByLabelText(/Valor/), '10');
    await userEvent.type(within(dialog).getByLabelText(/Motivo/), 'x');
    await submit(dialog);
    await within(dialog).findByRole('button', { name: 'Tentar de novo' });
    expect((within(dialog).getByLabelText(/Valor/) as HTMLInputElement).disabled).toBe(true);

    await submit(dialog);
    expect((await within(dialog).findByRole('alert')).textContent).toContain('429 DAILY_CAP_EXCEEDED');
    await submit(dialog);
    await waitFor(() => expect(billingMock.grantBillingCredit).toHaveBeenCalledTimes(3));
    const keys = billingMock.grantBillingCredit.mock.calls.map((c) => c[1]);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[1]);
  });
});

describe('Lançar contrário', () => {
  it('prévia do restante, motivo obrigatório e envio', async () => {
    renderPage();
    await screen.findByText('Extrato imutável');
    const row = tableRow('Cortesia combinada no atendimento.');
    await userEvent.click(within(row).getByRole('button', { name: 'Lançar contrário' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('A linha original continua no extrato.');
    expect(within(dialog).getByText('Disponível depois').nextSibling?.textContent).toContain('9,40');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lançar contrário' }));
    expect(within(dialog).getByText('Escreva o motivo.')).toBeTruthy();
    await userEvent.type(within(dialog).getByLabelText(/Motivo/), 'Digitado errado');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lançar contrário' }));
    await waitFor(() => expect(billingMock.reverseBillingCredit).toHaveBeenCalledTimes(1));
    expect(billingMock.reverseBillingCredit.mock.calls[0].slice(0, 2)).toEqual(['e1', { reason: 'Digitado errado' }]);
    expect(await screen.findByText(/Lançamento contrário de/)).toBeTruthy();
  });
});
