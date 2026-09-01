import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from '../common/Modal';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { PATHS } from '../../navigation/routes';
import {
  propagateCollectorDataSource,
  type CollectorDataSource,
  type PropagateAgentPreview,
  type PropagateDataSourceResult,
  type PropagateFieldGroup,
} from '../../services/agentService';
import { PROPAGATE_FIELD_GROUPS } from '../../utils/collectorTemplate';

type ModalPhase = 'review' | 'propagating' | 'success';

type Props = {
  isOpen: boolean;
  source: CollectorDataSource | null;
  changedGroups?: PropagateFieldGroup[];
  lockUnchanged?: boolean;
  onClose: () => void;
  onDone?: (result: PropagateDataSourceResult) => void;
};

export const PropagateDataSourceModal: React.FC<Props> = ({
  isOpen,
  source,
  changedGroups,
  lockUnchanged = false,
  onClose,
  onDone,
}) => {
  const { getAccessToken } = useAuth();
  const { addToast } = useToast();
  const [fields, setFields] = useState<PropagateFieldGroup[]>([]);
  const [phase, setPhase] = useState<ModalPhase>('review');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [preview, setPreview] = useState<PropagateDataSourceResult | null>(null);
  const [result, setResult] = useState<PropagateDataSourceResult | null>(null);

  const changedSet = useMemo(() => new Set(changedGroups || []), [changedGroups]);
  const hasChangedHint = lockUnchanged && changedSet.size > 0;

  useEffect(() => {
    if (!isOpen) {
      setPhase('review');
      setPreview(null);
      setResult(null);
      setPreviewError('');
      setFields([]);
      return;
    }
    setPhase('review');
    setPreview(null);
    setResult(null);
    setPreviewError('');
    setFields(changedGroups && changedGroups.length ? [...changedGroups] : []);
  }, [isOpen, source?.id, changedGroups]);

  useEffect(() => {
    if (!isOpen || !source) return;
    const token = getAccessToken();
    if (!token) return;
    if (fields.length === 0) {
      setPreview(null);
      setPreviewError('');
      setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError('');
    const timer = window.setTimeout(() => {
      void propagateCollectorDataSource(source.id, { fields, dryRun: true, limit: 5 }, token)
        .then((next) => {
          if (cancelled) return;
          setPreview(next);
        })
        .catch((err: { message?: string }) => {
          if (cancelled) return;
          setPreview(null);
          setPreviewError(err?.message || 'Não foi possível gerar o preview.');
        })
        .finally(() => {
          if (!cancelled) setPreviewLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [fields, getAccessToken, isOpen, source]);

  const toggleField = (id: PropagateFieldGroup) => {
    if (phase !== 'review') return;
    if (hasChangedHint && !changedSet.has(id)) return;
    setFields((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const handleClose = () => {
    if (phase === 'propagating') return;
    onClose();
  };

  const handlePropagate = async () => {
    if (!source || fields.length === 0 || phase !== 'review') return;
    const token = getAccessToken();
    if (!token) return;
    setPhase('propagating');
    try {
      const next = await propagateCollectorDataSource(source.id, { fields, dryRun: false }, token);
      setResult(next);
      setPhase('success');
      addToast({
        type: next.updated > 0 ? 'success' : 'warning',
        title: next.updated > 0 ? 'Config de coleta aplicada' : 'Nada para atualizar',
        description: next.updated > 0
          ? `Aplicada em ${next.updated} agent(s).`
          : 'Nenhum agent precisava de alteração.',
      });
      onDone?.(next);
    } catch (err: any) {
      setPhase('review');
      addToast({
        type: 'error',
        title: 'Não foi possível propagar',
        description: err?.message || 'Tente novamente.',
      });
    }
  };

  const linked = preview?.totalLinked ?? 0;
  const wouldUpdate = preview?.updated ?? 0;
  const previews = preview?.previews || [];
  const busy = phase === 'propagating';
  const confirmDisabled = busy || fields.length === 0 || previewLoading || wouldUpdate === 0 || Boolean(previewError);

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Propagar alterações de coleta"
      subtitle={source?.name}
      maxWidth="640px"
      maxHeight="min(90vh, 760px)"
      footer={(
        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={handleClose} disabled={busy}>
            {phase === 'success' ? 'Fechar' : 'Agora não'}
          </button>
          {phase !== 'success' ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handlePropagate()}
              disabled={confirmDisabled}
              aria-busy={busy}
            >
              {busy ? 'Propagando…' : `Propagar em ${wouldUpdate || linked || 0} agents`}
            </button>
          ) : null}
        </div>
      )}
    >
      <p className="agent-form-panel-intro" role="status">
        Esta alteração não atualiza agents automaticamente. Escolha o que aplicar no snapshot de cada coletor.
      </p>

      <p className="propagate-linked-summary">
        {previewLoading && !preview
          ? 'Contando agents vinculados…'
          : `${linked} agent(s) vinculados.`}
        {' '}
        {source ? (
          <Link className="link-btn" to={`${PATHS.agents}?dataSourceId=${encodeURIComponent(source.id)}`}>
            Ver lista
          </Link>
        ) : null}
      </p>

      <fieldset className="propagate-fields" disabled={busy || phase === 'success'}>
        <legend>O que aplicar</legend>
        {PROPAGATE_FIELD_GROUPS.map((group) => {
          const lockedOut = hasChangedHint && !changedSet.has(group.id);
          const checked = fields.includes(group.id);
          return (
            <label key={group.id} className={`collector-check-row propagate-field-row ${lockedOut ? 'is-locked' : ''}`}>
              <input
                type="checkbox"
                checked={checked}
                disabled={lockedOut || busy || phase === 'success'}
                onChange={() => toggleField(group.id)}
                style={{ accentColor: '#673de6' }}
              />
              <span>
                <strong>{group.label}</strong>
                <span className="table-cell-muted">
                  {lockedOut ? 'Sem alteração neste grupo' : group.hint}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {phase === 'success' && result ? (
        <div className="agent-test-result is-ok" role="status">
          <p>
            {result.updated} atualizados · {result.skipped} ignorados
            {result.failed ? ` · ${result.failed} com erro` : ''}
          </p>
        </div>
      ) : null}

      {previewError ? (
        <div className="agent-test-result is-error" role="alert">
          <p>{previewError}</p>
        </div>
      ) : null}

      {fields.length === 0 ? (
        <p className="kv-editor-empty">Selecione ao menos um grupo para ver o preview.</p>
      ) : previewLoading ? (
        <div className="propagate-preview-wrap" aria-busy="true" aria-live="polite">
          <p className="table-cell-muted">Gerando preview…</p>
        </div>
      ) : linked === 0 ? (
        <p className="kv-editor-empty">Nenhum agent vinculado. Feche este painel ou crie um coletor a partir desta fonte.</p>
      ) : (
        <div className="propagate-preview-wrap">
          <table className="propagate-preview-table">
            <caption className="sr-only">Preview da URL antes e depois</caption>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Ticker</th>
                <th>URL</th>
              </tr>
            </thead>
            <tbody>
              {previews.map((item: PropagateAgentPreview) => (
                <tr key={item.agentId}>
                  <td>
                    <span className="table-cell-title">{item.agentName}</span>
                    {item.skipReason ? <div className="table-cell-muted">{item.skipReason}</div> : null}
                  </td>
                  <td><span className="id-compact">{item.ticker || '—'}</span></td>
                  <td>
                    <div className="propagate-url-diff">
                      <span className="propagate-url-before">{item.beforeUrl || '—'}</span>
                      <span className="propagate-url-after">{item.afterUrl || '—'}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {linked > previews.length ? (
            <p className="table-cell-muted" style={{ marginTop: '0.5rem' }}>
              Mostrando {previews.length} de {linked} agents.
            </p>
          ) : null}
        </div>
      )}
    </Modal>
  );
};
