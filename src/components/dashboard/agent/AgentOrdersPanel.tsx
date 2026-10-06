import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pause, Play, Power, SlidersHorizontal } from 'lucide-react';
import { PATHS } from '../../../navigation/routes';
import type { AgentProposalsState } from '../../../hooks/useAgentProposals';
import { getEngine, type AgentCapital, type AgentEngine, type Proposal, type ProposalFamilia } from '../../../services/agentOrdersService';
import { useToast } from '../../../context/ToastContext';
import { AgentProposalsTable } from './AgentProposalsTable';
import { AgentHistory } from './AgentHistory';
import { AgentSettingsDrawer } from './AgentSettingsDrawer';
import { CancelProposalModal, ConfirmProposalModal } from './ProposalModals';
import { EngineActionModal, type EngineAction } from './EngineActionModal';
import { FAMILIA_META, FAMILIAS_ORDEM, dateTime, money, pct, sortProposals } from './agentFormat';

type FamiliaFilter = 'TODAS' | ProposalFamilia;

const FLASH_MS = 1800;

interface AgentOrdersPanelProps {
  state: AgentProposalsState;
}

export function AgentOrdersPanel({ state }: AgentOrdersPanelProps) {
  const { data, loading, error, refresh } = state;
  const { addToast } = useToast();
  const [filter, setFilter] = useState<FamiliaFilter>('TODAS');
  const [confirming, setConfirming] = useState<Proposal | null>(null);
  const [cancelling, setCancelling] = useState<Proposal | null>(null);
  const [engineAction, setEngineAction] = useState<EngineAction | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [flashIds, setFlashIds] = useState<ReadonlySet<string>>(new Set());
  const [liveMsg, setLiveMsg] = useState('');
  const versions = useRef<Map<string, number> | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // GET /engine diz se este ambiente executa ordens; false = só acompanhamento.
  const [execucaoHabilitada, setExecucaoHabilitada] = useState(true);
  const [engineKey, setEngineKey] = useState(0);
  useEffect(() => {
    const ctrl = new AbortController();
    getEngine(ctrl.signal)
      .then((e) => setExecucaoHabilitada(e.execucaoHabilitada !== false))
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [engineKey]);

  // Linha que subiu de versão (§4.1 C) pisca uma vez. Na 1ª carga nada pisca.
  useEffect(() => {
    if (!data) return;
    const prev = versions.current;
    const next = new Map(data.items.map((p) => [p.id, p.versao]));
    versions.current = next;
    if (!prev) return;
    const changed = data.items.filter((p) => (prev.get(p.id) ?? p.versao) < p.versao).map((p) => p.id);
    const novos = data.items.filter((p) => !prev.has(p.id)).length;
    if (changed.length === 0 && novos === 0) return;
    const parts: string[] = [];
    if (changed.length) parts.push(`${changed.length} ${changed.length === 1 ? 'proposta atualizada' : 'propostas atualizadas'}`);
    if (novos) parts.push(`${novos} ${novos === 1 ? 'proposta nova' : 'propostas novas'}`);
    setLiveMsg(parts.join(', '));
    if (changed.length === 0) return;
    setFlashIds(new Set(changed));
    const t = window.setTimeout(() => setFlashIds(new Set()), FLASH_MS);
    return () => window.clearTimeout(t);
  }, [data]);

  const sorted = useMemo(() => sortProposals(data?.items ?? []), [data]);
  const filtered = useMemo(() => (filter === 'TODAS' ? sorted : sorted.filter((p) => p.familia === filter)), [sorted, filter]);
  const liveConfirming = useMemo(
    () => (confirming ? data?.items.find((p) => p.id === confirming.id) ?? null : null),
    [confirming, data],
  );
  const suggestedTicker = useMemo(() => sorted.find((p) => p.familia === 'COMPRA')?.ticker, [sorted]);
  const enginePaused = data?.engine.estado === 'PAUSADO';

  const afterDecision = () => {
    refresh();
    setHistoryKey((k) => k + 1);
  };

  if (loading && !data) {
    return (
      <div className="hpanel-table-card desktop-table-view" aria-busy="true" aria-label="Carregando Agent Ordens">
        <div className="portfolio-skeleton" />
      </div>
    );
  }

  if (!data && error) {
    return (
      <div className="ao-panel">
        <div className="trade-state" role="alert">
          <p>{error.message}</p>
          {error.code === 'MT5_ACCOUNT_NOT_FOUND' ? (
            <Link to={PATHS.carteira} className="btn btn-primary">Vincular corretora</Link>
          ) : (
            <button type="button" className="btn btn-secondary" onClick={refresh}>Tentar de novo</button>
          )}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const contadores = data.contadores;

  return (
    <div className="ao-panel">
      {!execucaoHabilitada ? (
        <p className="trade-note" role="status">Execução de ordens desligada — propostas só para acompanhamento</p>
      ) : null}
      <section className="ao-topbar" aria-label="Motor e capital">
        <div className="ao-topbar-row">
          <div className="ao-topbar-identity">
            <EngineStatus engine={data.engine} />
          </div>
          <div className="ao-topbar-actions">
            {enginePaused ? (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEngineAction('resume')}>
                <Play size={14} aria-hidden="true" /> Retomar
              </button>
            ) : (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEngineAction('pause')}>
                <Pause size={14} aria-hidden="true" /> Pausar
              </button>
            )}
            <button type="button" className="btn btn-danger btn-sm" onClick={() => setEngineAction('zerar')} disabled={!execucaoHabilitada}>
              <Power size={14} aria-hidden="true" /> Zerar tudo
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSettingsOpen(true)} aria-haspopup="dialog">
              <SlidersHorizontal size={14} aria-hidden="true" /> Configurações
            </button>
          </div>
        </div>
        <CapitalBar capital={data.capital} />
      </section>

      {error ? (
        <p className="trade-note is-warn" role="alert">
          Não foi possível atualizar agora ({error.message}). Mostrando os dados de {dateTime(data.asOf)}.
        </p>
      ) : null}
      {enginePaused ? (
        <p className="trade-note is-warn">Motor pausado: as propostas continuam visíveis, mas nenhuma pode ser confirmada.</p>
      ) : null}

      <div className="ao-chips" role="group" aria-label="Filtrar propostas por família">
        <button type="button" className={`ao-chip${filter === 'TODAS' ? ' is-active' : ''}`} aria-pressed={filter === 'TODAS'} onClick={() => setFilter('TODAS')}>
          Todas <span className="ao-chip-count">{data.items.length}</span>
        </button>
        {FAMILIAS_ORDEM.map((f) => {
          const meta = FAMILIA_META[f];
          const n = contadores?.[f] ?? data.items.filter((p) => p.familia === f).length;
          if (f === 'EMERGENCIA' && n === 0) return null;
          const Icon = meta.icon;
          return (
            <button
              key={f}
              type="button"
              className={`ao-chip is-${meta.tone}${filter === f ? ' is-active' : ''}`}
              aria-pressed={filter === f}
              onClick={() => setFilter(filter === f ? 'TODAS' : f)}
            >
              <Icon size={13} aria-hidden="true" /> {meta.label} <span className="ao-chip-count">{n}</span>
            </button>
          );
        })}
      </div>

      <p className="sr-only" aria-live="polite">{liveMsg}</p>

      <AgentProposalsTable
        items={filtered}
        nowMs={nowMs}
        flashIds={flashIds}
        enginePaused={enginePaused}
        execucaoHabilitada={execucaoHabilitada}
        emptyMessage={
          filter === 'TODAS'
            ? 'Nenhuma proposta agora. O motor roda a cada ciclo e as novas aparecem aqui sozinhas.'
            : `Nenhuma proposta de ${FAMILIA_META[filter].plural} agora.`
        }
        onConfirm={setConfirming}
        onCancel={setCancelling}
      />

      <AgentHistory reloadKey={historyKey} />

      <ConfirmProposalModal
        proposal={confirming}
        liveProposal={liveConfirming}
        enginePaused={enginePaused || !execucaoHabilitada}
        onClose={() => setConfirming(null)}
        onChanged={afterDecision}
      />
      <CancelProposalModal
        proposal={cancelling}
        onClose={() => setCancelling(null)}
        onChanged={(cancelled) => {
          afterDecision();
          if (cancelled) addToast({ type: 'info', title: 'Proposta cancelada', description: 'Nada foi enviado à corretora.' });
        }}
      />
      <EngineActionModal
        action={engineAction}
        onClose={() => setEngineAction(null)}
        onDone={(a) => {
          refresh();
          setEngineKey((k) => k + 1);
          addToast({
            type: a === 'zerar' ? 'warning' : 'success',
            title: a === 'pause' ? 'Motor pausado' : a === 'resume' ? 'Motor retomado' : 'Zerar tudo enviado',
            description: a === 'zerar' ? 'Confira as posições na aba Corretora.' : undefined,
          });
        }}
      />
      <AgentSettingsDrawer
        isOpen={settingsOpen}
        capital={data.capital}
        suggestedTicker={suggestedTicker}
        onClose={() => setSettingsOpen(false)}
        onSaved={refresh}
      />
    </div>
  );
}

function EngineStatus({ engine }: { engine: AgentEngine }) {
  const paused = engine.estado === 'PAUSADO';
  return (
    <span className={`ao-engine${paused ? ' is-paused' : ' is-active'}`} role="status">
      <span className="ao-engine-dot" aria-hidden="true" />
      <strong>{paused ? 'Motor pausado' : 'Motor ativo'}</strong>
      {paused ? (
        <span className="table-cell-muted">
          {engine.por ? ` por ${engine.por === 'IA' ? 'IA de monitoramento' : engine.por}` : ''}
          {engine.desde ? ` desde ${dateTime(engine.desde)}` : ''}
          {engine.motivo ? ` · ${engine.motivo}` : ''}
        </span>
      ) : null}
    </span>
  );
}

/** Barra investido / reservado / disponível / reserva mínima sobre o capital de trade. */
function CapitalBar({ capital }: { capital: AgentCapital }) {
  const total = Math.max(capital.capitalTrade, 1);
  const w = (v: number) => `${Math.max(0, Math.min(100, (v / total) * 100))}%`;
  const segments = [
    { key: 'investido', label: 'Investido', value: capital.investido, extra: pct(capital.pctInvestido, 0) },
    { key: 'reservado', label: 'Reservado', value: capital.reservado },
    { key: 'disponivel', label: 'Disponível', value: capital.disponivel },
    { key: 'reserva', label: 'Reserva mínima', value: capital.reservaMinima },
  ];
  return (
    <div className="ao-capital">
      <div className="ao-capital-bar" aria-hidden="true">
        {segments.map((s) => (
          <span key={s.key} className={`ao-capital-seg is-${s.key}`} style={{ width: w(s.value) }} />
        ))}
      </div>
      <dl className="ao-capital-legend">
        {segments.map((s) => (
          <div key={s.key}>
            <dt><span className={`ao-capital-swatch is-${s.key}`} aria-hidden="true" />{s.label}</dt>
            <dd>{money(s.value)}{s.extra ? <span className="table-cell-muted"> · {s.extra}</span> : null}</dd>
          </div>
        ))}
        <div>
          <dt>Capital de trade</dt>
          <dd>{money(capital.capitalTrade)}</dd>
        </div>
        {capital.riscoAbertoPct != null ? (
          <div>
            <dt>Risco aberto</dt>
            <dd>{pct(capital.riscoAbertoPct)}{capital.estresseGapPct != null ? <span className="table-cell-muted"> · gap {pct(capital.estresseGapPct)}</span> : null}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
