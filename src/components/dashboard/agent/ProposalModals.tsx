import { useEffect, useRef, useState } from 'react';
import { CalendarClock, Newspaper, TriangleAlert } from 'lucide-react';
import {
  cancelProposal,
  confirmProposal,
  toAgentError,
  type AgentApiError,
  type DecisionResponse,
  type ExecucaoStatus,
  type Proposal,
} from '../../../services/agentOrdersService';
import { AgentDialog } from './AgentDialog';
import { ContaBadge, FamiliaBadge } from './AgentBadges';
import {
  TIPO_LABEL,
  alteracoesRecentes,
  countdown,
  dateTime,
  money,
  ordemResumo,
  pct,
  price,
  protecaoResumo,
  qty,
  timeOnly,
} from './agentFormat';

const STATUS_LABEL: Record<ExecucaoStatus, string> = {
  AGENDADA: 'Agendada para depois do leilão de abertura',
  EXECUTADA: 'Executada',
  PARCIAL: 'Executada em parte',
  REJEITADA: 'Rejeitada pela corretora',
  FALHOU: 'Falhou',
  INCERTO: 'Resultado incerto — confira na corretora',
  NAO_ENVIADA: 'Não enviada — a condição de envio não foi atendida',
  CONFIRMANDO: 'Em processamento',
};

const ARM_TIMEOUT_MS = 10_000;

/** Resumo exato da ordem — o mesmo que vai para o MT5. */
export function ProposalSummary({ proposal }: { proposal: Proposal }) {
  const p = proposal;
  return (
    <dl className="ao-summary">
      <div><dt>Ação</dt><dd><FamiliaBadge familia={p.familia} /> {TIPO_LABEL[p.tipo] ?? p.tipo}</dd></div>
      <div><dt>Ativo</dt><dd><strong>{p.ticker}</strong>{p.simbolo && p.simbolo !== p.ticker ? <span className="table-cell-muted"> · envia como {p.simbolo}</span> : null}</dd></div>
      <div><dt>Conta</dt><dd><ContaBadge conta={p.conta} /></dd></div>
      {p.ordem ? <div><dt>Ordem</dt><dd><strong>{ordemResumo(p.ordem)}</strong> <span className="table-cell-muted">· validade {p.ordem.validade === 'DAY' ? 'no dia' : p.ordem.validade}</span></dd></div> : null}
      {p.protecao ? <div><dt>Proteção</dt><dd>{protecaoResumo(p.protecao)}</dd></div> : null}
      {p.valorOrdem != null ? <div><dt>Valor</dt><dd>{money(p.valorOrdem)}</dd></div> : null}
      {p.risco ? (
        <div>
          <dt>Risco</dt>
          <dd><strong>{money(p.risco.valor)}</strong> <span className="table-cell-muted">({pct(p.risco.pctCapital, 2)} do capital) se o stop executar</span></dd>
        </div>
      ) : null}
      {p.pctDisponivel != null ? (
        <div>
          <dt>Saldo</dt>
          <dd>{pct(p.pctDisponivel)} do disponível{p.pctInvestidoDepois != null ? ` · investido passa a ${pct(p.pctInvestidoDepois)}` : ''}</dd>
        </div>
      ) : null}
      <div>
        <dt>Preço agora</dt>
        <dd>{price(p.ultimoPreco)} <span className="table-cell-muted">(cotação {timeOnly(p.cotacaoEm)} · referência {price(p.precoReferencia)})</span></dd>
      </div>
      <div><dt>Motivo</dt><dd>{p.motivo}</dd></div>
      <div><dt>Versão</dt><dd className="table-cell-muted">v{p.versao} · atualizada {dateTime(p.atualizadoEm)}</dd></div>
    </dl>
  );
}

function JevWarnings({ proposal }: { proposal: Proposal }) {
  const jev = proposal.jev;
  if (!jev || !jev.disponivel) return null;
  const items: { icon: typeof Newspaper; text: string }[] = [];
  if (jev.noticia?.aviso) items.push({ icon: Newspaper, text: `Notícia relevante recente (prob. ${pct((jev.noticia.prob ?? 0) * 100, 0)}). Leia antes de confirmar.` });
  if (jev.evento?.suspende) items.push({ icon: CalendarClock, text: `Evento próximo que pode mexer no preço (prob. ${pct((jev.evento.prob ?? 0) * 100, 0)}).` });
  if (items.length === 0) return null;
  return (
    <div className="ao-callout is-warn" role="note">
      <strong>Aviso do JEV (só contexto, não decide):</strong>
      <ul>
        {items.map((i) => (
          <li key={i.text}><i.icon size={14} aria-hidden="true" /> {i.text}</li>
        ))}
      </ul>
    </div>
  );
}

interface ConfirmProposalModalProps {
  proposal: Proposal | null;
  /** Mesma proposta na tabela viva — se a versão subir com o modal aberto, o modal troca para ela. */
  liveProposal?: Proposal | null;
  enginePaused: boolean;
  onClose: () => void;
  /** Chamado quando a tabela precisa recarregar (sucesso ou proposta que mudou de estado). */
  onChanged: () => void;
}

export function ConfirmProposalModal({ proposal, liveProposal, enginePaused, onClose, onChanged }: ConfirmProposalModalProps) {
  const [current, setCurrent] = useState<Proposal | null>(proposal);
  const [step, setStep] = useState<'review' | 'armed' | 'sending' | 'done'>('review');
  const [error, setError] = useState<AgentApiError | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [notice, setNotice] = useState<string[] | null>(null);
  const [result, setResult] = useState<DecisionResponse | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const armTimer = useRef<number | null>(null);

  const switchToNewVersion = (prevVersao: number, next: Proposal) => {
    setNotice([`A proposta mudou da versão ${prevVersao} para a ${next.versao}. Revise antes de confirmar.`, ...alteracoesRecentes(next)]);
    setCurrent(next);
    setStep('review');
    setError(null);
    if (next.estado !== 'ABERTA') setBlocked(true);
  };

  useEffect(() => {
    setCurrent(proposal);
    setStep('review');
    setError(null);
    setBlocked(false);
    setNotice(null);
    setResult(null);
  }, [proposal?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- reabre só ao trocar de proposta

  useEffect(() => {
    if (!proposal) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [proposal]);

  // Versão nova chegou pela atualização automática: troca e exige revisar de novo.
  useEffect(() => {
    if (!current || !liveProposal || liveProposal.id !== current.id) return;
    if (liveProposal.versao > current.versao && (step === 'review' || step === 'armed')) {
      switchToNewVersion(current.versao, liveProposal);
    }
  }, [liveProposal?.versao]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (armTimer.current) window.clearTimeout(armTimer.current); }, []);

  if (!proposal || !current) return null;

  const cd = countdown(current.preNegociacao ? null : current.validaAte, now);
  const expired = !current.preNegociacao && cd.expired;
  const disabledReason = enginePaused
    ? 'O motor está pausado. Retome para confirmar.'
    : current.estado !== 'ABERTA'
      ? `Proposta ${current.estado === 'INVALIDADA' ? 'invalidada' : 'sem saldo'} — não pode ser confirmada.`
      : expired
        ? 'A validade terminou. Aguarde o próximo ciclo.'
        : null;
  const canAct = !disabledReason && !blocked;

  const arm = () => {
    setStep('armed');
    if (armTimer.current) window.clearTimeout(armTimer.current);
    armTimer.current = window.setTimeout(() => setStep((s) => (s === 'armed' ? 'review' : s)), ARM_TIMEOUT_MS);
  };

  const send = async () => {
    if (armTimer.current) window.clearTimeout(armTimer.current);
    setStep('sending');
    setError(null);
    try {
      const resp = await confirmProposal(current.id, current.versao);
      setResult(resp);
      setStep('done');
      onChanged();
    } catch (err) {
      const e = toAgentError(err);
      if (e.code === 'PROPOSTA_ATUALIZADA' && e.proposal) {
        switchToNewVersion(current.versao, e.proposal);
        return;
      }
      setError(e);
      setStep('review');
      if (e.status === 410 || e.code === 'PROPOSTA_INVALIDADA' || e.code === 'QUANTIDADE_AUMENTOU' || e.code === 'PROPOSTA_ATUALIZADA') {
        setBlocked(true);
        onChanged();
      }
    }
  };

  const sending = step === 'sending';
  const isReal = current.conta === 'REAL';

  const footer =
    step === 'done' ? (
      <button type="button" className="btn btn-primary" onClick={onClose} data-autofocus>
        Fechar
      </button>
    ) : (
      <>
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={sending}>
          Voltar
        </button>
        {step === 'review' ? (
          <button type="button" className="btn btn-primary" onClick={arm} disabled={!canAct}>
            Revisei, confirmar
          </button>
        ) : (
          <button
            type="button"
            className={`btn ${isReal ? 'btn-danger-solid' : 'btn-primary'} ao-armed-btn`}
            onClick={send}
            disabled={!canAct || sending}
            aria-describedby="ao-confirm-armed-hint"
            autoFocus
          >
            {sending ? 'Enviando…' : `Enviar para a conta ${current.conta}`}
          </button>
        )}
      </>
    );

  return (
    <AgentDialog
      isOpen
      onClose={onClose}
      busy={sending}
      title={step === 'done' ? 'Resultado da ordem' : `Confirmar ${(TIPO_LABEL[current.tipo] ?? current.tipo).toLowerCase()} · ${current.ticker}`}
      subtitle={step === 'done' ? undefined : <>Executa só no segundo clique. Conta-alvo: <ContaBadge conta={current.conta} /></>}
      maxWidth="600px"
      footer={footer}
    >
      {step === 'done' && result ? (
        <DecisionResult result={result} />
      ) : (
        <>
          {notice ? (
            <div className="ao-callout is-info" role="status">
              {notice.map((n, i) => (i === 0 ? <strong key={n}>{n}</strong> : <p key={n} className="ao-change-line">{n}</p>))}
            </div>
          ) : null}
          {error ? (
            <div className="ao-callout is-danger" role="alert">
              {error.message}
              {error.correlationId ? <span className="table-cell-muted ao-correlation"> Código para suporte: {error.correlationId}</span> : null}
            </div>
          ) : null}
          {disabledReason ? <div className="ao-callout is-warn" role="status">{disabledReason}</div> : null}

          <ProposalSummary proposal={current} />
          <JevWarnings proposal={current} />

          <p className="ao-validity-line">
            {current.preNegociacao
              ? 'Pré-pregão: a ordem é enviada sozinha depois do leilão de abertura, se ainda valer.'
              : current.validaAte
                ? <>Vale até {timeOnly(current.validaAte)} · <span className={cd.urgent ? 'ao-countdown is-urgent' : 'ao-countdown'}>{cd.text}</span></>
                : 'Vale até ser resolvida.'}
          </p>
          {isReal ? (
            <div className="ao-callout is-danger" role="note">
              <TriangleAlert size={14} aria-hidden="true" /> Conta <strong>REAL</strong>: dinheiro de verdade.
            </div>
          ) : null}
          {step === 'armed' ? (
            <p id="ao-confirm-armed-hint" className="ao-armed-hint" role="status">
              Clique em “Enviar para a conta {current.conta}” para executar. Volta ao normal em 10 s se você não clicar.
            </p>
          ) : null}
        </>
      )}
    </AgentDialog>
  );
}

function DecisionResult({ result }: { result: DecisionResponse }) {
  const ok = result.status === 'EXECUTADA' || result.status === 'AGENDADA' || result.status === 'PARCIAL';
  return (
    <div className="ao-result">
      <div className={`ao-callout ${ok ? 'is-success' : 'is-danger'}`} role="status">
        <strong>{result.status ? STATUS_LABEL[result.status] ?? result.status : 'Confirmada'}</strong>
        {result.mensagem ? <p>{result.mensagem}</p> : null}
      </div>
      {result.execucoes && result.execucoes.length > 0 ? (
        <table className="hpanel-table ao-exec-table">
          <caption className="sr-only">Execuções enviadas ao MT5</caption>
          <thead>
            <tr><th>Ordem</th><th>Pedido</th><th>Executado</th><th>Preço médio</th><th>Retorno</th></tr>
          </thead>
          <tbody>
            {result.execucoes.map((x, i) => (
              <tr key={`${x.ticket ?? i}-${x.ordemTipo}`}>
                <td>{x.ordemTipo} · {x.simbolo}</td>
                <td>{qty(x.volumePedido)}</td>
                <td>{qty(x.volumeExecutado)}</td>
                <td>{price(x.precoMedio)}</td>
                <td className="table-cell-muted">{x.retcode}{x.ticket ? ` · #${x.ticket}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

interface CancelProposalModalProps {
  proposal: Proposal | null;
  onClose: () => void;
  /** `cancelled=false`: a proposta mudou de estado no servidor (só recarregar a tabela). */
  onChanged: (cancelled: boolean) => void;
}

export function CancelProposalModal({ proposal, onClose, onChanged }: CancelProposalModalProps) {
  const [motivo, setMotivo] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<AgentApiError | null>(null);

  useEffect(() => {
    setMotivo('');
    setError(null);
    setSending(false);
  }, [proposal?.id]);

  if (!proposal) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      await cancelProposal(proposal.id, proposal.versao, motivo);
      onChanged(true);
      onClose();
    } catch (err) {
      const ae = toAgentError(err);
      setError(ae);
      if (ae.status === 409 || ae.status === 410) onChanged(false);
    } finally {
      setSending(false);
    }
  };

  const isEntrada = proposal.familia === 'COMPRA';

  return (
    <AgentDialog
      isOpen
      onClose={onClose}
      busy={sending}
      title={`Cancelar proposta · ${proposal.ticker}`}
      subtitle={`${TIPO_LABEL[proposal.tipo] ?? proposal.tipo} · versão ${proposal.versao}`}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={sending}>Voltar</button>
          <button type="submit" form="ao-cancel-form" className="btn btn-danger" disabled={sending}>
            {sending ? 'Cancelando…' : 'Cancelar proposta'}
          </button>
        </>
      }
    >
      <form id="ao-cancel-form" onSubmit={submit}>
        {error ? <div className="ao-callout is-danger" role="alert">{error.message}</div> : null}
        <p className="ao-modal-text">
          Nada é enviado à corretora.{' '}
          {isEntrada ? 'Este sinal não volta: um sinal novo traz uma nova chance.' : 'O motor pode propor de novo se a condição continuar.'}
        </p>
        <div className="form-group">
          <label htmlFor="ao-cancel-motivo" className="form-label">Motivo (opcional)</label>
          <textarea
            id="ao-cancel-motivo"
            className="form-input"
            rows={3}
            maxLength={500}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: não quero aumentar exposição em petróleo agora"
            disabled={sending}
          />
        </div>
      </form>
    </AgentDialog>
  );
}
