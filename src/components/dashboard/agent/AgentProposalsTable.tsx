import { Link } from 'react-router-dom';
import { CalendarClock, Hourglass, Newspaper } from 'lucide-react';
import { PATHS } from '../../../navigation/routes';
import type { Proposal } from '../../../services/agentOrdersService';
import { Tooltip } from '../../common/Tooltip';
import { FamiliaBadge } from './AgentBadges';
import {
  ESTADO_LABEL,
  FAMILIA_META,
  REGIME_LABEL,
  TIPO_LABEL,
  alteracoesRecentes,
  countdown,
  isConfirmavel,
  isInativa,
  money,
  ordemResumo,
  pct,
  protecaoResumo,
  timeOnly,
} from './agentFormat';

interface AgentProposalsTableProps {
  items: Proposal[];
  nowMs: number;
  flashIds: ReadonlySet<string>;
  enginePaused: boolean;
  execucaoHabilitada?: boolean;
  emptyMessage: string;
  onConfirm: (p: Proposal) => void;
  onCancel: (p: Proposal) => void;
}

function rowClass(p: Proposal, flash: boolean): string {
  const tone = isInativa(p) ? 'muted' : FAMILIA_META[p.familia]?.tone ?? 'muted';
  return `ao-row is-${tone}${isInativa(p) ? ' is-inactive' : ''}${flash ? ' is-flash' : ''}`;
}

function OrdemCell({ p }: { p: Proposal }) {
  const changes = p.versao > 1 ? alteracoesRecentes(p) : [];
  return (
    <div className="ao-ordem">
      {p.ordem ? <strong>{ordemResumo(p.ordem)}</strong> : <span className="table-cell-muted">Sem ordem — só aviso</span>}
      {p.protecao ? <span className="table-cell-muted">{protecaoResumo(p.protecao)}</span> : null}
      {changes.map((c) => (
        <span key={c} className="ao-change-line">
          <span className="sr-only">Atualizado: </span>
          {c}
        </span>
      ))}
    </div>
  );
}

function JevCell({ p }: { p: Proposal }) {
  const jev = p.jev;
  if (!jev || !jev.disponivel) return <span className="table-cell-muted">—</span>;
  const regime = jev.regime ? REGIME_LABEL[jev.regime.valor] ?? jev.regime.valor : null;
  const nivel = jev.qualidade?.nivel;
  const desc = [
    regime && jev.regime ? `Regime: ${regime} (confiança ${pct(jev.regime.confianca * 100, 0)})` : null,
    nivel != null && jev.qualidade ? `Qualidade do setup: ${nivel}/5 (confiança ${pct(jev.qualidade.confianca * 100, 0)})` : null,
    jev.noticia ? `Notícia relevante: ${pct(jev.noticia.prob * 100, 0)}${jev.noticia.aviso ? ' — aviso' : ''}` : null,
    jev.evento ? `Evento próximo: ${pct(jev.evento.prob * 100, 0)}${jev.evento.suspende ? ' — atenção' : ''}` : null,
    'O JEV só dá contexto; não decide nem executa.',
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Tooltip label="Parecer do JEV" description={desc} align="end">
      <button type="button" className="ao-jev" aria-label={`Parecer do JEV. ${desc}`}>
        {regime ? <span>{regime}</span> : null}
        {nivel != null ? <span className="table-cell-muted">Q{nivel}</span> : null}
        {jev.noticia?.aviso ? <Newspaper size={13} className="ao-jev-warn" aria-hidden="true" /> : null}
        {jev.evento?.suspende ? <CalendarClock size={13} className="ao-jev-warn" aria-hidden="true" /> : null}
      </button>
    </Tooltip>
  );
}

function ValidadeCell({ p, nowMs }: { p: Proposal; nowMs: number }) {
  if (p.preNegociacao) {
    return (
      <span className="ao-validade is-pre">
        <Hourglass size={13} aria-hidden="true" /> Pré-pregão
      </span>
    );
  }
  const cd = countdown(p.validaAte, nowMs);
  return (
    <span className={`ao-validade${cd.urgent ? ' is-urgent' : ''}`}>
      {p.validaAte ? <time dateTime={p.validaAte} title={`Vale até ${timeOnly(p.validaAte)}`}>{cd.text}</time> : cd.text}
    </span>
  );
}

function Actions({ p, enginePaused, execOff = false, onConfirm, onCancel, compact = false }: {
  p: Proposal;
  enginePaused: boolean;
  execOff?: boolean;
  onConfirm: (p: Proposal) => void;
  onCancel: (p: Proposal) => void;
  compact?: boolean;
}) {
  const label = `${TIPO_LABEL[p.tipo] ?? p.tipo} ${p.ticker}`;
  if (p.estado === 'INVALIDADA') {
    return <span className="table-cell-muted">Some no próximo ciclo</span>;
  }
  return (
    <div className={`ao-actions${compact ? ' is-compact' : ''}`}>
      {isConfirmavel(p) ? (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => onConfirm(p)}
          disabled={enginePaused || execOff}
          title={execOff ? 'Execução de ordens desligada neste ambiente' : enginePaused ? 'Motor pausado — retome para confirmar' : undefined}
          aria-label={`Confirmar: ${label}`}
        >
          Confirmar
        </button>
      ) : null}
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onCancel(p)} aria-label={`${p.familia === 'ALERTA' ? 'Dispensar' : 'Cancelar'}: ${label}`}>
        {p.familia === 'ALERTA' ? 'Dispensar' : 'Cancelar'}
      </button>
    </div>
  );
}

function MotivoText({ p }: { p: Proposal }) {
  if (isInativa(p)) {
    return (
      <>
        <strong className="ao-estado">{ESTADO_LABEL[p.estado]}</strong>
        {p.motivoEstado ? <> · {p.motivoEstado}</> : null}
        <span className="ao-motivo-sub">{p.motivo}</span>
      </>
    );
  }
  return <>{p.motivo}</>;
}

/** Tabela única (desktop) + cards (mobile). A ordem e o filtro chegam prontos do painel. */
export function AgentProposalsTable({ items, nowMs, flashIds, enginePaused, execucaoHabilitada = true, emptyMessage, onConfirm, onCancel }: AgentProposalsTableProps) {
  if (items.length === 0) {
    return <div className="trade-state"><p>{emptyMessage}</p></div>;
  }

  return (
    <>
      <div className="hpanel-table-card desktop-table-view ao-table-card">
        <table className="hpanel-table ao-table" aria-label="Propostas do Agent Ordens, ordenadas por prioridade">
          <thead>
            <tr>
              <th scope="col">Tipo</th>
              <th scope="col">Ativo</th>
              <th scope="col">Ordem</th>
              <th scope="col">Risco</th>
              <th scope="col">
                <Tooltip label="% do disponível" description="Quanto esta ordem usa do saldo disponível agora, e o % investido depois dela.">
                  <button type="button" className="trade-day-stop-info" aria-label="O que é % do disponível">?</button>
                </Tooltip>{' '}
                % disp.
              </th>
              <th scope="col">Motivo</th>
              <th scope="col">JEV</th>
              <th scope="col">Validade</th>
              <th scope="col"><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className={rowClass(p, flashIds.has(p.id))}>
                <td>
                  <FamiliaBadge familia={p.familia} muted={isInativa(p)} />
                  <span className="ao-tipo">{TIPO_LABEL[p.tipo] ?? p.tipo}</span>
                </td>
                <td>
                  <div className="table-cell-title">
                    <Link to={`${PATHS.market}?ticker=${encodeURIComponent(p.ticker)}`}>{p.ticker}</Link>
                  </div>
                  {p.nivelPiramide ? <span className="table-cell-muted ao-sub">nível {p.nivelPiramide}</span> : null}
                </td>
                <td><OrdemCell p={p} /></td>
                <td>
                  {p.risco ? (
                    <div className="ao-num">
                      <strong>{money(p.risco.valor)}</strong>
                      <span className="table-cell-muted">{pct(p.risco.pctCapital, 2)}</span>
                    </div>
                  ) : <span className="table-cell-muted">—</span>}
                </td>
                <td>
                  {p.pctDisponivel != null ? (
                    <div className="ao-num">
                      <strong>{pct(p.pctDisponivel)}</strong>
                      {p.pctInvestidoDepois != null ? <span className="table-cell-muted">inv. → {pct(p.pctInvestidoDepois, 0)}</span> : null}
                    </div>
                  ) : <span className="table-cell-muted">—</span>}
                </td>
                <td className="ao-motivo"><MotivoText p={p} /></td>
                <td><JevCell p={p} /></td>
                <td><ValidadeCell p={p} nowMs={nowMs} /></td>
                <td>
                  <Actions p={p} enginePaused={enginePaused} execOff={!execucaoHabilitada} onConfirm={onConfirm} onCancel={onCancel} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="mobile-cards-container ao-cards" aria-label="Propostas do Agent Ordens">
        {items.map((p) => (
          <li key={p.id} className={`mobile-domain-card ${rowClass(p, flashIds.has(p.id))}`}>
            <div className="mobile-card-top">
              <div className="mobile-card-identity">
                <FamiliaBadge familia={p.familia} muted={isInativa(p)} />
                <span className="mobile-domain-name">{p.ticker}</span>
              </div>
              <ValidadeCell p={p} nowMs={nowMs} />
            </div>
            <div className="mobile-card-subinfo">{TIPO_LABEL[p.tipo] ?? p.tipo}</div>
            <OrdemCell p={p} />
            <div className="mobile-card-meta">
              {p.risco ? <span>Risco {money(p.risco.valor)} ({pct(p.risco.pctCapital, 2)})</span> : null}
              {p.pctDisponivel != null ? <span>{pct(p.pctDisponivel)} do disponível</span> : null}
            </div>
            <p className="ao-motivo ao-card-motivo"><MotivoText p={p} /></p>
            <Actions p={p} enginePaused={enginePaused} execOff={!execucaoHabilitada} onConfirm={onConfirm} onCancel={onCancel} compact />
          </li>
        ))}
      </ul>
    </>
  );
}
