import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getSettings,
  getSettingsPreview,
  toAgentError,
  updateSettings,
  type AgentApiError,
  type AgentCapital,
  type AgentConta,
  type SettingsPreview,
  type SettingsResponse,
  type TradingSettings,
} from '../../../services/agentOrdersService';
import { AgentDialog } from './AgentDialog';
import { ContaBadge } from './AgentBadges';
import { money, pct, qty } from './agentFormat';

type Unit = 'brl' | 'pct' | 'int' | 'num';
/** `max`: o sistema é teto (usuário só abaixa). `min`: o sistema é piso (usuário só sobe). `info`: o ms decide. */
type LimitKind = 'max' | 'min' | 'info';

interface NumField {
  path: string;
  label: string;
  unit: Unit;
  step: number;
  kind: LimitKind;
  help?: string;
}

const GROUPS: { title: string; fields: NumField[] }[] = [
  {
    title: 'Capital',
    fields: [
      { path: 'capital.capitalTrade', label: 'Capital de trade', unit: 'brl', step: 100, kind: 'max', help: 'Quanto o motor pode usar. O resto da conta não é tocado.' },
      { path: 'capital.maxPctInvestido', label: 'Investido máximo', unit: 'pct', step: 1, kind: 'max', help: 'Quanto do capital pode estar em posições + ordens ao mesmo tempo.' },
      { path: 'capital.reservaMinima', label: 'Reserva mínima', unit: 'brl', step: 100, kind: 'min', help: 'Quanto nunca é usado, aconteça o que acontecer.' },
    ],
  },
  {
    title: 'Por operação',
    fields: [
      { path: 'porOperacao.riscoPorTradePct', label: 'Risco por operação', unit: 'pct', step: 0.05, kind: 'max', help: 'Quanto se perde do capital se o stop executar.' },
      { path: 'porOperacao.maxPctPorCompra', label: 'Máximo por compra', unit: 'pct', step: 1, kind: 'max', help: 'Quanto uma compra pode representar do disponível naquele momento.' },
      { path: 'porOperacao.valorMaximoOrdem', label: 'Valor máximo por ordem', unit: 'brl', step: 100, kind: 'max', help: 'Teto absoluto em R$ (proteção contra dedo gordo).' },
    ],
  },
  {
    title: 'Concentração',
    fields: [
      { path: 'concentracao.maxPctPorAtivo', label: 'Máximo por ativo', unit: 'pct', step: 1, kind: 'max' },
      { path: 'concentracao.maxPctPorSetor', label: 'Máximo por setor', unit: 'pct', step: 1, kind: 'max' },
      { path: 'concentracao.maxPosicoes', label: 'Posições ao mesmo tempo', unit: 'int', step: 1, kind: 'max' },
      { path: 'concentracao.maxEntradasDia', label: 'Entradas por dia', unit: 'int', step: 1, kind: 'max' },
    ],
  },
  {
    title: 'Risco da carteira',
    fields: [
      { path: 'risco.riscoAbertoMaxPct', label: 'Risco aberto máximo', unit: 'pct', step: 0.1, kind: 'max' },
      { path: 'risco.estresseGapPct', label: 'Estresse de gap', unit: 'pct', step: 0.5, kind: 'info' },
      { path: 'risco.liquidezMinADV', label: 'Liquidez mínima (volume diário)', unit: 'brl', step: 100000, kind: 'min' },
      { path: 'risco.custoPorAcao', label: 'Custo por ação', unit: 'brl', step: 0.01, kind: 'info' },
    ],
  },
  {
    title: 'Limites de perda',
    fields: [
      { path: 'perdas.diariaPct', label: 'Perda diária', unit: 'pct', step: 0.5, kind: 'max' },
      { path: 'perdas.mensalPct', label: 'Perda mensal', unit: 'pct', step: 0.5, kind: 'max' },
      { path: 'perdas.drawdownPicoPct', label: 'Queda máxima desde o pico', unit: 'pct', step: 0.5, kind: 'max' },
      { path: 'perdas.stopsSeguidos', label: 'Stops seguidos', unit: 'int', step: 1, kind: 'max' },
      { path: 'perdas.stopsPorAtivo30d', label: 'Stops por ativo em 30 dias', unit: 'int', step: 1, kind: 'max' },
    ],
  },
  {
    title: 'Pirâmide (comprar mais)',
    fields: [
      { path: 'piramide.kAtr', label: 'Distância entre adições (× ATR)', unit: 'num', step: 0.1, kind: 'info' },
      { path: 'piramide.maxAdicoes', label: 'Máximo de adições', unit: 'int', step: 1, kind: 'max' },
    ],
  },
];

const CANAIS = [
  { id: 'PUSH', label: 'Push' },
  { id: 'EMAIL', label: 'E-mail' },
];

function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, k) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined), obj);
}

function setPath<T>(obj: T, path: string, value: unknown): T {
  const clone = structuredClone(obj) as Record<string, unknown>;
  const keys = path.split('.');
  let cur = clone;
  for (let i = 0; i < keys.length - 1; i++) {
    const next = cur[keys[i]];
    cur[keys[i]] = next && typeof next === 'object' ? next : {};
    cur = cur[keys[i]] as Record<string, unknown>;
  }
  cur[keys[keys.length - 1]] = value;
  return clone as T;
}

function fmtLimit(v: number, unit: Unit): string {
  if (unit === 'brl') return money(v);
  if (unit === 'pct') return pct(v, v % 1 === 0 ? 0 : 2);
  return v.toLocaleString('pt-BR');
}

function parseList(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
}

interface AgentSettingsDrawerProps {
  isOpen: boolean;
  conta: AgentConta;
  capital: AgentCapital | null;
  suggestedTicker?: string;
  onClose: () => void;
  onSaved: () => void;
}

export function AgentSettingsDrawer({ isOpen, conta, capital, suggestedTicker, onClose, onSaved }: AgentSettingsDrawerProps) {
  const [resp, setResp] = useState<SettingsResponse | null>(null);
  const [draft, setDraft] = useState<TradingSettings | null>(null);
  const [listDraft, setListDraft] = useState({ permitidos: '', bloqueados: '' });
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<AgentApiError | null>(null);
  const [saveError, setSaveError] = useState<AgentApiError | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [realAck, setRealAck] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    setSaveError(null);
    getSettings(conta)
      .then((r) => {
        setResp(r);
        setDraft(structuredClone(r.settings));
        setListDraft({
          permitidos: (r.settings.ativos?.permitidos ?? []).join(', '),
          bloqueados: (r.settings.ativos?.bloqueados ?? []).join(', '),
        });
      })
      .catch((err) => setLoadError(toAgentError(err)))
      .finally(() => setLoading(false));
  }, [conta]);

  useEffect(() => {
    if (!isOpen) return;
    setSavedAt(null);
    setRealAck(false);
    load();
  }, [isOpen, load]);

  const errors = useMemo(() => {
    const out: Record<string, string> = {};
    if (!draft || !resp) return out;
    for (const g of GROUPS) {
      for (const f of g.fields) {
        const v = getPath(draft, f.path);
        if (typeof v !== 'number' || Number.isNaN(v)) {
          out[f.path] = 'Preencha um número.';
          continue;
        }
        if (v < 0) {
          out[f.path] = 'Não pode ser negativo.';
          continue;
        }
        const lim = getPath(resp.tetos, f.path);
        if (typeof lim === 'number') {
          if (f.kind === 'max' && v > lim) out[f.path] = `Acima do teto do sistema (${fmtLimit(lim, f.unit)}).`;
          if (f.kind === 'min' && v < lim) out[f.path] = `Abaixo do mínimo do sistema (${fmtLimit(lim, f.unit)}).`;
        }
      }
    }
    for (const campo of saveError?.campos ?? []) {
      const match = GROUPS.flatMap((g) => g.fields).find((f) => f.path === campo || f.path.endsWith(`.${campo}`));
      if (match && !out[match.path]) out[match.path] = 'O servidor recusou: acima do teto.';
    }
    return out;
  }, [draft, resp, saveError]);

  const finalDraft = useMemo<TradingSettings | null>(() => {
    if (!draft) return null;
    return setPath(draft, 'ativos', {
      permitidos: parseList(listDraft.permitidos),
      bloqueados: parseList(listDraft.bloqueados),
    });
  }, [draft, listDraft]);

  const dirty = Boolean(resp && finalDraft && JSON.stringify(finalDraft) !== JSON.stringify(resp.settings));
  const hasErrors = Object.keys(errors).length > 0;
  const needsRealAck = conta === 'REAL' && !realAck;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resp || !finalDraft || hasErrors || needsRealAck) return;
    setSaving(true);
    setSaveError(null);
    try {
      const next = await updateSettings(conta, resp.version, finalDraft);
      setResp(next);
      setDraft(structuredClone(next.settings));
      setSavedAt(Date.now());
      onSaved();
    } catch (err) {
      setSaveError(toAgentError(err));
    } finally {
      setSaving(false);
    }
  };

  const setField = (path: string, value: unknown) => {
    setDraft((d) => (d ? setPath(d, path, value) : d));
    setSavedAt(null);
  };

  return (
    <AgentDialog
      isOpen={isOpen}
      onClose={onClose}
      busy={saving}
      variant="drawer"
      title="Configurações do agente"
      subtitle={
        <>
          Conta <ContaBadge conta={conta} /> · você pode apertar os limites do sistema, nunca afrouxar.
          {resp ? <> Versão {resp.version}{resp.updatedBy ? ` · por ${resp.updatedBy}` : ''}.</> : null}
        </>
      }
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Fechar</button>
          <button
            type="submit"
            form="ao-settings-form"
            className={conta === 'REAL' ? 'btn btn-danger-solid' : 'btn btn-primary'}
            disabled={!dirty || hasErrors || saving || needsRealAck || !resp}
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </>
      }
    >
      {loading && !resp ? (
        <div aria-busy="true" aria-label="Carregando configurações"><div className="portfolio-skeleton" /></div>
      ) : loadError ? (
        <div className="trade-state" role="alert">
          <p>{loadError.message}</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={load}>Tentar de novo</button>
        </div>
      ) : draft && resp ? (
        <form id="ao-settings-form" onSubmit={save} noValidate>
          <SettingsPreviewBox conta={conta} capital={capital} suggestedTicker={suggestedTicker} reloadKey={resp.version} dirty={dirty} />

          {saveError ? (
            <div className="ao-callout is-danger" role="alert">
              {saveError.message}
              {saveError.code === 'SETTINGS_VERSION_MISMATCH' ? (
                <button type="button" className="link-btn bold" onClick={load}>Recarregar (descarta suas mudanças)</button>
              ) : null}
            </div>
          ) : null}
          {savedAt ? <div className="ao-callout is-success" role="status">Salvo. Vale a partir do próximo ciclo; as propostas abertas são recalculadas.</div> : null}

          <div className="form-group">
            <label htmlFor="ao-modo-qtd" className="form-label">Modo de quantidade</label>
            <select
              id="ao-modo-qtd"
              className="form-input"
              value={draft.modoQuantidade}
              onChange={(e) => setField('modoQuantidade', e.target.value)}
            >
              {Array.from(new Set([draft.modoQuantidade, 'FRACAO', 'LOTE'])).map((m) => (
                <option key={m} value={m}>{m === 'FRACAO' ? 'Lote + fracionário' : m === 'LOTE' ? 'Só lote padrão' : m}</option>
              ))}
            </select>
          </div>

          {GROUPS.map((g) => (
            <fieldset key={g.title} className="ao-fieldset">
              <legend>{g.title}</legend>
              {g.title.startsWith('Pirâmide') ? (
                <label className="ao-check">
                  <input
                    type="checkbox"
                    checked={Boolean(draft.piramide?.habilitada)}
                    onChange={(e) => setField('piramide.habilitada', e.target.checked)}
                  />
                  Permitir comprar mais em posição que já está no lucro
                </label>
              ) : null}
              <div className="ao-field-grid">
                {g.fields.map((f) => {
                  const id = `ao-cfg-${f.path.replace('.', '-')}`;
                  const v = getPath(draft, f.path);
                  const lim = getPath(resp.tetos, f.path);
                  const eff = getPath(resp.efetiva, f.path);
                  const err = errors[f.path];
                  const hintId = `${id}-hint`;
                  return (
                    <div key={f.path} className={`form-group ao-field${err ? ' has-error' : ''}`}>
                      <label htmlFor={id} className="form-label">
                        {f.label} {f.unit === 'pct' ? <span className="table-cell-muted">(%)</span> : f.unit === 'brl' ? <span className="table-cell-muted">(R$)</span> : null}
                      </label>
                      <input
                        id={id}
                        type="number"
                        inputMode="decimal"
                        className="form-input"
                        step={f.step}
                        min={0}
                        value={typeof v === 'number' && !Number.isNaN(v) ? v : ''}
                        onChange={(e) => setField(f.path, e.target.value === '' ? Number.NaN : Number(e.target.value))}
                        aria-invalid={Boolean(err)}
                        aria-describedby={hintId}
                      />
                      <span id={hintId} className={`ao-field-hint${err ? ' is-error' : ''}`}>
                        {err
                          ? err
                          : [
                              typeof lim === 'number'
                                ? `${f.kind === 'min' ? 'Mínimo' : f.kind === 'max' ? 'Teto' : 'Sistema'}: ${fmtLimit(lim, f.unit)}`
                                : null,
                              typeof eff === 'number' && eff !== v ? `em uso: ${fmtLimit(eff, f.unit)}` : null,
                              f.help ?? null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                      </span>
                    </div>
                  );
                })}
              </div>
            </fieldset>
          ))}

          <fieldset className="ao-fieldset">
            <legend>Ativos</legend>
            <div className="form-group">
              <label htmlFor="ao-cfg-permitidos" className="form-label">Só operar estes (vazio = todos do plano)</label>
              <input
                id="ao-cfg-permitidos"
                className="form-input"
                value={listDraft.permitidos}
                onChange={(e) => setListDraft((l) => ({ ...l, permitidos: e.target.value }))}
                placeholder="PETR4, VALE3"
              />
            </div>
            <div className="form-group">
              <label htmlFor="ao-cfg-bloqueados" className="form-label">Nunca operar</label>
              <input
                id="ao-cfg-bloqueados"
                className="form-input"
                value={listDraft.bloqueados}
                onChange={(e) => setListDraft((l) => ({ ...l, bloqueados: e.target.value }))}
                placeholder="MGLU3"
              />
            </div>
          </fieldset>

          <fieldset className="ao-fieldset">
            <legend>Notificações</legend>
            {CANAIS.map((c) => (
              <label key={c.id} className="ao-check">
                <input
                  type="checkbox"
                  checked={draft.notificacoes?.canais?.includes(c.id) ?? false}
                  onChange={(e) => {
                    const atual = draft.notificacoes?.canais ?? [];
                    setField('notificacoes.canais', e.target.checked ? [...atual, c.id] : atual.filter((x) => x !== c.id));
                  }}
                />
                {c.label}
              </label>
            ))}
            <label className="ao-check">
              <input
                type="checkbox"
                checked={Boolean(draft.notificacoes?.silencioForaDoPregao)}
                onChange={(e) => setField('notificacoes.silencioForaDoPregao', e.target.checked)}
              />
              Silêncio fora do pregão
            </label>
          </fieldset>

          {conta === 'REAL' ? (
            <label className="ao-check ao-real-ack">
              <input type="checkbox" checked={realAck} onChange={(e) => setRealAck(e.target.checked)} />
              Entendo que estou alterando as regras da conta <strong>REAL</strong>.
            </label>
          ) : null}
        </form>
      ) : null}
    </AgentDialog>
  );
}

/** Prévia: quantas ações uma compra daria com a configuração SALVA e o saldo atual (GET settings/preview). */
function SettingsPreviewBox({
  conta,
  capital,
  suggestedTicker,
  reloadKey,
  dirty,
}: {
  conta: AgentConta;
  capital: AgentCapital | null;
  suggestedTicker?: string;
  reloadKey: number;
  dirty: boolean;
}) {
  const [ticker, setTicker] = useState(suggestedTicker || 'PETR4');
  const [preview, setPreview] = useState<SettingsPreview | null>(null);
  const [error, setError] = useState<AgentApiError | null>(null);
  const [loading, setLoading] = useState(false);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    const t = ticker.trim().toUpperCase();
    if (t.length < 4) {
      setPreview(null);
      return;
    }
    const id = window.setTimeout(() => {
      ctrl.current?.abort();
      const c = new AbortController();
      ctrl.current = c;
      setLoading(true);
      getSettingsPreview(conta, t, c.signal)
        .then((p) => {
          if (c.signal.aborted) return;
          setPreview(p);
          setError(null);
        })
        .catch((err) => {
          if (c.signal.aborted) return;
          setPreview(null);
          setError(toAgentError(err));
        })
        .finally(() => {
          if (!c.signal.aborted) setLoading(false);
        });
    }, 400);
    return () => window.clearTimeout(id);
  }, [ticker, conta, reloadKey]);

  useEffect(() => () => ctrl.current?.abort(), []);

  return (
    <section className="ao-preview" aria-labelledby="ao-preview-title" aria-busy={loading}>
      <div className="ao-preview-head">
        <h4 id="ao-preview-title">Prévia de uma compra</h4>
        <label className="ao-preview-ticker">
          <span className="sr-only">Ativo da prévia</span>
          <input
            className="form-input"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            maxLength={8}
            aria-label="Ativo da prévia"
          />
        </label>
      </div>
      <p className="ao-preview-line" aria-live="polite">
        {capital ? <>Disponível <strong>{money(capital.disponivel)}</strong> · Investido <strong>{pct(capital.pctInvestido, 0)}</strong> · </> : null}
        {preview ? (
          <>
            uma compra de <strong>{preview.ticker}</strong> = <strong>{qty(preview.quantidade)} ações</strong> = {money(preview.valor)} ={' '}
            {pct(preview.pctDisponivel, 0)} do disponível → investido passa a <strong>{pct(preview.pctInvestidoDepois, 0)}</strong>.
            Risco {money(preview.risco.valor)} ({pct(preview.risco.pctCapital, 2)}). Quem limitou: <code>{preview.limitante}</code>.
          </>
        ) : error ? (
          <span className="ao-field-hint is-error">{error.message}</span>
        ) : loading ? (
          'calculando…'
        ) : (
          'digite um ativo.'
        )}
      </p>
      {dirty ? <p className="ao-field-hint">A prévia usa a configuração salva. Salve para ver o efeito das mudanças.</p> : null}
    </section>
  );
}
