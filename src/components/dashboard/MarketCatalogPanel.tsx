import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Search } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import {
  createCatalogAsset,
  isValidTicker,
  listCatalogTickers,
  updateCatalogAsset,
  type AssetClassType,
  type MarketAssetItem,
} from '../../services/analystService';

const ASSET_TYPES: ReadonlyArray<{ value: AssetClassType; label: string }> = [
  { value: 'STOCK', label: 'Ação' },
  { value: 'FII', label: 'FII' },
  { value: 'FI_INFRA', label: 'FI-Infra' },
  { value: 'FIAGRO', label: 'Fiagro' },
  { value: 'BDR', label: 'BDR' },
  { value: 'ETF', label: 'ETF' },
];

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
  return ASSET_TYPES.find((item) => item.value === type)?.label || type || '—';
}

const emptyForm = {
  ticker: '',
  displayName: '',
  assetType: 'STOCK' as AssetClassType,
  sectorLabel: '',
  segment: '',
  hasRuns: false,
};

export const MarketCatalogPanel: React.FC = () => {
  const { addToast } = useToast();
  const [items, setItems] = useState<MarketAssetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'' | AssetClassType>('');
  const [form, setForm] = useState(emptyForm);
  const [pendingOff, setPendingOff] = useState<string | null>(null);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await listCatalogTickers();
      setItems(res.items ?? []);
    } catch (err) {
      setError(mapCatalogError(err, 'Falha ao carregar o catálogo'));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    return items.filter((item) => {
      if (typeFilter && item.assetType !== typeFilter) return false;
      if (!q) return true;
      return (
        item.ticker.toUpperCase().includes(q)
        || (item.displayName || '').toUpperCase().includes(q)
        || (item.sectorLabel || '').toUpperCase().includes(q)
        || (item.segment || '').toUpperCase().includes(q)
      );
    });
  }, [items, query, typeFilter]);

  const inBatch = items.filter((item) => item.hasRuns).length;
  const tickerOk = isValidTicker(form.ticker);
  const canSave = tickerOk && Boolean(form.assetType) && !saving;

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

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSave) {
      setError('Informe um ticker válido e o tipo do ativo.');
      return;
    }
    setSaving(true);
    setError('');
    const ticker = form.ticker.trim().toUpperCase();
    const existed = items.some((item) => item.ticker.toUpperCase() === ticker);
    try {
      const saved = await createCatalogAsset({
        ticker,
        displayName: form.displayName.trim() || ticker,
        assetType: form.assetType,
        sectorLabel: form.sectorLabel.trim(),
        segment: form.segment.trim(),
        isActive: true,
        hasRuns: form.hasRuns,
      });
      setItems((prev) => {
        const next = prev.filter((item) => item.ticker.toUpperCase() !== ticker);
        return [...next, saved].sort((a, b) => a.ticker.localeCompare(b.ticker));
      });
      addToast({
        type: 'success',
        title: existed ? `${ticker} atualizado` : `${ticker} no catálogo`,
        description: form.hasRuns
          ? 'Entra no lote diário. Cadastro não coleta fatos — sem agent, a análise falha.'
          : 'Disponível na busca e nos picks. Não entra no lote até ligar “lote diário”.',
      });
      setForm(emptyForm);
    } catch (err) {
      setError(mapCatalogError(err, 'Falha ao salvar o ativo'));
    } finally {
      setSaving(false);
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
        description: 'Sai da busca e dos picks. Para reativar, cadastre o ticker de novo.',
      });
    } catch (err) {
      setError(mapCatalogError(err, 'Falha ao desativar o ativo'));
    } finally {
      setToggling(null);
    }
  }

  function fillForm(item: MarketAssetItem) {
    setForm({
      ticker: item.ticker,
      displayName: item.displayName || '',
      assetType: (item.assetType || 'STOCK') as AssetClassType,
      sectorLabel: item.sectorLabel || '',
      segment: item.segment || '',
      hasRuns: Boolean(item.hasRuns),
    });
  }

  return (
    <div className="market-ops-catalog">
      <p className="text-muted market-desk-hint">
        Cadastro grava em <code>market_assets</code>. Disponível no catálogo ≠ entra no lote diário.
        Fatos vêm dos agents de coleta — sem coleta, analisar falha.
      </p>

      <form className="market-catalog-form" onSubmit={onSubmit}>
        <div className="market-catalog-form-grid">
          <div className="llm-form-field">
            <label className="form-label" htmlFor="catalog-ticker">Ticker</label>
            <input
              id="catalog-ticker"
              className="form-input"
              name="ticker"
              value={form.ticker}
              onChange={(e) => setForm((prev) => ({ ...prev, ticker: e.target.value.toUpperCase() }))}
              maxLength={6}
              autoComplete="off"
              spellCheck={false}
              placeholder="PETR4"
              aria-describedby="catalog-ticker-hint"
            />
            <span id="catalog-ticker-hint" className="text-muted market-catalog-hint">4 a 6 caracteres.</span>
          </div>
          <div className="llm-form-field">
            <label className="form-label" htmlFor="catalog-name">Nome</label>
            <input
              id="catalog-name"
              className="form-input"
              name="displayName"
              value={form.displayName}
              onChange={(e) => setForm((prev) => ({ ...prev, displayName: e.target.value }))}
              placeholder="Petrobras PN"
            />
          </div>
          <div className="llm-form-field">
            <label className="form-label" htmlFor="catalog-type">Tipo</label>
            <select
              id="catalog-type"
              className="form-input"
              name="assetType"
              value={form.assetType}
              onChange={(e) => setForm((prev) => ({ ...prev, assetType: e.target.value as AssetClassType }))}
            >
              {ASSET_TYPES.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </div>
          <div className="llm-form-field">
            <label className="form-label" htmlFor="catalog-sector">Setor</label>
            <input
              id="catalog-sector"
              className="form-input"
              name="sectorLabel"
              value={form.sectorLabel}
              onChange={(e) => setForm((prev) => ({ ...prev, sectorLabel: e.target.value }))}
              list="catalog-sector-list"
              placeholder="Petróleo e gás"
            />
            <datalist id="catalog-sector-list">
              {sectorHints.map((label) => (
                <option key={label} value={label} />
              ))}
            </datalist>
          </div>
          <div className="llm-form-field">
            <label className="form-label" htmlFor="catalog-segment">Segmento</label>
            <input
              id="catalog-segment"
              className="form-input"
              name="segment"
              value={form.segment}
              onChange={(e) => setForm((prev) => ({ ...prev, segment: e.target.value }))}
              placeholder="Opcional"
            />
          </div>
        </div>

        <label className="market-catalog-toggle">
          <input
            type="checkbox"
            checked={form.hasRuns}
            onChange={(e) => setForm((prev) => ({ ...prev, hasRuns: e.target.checked }))}
          />
          <span>Entra no lote diário (<code>hasRuns</code>) — custa uma análise por dia útil</span>
        </label>

        <div className="market-catalog-form-actions">
          <button type="submit" className="btn btn-primary btn-pill" disabled={!canSave}>
            <Plus size={15} />
            <span>{saving ? 'Salvando…' : 'Salvar no catálogo'}</span>
          </button>
        </div>
      </form>

      {error ? (
        <div className="agent-test-result is-error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      <div className="audits-filter-row audits-filter-row-primary market-desk-toolbar-primary">
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
          {ASSET_TYPES.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
        <span className="connections-summary-chip is-wait" aria-live="polite">
          {inBatch} no lote · {items.length} no catálogo
        </span>
        <button
          type="button"
          className="btn btn-secondary btn-pill"
          onClick={() => { void loadCatalog(); }}
          disabled={loading}
        >
          <RefreshCw size={15} />
          <span>{loading ? 'Atualizando…' : 'Atualizar lista'}</span>
        </button>
      </div>

      <div className="hpanel-table-card desktop-table-view">
        <table className="hpanel-table">
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Nome</th>
              <th>Tipo</th>
              <th>Setor</th>
              <th>Lote diário</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: '#5f6368' }}>
                  Carregando catálogo…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: '#5f6368' }}>
                  {items.length === 0
                    ? 'Nenhum ativo no catálogo. Cadastre o primeiro ticker acima.'
                    : 'Nenhum ativo corresponde ao filtro.'}
                </td>
              </tr>
            ) : (
              filtered.map((item) => {
                const busyRow = toggling === item.ticker;
                return (
                  <tr key={item.ticker}>
                    <td>
                      <button
                        type="button"
                        className="market-catalog-ticker-btn"
                        onClick={() => fillForm(item)}
                      >
                        {item.ticker}
                      </button>
                    </td>
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
                    <td>
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
                    <td>
                      {pendingOff === item.ticker ? (
                        <div className="market-catalog-confirm">
                          <button
                            type="button"
                            className="btn btn-primary btn-pill"
                            disabled={busyRow}
                            onClick={() => { void deactivate(item.ticker); }}
                          >
                            Confirmar
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-pill"
                            onClick={() => setPendingOff(null)}
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-secondary btn-pill"
                          disabled={busyRow}
                          onClick={() => setPendingOff(item.ticker)}
                        >
                          Desativar
                        </button>
                      )}
                    </td>
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
              <button type="button" className="market-catalog-ticker-btn" onClick={() => fillForm(item)}>
                {item.ticker}
              </button>
              <span className={`market-asset-type-badge market-asset-type-badge--${(item.assetType || 'stock').toLowerCase().replace('_', '-')}`}>
                {assetTypeLabel(item.assetType)}
              </span>
            </div>
            <div className="mobile-card-subinfo">{item.displayName || 'Sem nome'}</div>
            <div className="mobile-card-meta">{item.sectorLabel || 'Sem setor'}</div>
            <label className="market-catalog-toggle" style={{ marginTop: '0.75rem' }}>
              <input
                type="checkbox"
                checked={Boolean(item.hasRuns)}
                disabled={toggling === item.ticker}
                onChange={(e) => { void setHasRuns(item.ticker, e.target.checked); }}
              />
              <span>Lote diário</span>
            </label>
            {pendingOff === item.ticker ? (
              <div className="market-catalog-confirm" style={{ marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-primary btn-pill" onClick={() => { void deactivate(item.ticker); }}>
                  Confirmar desativar
                </button>
                <button type="button" className="btn btn-secondary btn-pill" onClick={() => setPendingOff(null)}>
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-secondary btn-pill"
                style={{ marginTop: '0.5rem' }}
                onClick={() => setPendingOff(item.ticker)}
              >
                Desativar
              </button>
            )}
          </article>
        ))}
      </div>
    </div>
  );
};
