import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Loader2, MinusCircle, XCircle } from 'lucide-react';
import { Modal } from '../common/Modal';
import {
  isValidTicker,
  listCollectorTypes,
  onboardAsset,
  type AssetClassType,
  type CollectorTypeOption,
  type MarketAssetItem,
  type OnboardingReport,
  type OnboardingRequest,
  type OnboardingStepName,
  type OnboardingStepStatus,
} from '../../services/analystService';
import {
  ASSET_CLASS_BY_TYPE,
  ASSET_TYPE_OPTIONS,
  MT5_TIPO_BY_ASSET_TYPE,
  formatCnpjMask,
  isValidCnpj,
  isValidIsin,
  isValidMt5Symbol,
} from '../../utils/assetValidators';


const STEPS = [
  { id: 'identification', label: 'Identificação' },
  { id: 'classification', label: 'Classificação' },
  { id: 'collectors', label: 'Coletores' },
  { id: 'mt5', label: 'MT5' },
  { id: 'analysis', label: 'Análise' },
  { id: 'review', label: 'Revisão' },
] as const;

const STEP_INDEX = { identification: 0, classification: 1, collectors: 2, mt5: 3, analysis: 4, review: 5 } as const;
export type WizardStartStep = keyof typeof STEP_INDEX;

const RESULT_ROWS: ReadonlyArray<{ name: OnboardingStepName; label: string }> = [
  { name: 'catalog', label: 'Catálogo de ativos' },
  { name: 'collectors', label: 'Coletores de dados' },
  { name: 'mt5', label: 'MetaTrader 5' },
  { name: 'runsActivation', label: 'Análise diária (lote)' },
];

/** Código de erro do BFF → texto para o operador. */
function stepErrorText(code?: string, message?: string): string {
  switch (code) {
    case 'UPSTREAM_UNAVAILABLE':
      return 'Serviço indisponível no momento. Tente de novo em instantes.';
    case 'ASSET_OWNED_BY_OTHER_COMPANY':
      return 'Este ativo pertence a outra organização.';
    case 'COLLECTORS_FAILED':
      return 'Não solicitada: algum coletor falhou. Tente de novo os coletores primeiro.';
    case 'INVALID_ASSET_TYPE':
      return 'Tipo de ativo inválido.';
    case undefined:
    case '':
      return message || '';
    default:
      return message ? `${message} (${code})` : code;
  }
}

function overallResult(steps: OnboardingReport['steps']): OnboardingReport['result'] {
  const all = [steps.catalog.status, steps.collectors.status, steps.mt5.status, steps.runsActivation.status];
  if (all.includes('FAILED')) return 'PARTIAL';
  if (steps.runsActivation.status === 'PENDING') return 'AWAITING_DATA';
  return 'COMPLETED';
}

/** Junta o resultado de um retry de uma etapa ao relatório anterior (as demais etapas voltam SKIPPED). */
function mergeReport(prev: OnboardingReport, next: OnboardingReport, step: OnboardingStepName): OnboardingReport {
  const steps = { ...prev.steps, [step]: next.steps[step] } as OnboardingReport['steps'];
  // O catálogo sempre roda de novo no retry; se ele passou a falhar, isso vale.
  steps.catalog = next.steps.catalog;
  return { ...prev, steps, result: overallResult(steps), correlationId: next.correlationId };
}

function StatusIcon({ status }: { status: OnboardingStepStatus }) {
  switch (status) {
    case 'OK':
      return <CheckCircle2 size={18} className="onb-icon is-ok" aria-hidden="true" />;
    case 'FAILED':
      return <XCircle size={18} className="onb-icon is-error" aria-hidden="true" />;
    case 'PENDING':
      return <Clock size={18} className="onb-icon is-wait" aria-hidden="true" />;
    default:
      return <MinusCircle size={18} className="onb-icon is-off" aria-hidden="true" />;
  }
}

const STATUS_TEXT: Record<OnboardingStepStatus, string> = {
  OK: 'Feito',
  FAILED: 'Falhou',
  PENDING: 'Aguardando dados',
  SKIPPED: 'Não solicitado',
};

interface WizardProps {
  onClose: () => void;
  /** Chamado a cada relatório recebido (cadastro ou retry), para o painel atualizar a lista. */
  onReport: (report: OnboardingReport) => void;
  onViewInCatalog: (ticker: string) => void;
  /** Ativo existente: pré-preenche o formulário ("Completar cadastro"). */
  initial?: MarketAssetItem | null;
  startStep?: WizardStartStep;
  sectorHints: string[];
}

export const AssetOnboardingWizard: React.FC<WizardProps> = ({
  onClose, onReport, onViewInCatalog, initial, startStep = 'identification', sectorHints,
}) => {
  const [step, setStep] = useState<number>(STEP_INDEX[startStep]);
  const [phase, setPhase] = useState<'form' | 'sending' | 'result'>('form');
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const [ticker, setTicker] = useState(initial?.ticker ?? '');
  const [displayName, setDisplayName] = useState(initial?.displayName ?? '');
  const [assetType, setAssetType] = useState<AssetClassType>((initial?.assetType as AssetClassType) ?? 'STOCK');
  const [cnpj, setCnpj] = useState(initial?.cnpj ?? '');
  const [isin, setIsin] = useState(initial?.isin ?? '');
  const [sectorLabel, setSectorLabel] = useState(initial?.sectorLabel ?? '');
  const [segment, setSegment] = useState(initial?.segment ?? '');
  const [issuerGroup, setIssuerGroup] = useState('');
  const [isFinancial, setIsFinancial] = useState(false);
  const [isUtility, setIsUtility] = useState(false);
  const [isCyclical, setIsCyclical] = useState(false);

  const [types, setTypes] = useState<{ state: 'idle' | 'loading' | 'error' | 'ready'; items: CollectorTypeOption[]; forType: string }>(
    { state: 'idle', items: [], forType: '' },
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const collectorsTouched = useRef(false);
  const [runNow, setRunNow] = useState(true);

  const [mt5Enabled, setMt5Enabled] = useState(true);
  const [mt5Symbol, setMt5Symbol] = useState('');
  const [mt5SymbolEdited, setMt5SymbolEdited] = useState(false);
  const [activateRuns, setActivateRuns] = useState(true);

  const [report, setReport] = useState<OnboardingReport | null>(null);
  const [retrying, setRetrying] = useState<OnboardingStepName | null>(null);
  const [error, setError] = useState('');
  const [serverFields, setServerFields] = useState<Record<string, string>>({});
  const headingRef = useRef<HTMLHeadingElement>(null);

  const tickerNorm = ticker.trim().toUpperCase();
  const symbolNorm = (mt5SymbolEdited ? mt5Symbol : tickerNorm).trim().toUpperCase();

  // Erros inline (só aparecem depois que o campo foi tocado, ou como retorno do servidor).
  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!isValidTicker(tickerNorm)) e.ticker = 'Use 4 a 6 letras/dígitos (ex.: PETR4, BTCI11).';
    if (cnpj.trim() && !isValidCnpj(cnpj)) e.cnpj = 'CNPJ inválido (dígitos verificadores não conferem).';
    if (isin.trim() && !isValidIsin(isin)) e.isin = 'ISIN inválido (formato ou dígito verificador).';
    if (mt5Enabled && !isValidMt5Symbol(symbolNorm)) e.mt5Symbol = 'Use 4 a 12 letras/dígitos.';
    return e;
  }, [tickerNorm, cnpj, isin, mt5Enabled, symbolNorm]);

  const fieldError = (name: string): string => (touched[name] ? errors[name] : '') || serverFields[name] || '';
  const touch = (name: string) => setTouched((prev) => ({ ...prev, [name]: true }));

  const stepBlocked = (index: number): boolean => {
    if (index === 0) return Boolean(errors.ticker || errors.cnpj || errors.isin);
    if (index === 3) return Boolean(errors.mt5Symbol);
    return false;
  };

  // Carrega as fontes de coleta do tipo escolhido ao chegar na etapa de coletores.
  useEffect(() => {
    if (phase !== 'form' || step !== STEP_INDEX.collectors || types.forType === assetType) return undefined;
    let alive = true;
    listCollectorTypes(assetType)
      .then((res) => {
        if (!alive) return;
        const items = res.items ?? [];
        setTypes({ state: 'ready', items, forType: assetType });
        if (!collectorsTouched.current) {
          setSelected(new Set(items.filter((item) => item.recommended).map((item) => item.id)));
        }
      })
      .catch(() => {
        if (alive) setTypes({ state: 'error', items: [], forType: assetType });
      });
    return () => { alive = false; };
  }, [phase, step, assetType, types.forType]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step, phase]);

  // Enquanto o resultado guardado é de outro tipo (ou não há), a lista está carregando.
  const typesLoading = types.forType !== assetType;

  const buildRequest = (steps?: OnboardingStepName[]): OnboardingRequest => ({
    asset: {
      ticker: tickerNorm,
      displayName: displayName.trim() || undefined,
      assetType,
      sectorLabel: sectorLabel.trim() || undefined,
      segment: segment.trim() || undefined,
      issuerGroup: issuerGroup.trim() || undefined,
      cnpj: cnpj.trim() || undefined,
      isin: isin.trim().toUpperCase() || undefined,
      isFinancial: isFinancial || undefined,
      isUtility: isUtility || undefined,
      isCyclical: isCyclical || undefined,
    },
    collectors: { dataSourceIds: Array.from(selected), runNow },
    mt5: mt5Enabled
      ? { enabled: true, symbol: symbolNorm, tipo: MT5_TIPO_BY_ASSET_TYPE[assetType] }
      : { enabled: false },
    activateRuns,
    ...(steps ? { steps } : {}),
  });

  function applyServerError(err: unknown) {
    const status = (err as { status?: number }).status;
    const data = (err as { data?: { error?: string; message?: string; fields?: Array<{ field: string; message: string }>; report?: OnboardingReport } }).data;
    if (data?.error === 'VALIDATION_ERROR' && data.fields?.length) {
      const map: Record<string, string> = {};
      for (const f of data.fields) {
        map[f.field.replace(/^asset\./, '').replace(/^mt5\.symbol$/, 'mt5Symbol')] = f.message;
      }
      setServerFields(map);
      setStep(map.ticker || map.cnpj || map.isin || map.assetType ? 0 : map.mt5Symbol ? 3 : STEP_INDEX.review);
      setError('Corrija os campos destacados e envie de novo.');
      return;
    }
    if (data?.report) {
      // O catálogo falhou: mostra o resultado (tudo pendente) e o motivo.
      setReport(data.report);
      onReport(data.report);
      setPhase('result');
      setError(stepErrorText(data.error, data.message));
      return;
    }
    if (status === 403) setError('Sem permissão para cadastrar ativos (apenas ADMIN/SYSTEM).');
    else if (status === 401) setError('Sessão expirada. Entre de novo.');
    else if (status === 502 || status === 503 || status === 504) setError('Serviço indisponível no momento. Nada foi cadastrado; tente de novo.');
    else if ((err as { name?: string }).name === 'AbortError') setError('A operação demorou demais. Confira o estado do ativo no catálogo antes de repetir.');
    else setError(err instanceof Error ? err.message : 'Falha ao cadastrar o ativo.');
  }

  async function submit() {
    setPhase('sending');
    setError('');
    setServerFields({});
    try {
      const res = await onboardAsset(buildRequest());
      setReport(res);
      onReport(res);
      setPhase('result');
    } catch (err) {
      setPhase('form');
      applyServerError(err);
    }
  }

  async function retryStep(name: OnboardingStepName) {
    setRetrying(name);
    setError('');
    try {
      const res = await onboardAsset(buildRequest([name]));
      const merged = report ? mergeReport(report, res, name) : res;
      setReport(merged);
      onReport(merged);
    } catch (err) {
      const data = (err as { data?: { error?: string; message?: string } }).data;
      setError(stepErrorText(data?.error, data?.message) || (err instanceof Error ? err.message : 'Falha ao tentar de novo.'));
    } finally {
      setRetrying(null);
    }
  }

  const goNext = () => {
    if (stepBlocked(step)) {
      if (step === 0) { touch('ticker'); touch('cnpj'); touch('isin'); }
      if (step === 3) touch('mt5Symbol');
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const toggleCollector = (id: string) => {
    collectorsTouched.current = true;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectedTypes = types.items.filter((item) => selected.has(item.id));

  // ── Resultado ──────────────────────────────────────────────────────────────
  if (phase === 'result' && report) {
    const banner: { cls: string; title: string; text: string } =
      report.result === 'COMPLETED'
        ? { cls: 'is-ok', title: 'Cadastro completo', text: `${report.ticker} está no catálogo, com coleta, MT5 e análise diária ligados.` }
        : report.result === 'AWAITING_DATA'
          ? { cls: 'is-ok', title: 'Cadastro feito — aguardando os primeiros dados', text: 'A análise diária liga sozinha quando a primeira coleta chegar (checagem a cada 30 minutos). Até lá o ativo não entra no lote.' }
          : report.result === 'PARTIAL'
            ? { cls: 'is-error', title: 'Cadastro parcial', text: 'O que deu certo ficou gravado. Tente de novo só as etapas que falharam.' }
            : { cls: 'is-error', title: 'Cadastro não concluído', text: 'O ativo não foi gravado no catálogo, então nada mais foi criado.' };
    return (
      <Modal
        isOpen
        onClose={onClose}
        title={`Cadastro de ${report.ticker}`}
        subtitle="Resultado por etapa"
        maxWidth="640px"
        footer={(
          <div className="modal-actions">
            {report.result === 'FAILED' ? (
              <button type="button" className="btn btn-primary btn-pill" onClick={() => { setPhase('form'); setStep(STEPS.length - 1); }}>
                Voltar e tentar de novo
              </button>
            ) : (
              <button type="button" className="btn btn-primary btn-pill" onClick={() => { onViewInCatalog(report.ticker); onClose(); }}>
                Ver no catálogo
              </button>
            )}
            <button type="button" className="btn btn-secondary btn-pill" onClick={onClose}>Fechar</button>
          </div>
        )}
      >
        <div className={`agent-test-result ${banner.cls}`} role={banner.cls === 'is-error' ? 'alert' : 'status'}>
          <strong>{banner.title}</strong>
          <p style={{ margin: '0.3rem 0 0' }}>{banner.text}</p>
        </div>
        {error ? <p className="onb-inline-error" role="alert">{error}</p> : null}

        <ul className="onb-result-list" aria-live="polite">
          {RESULT_ROWS.map((row) => {
            const st = report.steps[row.name];
            const detail =
              row.name === 'collectors' && st.status !== 'SKIPPED'
                ? (report.steps.collectors.items ?? []).map((item) => (
                  <li key={item.dataSourceId} className="onb-result-sub">
                    {item.dataSourceSlug || item.dataSourceId}
                    {item.agentId ? (item.created ? ' — criado' : ' — já existia') : ''}
                    {item.run === 'QUEUED' ? ' · coleta na fila' : ''}
                    {item.run === 'FAILED' ? ' · coleta imediata não enfileirada (o agendamento coleta depois)' : ''}
                    {item.error && !item.agentId ? ` — ${stepErrorText(item.error)}` : ''}
                  </li>
                ))
                : null;
            const errorCode = 'error' in st ? st.error : undefined;
            const errorMsg = 'message' in st ? (st as { message?: string }).message : undefined;
            return (
              <li key={row.name} className="onb-result-row">
                <StatusIcon status={st.status} />
                <div className="onb-result-main">
                  <div>
                    <strong>{row.label}</strong>
                    <span className={`onb-status-text is-${st.status.toLowerCase()}`}>{STATUS_TEXT[st.status]}</span>
                    {row.name === 'catalog' && st.status === 'OK' ? (
                      <span className="text-muted"> · {report.steps.catalog.created ? 'criado' : 'atualizado'}</span>
                    ) : null}
                    {row.name === 'mt5' && st.status === 'OK' ? (
                      <span className="text-muted"> · {report.steps.mt5.created ? 'criado' : 'já existia'} ({report.steps.mt5.symbol})</span>
                    ) : null}
                  </div>
                  {errorCode ? <p className="onb-inline-error">{stepErrorText(errorCode, errorMsg)}</p> : null}
                  {detail && detail.length > 0 ? <ul className="onb-result-subs">{detail}</ul> : null}
                </div>
                {st.status === 'FAILED' && row.name !== 'catalog' ? (
                  <button
                    type="button"
                    className="btn btn-secondary btn-pill"
                    disabled={retrying !== null}
                    onClick={() => { void retryStep(row.name); }}
                  >
                    {retrying === row.name ? 'Tentando…' : 'Tentar de novo'}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
        <p className="text-muted market-catalog-hint">Código de rastreio: {report.correlationId}</p>
      </Modal>
    );
  }

  // ── Formulário em etapas ───────────────────────────────────────────────────
  const isReview = step === STEPS.length - 1;
  const sending = phase === 'sending';

  return (
    <Modal
      isOpen
      onClose={sending ? () => undefined : onClose}
      title={initial ? `Completar cadastro de ${initial.ticker}` : 'Novo ativo'}
      subtitle="Cadastra o ativo no catálogo, nos coletores e no MetaTrader 5 de uma vez"
      maxWidth="720px"
      footer={(
        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-secondary btn-pill"
            disabled={step === 0 || sending}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            Voltar
          </button>
          {isReview ? (
            <button type="button" className="btn btn-primary btn-pill" disabled={sending || Object.keys(errors).length > 0} onClick={() => { void submit(); }}>
              {sending ? (<><Loader2 size={15} className="onb-spin" aria-hidden="true" /> Cadastrando…</>) : 'Cadastrar ativo'}
            </button>
          ) : (
            <button type="button" className="btn btn-primary btn-pill" onClick={goNext}>Continuar</button>
          )}
        </div>
      )}
    >
      <ol className="onb-stepper" aria-label="Etapas do cadastro">
        {STEPS.map((s, i) => (
          <li key={s.id} className={`onb-step${i === step ? ' is-active' : ''}${i < step ? ' is-done' : ''}`} aria-current={i === step ? 'step' : undefined}>
            <span className="onb-step-num">{i + 1}</span>
            <span className="onb-step-label">{s.label}</span>
          </li>
        ))}
      </ol>

      {error ? <div className="agent-test-result is-error" role="alert"><p style={{ margin: 0 }}>{error}</p></div> : null}

      <h4 className="onb-step-title" tabIndex={-1} ref={headingRef}>{STEPS[step].label}</h4>

      {step === 0 ? (
        <div className="onb-grid">
          <div className="llm-form-field">
            <label className="form-label" htmlFor="onb-ticker">Ticker</label>
            <input
              id="onb-ticker" className="form-input" value={ticker} maxLength={6} autoComplete="off" spellCheck={false}
              placeholder="BTCI11" readOnly={Boolean(initial)}
              aria-invalid={Boolean(fieldError('ticker'))} aria-describedby="onb-ticker-msg"
              onChange={(e) => setTicker(e.target.value.toUpperCase())} onBlur={() => touch('ticker')}
            />
            <span id="onb-ticker-msg" className={fieldError('ticker') ? 'onb-field-error' : 'text-muted market-catalog-hint'}>
              {fieldError('ticker') || (initial ? 'O ticker não muda em um cadastro existente.' : '4 a 6 letras/dígitos.')}
            </span>
          </div>
          <div className="llm-form-field">
            <label className="form-label" htmlFor="onb-type">Tipo do ativo</label>
            <select
              id="onb-type" className="form-input" value={assetType}
              onChange={(e) => {
                setAssetType(e.target.value as AssetClassType);
                collectorsTouched.current = false; // trocar o tipo refaz a pré-seleção de coletores
              }}
            >
              {ASSET_TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <span className="text-muted market-catalog-hint">Classe derivada: {ASSET_CLASS_BY_TYPE[assetType] ?? '—'}</span>
          </div>
          <div className="llm-form-field onb-span-2">
            <label className="form-label" htmlFor="onb-name">Nome</label>
            <input id="onb-name" className="form-input" value={displayName} placeholder="BTG Pactual Crédito Imobiliário" onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="llm-form-field">
            <label className="form-label" htmlFor="onb-cnpj">CNPJ <span className="text-muted">(opcional)</span></label>
            <input
              id="onb-cnpj" className="form-input" value={cnpj} inputMode="numeric" placeholder="00.000.000/0000-00"
              aria-invalid={Boolean(fieldError('cnpj'))} aria-describedby="onb-cnpj-msg"
              onChange={(e) => setCnpj(formatCnpjMask(e.target.value))} onBlur={() => touch('cnpj')}
            />
            <span id="onb-cnpj-msg" className={fieldError('cnpj') ? 'onb-field-error' : 'text-muted market-catalog-hint'}>{fieldError('cnpj') || 'Do fundo ou da empresa.'}</span>
          </div>
          <div className="llm-form-field">
            <label className="form-label" htmlFor="onb-isin">ISIN <span className="text-muted">(opcional)</span></label>
            <input
              id="onb-isin" className="form-input" value={isin} maxLength={12} autoComplete="off" spellCheck={false} placeholder="BRPETRACNPR6"
              aria-invalid={Boolean(fieldError('isin'))} aria-describedby="onb-isin-msg"
              onChange={(e) => setIsin(e.target.value.toUpperCase())} onBlur={() => touch('isin')}
            />
            <span id="onb-isin-msg" className={fieldError('isin') ? 'onb-field-error' : 'text-muted market-catalog-hint'}>{fieldError('isin') || '12 caracteres, com dígito verificador.'}</span>
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="onb-grid">
          <div className="llm-form-field">
            <label className="form-label" htmlFor="onb-sector">Setor</label>
            <input id="onb-sector" className="form-input" value={sectorLabel} list="onb-sector-list" placeholder="Imobiliário" onChange={(e) => setSectorLabel(e.target.value)} />
            <datalist id="onb-sector-list">{sectorHints.map((label) => <option key={label} value={label} />)}</datalist>
          </div>
          <div className="llm-form-field">
            <label className="form-label" htmlFor="onb-segment">Segmento</label>
            <input id="onb-segment" className="form-input" value={segment} placeholder="Papel — Títulos e Recebíveis (CRI)" onChange={(e) => setSegment(e.target.value)} />
          </div>
          <div className="llm-form-field onb-span-2">
            <label className="form-label" htmlFor="onb-issuer">Gestora / grupo emissor</label>
            <input id="onb-issuer" className="form-input" value={issuerGroup} placeholder="BTG Pactual" onChange={(e) => setIssuerGroup(e.target.value)} />
          </div>
          <fieldset className="onb-fieldset onb-span-2">
            <legend className="form-label">Características (mudam as réguas de valuation)</legend>
            <label className="market-catalog-toggle"><input type="checkbox" checked={isFinancial} onChange={(e) => setIsFinancial(e.target.checked)} /><span>Financeira (banco, seguradora)</span></label>
            <label className="market-catalog-toggle"><input type="checkbox" checked={isUtility} onChange={(e) => setIsUtility(e.target.checked)} /><span>Utilities (energia, saneamento)</span></label>
            <label className="market-catalog-toggle"><input type="checkbox" checked={isCyclical} onChange={(e) => setIsCyclical(e.target.checked)} /><span>Cíclica</span></label>
          </fieldset>
        </div>
      ) : null}

      {step === 2 ? (
        <div>
          <p className="text-muted">Fontes que buscam cotações e fundamentos deste ativo. Sem coletor não há fatos, e sem fatos a análise não roda.</p>
          {typesLoading ? <p role="status"><Loader2 size={15} className="onb-spin" aria-hidden="true" /> Carregando fontes de {assetType}…</p> : null}
          {!typesLoading && types.state === 'error' ? (
            <div className="agent-test-result is-error" role="alert">
              <p style={{ margin: 0 }}>Não foi possível carregar as fontes.</p>
              <button type="button" className="btn btn-secondary btn-pill" style={{ marginTop: '0.5rem' }} onClick={() => setTypes({ state: 'idle', items: [], forType: '' })}>Tentar de novo</button>
            </div>
          ) : null}
          {!typesLoading && types.state === 'ready' && types.items.length === 0 ? (
            <p className="text-muted">Nenhuma fonte de coleta cadastrada para {assetType}. O ativo pode ser cadastrado sem coletores e receber fontes depois.</p>
          ) : null}
          {!typesLoading && types.items.length > 0 ? (
            <fieldset className="onb-fieldset">
              <legend className="form-label">Fontes de coleta</legend>
              {types.items.map((item) => (
                <label key={item.id} className="market-catalog-toggle onb-collector">
                  <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleCollector(item.id)} />
                  <span>
                    <strong>{item.name}</strong>{item.recommended ? <span className="onb-badge">recomendada</span> : null}
                    {item.description ? <span className="text-muted onb-collector-desc">{item.description}</span> : null}
                  </span>
                </label>
              ))}
            </fieldset>
          ) : null}
          <label className="market-catalog-toggle" style={{ marginTop: '0.75rem' }}>
            <input type="checkbox" checked={runNow} onChange={(e) => setRunNow(e.target.checked)} />
            <span>Coletar agora (senão, só no próximo horário agendado, por volta das 20h)</span>
          </label>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="onb-grid">
          <label className="market-catalog-toggle onb-span-2">
            <input type="checkbox" checked={mt5Enabled} onChange={(e) => setMt5Enabled(e.target.checked)} />
            <span>Coletar cotações intraday no MetaTrader 5 (ticks e candles durante o pregão)</span>
          </label>
          {mt5Enabled ? (
            <div className="llm-form-field">
              <label className="form-label" htmlFor="onb-mt5">Símbolo no MT5</label>
              <input
                id="onb-mt5" className="form-input" autoComplete="off" spellCheck={false}
                value={mt5SymbolEdited ? mt5Symbol : tickerNorm}
                aria-invalid={Boolean(fieldError('mt5Symbol'))} aria-describedby="onb-mt5-msg"
                onChange={(e) => { setMt5SymbolEdited(true); setMt5Symbol(e.target.value.toUpperCase()); }}
                onBlur={() => touch('mt5Symbol')}
              />
              <span id="onb-mt5-msg" className={fieldError('mt5Symbol') ? 'onb-field-error' : 'text-muted market-catalog-hint'}>
                {fieldError('mt5Symbol') || 'Normalmente igual ao ticker.'}
              </span>
            </div>
          ) : null}
          {mt5Enabled ? (
            <p className="text-muted market-catalog-hint onb-span-2">
              O cadastro não confere se o símbolo existe na corretora: se não existir, o coletor MT5 simplesmente não traz dados para ele.
            </p>
          ) : null}
        </div>
      ) : null}

      {step === 4 ? (
        <div>
          <label className="market-catalog-toggle">
            <input type="checkbox" checked={activateRuns} onChange={(e) => setActivateRuns(e.target.checked)} />
            <span>Ligar a análise diária (<code>hasRuns</code>) assim que houver dados — custa uma análise por dia útil</span>
          </label>
          <p className="text-muted market-catalog-hint">
            A análise só liga quando a primeira coleta chega. Ligar antes faria o lote diário falhar todo dia por falta de dados.
            {selected.size === 0 && activateRuns ? ' Você não escolheu coletores: sem eles os dados não chegam e a ativação ficará pendente.' : ''}
          </p>
        </div>
      ) : null}

      {isReview ? (
        <div>
          {Object.keys(errors).length > 0 ? (
            <div className="agent-test-result is-error" role="alert"><p style={{ margin: 0 }}>Há campos inválidos: {Object.values(errors).join(' ')}</p></div>
          ) : null}
          <dl className="onb-review">
            <dt>Ativo</dt><dd><strong>{tickerNorm}</strong> · {ASSET_TYPE_OPTIONS.find((t) => t.value === assetType)?.label}{displayName ? ` · ${displayName}` : ''}</dd>
            <dt>Documentos</dt><dd>{cnpj || 'sem CNPJ'} · {isin || 'sem ISIN'}</dd>
            <dt>Classificação</dt><dd>{sectorLabel || 'sem setor'}{segment ? ` · ${segment}` : ''}{[isFinancial && 'financeira', isUtility && 'utilities', isCyclical && 'cíclica'].filter(Boolean).map((t) => ` · ${t}`).join('')}</dd>
            <dt>Coletores</dt>
            <dd>
              {selected.size === 0 ? 'nenhum' : (selectedTypes.length > 0 ? selectedTypes.map((t) => t.name).join(', ') : `${selected.size} fonte(s)`)}
              {selected.size > 0 ? (runNow ? ' · coleta imediata' : ' · só no horário agendado') : ''}
            </dd>
            <dt>MetaTrader 5</dt><dd>{mt5Enabled ? `habilitado como ${symbolNorm}` : 'não'}</dd>
            <dt>Análise diária</dt><dd>{activateRuns ? 'liga quando houver dados' : 'não liga (dá para ligar depois)'}</dd>
          </dl>
          <p className="text-muted market-catalog-hint">
            <AlertTriangle size={13} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> Repetir o cadastro do mesmo ticker é seguro: nada é duplicado.
          </p>
        </div>
      ) : null}
    </Modal>
  );
};
