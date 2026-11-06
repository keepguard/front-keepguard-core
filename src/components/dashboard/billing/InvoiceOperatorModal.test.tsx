import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { authMock, billingMock } from './billingMoneyMocks';
import { httpError, OPERATOR, paidCard, paidPix } from './testSupport';
import { InvoiceOperatorModal } from './InvoiceOperatorModal';
import { BillingFeaturesContext, type BillingFeatures } from './useBillingFeatures';
import type { BillingInvoice } from '../../../services/billingService';

vi.mock('../../../services/billingService', () => billingMock);
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => authMock }));
vi.mock('../PixQr', () => ({ PixQr: () => null }));

const PREVIEW = { refundableCents: 5790, clawbackCents: 0, derivedLots: [], usedNotRecoverableCents: 0, creditRestoredCents: 1000, fundedUpgradeLimitCents: null, requiresAcknowledge: false };

let markWriteDisabled = vi.fn();

function renderModal(invoice: BillingInvoice, over: Partial<BillingFeatures> = {}) {
  billingMock.getBillingInvoice.mockResolvedValue(invoice);
  const features: BillingFeatures = {
    loading: false, settings: null, creditOn: true, financialOn: true, writeOpen: true, markWriteDisabled, ...over,
  };
  return render(
    <BillingFeaturesContext.Provider value={features}>
      <InvoiceOperatorModal invoice={invoice} onClose={() => {}} />
    </BillingFeaturesContext.Provider>,
  );
}

const estornarDetail = () => screen.findByRole('button', { name: 'Estornar' }) as Promise<HTMLButtonElement>;

async function openForm(invoice: BillingInvoice = paidCard) {
  renderModal(invoice);
  const button = await estornarDetail();
  await waitFor(() => expect(button.disabled).toBe(false));
  await userEvent.click(button);
  await screen.findByRole('heading', { name: 'Estornar' });
  return screen.getByRole('dialog');
}

const previewReady = (dialog: HTMLElement) =>
  waitFor(() => expect(within(dialog).getByText('Volta para a pessoa').nextSibling?.textContent).not.toBe('—'), { timeout: 2000 });

beforeEach(() => {
  markWriteDisabled = vi.fn();
  billingMock.listBillingInvoiceRefunds.mockResolvedValue([]);
  billingMock.previewBillingRefund.mockResolvedValue(PREVIEW);
  billingMock.createBillingRefund.mockResolvedValue({ id: 'r1', amountCents: 5790, method: 'GATEWAY', status: 'DONE' });
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('detalhe da fatura', () => {
  it('conta linha a linha', async () => {
    renderModal(paidCard);
    const conta = await screen.findByRole('table', { name: 'Conta da fatura' });
    expect(within(conta).getByText('Preço do plano')).toBeTruthy();
    expect(within(conta).getByText('Cupom VOLTA30').nextSibling?.textContent).toContain('29,10');
    expect(within(conta).getByText('Crédito')).toBeTruthy();
    expect(within(conta).getByText('Cobrado').nextSibling?.textContent).toContain('57,90');
    expect(screen.getByText('Visa final 1234')).toBeTruthy();
  });

  it('escrita desligada: fatura aberta, aviso e Estornar travado', async () => {
    renderModal(paidCard, { writeOpen: false });
    expect(await screen.findByText('Escrita desligada nesta fase')).toBeTruthy();
    const button = await estornarDetail();
    expect(button.disabled).toBe(true);
    expect(screen.getByRole('table', { name: 'Conta da fatura' })).toBeTruthy();
  });

  it('fatura antiga: sem conta, com o texto certo', async () => {
    renderModal({ ...paidCard, breakdown: null, paidAmountCents: null });
    expect(await screen.findByText(/de antes da conta linha a linha/)).toBeTruthy();
    expect((await estornarDetail())).toBeTruthy();
  });

  it('erro ao abrir, com tentar de novo', async () => {
    billingMock.getBillingInvoice.mockRejectedValueOnce(httpError(502));
    const features = { loading: false, settings: null, creditOn: true, financialOn: true, writeOpen: true, markWriteDisabled };
    render(
      <BillingFeaturesContext.Provider value={features}>
        <InvoiceOperatorModal invoice={paidCard} onClose={() => {}} />
      </BillingFeaturesContext.Provider>,
    );
    expect((await screen.findByRole('alert')).textContent).toContain('Não foi possível abrir a fatura.');
    billingMock.getBillingInvoice.mockResolvedValue(paidCard);
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('table', { name: 'Conta da fatura' })).toBeTruthy();
  });

  it('contestação aberta trava o estorno', async () => {
    renderModal({ ...paidCard, disputeStatus: 'OPEN', disputeOpenedAt: '2026-11-03T12:00:00Z' });
    expect(await screen.findByText(/Contestação aberta no cartão desde 03\/11\/2026/)).toBeTruthy();
    expect(await screen.findByText('Travado: há contestação aberta.')).toBeTruthy();
    expect((await estornarDetail()).disabled).toBe(true);
  });

  it('PIX aguardando autorização', async () => {
    billingMock.listBillingInvoiceRefunds.mockResolvedValue([
      { id: 'r', amountCents: 9700, method: 'GATEWAY', status: 'AWAITING_AUTHORIZATION', reason: 'Duplicidade', requestedBy: OPERATOR, createdAt: '2026-11-05T12:00:00Z' },
    ]);
    renderModal(paidPix);
    expect(await screen.findByText('Estorno de PIX aguardando autorização.')).toBeTruthy();
    expect(screen.getByText('Aguardando autorização')).toBeTruthy();
    expect(screen.getByText(/Sem valor para estornar/)).toBeTruthy();
    expect((await estornarDetail()).disabled).toBe(true);
  });

  it('recusado não consome o limite', async () => {
    billingMock.listBillingInvoiceRefunds.mockResolvedValue([
      { id: 'r', amountCents: 2000, method: 'GATEWAY', status: 'REJECTED', reason: 'x', createdAt: '2026-11-05T12:00:00Z' },
    ]);
    renderModal(paidCard);
    expect(await screen.findByText('Recusado')).toBeTruthy();
    expect((await estornarDetail()).disabled).toBe(false);
  });

  it('sem ler os estornos, não libera estornar', async () => {
    billingMock.listBillingInvoiceRefunds.mockRejectedValue(httpError(404));
    renderModal(paidCard);
    expect(await screen.findByText('Não foi possível ler os estornos.')).toBeTruthy();
    expect((await estornarDetail()).disabled).toBe(true);
  });

  it('fatura não paga não estorna', async () => {
    renderModal({ ...paidCard, status: 'pending', paidAt: null, paidAmountCents: null });
    expect(await screen.findByText('Só fatura paga pode ser estornada.')).toBeTruthy();
  });
});

describe('Estornar', () => {
  it('total: usa a prévia do servidor e devolve crédito por padrão', async () => {
    const dialog = await openForm();
    await previewReady(dialog);
    expect(billingMock.previewBillingRefund).toHaveBeenCalledWith(paidCard.id, { amountCents: 5790, method: 'GATEWAY' }, 'token-de-teste');
    expect(within(dialog).getByText('Crédito usado').nextSibling?.textContent).toContain('voltam ao saldo');
    expect(within(dialog).getByText('Fatura fica').nextSibling?.textContent).toBe('Estornada');
    expect(within(dialog).getByText('Plano').nextSibling?.textContent).toContain('Sem mudança');
    await userEvent.type(within(dialog).getByLabelText(/Motivo/), 'Duplicidade');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Estornar' }));
    await waitFor(() => expect(billingMock.createBillingRefund).toHaveBeenCalledTimes(1));
    const [id, body, key] = billingMock.createBillingRefund.mock.calls[0];
    expect(id).toBe(paidCard.id);
    expect(body).toEqual({ amountCents: 5790, method: 'GATEWAY', reason: 'Duplicidade', restoreCredit: true });
    expect(key).toMatch(/[0-9a-f-]{36}/);
    expect(await screen.findByText(/concluído\./)).toBeTruthy();
  });

  it('parcial: valor digitado, sem devolver crédito', async () => {
    const dialog = await openForm();
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Parcial' }));
    expect(within(dialog).queryByRole('checkbox')).toBeNull();
    await userEvent.type(within(dialog).getByLabelText(/Valor do estorno/), '20,00');
    await previewReady(dialog);
    await waitFor(() => expect(billingMock.previewBillingRefund).toHaveBeenLastCalledWith(paidCard.id, { amountCents: 2000, method: 'GATEWAY' }, 'token-de-teste'));
    expect(within(dialog).getByText('Sobra na fatura').nextSibling?.textContent).toContain('37,90');
    expect(within(dialog).getByText('Fatura fica').nextSibling?.textContent).toBe('Paga, com estorno');
    expect(within(dialog).getByText('Quando').nextSibling?.textContent).toContain('em andamento');
    await userEvent.type(within(dialog).getByLabelText(/Motivo/), 'Acerto');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Estornar' }));
    await waitFor(() => expect(billingMock.createBillingRefund).toHaveBeenCalledTimes(1));
    expect(billingMock.createBillingRefund.mock.calls[0][1]).toEqual({ amountCents: 2000, method: 'GATEWAY', reason: 'Acerto', restoreCredit: false });
  });

  it('parcial acima do limite não vai ao servidor', async () => {
    const dialog = await openForm();
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Parcial' }));
    billingMock.previewBillingRefund.mockClear();
    await userEvent.type(within(dialog).getByLabelText(/Valor do estorno/), '57,91');
    await userEvent.type(within(dialog).getByLabelText(/Motivo/), 'x');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Estornar' }));
    expect(within(dialog).getByText(/O valor passa do que pode ser estornado/)).toBeTruthy();
    expect(billingMock.createBillingRefund).not.toHaveBeenCalled();
    expect(billingMock.previewBillingRefund).not.toHaveBeenCalled();
  });

  it('sem prévia não estorna', async () => {
    billingMock.previewBillingRefund.mockRejectedValue(httpError(404));
    const dialog = await openForm();
    expect(await within(dialog).findByText('Não foi possível calcular a prévia.', {}, { timeout: 2000 })).toBeTruthy();
    await userEvent.type(within(dialog).getByLabelText(/Motivo/), 'x');
    fireEvent.submit(dialog.querySelector('form') as HTMLFormElement);
    await act(async () => {});
    expect(billingMock.createBillingRefund).not.toHaveBeenCalled();
  });

  it('PIX: a prévia diz que aguarda autorização, e a resposta também', async () => {
    billingMock.createBillingRefund.mockResolvedValue({ id: 'r1', amountCents: 9700, method: 'GATEWAY', status: 'AWAITING_AUTHORIZATION' });
    billingMock.previewBillingRefund.mockResolvedValue({ ...PREVIEW, refundableCents: 9700 });
    const dialog = await openForm(paidPix);
    await previewReady(dialog);
    expect(within(dialog).getByText('Quando').nextSibling?.textContent).toContain('Aguardando autorização no painel do Asaas');
    await userEvent.type(within(dialog).getByLabelText(/Motivo/), 'Duplicidade');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Estornar' }));
    expect(await screen.findByText(/aguardando autorização no painel do Asaas\./)).toBeTruthy();
  });

  it('crédito no saldo vale na hora', async () => {
    const dialog = await openForm();
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Como crédito no saldo' }));
    await previewReady(dialog);
    await waitFor(() => expect(billingMock.previewBillingRefund).toHaveBeenLastCalledWith(paidCard.id, { amountCents: 5790, method: 'CREDIT' }, 'token-de-teste'));
    expect(within(dialog).getByText('Quando').nextSibling?.textContent).toContain('Na hora');
  });

  it('REFUND_REJECTED_BY_GATEWAY: mostra o texto, nada muda e a nova tentativa usa chave nova', async () => {
    billingMock.createBillingRefund.mockRejectedValueOnce(
      httpError(422, 'REFUND_REJECTED_BY_GATEWAY', 'Esta transação só pode ser estornada parcialmente no próximo dia.'),
    );
    const dialog = await openForm();
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Parcial' }));
    await userEvent.type(within(dialog).getByLabelText(/Valor do estorno/), '20,00');
    await previewReady(dialog);
    await waitFor(() => expect(billingMock.previewBillingRefund).toHaveBeenLastCalledWith(paidCard.id, { amountCents: 2000, method: 'GATEWAY' }, 'token-de-teste'));
    await userEvent.type(within(dialog).getByLabelText(/Motivo/), 'Acerto');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Estornar' }));
    const alert = await within(dialog).findByRole('alert');
    expect(alert.textContent).toContain('estornada parcialmente no próximo dia');
    expect(alert.textContent).toContain('Nada mudou no saldo nem na fatura');
    expect(alert.textContent).toContain('422 REFUND_REJECTED_BY_GATEWAY');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Estornar' }));
    await waitFor(() => expect(billingMock.createBillingRefund).toHaveBeenCalledTimes(2));
    const [first, second] = billingMock.createBillingRefund.mock.calls;
    expect(second[2]).not.toBe(first[2]);
  });

  it('502 do Asaas: pedido registrado, não deixa pedir de novo e atualiza a lista', async () => {
    billingMock.createBillingRefund.mockRejectedValue(httpError(502, 'GATEWAY_UNAVAILABLE'));
    const dialog = await openForm();
    await previewReady(dialog);
    await userEvent.type(within(dialog).getByLabelText(/Motivo/), 'x');
    billingMock.listBillingInvoiceRefunds.mockClear();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Estornar' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Não precisa pedir de novo agora');
    expect((screen.getByRole('button', { name: 'Estornar' }) as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() => expect(billingMock.listBillingInvoiceRefunds).toHaveBeenCalled());
  });

  it('403 CORE_WRITE_DISABLED: trava a escrita', async () => {
    billingMock.createBillingRefund.mockRejectedValue(httpError(403, 'CORE_WRITE_DISABLED'));
    const dialog = await openForm();
    await previewReady(dialog);
    await userEvent.type(within(dialog).getByLabelText(/Motivo/), 'x');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Estornar' }));
    expect((await within(dialog).findByRole('alert')).textContent).toContain('403 CORE_WRITE_DISABLED');
    expect(markWriteDisabled).toHaveBeenCalled();
    expect((within(dialog).getByRole('button', { name: 'Estornar' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('teto do dia', async () => {
    billingMock.createBillingRefund.mockRejectedValue(httpError(429, 'DAILY_CAP_EXCEEDED'));
    const dialog = await openForm();
    await previewReady(dialog);
    await userEvent.type(within(dialog).getByLabelText(/Motivo/), 'x');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Estornar' }));
    expect((await within(dialog).findByRole('alert')).textContent).toContain('O teto de hoje foi atingido.');
  });

  it('própria fatura: abre com aviso e não envia', async () => {
    const dialog = await openForm({ ...paidCard, payerUserId: OPERATOR });
    expect(within(dialog).getByText('Esta fatura é sua.')).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: 'Estornar' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('fatura que pagou upgrade: exige confirmar para passar do limite', async () => {
    billingMock.previewBillingRefund.mockResolvedValue({
      ...PREVIEW, refundableCents: 97000, clawbackCents: 50526, derivedLots: [{ entryId: 'l', type: 'UPGRADE_SURPLUS', remainingCents: 50526 }],
      fundedUpgradeLimitCents: 67800, requiresAcknowledge: true, creditRestoredCents: 0,
    });
    const invoice = { ...paidCard, amountCents: 97000, paidAmountCents: 97000, breakdown: { baseCents: 97000, lines: [], chargedCents: 97000 } };
    const dialog = await openForm(invoice);
    await previewReady(dialog);
    expect(within(dialog).getByText('Esta fatura pagou um upgrade')).toBeTruthy();
    expect(dialog.textContent).toContain('292,00');
    expect(dialog.textContent).toContain('678,00');
    expect(within(dialog).getByText('Crédito retirado').nextSibling?.textContent).toContain('505,26');
    await userEvent.type(within(dialog).getByLabelText(/Motivo/), 'Pedido');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Estornar' }));
    expect(within(dialog).getByText(/Marque a confirmação/)).toBeTruthy();
    expect(billingMock.createBillingRefund).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Confirmo estornar/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Estornar' }));
    await waitFor(() => expect(billingMock.createBillingRefund).toHaveBeenCalledTimes(1));
    expect(billingMock.createBillingRefund.mock.calls[0][1].acknowledgeUpgradeFunding).toBe(true);
  });

  it('limite de upgrade zerado pelo billing não vira aviso em fatura comum', async () => {
    billingMock.previewBillingRefund.mockResolvedValue({ ...PREVIEW, fundedUpgradeLimitCents: 0, requiresAcknowledge: false });
    const dialog = await openForm();
    await previewReady(dialog);
    expect(within(dialog).queryByText('Esta fatura pagou um upgrade')).toBeNull();
  });

  it('prévia atrasada de outro valor não vale para o valor atual', async () => {
    const dialog = await openForm();
    await previewReady(dialog);
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Parcial' }));
    billingMock.previewBillingRefund.mockReturnValue(new Promise(() => {}));
    await userEvent.type(within(dialog).getByLabelText(/Valor do estorno/), '20,00');
    await userEvent.type(within(dialog).getByLabelText(/Motivo/), 'x');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Estornar' }));
    expect(within(dialog).getByText(/Espere a prévia/)).toBeTruthy();
    expect(billingMock.createBillingRefund).not.toHaveBeenCalled();
  });
});
