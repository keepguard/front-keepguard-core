import React, { useEffect, useId, useRef, useState } from 'react';
import { Modal } from '../../common/Modal';
import { useAuth } from '../../../context/AuthContext';
import {
  createBillingRefund,
  previewBillingRefund,
  type BillingInvoice,
  type BillingRefund,
  type BillingRefundMethod,
  type BillingRefundPreview,
} from '../../../services/billingService';
import { brl, paidCents, parseBrlToCents, requestedRefundsCents } from '../../../utils/billingMoney';
import { Field, MoneyErrorNotice, Notice, REASON_HINT } from './BillingMoneyUi';
import { useMoneyWrite } from './useBillingFeatures';

const PREVIEW_DELAY_MS = 300;

type Loaded = { key: string; data: BillingRefundPreview };

function compact(id: string): string {
  return id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

export const RefundModal: React.FC<{
  invoice: BillingInvoice;
  refunds: BillingRefund[];
  isSelf: boolean;
  onBack: () => void;
  onDone: (refund: BillingRefund) => void;
  /** Pedido registrado sem resposta do gateway: a lista precisa mostrar a linha. */
  onRegistered: () => void;
}> = ({ invoice, refunds, isSelf, onBack, onDone, onRegistered }) => {
  const { getAccessToken } = useAuth();
  const write = useMoneyWrite();
  const baseId = useId();
  const [mode, setMode] = useState<'total' | 'partial'>('total');
  const [amountText, setAmountText] = useState('');
  const [method, setMethod] = useState<BillingRefundMethod>('GATEWAY');
  const [restore, setRestore] = useState(true);
  const [acknowledged, setAcknowledged] = useState(false);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ amount?: string; reason?: string; preview?: string; acknowledge?: string }>({});
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const requestRef = useRef(0);

  const paid = paidCents(invoice);
  const localLimit = Math.max(0, paid - requestedRefundsCents(refunds));
  // O servidor manda: a prévia pode saber de um estorno que entrou depois de abrir a tela.
  const limit = loaded ? Math.min(localLimit, loaded.data.refundableCents) : localLimit;
  const isPix = (invoice.paymentMethod ?? '').toLowerCase() === 'pix';
  const usedCredit = Math.abs((invoice.breakdown?.lines ?? [])
    .filter((line) => line.kind === 'CREDIT')
    .reduce((sum, line) => sum + line.amountCents, 0));

  const typed = parseBrlToCents(amountText);
  const amount = mode === 'total' ? limit : typed;
  const amountValid = amount !== null && amount > 0 && amount <= limit;
  const previewKey = amountValid ? `${amount}:${method}` : null;
  const preview = loaded && loaded.key === previewKey ? loaded.data : null;

  useEffect(() => {
    const access = getAccessToken();
    if (!previewKey || !access || amount === null) return undefined;
    const request = ++requestRef.current;
    setPreviewFailed(false);
    const timer = window.setTimeout(() => {
      previewBillingRefund(invoice.id, { amountCents: amount, method }, access)
        .then((data) => { if (request === requestRef.current) setLoaded({ key: previewKey, data }); })
        .catch(() => { if (request === requestRef.current) setPreviewFailed(true); });
    }, PREVIEW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [amount, getAccessToken, invoice.id, method, previewAttempt, previewKey]);

  const fundedLimit = preview?.fundedUpgradeLimitCents ?? null;
  const usedByUpgrade = fundedLimit === null
    ? 0
    : Math.max(0, paid - (invoice.refundedCents ?? 0) - fundedLimit);
  const total = amountValid && amount >= limit;
  const restoreCredit = total && usedCredit > 0 && restore;
  const afterThis = amountValid ? limit - amount : null;
  const becomesRefunded = amountValid && amount + requestedRefundsCents(refunds) >= paid;

  const when = method === 'CREDIT'
    ? `Na hora, em ${new Date().toLocaleDateString('pt-BR')}`
    : isPix
      ? 'Aguardando autorização no painel do Asaas'
      : total
        ? `Na hora, em ${new Date().toLocaleDateString('pt-BR')}`
        : 'Fica em andamento no Asaas; acompanhe na lista de estornos';

  const creditUsedText = usedCredit === 0
    ? 'Nenhum foi usado'
    : restoreCredit
      ? `${brl(preview?.creditRestoredCents ?? usedCredit)} voltam ao saldo`
      : 'Não volta';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const next: typeof errors = {};
    if (!amountValid) {
      next.amount = amount !== null && amount > limit
        ? `O valor passa do que pode ser estornado: até ${brl(limit)}.`
        : 'Informe um valor maior que zero, como 20,00.';
    }
    if (!reason.trim()) next.reason = 'Escreva o motivo do estorno.';
    if (amountValid && !preview) next.preview = 'Espere a prévia. Sem ela não dá para estornar.';
    if (preview?.requiresAcknowledge && !acknowledged) next.acknowledge = 'Marque a confirmação ou baixe o valor até o limite.';
    setErrors(next);
    const access = getAccessToken();
    if (Object.keys(next).length > 0 || !access || amount === null) return;
    const body = {
      amountCents: amount,
      method,
      reason: reason.trim(),
      restoreCredit,
      ...(preview?.requiresAcknowledge ? { acknowledgeUpgradeFunding: true } : {}),
    };
    const result = await write.run((key) => createBillingRefund(invoice.id, body, key, access));
    if (result) onDone(result);
  };

  const registered = write.error?.kind === 'registered';
  useEffect(() => { if (registered) onRegistered(); }, [onRegistered, registered]);

  const formId = `${baseId}-form`;
  const locked = write.frozen || write.busy;
  return (
    <Modal
      isOpen
      trapFocus
      onClose={() => { if (!write.busy) onBack(); }}
      title="Estornar"
      subtitle={`Fatura ${compact(invoice.id)} · pode estornar até ${brl(limit)}`}
      maxWidth="620px"
      footer={(
        <div className="modal-actions bm-footer">
          <button type="button" className="btn btn-secondary btn-pill" onClick={onBack} disabled={write.busy}>Voltar</button>
          <button
            type="submit"
            form={formId}
            className="btn btn-danger btn-pill bm-btn"
            disabled={isSelf || write.busy || write.blocked}
          >
            {write.busy ? 'Enviando…' : write.canRetrySame ? 'Tentar de novo' : 'Estornar'}
          </button>
        </div>
      )}
    >
      <form id={formId} noValidate onSubmit={handleSubmit} className="bm-scope">
        {isSelf ? (
          <Notice tone="bad" title="Esta fatura é sua." code="403 SELF_ACTION_FORBIDDEN">
            Nenhum operador estorna a própria fatura. Peça a outra pessoa da operação.
          </Notice>
        ) : null}
        {write.error ? <MoneyErrorNotice error={write.error} /> : null}

        <fieldset className="bm-choices" disabled={locked}>
          <legend>Quanto estornar</legend>
          <label><input type="radio" name={`${baseId}-mode`} checked={mode === 'total'} onChange={() => setMode('total')} /> Total: {brl(limit)}</label>
          <label><input type="radio" name={`${baseId}-mode`} checked={mode === 'partial'} onChange={() => setMode('partial')} /> Parcial</label>
        </fieldset>

        {mode === 'partial' ? (
          <Field id={`${baseId}-amount`} label="Valor do estorno" required error={errors.amount}>
            {(describedBy) => (
              <input
                id={`${baseId}-amount`}
                className="form-input"
                inputMode="decimal"
                autoComplete="off"
                value={amountText}
                disabled={locked}
                aria-required="true"
                aria-invalid={Boolean(errors.amount)}
                aria-describedby={describedBy}
                onChange={(e) => setAmountText(e.target.value)}
              />
            )}
          </Field>
        ) : null}

        <fieldset className="bm-choices" disabled={locked}>
          <legend>Como devolver</legend>
          <label><input type="radio" name={`${baseId}-method`} checked={method === 'GATEWAY'} onChange={() => setMethod('GATEWAY')} /> Pelo meio de pagamento ({isPix ? 'PIX' : 'cartão'})</label>
          <label><input type="radio" name={`${baseId}-method`} checked={method === 'CREDIT'} onChange={() => setMethod('CREDIT')} /> Como crédito no saldo</label>
        </fieldset>

        {mode === 'total' && usedCredit > 0 ? (
          <label className="bm-check">
            <input type="checkbox" checked={restore} disabled={locked} onChange={(e) => setRestore(e.target.checked)} />
            Devolver ao saldo o crédito usado nesta fatura ({brl(usedCredit)})
          </label>
        ) : null}

        {fundedLimit !== null ? (
          <Notice tone="warn" title="Esta fatura pagou um upgrade">
            {brl(usedByUpgrade)} já foram usados no plano novo. Sem confirmar, o estorno vai até {brl(fundedLimit)}.
            <label className="bm-check bm-check-inline">
              <input
                type="checkbox"
                checked={acknowledged}
                disabled={locked}
                aria-invalid={Boolean(errors.acknowledge)}
                onChange={(e) => setAcknowledged(e.target.checked)}
              />
              Confirmo estornar acima desse limite (exige motivo e dispara alerta)
            </label>
            {errors.acknowledge ? <span className="bm-field-error">{errors.acknowledge}</span> : null}
          </Notice>
        ) : null}

        <Field id={`${baseId}-reason`} label="Motivo" required hint={REASON_HINT} error={errors.reason}>
          {(describedBy) => (
            <textarea
              id={`${baseId}-reason`}
              className="form-input bm-textarea"
              value={reason}
              disabled={locked}
              aria-required="true"
              aria-invalid={Boolean(errors.reason)}
              aria-describedby={describedBy}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </Field>

        <div className="bm-preview" aria-live="polite">
          <h4>Prévia</h4>
          {previewFailed && amountValid ? (
            <Notice
              tone="bad"
              title="Não foi possível calcular a prévia."
              action={<button type="button" className="btn btn-secondary btn-pill bm-btn-sm" onClick={() => setPreviewAttempt((n) => n + 1)}>Calcular de novo</button>}
            >
              Sem ela não dá para estornar. Nada foi gravado.
            </Notice>
          ) : (
            <>
              {!preview && amountValid ? <p role="status" className="bm-preview-note">Calculando…</p> : null}
              <dl>
                <dt>Volta para a pessoa</dt>
                <dd>{preview && amountValid ? brl(amount) : '—'}</dd>
                <dt>Sobra na fatura</dt>
                <dd>{preview && afterThis !== null ? brl(afterThis) : '—'}</dd>
              </dl>
              <dl className="is-long">
                <dt>Quando</dt>
                <dd>{when}</dd>
                <dt>Crédito usado</dt>
                <dd>{creditUsedText}</dd>
                <dt>Crédito retirado</dt>
                <dd>
                  {preview ? brl(preview.clawbackCents) : '—'}
                  {preview ? (preview.derivedLots?.length ? ' (crédito que nasceu desta fatura)' : ' (esta fatura não gerou crédito)') : ''}
                </dd>
                {preview?.usedNotRecoverableCents ? (
                  <>
                    <dt>Já usado, não volta</dt>
                    <dd>{brl(preview.usedNotRecoverableCents)}</dd>
                  </>
                ) : null}
                <dt>Fatura fica</dt>
                <dd>{becomesRefunded ? 'Estornada' : 'Paga, com estorno'}</dd>
                <dt>Plano</dt>
                <dd>Sem mudança. Cancelar é outra ação.</dd>
              </dl>
              {errors.preview ? <span className="bm-field-error">{errors.preview}</span> : null}
            </>
          )}
        </div>
      </form>
    </Modal>
  );
};
