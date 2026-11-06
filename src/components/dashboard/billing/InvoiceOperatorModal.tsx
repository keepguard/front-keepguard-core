import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from '../../common/Modal';
import { InvoiceDetailModal } from '../InvoiceDetailModal';
import { useAuth } from '../../../context/AuthContext';
import {
  getBillingInvoice,
  listBillingInvoiceRefunds,
  type BillingInvoice,
  type BillingRefund,
  type BillingRefundStatus,
} from '../../../services/billingService';
import {
  actorLabel,
  brl,
  doneRefundsCents,
  paidCents,
  requestedRefundsCents,
  shortDate,
  signedBrl,
} from '../../../utils/billingMoney';
import { FlashNotice, Notice, Pill, WriteDisabledNotice, type Tone } from './BillingMoneyUi';
import { RefundModal } from './RefundModal';
import { useBillingFeatures } from './useBillingFeatures';

const REFUND_STATUS: Record<BillingRefundStatus, { tone: Tone; label: string }> = {
  REQUESTED: { tone: 'neutral', label: 'Pedido registrado' },
  AWAITING_AUTHORIZATION: { tone: 'warn', label: 'Aguardando autorização' },
  PROCESSING: { tone: 'info', label: 'Em andamento' },
  DONE: { tone: 'ok', label: 'Concluído' },
  REJECTED: { tone: 'bad', label: 'Recusado' },
};

function refundFlash(refund: BillingRefund): string {
  const value = brl(refund.amountCents);
  switch (refund.status) {
    case 'AWAITING_AUTHORIZATION': return `Estorno de ${value} registrado, aguardando autorização no painel do Asaas.`;
    case 'DONE': return `Estorno de ${value} concluído.`;
    default: return `Estorno de ${value} registrado. Acompanhe na lista de estornos.`;
  }
}

const SimpleFooter: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="modal-actions bm-footer">
    <button type="button" className="btn btn-secondary btn-pill" onClick={onClose}>Fechar</button>
  </div>
);

/**
 * Detalhe da fatura para o operador, em company ligada: conta linha a linha, estornos e Estornar (§6.10, §6.12).
 * Sobre o modal de hoje, que segue igual para quem não passa por aqui.
 */
export const InvoiceOperatorModal: React.FC<{
  invoice: BillingInvoice | null;
  onClose: () => void;
  onChanged?: () => void;
}> = ({ invoice: row, onClose, onChanged }) => {
  const { getAccessToken, user } = useAuth();
  const { writeOpen } = useBillingFeatures();
  const [invoice, setInvoice] = useState<BillingInvoice | null>(null);
  const [refunds, setRefunds] = useState<BillingRefund[]>([]);
  const [refundsFailed, setRefundsFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const requestRef = useRef(0);
  const invoiceId = row?.id ?? null;

  const load = useCallback(async (id: string) => {
    const access = getAccessToken();
    if (!access) return;
    const request = ++requestRef.current;
    setLoading(true);
    setFailed(false);
    const [invoiceResult, refundsResult] = await Promise.allSettled([
      getBillingInvoice(id, access),
      listBillingInvoiceRefunds(id, access),
    ]);
    if (request !== requestRef.current) return;
    if (invoiceResult.status === 'fulfilled') setInvoice(invoiceResult.value);
    else setFailed(true);
    if (refundsResult.status === 'fulfilled') {
      setRefunds(refundsResult.value);
      setRefundsFailed(false);
    } else {
      setRefunds([]);
      setRefundsFailed(true);
    }
    setLoading(false);
  }, [getAccessToken]);

  useEffect(() => {
    setInvoice(null);
    setRefunds([]);
    setRefunding(false);
    setFlash(null);
    if (invoiceId) void load(invoiceId);
    else requestRef.current += 1;
  }, [invoiceId, load]);

  const reloadAfterChange = useCallback(() => {
    if (invoiceId) void load(invoiceId);
    onChanged?.();
  }, [invoiceId, load, onChanged]);

  if (!row) return null;

  if (failed) {
    return (
      <Modal isOpen trapFocus onClose={onClose} title="Detalhes da transação" subtitle="Fatura" maxWidth="620px" footer={<SimpleFooter onClose={onClose} />}>
        <div className="bm-scope">
          <Notice
            tone="bad"
            title="Não foi possível abrir a fatura."
            action={<button type="button" className="btn btn-secondary btn-pill bm-btn-sm" onClick={() => void load(row.id)}>Tentar de novo</button>}
          >
            Nada foi alterado. Tente de novo em alguns segundos.
          </Notice>
        </div>
      </Modal>
    );
  }

  if (!invoice || invoice.id !== row.id) {
    return (
      <Modal isOpen trapFocus onClose={onClose} title="Detalhes da transação" subtitle="Carregando…" maxWidth="620px" footer={<SimpleFooter onClose={onClose} />}>
        <div className="bm-scope">
          <p role="status" className="table-cell-muted">Carregando a fatura…</p>
          <div className="bm-block" aria-hidden="true">
            {[0, 1, 2].map((i) => <span className="bm-skeleton" key={i} />)}
          </div>
        </div>
      </Modal>
    );
  }

  // A busca da lista enriquece nome e e-mail; a leitura por id pode não trazer.
  const view: BillingInvoice = {
    ...invoice,
    payerName: invoice.payerName ?? row.payerName,
    payerEmail: invoice.payerEmail ?? row.payerEmail,
  };
  const isSelf = Boolean(user?.codeUser) && user?.codeUser === view.payerUserId;

  if (refunding) {
    return (
      <RefundModal
        invoice={view}
        refunds={refunds}
        isSelf={isSelf}
        onBack={() => setRefunding(false)}
        onStateChanged={reloadAfterChange}
        onDone={(refund) => {
          setRefunding(false);
          setFlash(refundFlash(refund));
          void load(view.id);
          onChanged?.();
        }}
      />
    );
  }

  const paid = paidCents(view);
  const requested = requestedRefundsCents(refunds);
  const done = doneRefundsCents(refunds);
  const remaining = paid - requested;
  const disputeOpen = view.disputeStatus === 'OPEN';
  const isPaidStatus = (view.status ?? '').toLowerCase() === 'paid';
  const awaitingPix = refunds.some((r) => r.status === 'AWAITING_AUTHORIZATION');
  const refundedAll = (view.status ?? '').toLowerCase() === 'refunded';
  const credited = (view.breakdown?.lines ?? []).filter((l) => l.kind === 'CREDIT').reduce((sum, l) => sum + Math.abs(l.amountCents), 0);

  let lockReason = '';
  if (loading) lockReason = '';
  else if (disputeOpen) lockReason = 'Travado: há contestação aberta.';
  else if (refundsFailed) lockReason = 'Travado: não deu para ler os estornos.';
  else if (refundedAll) lockReason = requested > 0 ? `Sem valor para estornar: ${brl(requested)} já pedidos.` : 'Fatura já estornada.';
  else if (!isPaidStatus) lockReason = 'Só fatura paga pode ser estornada.';
  else if (remaining <= 0) lockReason = `Sem valor para estornar: ${brl(requested)} já pedidos.`;

  return (
    <InvoiceDetailModal
      isOpen
      onClose={onClose}
      invoice={view}
      operator={{
        badges: (
          <>
            {disputeOpen ? <Pill tone="bad">Contestação aberta</Pill> : null}
            {view.disputeStatus === 'WON' ? <Pill tone="neutral">Contestação ganha</Pill> : null}
            {view.disputeStatus === 'LOST' ? <Pill tone="neutral">Contestação perdida</Pill> : null}
          </>
        ),
        sections: (
          <div className="bm-scope bm-invoice-sections">
            {flash ? <FlashNotice>{flash}</FlashNotice> : null}
            {disputeOpen ? (
              <Notice tone="bad" title={`Contestação aberta no cartão desde ${shortDate(view.disputeOpenedAt)}.`}>
                A fatura segue paga na conta e o valor fica à parte no resumo. A pessoa está restrita, a recorrência foi desligada e o crédito ligado a esta fatura está retido. Estornar fica travado até a contestação fechar.
              </Notice>
            ) : null}
            {awaitingPix ? (
              <Notice tone="warn" title="Estorno de PIX aguardando autorização.">
                Só conclui depois de autorizado no painel do Asaas, por quem administra a conta. Não chega aviso quando isso acontece: a conferência roda a cada 15 minutos.
              </Notice>
            ) : null}
            {!writeOpen ? <WriteDisabledNotice /> : null}

            <section className="bm-section" aria-labelledby="bm-conta">
              <h4 id="bm-conta">Conta</h4>
              {view.breakdown ? (
                <table className="bm-bill">
                  <caption className="bm-sr-only">Conta da fatura</caption>
                  <tbody>
                    <tr><th scope="row">Preço do plano</th><td>{brl(view.breakdown.baseCents)}</td></tr>
                    {view.breakdown.lines.map((line) => (
                      <tr key={`${line.kind}-${line.description}`}>
                        <th scope="row">{line.description || line.kind}</th>
                        <td>{signedBrl(line.amountCents)}</td>
                      </tr>
                    ))}
                    <tr className="is-total"><th scope="row">Cobrado</th><td>{brl(view.breakdown.chargedCents)}</td></tr>
                  </tbody>
                </table>
              ) : (
                <p className="table-cell-muted">
                  Esta fatura é de antes da conta linha a linha. Só existe o valor total. O estorno vale até esse total, sem mexer em crédito.
                </p>
              )}
              <div className="bm-facts">
                <div><span>Pago</span><strong>{brl(paid)}</strong></div>
                <div><span>Estornado</span><strong>{brl(done)}</strong></div>
                {view.cardLast4 ? <div><span>Cartão</span><strong>{view.cardBrand ?? 'Cartão'} final {view.cardLast4}</strong></div> : null}
              </div>
            </section>

            <section className="bm-section" aria-labelledby="bm-estornos">
              <h4 id="bm-estornos">Estornos</h4>
              {refundsFailed ? (
                <Notice
                  tone="bad"
                  title="Não foi possível ler os estornos."
                  action={<button type="button" className="btn btn-secondary btn-pill bm-btn-sm" onClick={() => void load(view.id)}>Tentar de novo</button>}
                />
              ) : refunds.length === 0 ? (
                <p className="table-cell-muted">{loading ? 'Carregando…' : 'Nenhum estorno nesta fatura.'}</p>
              ) : (
                <ul className="bm-refunds">
                  {refunds.map((refund) => {
                    const status = REFUND_STATUS[refund.status] ?? { tone: 'neutral' as Tone, label: refund.status };
                    return (
                      <li key={refund.id}>
                        <span>
                          <span className="bm-strong">{brl(refund.amountCents)}</span>{' '}
                          {refund.method === 'CREDIT' ? 'em crédito' : 'pelo meio de pagamento'}
                          <br />
                          <span className="table-cell-muted">
                            {[
                              refund.reason,
                              refund.origin === 'GATEWAY_PANEL' ? 'Painel do Asaas' : actorLabel(refund.requestedBy),
                              shortDate(refund.createdAt),
                            ].filter(Boolean).join(' · ')}
                          </span>
                          {refund.restoreCredit && refund.status === 'DONE' && credited > 0 ? (
                            <>
                              <br />
                              <span className="table-cell-muted">Devolveu {brl(credited)} de crédito ao saldo.</span>
                            </>
                          ) : null}
                        </span>
                        <Pill tone={status.tone}>{status.label}</Pill>
                      </li>
                    );
                  })}
                </ul>
              )}
              {refundedAll ? <p className="table-cell-muted bm-after-list">O plano não muda com o estorno. Cancelar é outra ação.</p> : null}
            </section>
          </div>
        ),
        footer: (
          <div className="modal-actions bm-footer">
            {lockReason ? <span className="table-cell-muted bm-footer-note">{lockReason}</span> : null}
            <button type="button" className="btn btn-secondary btn-pill" onClick={onClose}>Fechar</button>
            <button
              type="button"
              className="btn btn-danger btn-pill bm-btn"
              disabled={loading || Boolean(lockReason) || !writeOpen}
              onClick={() => { setFlash(null); setRefunding(true); }}
            >
              Estornar
            </button>
          </div>
        ),
      }}
    />
  );
};
