import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ListChecks, Plus, Power, RefreshCw, Search, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  getOnboardingHealth,
  listCatalogTickers,
  updateCatalogAsset,
  type AssetClassType,
  type MarketAssetItem,
  type OnboardingCompleteness,
  type OnboardingHealth,
  type OnboardingReport,
  type OnboardingStatus,
} from '../../services/analystService';
import { ASSET_TYPE_OPTIONS } from '../../utils/assetValidators';
import { hasAdminRole } from '../../utils/roles';
import { Tooltip } from '../common/Tooltip';
import { AssetOnboardingWizard, type WizardStartStep } from './AssetOnboardingWizard';

function mapCatalogError(err: unknown, fallback: string): string {
  const status = (err as { status?: number }).status;
  const data = (err as { data?: { error?: string; message?: string } }).data;
  if (data?.error === 'INVALID_TICKER' || status === 400) {
    return data?.message || 'Ticker inválido. Use 4 a 6 caracteres (ex.: PETR4).';
  }
  if (data?.error === 'INVALID_ASSET_TYPE') {
    return data?.message || 'Tipo de ativo inválido.';
  }
  if (status === 502 || status === 503 || status === 504) {
    return 'Não foi possível falar com o analista agora. Tente de novo.';
  }
  return err instanceof Error ? err.message : fallback;
}

function assetTypeLabel(type?: string): string {
  return ASSET_TYPE_OPTIONS.find((item) => item.value === type)?.label || type || '—';
}

const MISSING_LABEL: Record<string, string> = {
  NO_COLLECTORS: 'sem coletores',
  COLLECTORS_DISABLED: 'coletores desabilitados',
  MT5_MISSING: 'sem MT5',
  MT5_DISABLED: 'MT5 desabilitado',
  RUNS_PENDING: 'aguardando os primeiros dados',
  RUNS_OFF: 'fora do lote diário',
};

interface Badge { label: string; tone: 'ok' | 'wait' | 'warn' | 'error' | 'off' }

/** Rótulo do indicador "cadastro completo × incompleto" de uma linha da listagem. */
function completenessBadge(status?: OnboardingStatus): Badge | null {
  if (!status) return null;
  switch (status.completeness) {
    case 'COMPLETE': return { label: 'Completo', tone: 'ok' };
    case 'AWAITING_DATA': return { label: 'Aguardando dados', tone: 'wait' };
    case 'STUCK': return { label: 'Travado', tone: 'error' };
    case 'INACTIVE': return { label: 'Inativo', tone: 'off' };
    case 'ORPHAN': return { label: 'Órfão', tone: 'error' };
    default: {
      const onlyMt5 = status.missing.length > 0 && status.missing.every((m) => m.startsWith('MT5_'));
      return onlyMt5 ? { label: 'Sem MT5', tone: 'warn' } : { label: 'Incompleto', tone: 'error' };
    }
  }
}

function missingText(status?: OnboardingStatus): string {
  if (!status) return '';
  if (status.completeness === 'STUCK') {
    return 'Aguardando dados há mais de 3 dias: confira os coletores (falhas ou incidentes abertos).';
  }
  if (status.missing.length === 0) return '';
  return `Falta: ${status.missing.map((m) => MISSING_LABEL[m] ?? m).join(', ')}`;
}

const CompletenessBadge: React.FC<{ status?: OnboardingStatus; loaded: boolean }> = ({ status, loaded }) => {
  const badge = completenessBadge(status);
  if (!badge) {
    return <span className="text-muted" title={loaded ? 'Sem informação de cadastro' : 'Indicador de cadastro indisponível'}>—</span>;
  }
  const hint = missingText(status);
  return (
    <span className={`onb-badge-status is-${badge.tone}`} title={hint || undefined}>
      {badge.label}
      {hint ? <span className="onb-sr-only">. {hint}</span> : null}
    </span>
  );
};

const COMPLETENESS_FILTERS: ReadonlyArray<{ value: '' | 'PENDING'; label: string }> = [
  { value: '', label: 'Todos os cadastros' },
  { value: 'PENDING', label: 'Só com pendências' },
];

function needsCompletion(c?: OnboardingCompleteness): boolean {
  return c === 'INCOMPLETE' || c === 'STUCK' || c === 'AWAITING_DATA';
}

interface WizardState { initial: MarketAssetItem | null; startStep: WizardStartStep }

export const MarketCatalogPanel: React.FC = () => {
  const { addToast } = useToast();
  const { user } = useAuth();
  const canOnboard = hasAdminRole(user?.roles);

  const [items, setItems] = useState<MarketAssetItem[]>([]);
  const [health, setHealth] = useState<OnboardingHealth | null>(null);
  const [healthFailed, setHealthFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'' | AssetClassType>('');
  const [statusFilter, setStatusFilter] = useState<'' | 'PENDING'>('');
  const [pendingOff, setPendingOff] = useState<string | null>(null);
  const [wizard, setWizard] = useState<WizardState | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    // O indicador de cadastro nunca pode derrubar a listagem: falha do health só esconde a coluna.
    const [catalogRes, healthRes] = await Promise.allSettled([listCatalogTickers(), getOnboardingHealth()]);
    if (catalogRes.status === 'fulfilled') {
      setItems(catalogRes.value.items ?? []);
    } else {
      setError(mapCatalogError(catalogRes.reason, 'Falha ao carregar o catálogo'));
      setItems([]);
    }
    if (healthRes.status === 'fulfilled') {
      setHealth(healthRes.value);
      setHealthFailed(false);
    } else {
      setHealth(null);
      setHealthFailed(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const statusByTicker = useMemo(() => {
    const map = new Map<string, OnboardingStatus>();
    for (const st of health?.items ?? []) map.set(st.ticker.toUpperCase(), st);
    return map;
  }, [health]);

  const orphans = useMemo(
    () => (health?.items ?? []).filter((st) => st.completeness === 'ORPHAN').map((st) => st.ticker),
    [health],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    return items.filter((item) => {
      if (typeFilter && item.assetType !== typeFilter) return false;
      if (statusFilter === 'PENDING' && !needsCompletion(statusByTicker.get(item.ticker.toUpperCase())?.completeness)) return false;
      if (!q) return true;
      return (
        item.ticker.toUpperCase().includes(q)
        || (item.displayName || '').toUpperCase().includes(q)
        || (item.sectorLabel || '').toUpperCase().includes(q)
        || (item.segment || '').toUpperCase().includes(q)
      );
    });
  }, [items, query, typeFilter, statusFilter, statusByTicker]);

  const inBatch = items.filter((item) => item.hasRuns).length;
  const pendingCount = items.filter((item) => needsCompletion(statusByTicker.get(item.ticker.toUpperCase())?.completeness)).length;

  const sectorHints = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of items) {
      const label = item.sectorLabel?.trim();
      if (!label || seen.has(label)) continue;
      seen.add(label);
      out.push(label);
    }
    return out.sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [items]);

  function onReport(report: OnboardingReport) {
    void loadAll();
    if (report.result === 'COMPLETED' || report.result === 'AWAITING_DATA') {
      addToast({
        type: 'success',
        title: `${report.ticker} cadastrado`,
        description: report.result === 'AWAITING_DATA'
          ? 'A análise diária liga sozinha quando a primeira coleta chegar.'
          : 'Catálogo, coletores, MT5 e análise diária ligados.',
      });
    }
  }

  async function setHasRuns(ticker: string, hasRuns: boolean) {
    setToggling(ticker);
    setError('');
    try {
      const saved = await updateCatalogAsset(ticker, { hasRuns });
      setItems((prev) => prev.map((item) => (item.ticker === ticker ? { ...item, ...saved } : item)));
      addToast({
        type: 'success',
        title: hasRuns ? `${ticker} no lote diário` : `${ticker} fora do lote`,
        description: hasRuns
          ? 'O cron analisa este ativo em dias úteis. Cada ticker custa uma análise.'
          : 'Continua no catálogo, mas o lote diário ignora este ticker.',
      });
    } catch (err) {
      setError(mapCatalogError(err, 'Falha ao atualizar o lote'));
    } finally {
      setToggling(null);
    }
  }

  async function deactivate(ticker: string) {
    setToggling(ticker);
    setError('');
    try {
      await updateCatalogAsset(ticker, { isActive: false });
      setItems((prev) => prev.filter((item) => item.ticker !== ticker));
      setPendingOff(null);
      addToast({
        type: 'success',
        title: `${ticker} desativado`,
        description: 'Sai da busca e dos picks. Coletores e MT5 continuam ligados até serem desativados à parte.',
      });
    } catch (err) {
      setError(mapCatalogError(err, 'Falha ao desativar o ativo'));
    } finally {
      setToggling(null);
    }
  }

  const openNew = () => setWizard({ initial: null, startStep: 'identification' });
  const openEdit = (item: MarketAssetItem, startStep: WizardStartStep) => setWizard({ initial: item, startStep });

  function rowActions(item: MarketAssetItem, busyRow: boolean) {
    const st = statusByTicker.get(item.ticker.toUpperCase());
    const incomplete = needsCompletion(st?.completeness) && st?.completeness !== 'AWAITING_DATA';
    return (
      <div className="table-actions-group">
        {canOnboard ? (
          <Tooltip label="Completar cadastro" description="Abre o assistente na etapa de coletores para ligar o que falta.">
            <button
              type="button"
              className={`btn-table-icon${incomplete ? '' : ' table-actions-placeholder'}`}
              aria-label={`Completar cadastro de ${item.ticker}`}
              aria-hidden={incomplete ? undefined : true}
              tabIndex={incomplete ? undefined : -1}
              disabled={busyRow || !incomplete}
              onClick={() => openEdit(item, 'collectors')}
            >
              <ListChecks size={15} />
            </button>
          </Tooltip>
        ) : null}
        {pendingOff === item.ticker ? (
          <>
            <Tooltip label="Confirmar" description={`Desativa ${item.ticker} do catálogo.`}>
              <button
                type="button"
                className="btn-table-icon is-danger"
                aria-label={`Confirmar desativação de ${item.ticker}`}
                disabled={busyRow}
                onClick={() => { void deactivate(item.ticker); }}
              >
                <Check size={15} />
              </button>
            </Tooltip>
            <Tooltip label="Cancelar">
              <button type="button" className="btn-table-icon" aria-label="Cancelar desativação" onClick={() => setPendingOff(null)}>
                <X size={15} />
              </button>
            </Tooltip>
          </>
        ) : (
          <Tooltip label="Desativar" description="Sai da busca e dos picks. Coletores e MT5 seguem ligados.">
            <button
              type="button"
              className="btn-table-icon is-danger"
              aria-label={`Desativar ${item.ticker}`}
              disabled={busyRow}
              onClick={() => setPendingOff(item.ticker)}
            >
              <Power size={15} />
            </button>
          </Tooltip>
        )}
      </div>
    );
  }

  const tickerButton = (item: MarketAssetItem) => (
    canOnboard ? (
      <button
        type="button"
        className="market-catalog-ticker-btn"
        onClick={() => openEdit(item, 'identification')}
        title="Editar cadastro"
      >
        {item.ticker}
      </button>
    ) : (
      <strong>{item.ticker}</strong>
    )
  );

  const columns = 7;

  return (
    <div className="market-ops-catalog">
      {error ? (
        <div className="agent-test-result is-error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      {healthFailed && !loading ? (
        <p className="text-muted market-catalog-hint" role="status">
          O indicador de cadastro completo não está disponível agora (coletores ou MT5 fora do ar). A listagem segue funcionando.
        </p>
      ) : null}

      {orphans.length > 0 ? (
        <div className="agent-test-result is-error" role="status">
          <p style={{ margin: 0 }}>
            {orphans.length} ticker(s) com coletor ou MT5 <strong>sem cadastro no catálogo</strong>: {orphans.join(', ')}.
            Cadastre-os em “Novo ativo” ou desligue os coletores.
          </p>
        </div>
      ) : null}

      <div className="market-catalog-toolbar">
        <div className="search-input-wrapper audits-search-field">
          <Search size={16} className="search-icon" />
          <input
            id="catalog-filter"
            className="search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrar ticker, nome ou setor"
            aria-label="Filtrar catálogo"
          />
        </div>
        <select
          className="form-input audits-compact-select"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as '' | AssetClassType)}
          aria-label="Filtrar por tipo"
        >
          <option value="">Todos os tipos</option>
          {ASSET_TYPE_OPTIONS.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
        {health ? (
          <select
            className="form-input audits-compact-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as '' | 'PENDING')}
            aria-label="Filtrar por estado do cadastro"
          >
            {COMPLETENESS_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        ) : null}
        <span className="connections-summary-chip is-wait" aria-live="polite">
          {inBatch} no lote · {items.length} no catálogo{health ? ` · ${pendingCount} com pendências` : ''}
        </span>
        <Tooltip label="Atualizar lista">
          <button
            type="button"
            className="btn-table-icon"
            onClick={() => { void loadAll(); }}
            disabled={loading}
            aria-label={loading ? 'Atualizando lista' : 'Atualizar lista'}
          >
            <RefreshCw size={15} className={loading ? 'spin' : undefined} />
          </button>
        </Tooltip>
        {canOnboard ? (
          <button type="button" className="btn btn-primary btn-pill market-catalog-toolbar-cta" onClick={openNew}>
            <Plus size={15} />
            <span>Novo ativo</span>
          </button>
        ) : null}
      </div>

      <div className="hpanel-table-card desktop-table-view">
        <table className="hpanel-table">
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Nome</th>
              <th>Tipo</th>
              <th>Setor</th>
              <th>Cadastro</th>
              <th className="market-catalog-col-batch">Lote diário</th>
              <th className="cell-actions" style={{ textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 ? (
              <tr>
                <td colSpan={columns} style={{ textAlign: 'center', padding: '2.5rem', color: '#5f6368' }}>
                  Carregando catálogo…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={columns} style={{ textAlign: 'center', padding: '2.5rem', color: '#5f6368' }}>
                  {items.length === 0
                    ? (canOnboard ? 'Nenhum ativo no catálogo. Use “Novo ativo” para cadastrar o primeiro.' : 'Nenhum ativo no catálogo.')
                    : 'Nenhum ativo corresponde ao filtro.'}
                </td>
              </tr>
            ) : (
              filtered.map((item) => {
                const busyRow = toggling === item.ticker;
                return (
                  <tr key={item.ticker}>
                    <td>{tickerButton(item)}</td>
                    <td>{item.displayName || '—'}</td>
                    <td>
                      <span className={`market-asset-type-badge market-asset-type-badge--${(item.assetType || 'stock').toLowerCase().replace('_', '-')}`}>
                        {assetTypeLabel(item.assetType)}
                      </span>
                    </td>
                    <td>
                      {item.sectorLabel || '—'}
                      {item.segment ? <span className="text-muted"> · {item.segment}</span> : null}
                    </td>
                    <td><CompletenessBadge status={statusByTicker.get(item.ticker.toUpperCase())} loaded={health !== null} /></td>
                    <td className="market-catalog-col-batch">
                      <label className={`switch-wrapper${busyRow ? ' switch-wrapper-disabled' : ''}`}>
                        <input
                          className="switch-input"
                          type="checkbox"
                          checked={Boolean(item.hasRuns)}
                          disabled={busyRow}
                          onChange={(e) => { void setHasRuns(item.ticker, e.target.checked); }}
                          aria-label={`Lote diário de ${item.ticker}`}
                        />
                        <span className="switch-slider" />
                      </label>
                    </td>
                    <td className="cell-actions">{rowActions(item, busyRow)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mobile-cards-container">
        {filtered.map((item) => (
          <article key={item.ticker} className="mobile-domain-card">
            <div className="mobile-card-top">
              {tickerButton(item)}
              <span className={`market-asset-type-badge market-asset-type-badge--${(item.assetType || 'stock').toLowerCase().replace('_', '-')}`}>
                {assetTypeLabel(item.assetType)}
              </span>
            </div>
            <div className="mobile-card-subinfo">{item.displayName || 'Sem nome'}</div>
            <div className="mobile-card-meta">{item.sectorLabel || 'Sem setor'}</div>
            <div style={{ marginTop: '0.4rem' }}>
              <CompletenessBadge status={statusByTicker.get(item.ticker.toUpperCase())} loaded={health !== null} />
            </div>
            <label className="market-catalog-toggle" style={{ marginTop: '0.75rem' }}>
              <input
                type="checkbox"
                checked={Boolean(item.hasRuns)}
                disabled={toggling === item.ticker}
                onChange={(e) => { void setHasRuns(item.ticker, e.target.checked); }}
              />
              <span>Lote diário</span>
            </label>
            <div className="mobile-card-actions" style={{ marginTop: '0.5rem' }}>{rowActions(item, toggling === item.ticker)}</div>
          </article>
        ))}
      </div>

      {wizard ? (
        <AssetOnboardingWizard
          initial={wizard.initial}
          startStep={wizard.startStep}
          sectorHints={sectorHints}
          onReport={onReport}
          onViewInCatalog={(ticker) => { setQuery(ticker); setStatusFilter(''); setTypeFilter(''); }}
          onClose={() => setWizard(null)}
        />
      ) : null}
    </div>
  );
};
