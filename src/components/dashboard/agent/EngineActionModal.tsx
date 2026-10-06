import { useEffect, useState } from 'react';
import {
  pauseEngine,
  resumeEngine,
  toAgentError,
  zerarEngine,
  type AgentApiError,
  type AgentConta,
} from '../../../services/agentOrdersService';
import { AgentDialog } from './AgentDialog';
import { ContaBadge } from './AgentBadges';

export type EngineAction = 'pause' | 'resume' | 'zerar';

const ZERAR_WORD = 'ZERAR';

interface EngineActionModalProps {
  action: EngineAction | null;
  conta: AgentConta;
  onClose: () => void;
  onDone: (action: EngineAction) => void;
}

/** Pausar (motivo), Retomar (confirmação simples) e Zerar tudo (exige digitar "ZERAR"). */
export function EngineActionModal({ action, conta, onClose, onDone }: EngineActionModalProps) {
  const [motivo, setMotivo] = useState('');
  const [typed, setTyped] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<AgentApiError | null>(null);

  useEffect(() => {
    setMotivo('');
    setTyped('');
    setError(null);
    setSending(false);
  }, [action]);

  if (!action) return null;

  const zerarOk = typed.trim() === ZERAR_WORD;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (action === 'zerar' && !zerarOk) return;
    setSending(true);
    setError(null);
    try {
      if (action === 'pause') await pauseEngine(conta, motivo.trim() || 'Pausado pelo usuário no backoffice');
      else if (action === 'resume') await resumeEngine(conta);
      else await zerarEngine(conta, ZERAR_WORD);
      onDone(action);
      onClose();
    } catch (err) {
      setError(toAgentError(err));
    } finally {
      setSending(false);
    }
  };

  const title = action === 'pause' ? 'Pausar o motor' : action === 'resume' ? 'Retomar o motor' : 'Zerar tudo';
  const submitLabel = action === 'pause' ? 'Pausar' : action === 'resume' ? 'Retomar' : 'Zerar tudo agora';
  const submitClass = action === 'zerar' ? 'btn btn-danger-solid' : action === 'pause' ? 'btn btn-danger' : 'btn btn-primary';

  return (
    <AgentDialog
      isOpen
      onClose={onClose}
      busy={sending}
      title={title}
      subtitle={<>Conta-alvo: <ContaBadge conta={conta} /></>}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={sending}>Voltar</button>
          <button type="submit" form="ao-engine-form" className={submitClass} disabled={sending || (action === 'zerar' && !zerarOk)}>
            {sending ? 'Enviando…' : submitLabel}
          </button>
        </>
      }
    >
      <form id="ao-engine-form" onSubmit={submit}>
        {error ? <div className="ao-callout is-danger" role="alert">{error.message}</div> : null}

        {action === 'pause' ? (
          <>
            <p className="ao-modal-text">
              Com o motor pausado nenhuma ordem é confirmada. As propostas continuam visíveis, e posições e stops já na corretora não mudam.
            </p>
            <div className="form-group">
              <label htmlFor="ao-pause-motivo" className="form-label">Motivo (opcional)</label>
              <input
                id="ao-pause-motivo"
                className="form-input"
                value={motivo}
                maxLength={200}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex.: Copom hoje à tarde"
                disabled={sending}
              />
            </div>
          </>
        ) : action === 'resume' ? (
          <p className="ao-modal-text">
            O motor volta a aceitar confirmações na conta {conta}. As propostas são revalidadas no próximo ciclo antes de qualquer envio.
          </p>
        ) : (
          <>
            <div className="ao-callout is-danger" role="note">
              <strong>Ação irreversível.</strong> Encerra todas as posições abertas pelo sistema na conta {conta} e cancela as ordens pendentes dele.
              Posições e ordens que você abriu à mão não são tocadas.
            </div>
            <div className="form-group">
              <label htmlFor="ao-zerar-confirm" className="form-label">
                Para confirmar, digite <strong>{ZERAR_WORD}</strong>
              </label>
              <input
                id="ao-zerar-confirm"
                className="form-input"
                value={typed}
                onChange={(e) => setTyped(e.target.value.toUpperCase())}
                autoComplete="off"
                spellCheck={false}
                aria-describedby="ao-zerar-hint"
                disabled={sending}
              />
              <span id="ao-zerar-hint" className="table-cell-muted ao-field-hint">
                O botão só libera com o texto exato.
              </span>
            </div>
          </>
        )}
      </form>
    </AgentDialog>
  );
}
