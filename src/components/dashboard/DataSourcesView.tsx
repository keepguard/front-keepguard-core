import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Database,
  Pencil,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../common/Modal';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { PATHS } from '../../navigation/routes';
import {
  createCollectorDataSource,
  deleteCollectorDataSource,
  disableCollectorDataSource,
  enableCollectorDataSource,
  listCollectorDataSources,
  searchCollectorAgents,
  updateCollectorDataSource,
  type CollectorDataSource,
  type CollectorDataSourceVariable,
  type CollectorSchedule,
  type CollectorType,
  type CreateCollectorDataSourceBody,
  type PropagateFieldGroup,
} from '../../services/agentService';
import { PropagateDataSourceModal } from './PropagateDataSourceModal';
import { changedFieldGroups } from '../../utils/collectorTemplate';

type StatusFilter = '' | 'true' | 'false';
type FormStep = 'identity' | 'collector' | 'defaults';
type AuthType = 'NONE' | 'STATIC_BEARER' | 'LOGIN_PASSWORD';
type KeyValueEntry = { id: string; key: string; value: string };
type FormVariable = CollectorDataSourceVariable & { id: string };
type ConfirmKind = 'disable' | 'delete';

type SourceForm = {
  name: string;
  slug: string;
  description: string;
  websiteUrl: string;
  collectorType: CollectorType;
  notes: string;
  variables: FormVariable[];
  url: string;
  method: string;
  headers: KeyValueEntry[];
  queryParams: KeyValueEntry[];
  bodyTemplate: string;
  outputFileName: string;
  entityHint: string;
  authType: AuthType;
  loginUrl: string;
  loginMethod: string;
  loginHeaders: KeyValueEntry[];
  loginBodyTemplate: string;
  tokenPath: string;
  authHeaderName: string;
  authHeaderPrefix: string;
  cssSelectorsText: string;
  extractLinks: boolean;
  outputFormat: string;
  urlsText: string;
  acceptedExtensions: string;
  maxFileSizeBytes: string;
  nameTemplate: string;
  descriptionTemplate: string;
  promptTemplate: string;
  defaultContext: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  intervalMinutes: string;
  timezone: string;
};

const WEEKDAYS = [
  { value: 0, label: 'Dom' },
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
];

const FORM_STEPS: Array<{ id: FormStep; label: string; hint: string }> = [
  { id: 'identity', label: 'Identidade', hint: 'Nome, slug e variáveis' },
  { id: 'collector', label: 'Coleta', hint: 'URL e config' },
  { id: 'defaults', label: 'Padrões', hint: 'Templates e agenda' },
];

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function emptyForm(): SourceForm {
  return {
    name: '',
    slug: '',
    description: '',
    websiteUrl: '',
    collectorType: 'API_REST',
    notes: '',
    variables: [{ id: newId('var'), key: 'ticker', label: 'Ticker', required: true, placeholder: 'PETR4' }],
    url: '',
    method: 'GET',
    headers: [],
    queryParams: [],
    bodyTemplate: '',
    outputFileName: '',
    entityHint: '{{ticker}}',
    authType: 'NONE',
    loginUrl: '',
    loginMethod: 'POST',
    loginHeaders: [],
    loginBodyTemplate: '{\n  "username": "{{username}}",\n  "password": "{{password}}"\n}',
    tokenPath: 'token',
    authHeaderName: 'Authorization',
    authHeaderPrefix: 'Bearer ',
    cssSelectorsText: '',
    extractLinks: false,
    outputFormat: 'html',
    urlsText: '',
    acceptedExtensions: '',
    maxFileSizeBytes: '',
    nameTemplate: '',
    descriptionTemplate: '',
    promptTemplate: '',
    defaultContext: 'geral',
    daysOfWeek: [1, 2, 3, 4, 5],
    startTime: '09:00',
    endTime: '17:00',
    intervalMinutes: '60',
    timezone: 'America/Sao_Paulo',
  };
}

function typeLabel(type?: string): string {
  if (type === 'API_REST') return 'API REST';
  if (type === 'HTML_SCRAPER') return 'HTML scraper';
  if (type === 'DOCUMENT_FETCHER') return 'Documentos';
  return type || '—';
}

function variablesLabel(source: CollectorDataSource): string {
  const keys = (source.variables || []).map((item) => item.key).filter(Boolean);
  return keys.length ? keys.join(', ') : '—';
}

function pairsToMap(entries: KeyValueEntry[]): Record<string, string> {
  const out: Record<string, string> = {};
  entries.forEach((entry) => {
    const key = entry.key.trim();
    if (key) out[key] = entry.value;
  });
  return out;
}

function mapToPairs(value: unknown): KeyValueEntry[] {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, string>).map(([key, item]) => ({
    id: newId('kv'),
    key,
    value: String(item ?? ''),
  }));
}

function linesToList(text: string): string[] {
  return text.split('\n').map((line) => line.trim()).filter(Boolean);
}

function normalizeVariables(value: unknown): CollectorDataSourceVariable[] {
  if (!Array.isArray(value)) return [];
  const out: CollectorDataSourceVariable[] = [];
  value.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const raw = item as Record<string, unknown>;
    const key = String(raw.key || '').trim();
    if (!key) return;
    out.push({
      key,
      label: String(raw.label || key),
      required: Boolean(raw.required),
      placeholder: String(raw.placeholder || ''),
    });
  });
  return out;
}

function previewPlaceholders(value: string, sample: string): string {
  const t = sample.trim().toUpperCase() || 'PETR4';
  return value
    .replaceAll('{{ticker}}', t)
    .replaceAll('{{ticker_lower}}', t.toLowerCase())
    .replaceAll('{{symbol}}', `${t}.SA`)
    .replace(/\{\{([a-z0-9_]+)_lower\}\}/g, t.toLowerCase())
    .replace(/\{\{([a-z0-9_]+)\}\}/g, t);
}

function buildConfigTemplate(form: SourceForm): Record<string, unknown> {
  if (form.collectorType === 'HTML_SCRAPER') {
    return {
      url: form.url.trim(),
      css_selectors: linesToList(form.cssSelectorsText),
      extract_links: form.extractLinks,
      output_format: form.outputFormat || 'html',
      output_file_name: form.outputFileName.trim() || undefined,
      entity_hint: form.entityHint.trim() || undefined,
    };
  }
  if (form.collectorType === 'DOCUMENT_FETCHER') {
    const maxSize = Number(form.maxFileSizeBytes);
    return {
      urls: linesToList(form.urlsText),
      accepted_extensions: form.acceptedExtensions.split(',').map((item) => item.trim()).filter(Boolean),
      max_file_size_bytes: Number.isFinite(maxSize) && maxSize > 0 ? maxSize : undefined,
      entity_hint: form.entityHint.trim() || undefined,
    };
  }
  const headers = pairsToMap(form.headers);
  const queryParams = pairsToMap(form.queryParams);
  const config: Record<string, unknown> = {
    url: form.url.trim(),
    method: form.method.trim() || 'GET',
    headers: Object.keys(headers).length ? headers : undefined,
    query_params: Object.keys(queryParams).length ? queryParams : undefined,
    body_template: form.bodyTemplate.trim() || undefined,
    output_file_name: form.outputFileName.trim() || undefined,
    entity_hint: form.entityHint.trim() || undefined,
  };
  if (form.authType !== 'NONE') {
    const loginHeaders = pairsToMap(form.loginHeaders);
    const auth: Record<string, unknown> = {
      type: form.authType,
      header_name: form.authHeaderName.trim() || 'Authorization',
      header_prefix: form.authHeaderPrefix,
    };
    if (form.authType === 'LOGIN_PASSWORD') {
      auth.login_url = form.loginUrl.trim();
      auth.login_method = form.loginMethod.trim() || 'POST';
      auth.login_headers = Object.keys(loginHeaders).length ? loginHeaders : undefined;
      auth.login_body_template = form.loginBodyTemplate.trim() || undefined;
      auth.token_path = form.tokenPath.trim() || 'token';
      auth.renew_before_seconds = 300;
    }
    config.auth = auth;
  }
  return config;
}

function buildSchedule(form: SourceForm): CollectorSchedule {
  return {
    daysOfWeek: [...form.daysOfWeek].sort((a, b) => a - b),
    startTime: form.startTime,
    endTime: form.endTime,
    intervalMinutes: Number(form.intervalMinutes) || 60,
    timezone: form.timezone.trim() || 'America/Sao_Paulo',
  };
}

function formFromSource(source: CollectorDataSource): SourceForm {
  const cfg = (source.configTemplate || {}) as Record<string, unknown>;
  const auth = (cfg.auth && typeof cfg.auth === 'object' ? cfg.auth : {}) as Record<string, unknown>;
  const authTypeRaw = String(auth.type || 'NONE').toUpperCase();
  const authType: AuthType = authTypeRaw === 'STATIC_BEARER' || authTypeRaw === 'LOGIN_PASSWORD' ? authTypeRaw : 'NONE';
  const sched = source.defaultSchedule;
  return {
    ...emptyForm(),
    name: source.name || '',
    slug: source.slug || '',
    description: source.description || '',
    websiteUrl: source.websiteUrl || '',
    collectorType: (source.collectorType as CollectorType) || 'API_REST',
    notes: source.notes || '',
    variables: (source.variables || []).map((item) => ({ ...item, id: newId('var') })),
    url: String(cfg.url || ''),
    method: String(cfg.method || 'GET'),
    headers: mapToPairs(cfg.headers),
    queryParams: mapToPairs(cfg.query_params),
    bodyTemplate: String(cfg.body_template || ''),
    outputFileName: String(cfg.output_file_name || ''),
    entityHint: String(cfg.entity_hint || ''),
    authType,
    loginUrl: String(auth.login_url || ''),
    loginMethod: String(auth.login_method || 'POST'),
    loginHeaders: mapToPairs(auth.login_headers),
    loginBodyTemplate: String(auth.login_body_template || emptyForm().loginBodyTemplate),
    tokenPath: String(auth.token_path || 'token'),
    authHeaderName: String(auth.header_name || 'Authorization'),
    authHeaderPrefix: auth.header_prefix !== undefined ? String(auth.header_prefix) : 'Bearer ',
    cssSelectorsText: Array.isArray(cfg.css_selectors) ? (cfg.css_selectors as string[]).join('\n') : '',
    extractLinks: Boolean(cfg.extract_links),
    outputFormat: String(cfg.output_format || 'html'),
    urlsText: Array.isArray(cfg.urls) ? (cfg.urls as string[]).join('\n') : '',
    acceptedExtensions: Array.isArray(cfg.accepted_extensions) ? (cfg.accepted_extensions as string[]).join(', ') : '',
    maxFileSizeBytes: cfg.max_file_size_bytes ? String(cfg.max_file_size_bytes) : '',
    nameTemplate: source.nameTemplate || '',
    descriptionTemplate: source.descriptionTemplate || '',
    promptTemplate: source.promptTemplate || '',
    defaultContext: source.defaultContext || 'geral',
    daysOfWeek: sched?.daysOfWeek?.length ? sched.daysOfWeek : [1, 2, 3, 4, 5],
    startTime: sched?.startTime || '09:00',
    endTime: sched?.endTime || '17:00',
    intervalMinutes: String(sched?.intervalMinutes || 60),
    timezone: sched?.timezone || 'America/Sao_Paulo',
  };
}

function toCreateBody(form: SourceForm): CreateCollectorDataSourceBody {
  return {
    name: form.name.trim(),
    slug: form.slug.trim(),
    description: form.description.trim() || undefined,
    websiteUrl: form.websiteUrl.trim() || undefined,
    collectorType: form.collectorType,
    nameTemplate: form.nameTemplate.trim() || undefined,
    descriptionTemplate: form.descriptionTemplate.trim() || undefined,
    promptTemplate: form.promptTemplate.trim() || undefined,
    defaultContext: form.defaultContext.trim() || 'geral',
    defaultSchedule: buildSchedule(form),
    configTemplate: buildConfigTemplate(form),
    variables: form.variables
      .map((item) => ({
        key: item.key.trim().toLowerCase(),
        label: item.label.trim(),
        required: Boolean(item.required),
        placeholder: item.placeholder?.trim() || undefined,
      }))
      .filter((item) => item.key),
    notes: form.notes.trim() || undefined,
    enabled: true,
  };
}

function KeyValueEditor({
  label,
  entries,
  onChange,
  disabled,
  keyPlaceholder = 'Chave',
  valuePlaceholder = 'Valor',
}: {
  label: string;
  entries: KeyValueEntry[];
  onChange: (next: KeyValueEntry[]) => void;
  disabled?: boolean;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}) {
  const [draftKey, setDraftKey] = useState('');
  const [draftValue, setDraftValue] = useState('');
  const addEntry = () => {
    const key = draftKey.trim();
    if (!key || disabled) return;
    onChange([...entries.filter((item) => item.key.trim().toLowerCase() !== key.toLowerCase()), {
      id: newId('kv'),
      key,
      value: draftValue,
    }]);
    setDraftKey('');
    setDraftValue('');
  };
  return (
    <div className="form-group kv-editor">
      <label>{label}</label>
      {!disabled ? (
        <div className="kv-editor-add">
          <input className="form-input" value={draftKey} onChange={(e) => setDraftKey(e.target.value)} placeholder={keyPlaceholder} aria-label={`${label} chave`} />
          <input className="form-input" value={draftValue} onChange={(e) => setDraftValue(e.target.value)} placeholder={valuePlaceholder} aria-label={`${label} valor`} />
          <button type="button" className="btn btn-outline btn-pill" onClick={addEntry} disabled={!draftKey.trim()}>
            <Plus size={15} />
            <span>Adicionar</span>
          </button>
        </div>
      ) : null}
      {entries.length > 0 ? (
        <div className="kv-editor-table-wrap">
          <table className="kv-editor-table">
            <thead>
              <tr>
                <th>Chave</th>
                <th>Valor</th>
                {!disabled ? <th aria-label="Ações" /> : null}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <input className="form-input" value={entry.key} disabled={disabled} onChange={(e) => onChange(entries.map((item) => (item.id === entry.id ? { ...item, key: e.target.value } : item)))} />
                  </td>
                  <td>
                    <input className="form-input" value={entry.value} disabled={disabled} onChange={(e) => onChange(entries.map((item) => (item.id === entry.id ? { ...item, value: e.target.value } : item)))} />
                  </td>
                  {!disabled ? (
                    <td className="kv-editor-actions">
                      <button type="button" className="btn-table-icon" aria-label={`Excluir ${entry.key || 'item'}`} onClick={() => onChange(entries.filter((item) => item.id !== entry.id))}>
                        <Trash2 size={15} />
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="kv-editor-empty">Nenhum item adicionado.</p>
      )}
    </div>
  );
}

export const DataSourcesView: React.FC = () => {
  const { isAuthenticated, getAccessToken } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [items, setItems] = useState<CollectorDataSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [q, setQ] = useState('');
  const [collectorType, setCollectorType] = useState<'' | CollectorType>('');
  const [enabled, setEnabled] = useState<StatusFilter>('');

  const [formOpen, setFormOpen] = useState(false);
  const [formStep, setFormStep] = useState<FormStep>('identity');
  const [form, setForm] = useState<SourceForm>(emptyForm);
  const [slugTouched, setSlugTouched] = useState(false);
  const [editing, setEditing] = useState<CollectorDataSource | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: ConfirmKind; source: CollectorDataSource } | null>(null);
  const [linkedAgents, setLinkedAgents] = useState(0);
  const [agentCounts, setAgentCounts] = useState<Record<string, number>>({});
  const [propagate, setPropagate] = useState<{
    source: CollectorDataSource;
    changedGroups?: PropagateFieldGroup[];
    lockUnchanged: boolean;
  } | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    setLoading(true);
    setLoadError('');
    try {
      const sources = await listCollectorDataSources(token, { includeDisabled: true });
      const mapped = (sources || []).map((source) => ({
        ...source,
        variables: normalizeVariables(source.variables),
        enabled: source.enabled !== false,
        scope: source.scope || 'company',
      }));
      setItems(mapped);
      const counts: Record<string, number> = {};
      await Promise.all(mapped.map(async (source) => {
        try {
          const page = await searchCollectorAgents({ dataSourceId: source.id, size: 1 }, token);
          counts[source.id] = page.totalElements || 0;
        } catch {
          counts[source.id] = 0;
        }
      }));
      setAgentCounts(counts);
    } catch (err: any) {
      setItems([]);
      setLoadError(err?.message || 'Não foi possível carregar as fontes.');
      addToast({
        type: 'error',
        title: 'Falha ao consultar fontes',
        description: err?.message || 'Tente novamente em instantes.',
      });
    } finally {
      setLoading(false);
    }
  }, [addToast, getAccessToken]);

  useEffect(() => {
    if (isAuthenticated) void load();
  }, [isAuthenticated, load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((item) => {
      if (needle && !`${item.name} ${item.slug}`.toLowerCase().includes(needle)) return false;
      if (collectorType && item.collectorType !== collectorType) return false;
      if (enabled === 'true' && item.enabled === false) return false;
      if (enabled === 'false' && item.enabled !== false) return false;
      return true;
    });
  }, [collectorType, enabled, items, q]);

  const sampleValue = form.variables[0]?.placeholder || 'PETR4';

  const openCreate = () => {
    setEditing(null);
    setSlugTouched(false);
    setForm(emptyForm());
    setFormStep('identity');
    setFormOpen(true);
  };

  const openEdit = (source: CollectorDataSource) => {
    setEditing(source);
    setSlugTouched(true);
    setForm(formFromSource(source));
    setFormStep('identity');
    setFormOpen(true);
  };

  const closeForm = () => {
    if (submitting) return;
    setFormOpen(false);
    setFormStep('identity');
    setEditing(null);
  };

  const validateStep = (step: FormStep): string | null => {
    if (step === 'identity') {
      if (!form.name.trim()) return 'Informe o nome da fonte.';
      if (!/^[a-z0-9-]{1,64}$/.test(form.slug.trim())) return 'Slug deve ser [a-z0-9-] com até 64 caracteres.';
      const keys = form.variables.map((item) => item.key.trim().toLowerCase()).filter(Boolean);
      if (new Set(keys).size !== keys.length) return 'As variáveis precisam ter chaves únicas.';
      if (form.variables.some((item) => item.key.trim() && !/^[a-z0-9_]{1,64}$/.test(item.key.trim()))) {
        return 'Chave de variável deve ser [a-z0-9_].';
      }
      if (form.variables.some((item) => item.key.trim() && !item.label.trim())) return 'Cada variável precisa de um rótulo.';
    }
    if (step === 'collector') {
      if (form.collectorType === 'DOCUMENT_FETCHER') {
        if (!linesToList(form.urlsText).length) return 'Informe ao menos uma URL.';
      } else if (!form.url.trim()) {
        return 'Informe a URL do template.';
      }
    }
    if (step === 'defaults') {
      if (!form.daysOfWeek.length) return 'Selecione ao menos um dia.';
      if (form.startTime >= form.endTime) return 'O horário inicial deve ser anterior ao final.';
      if (Number(form.intervalMinutes) <= 0) return 'Intervalo deve ser positivo.';
    }
    return null;
  };

  const goToStep = (step: FormStep) => {
    const order: FormStep[] = ['identity', 'collector', 'defaults'];
    const current = order.indexOf(formStep);
    const next = order.indexOf(step);
    if (next <= current) {
      setFormStep(step);
      return;
    }
    for (let i = 0; i < next; i += 1) {
      const error = validateStep(order[i]);
      if (error) {
        addToast({ type: 'warning', title: 'Complete a etapa', description: error });
        setFormStep(order[i]);
        return;
      }
    }
    setFormStep(step);
  };

  const handleNext = () => {
    const error = validateStep(formStep);
    if (error) {
      addToast({ type: 'warning', title: 'Revise os campos', description: error });
      return;
    }
    setFormStep(formStep === 'identity' ? 'collector' : 'defaults');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const error = validateStep('defaults') || validateStep('collector') || validateStep('identity');
    if (error) {
      addToast({ type: 'warning', title: 'Revise os campos', description: error });
      return;
    }
    const token = getAccessToken();
    if (!token) return;
    setSubmitting(true);
    try {
      const body = toCreateBody(form);
      if (editing) {
        const previousTemplate = (editing.configTemplate || {}) as Record<string, unknown>;
        const next = await updateCollectorDataSource(editing.id, body, token);
        setItems((current) => current.map((item) => (item.id === next.id ? { ...item, ...next, variables: normalizeVariables(next.variables) } : item)));
        const groups = changedFieldGroups(previousTemplate, body.configTemplate);
        setFormOpen(false);
        if (groups.length > 0) {
          let total = 0;
          try {
            const page = await searchCollectorAgents({ dataSourceId: next.id, size: 1 }, token);
            total = page.totalElements || page.content?.length || 0;
            setAgentCounts((current) => ({ ...current, [next.id]: total }));
          } catch {
            total = 0;
          }
          if (total > 0) {
            addToast({ type: 'success', title: 'Fonte atualizada', description: next.name });
            setPropagate({
              source: { ...editing, ...next, variables: normalizeVariables(next.variables) },
              changedGroups: groups,
              lockUnchanged: true,
            });
          } else {
            addToast({ type: 'success', title: 'Fonte atualizada', description: 'Nenhum agent vinculado.' });
          }
        } else {
          addToast({ type: 'success', title: 'Fonte atualizada', description: next.name });
        }
      } else {
        const created = await createCollectorDataSource(body, token);
        setItems((current) => [{ ...created, variables: normalizeVariables(created.variables), enabled: created.enabled !== false, scope: created.scope || 'company' }, ...current]);
        addToast({ type: 'success', title: 'Fonte cadastrada', description: 'Ela já aparece no combo de agents.' });
      }
      setFormOpen(false);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: editing ? 'Não foi possível salvar' : 'Não foi possível cadastrar',
        description: err?.message || 'Tente novamente.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (source: CollectorDataSource) => {
    const token = getAccessToken();
    if (!token) return;
    try {
      const next = source.enabled === false
        ? await enableCollectorDataSource(source.id, token)
        : await disableCollectorDataSource(source.id, token);
      setItems((current) => current.map((item) => (item.id === next.id ? { ...item, ...next } : item)));
      addToast({
        type: 'success',
        title: next.enabled ? 'Fonte ativada' : 'Fonte desativada',
        description: next.enabled ? 'Volta a aparecer no combo de agents.' : 'Some do combo de agents, mas o cadastro permanece.',
      });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Não foi possível alterar o status', description: err?.message || 'Tente novamente.' });
    }
  };

  const openDelete = async (source: CollectorDataSource) => {
    const token = getAccessToken();
    setConfirm({ kind: 'delete', source });
    if (!token) return;
    try {
      const page = await searchCollectorAgents({ dataSourceId: source.id, size: 100 }, token);
      setLinkedAgents(page.totalElements || page.content?.length || 0);
    } catch {
      setLinkedAgents(0);
    }
  };

  const handleConfirmDelete = async () => {
    const token = getAccessToken();
    if (!token || !confirm) return;
    setSubmitting(true);
    try {
      await deleteCollectorDataSource(confirm.source.id, token);
      setItems((current) => current.filter((item) => item.id !== confirm.source.id));
      addToast({
        type: 'success',
        title: 'Fonte excluída',
        description: linkedAgents > 0
          ? `${linkedAgents} agent(s) ficaram personalizados.`
          : 'Nenhum agent estava vinculado.',
      });
      setConfirm(null);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Não foi possível excluir', description: err?.message || 'Tente novamente.' });
    } finally {
      setSubmitting(false);
    }
  };

  const setFormField = <K extends keyof SourceForm>(key: K, value: SourceForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const disabled = submitting;

  return (
    <>
      <form
        className="audits-toolbar"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <div className="audits-filter-row client-system-filter-row">
          <div className="search-input-wrapper audits-search-field">
            <Search size={16} className="search-icon" />
            <input
              className="search-input"
              placeholder="Nome ou slug"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Buscar fonte"
            />
          </div>
          <select className="form-input audits-compact-select" value={collectorType} onChange={(e) => setCollectorType(e.target.value as '' | CollectorType)} aria-label="Tipo">
            <option value="">Todos os tipos</option>
            <option value="API_REST">API REST</option>
            <option value="HTML_SCRAPER">HTML scraper</option>
            <option value="DOCUMENT_FETCHER">Documentos</option>
          </select>
          <select className="form-input audits-compact-select" value={enabled} onChange={(e) => setEnabled(e.target.value as StatusFilter)} aria-label="Status">
            <option value="">Todos os status</option>
            <option value="true">Ativo</option>
            <option value="false">Inativo</option>
          </select>
          <div className="audits-filter-actions">
            <button type="button" className="btn btn-primary btn-pill" onClick={openCreate}>
              <Plus size={15} />
              <span>Nova fonte</span>
            </button>
          </div>
        </div>
      </form>

      {loadError ? (
        <div className="agent-test-result" role="alert">
          <p>{loadError}</p>
          <button type="button" className="btn btn-outline btn-pill" onClick={() => void load()}>Tentar de novo</button>
        </div>
      ) : null}

      <div className="hpanel-table-card desktop-table-view">
        <table className="hpanel-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Slug</th>
              <th>Tipo</th>
              <th>Variáveis</th>
              <th>Agents</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: '#5f6368' }}>Carregando fontes...</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: '#5f6368' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                    <Database size={22} />
                    <span>
                      {items.length === 0
                        ? 'Nenhuma fonte da organização. Cadastre um template para pré-preencher agents.'
                        : 'Nenhuma fonte para os filtros atuais.'}
                    </span>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((item) => (
                <tr key={item.id}>
                  <td>
                    <span className="table-cell-title" title={item.name}>{item.name}</span>
                    {item.description ? <div className="table-cell-muted">{item.description}</div> : null}
                  </td>
                  <td><span className="id-compact">{item.slug}</span></td>
                  <td>{typeLabel(item.collectorType)}</td>
                  <td><span className="id-compact">{variablesLabel(item)}</span></td>
                  <td>
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => navigate(`${PATHS.agents}?dataSourceId=${encodeURIComponent(item.id)}`)}
                      aria-label={`Ver agents de ${item.name}`}
                    >
                      {agentCounts[item.id] ?? '—'}
                    </button>
                  </td>
                  <td>
                    <span className="badge-role" style={item.enabled !== false
                      ? { background: '#e6f7f3', color: '#00b090', borderColor: '#b3ebd9' }
                      : { background: '#fdecea', color: '#c0392b', borderColor: '#f5c6cb' }}
                    >
                      {item.enabled !== false ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td>
                    <div className="table-actions-group" style={{ justifyContent: 'flex-end' }}>
                      <button type="button" className="btn-table-icon" title="Editar" aria-label={`Editar ${item.name}`} onClick={() => openEdit(item)}>
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        className="btn-table-icon"
                        title="Propagar para agents"
                        aria-label={`Propagar ${item.name} para agents vinculados`}
                        onClick={() => setPropagate({ source: item, lockUnchanged: false })}
                      >
                        <RefreshCw size={15} />
                      </button>
                      <button
                        type="button"
                        className="btn-table-icon"
                        title={item.enabled === false ? 'Ativar' : 'Desativar'}
                        aria-label={item.enabled === false ? `Ativar ${item.name}` : `Desativar ${item.name}`}
                        onClick={() => void handleToggle(item)}
                      >
                        {item.enabled === false ? <Power size={15} /> : <PowerOff size={15} />}
                      </button>
                      <button type="button" className="btn-table-icon" title="Excluir" aria-label={`Excluir ${item.name}`} onClick={() => void openDelete(item)}>
                        <Trash2 size={15} />
                      </button>
                      <button
                        type="button"
                        className="btn-table-icon"
                        title="Usar em um agent"
                        aria-label={`Usar ${item.name} em um agent`}
                        onClick={() => navigate(`${PATHS.agents}?dataSourceId=${encodeURIComponent(item.id)}`)}
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mobile-cards-container">
        {filtered.map((item) => (
          <div key={item.id} className="mobile-domain-card">
            <div className="mobile-card-subinfo">{item.slug}</div>
            <div className="mobile-card-top">
              <span className="mobile-domain-name">{item.name}</span>
              <span className="badge-role" style={item.enabled !== false
                ? { background: '#e6f7f3', color: '#00b090', borderColor: '#b3ebd9' }
                : { background: '#fdecea', color: '#c0392b', borderColor: '#f5c6cb' }}
              >
                {item.enabled !== false ? 'Ativo' : 'Inativo'}
              </span>
            </div>
            <div className="mobile-card-subinfo">{typeLabel(item.collectorType)} · {variablesLabel(item)} · {agentCounts[item.id] ?? 0} agents</div>
            <div className="mobile-card-actions">
              <button type="button" className="btn btn-outline btn-pill" onClick={() => openEdit(item)}>Editar</button>
              <button type="button" className="btn btn-outline btn-pill" onClick={() => setPropagate({ source: item, lockUnchanged: false })}>Propagar</button>
              <button type="button" className="btn btn-outline btn-pill" onClick={() => void handleToggle(item)}>
                {item.enabled === false ? 'Ativar' : 'Desativar'}
              </button>
            </div>
          </div>
        ))}
      </div>

      <Modal
        isOpen={formOpen}
        onClose={closeForm}
        title={editing ? 'Editar fonte' : 'Nova fonte de dados'}
        subtitle="Este template pré-preenche o agent; a coleta usa o snapshot, não esta tela."
        maxWidth="720px"
        maxHeight="min(90vh, 820px)"
        footer={(
          <div className="modal-actions">
            <button type="button" className="btn btn-outline" onClick={closeForm} disabled={submitting}>
              Cancelar
            </button>
            {formStep !== 'identity' ? (
              <button type="button" className="btn btn-outline" onClick={() => setFormStep(formStep === 'defaults' ? 'collector' : 'identity')} disabled={submitting}>
                Voltar
              </button>
            ) : null}
            {formStep !== 'defaults' ? (
              <button type="button" className="btn btn-primary" onClick={handleNext} disabled={submitting}>Continuar</button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                disabled={submitting}
                onClick={() => {
                  const el = document.getElementById('data-source-form') as HTMLFormElement | null;
                  el?.requestSubmit();
                }}
              >
                {submitting ? 'Salvando...' : editing ? 'Salvar' : 'Cadastrar'}
              </button>
            )}
          </div>
        )}
      >
        <form
          id="data-source-form"
          className="oauth-create-form agent-form"
          onSubmit={handleSubmit}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || formStep === 'defaults') return;
            const tag = (event.target as HTMLElement).tagName;
            if (tag === 'TEXTAREA' || tag === 'BUTTON') return;
            event.preventDefault();
            handleNext();
          }}
        >
          <nav className="agent-form-steps" aria-label="Etapas do formulário">
            {FORM_STEPS.map((step, index) => {
              const order: FormStep[] = ['identity', 'collector', 'defaults'];
              const isActive = formStep === step.id;
              const isDone = order.indexOf(formStep) > index;
              return (
                <button
                  key={step.id}
                  type="button"
                  className={`agent-form-step${isActive ? ' is-active' : ''}${isDone ? ' is-done' : ''}`}
                  onClick={() => goToStep(step.id)}
                >
                  <span className="agent-form-step-index">{index + 1}</span>
                  <span className="agent-form-step-label">
                    <strong>{step.label}</strong>
                    <span>{step.hint}</span>
                  </span>
                </button>
              );
            })}
          </nav>

          {formStep === 'identity' ? (
            <div className="agent-form-panel">
              <p className="agent-form-panel-intro">
                Defina o template. Use variáveis como {'{{ticker}}'}, {'{{ticker_lower}}'}, {'{{symbol}}'} e {'{{chave}}'} na coleta.
              </p>
              <div className="form-group">
                <label htmlFor="ds-name">Nome</label>
                <input
                  id="ds-name"
                  className="form-input"
                  value={form.name}
                  disabled={disabled}
                  onChange={(e) => {
                    const name = e.target.value;
                    setForm((current) => ({
                      ...current,
                      name,
                      slug: slugTouched ? current.slug : slugify(name),
                    }));
                  }}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="ds-slug">Slug</label>
                <input
                  id="ds-slug"
                  className="form-input"
                  value={form.slug}
                  disabled={disabled}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setFormField('slug', e.target.value.toLowerCase());
                  }}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="ds-desc">Descrição</label>
                <input id="ds-desc" className="form-input" value={form.description} disabled={disabled} onChange={(e) => setFormField('description', e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="ds-site">Site</label>
                <input id="ds-site" className="form-input" value={form.websiteUrl} disabled={disabled} onChange={(e) => setFormField('websiteUrl', e.target.value)} placeholder="https://" />
              </div>
              <div className="form-group">
                <label htmlFor="ds-type">Tipo de coleta</label>
                <select id="ds-type" className="form-input" value={form.collectorType} disabled={disabled || Boolean(editing)} onChange={(e) => setFormField('collectorType', e.target.value as CollectorType)}>
                  <option value="API_REST">API REST</option>
                  <option value="HTML_SCRAPER">HTML scraper</option>
                  <option value="DOCUMENT_FETCHER">Documentos</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="ds-notes">Notas (exibidas no agent)</label>
                <textarea id="ds-notes" className="form-input" rows={2} value={form.notes} disabled={disabled} onChange={(e) => setFormField('notes', e.target.value)} />
              </div>
              <div className="form-group">
                <div className="form-label-row">
                  <label>Variáveis</label>
                  {!disabled ? (
                    <button
                      type="button"
                      className="btn btn-outline btn-pill"
                      onClick={() => setForm((current) => ({
                        ...current,
                        variables: [...current.variables, { id: newId('var'), key: '', label: '', required: false, placeholder: '' }],
                      }))}
                    >
                      <Plus size={14} />
                      Adicionar
                    </button>
                  ) : null}
                </div>
                {form.variables.map((item) => (
                  <div key={item.id} className="form-row" style={{ marginTop: '0.5rem' }}>
                    <input className="form-input" aria-label="Chave" placeholder="ticker" value={item.key} disabled={disabled} onChange={(e) => setForm((current) => ({ ...current, variables: current.variables.map((row) => (row.id === item.id ? { ...row, key: e.target.value.toLowerCase() } : row)) }))} />
                    <input className="form-input" aria-label="Rótulo" placeholder="Ticker" value={item.label} disabled={disabled} onChange={(e) => setForm((current) => ({ ...current, variables: current.variables.map((row) => (row.id === item.id ? { ...row, label: e.target.value } : row)) }))} />
                    <input className="form-input" aria-label="Placeholder" placeholder="PETR4" value={item.placeholder || ''} disabled={disabled} onChange={(e) => setForm((current) => ({ ...current, variables: current.variables.map((row) => (row.id === item.id ? { ...row, placeholder: e.target.value } : row)) }))} />
                    <label className="collector-check-row">
                      <input type="checkbox" checked={Boolean(item.required)} disabled={disabled} onChange={(e) => setForm((current) => ({ ...current, variables: current.variables.map((row) => (row.id === item.id ? { ...row, required: e.target.checked } : row)) }))} style={{ accentColor: '#673de6' }} />
                      Obrigatória
                    </label>
                    {!disabled ? (
                      <button type="button" className="btn-table-icon" aria-label="Remover variável" onClick={() => setForm((current) => ({ ...current, variables: current.variables.filter((row) => row.id !== item.id) }))}>
                        <Trash2 size={15} />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {formStep === 'collector' ? (
            <div className="agent-form-panel">
              <p className="agent-form-panel-intro">
                Configure o template ({typeLabel(form.collectorType)}). Use placeholders nos campos. Segredos ficam no agent, não aqui.
              </p>
              {form.collectorType !== 'DOCUMENT_FETCHER' ? (
                <div className="form-group">
                  <label htmlFor="ds-url">URL</label>
                  <input id="ds-url" className="form-input" value={form.url} disabled={disabled} onChange={(e) => setFormField('url', e.target.value)} placeholder="https://exemplo.com/{{ticker_lower}}" required />
                </div>
              ) : (
                <div className="form-group">
                  <label htmlFor="ds-urls">URLs (uma por linha)</label>
                  <textarea id="ds-urls" className="form-input" rows={3} value={form.urlsText} disabled={disabled} onChange={(e) => setFormField('urlsText', e.target.value)} required />
                </div>
              )}
              <div className="form-group">
                <label htmlFor="ds-hint">entity_hint</label>
                <input id="ds-hint" className="form-input" value={form.entityHint} disabled={disabled} onChange={(e) => setFormField('entityHint', e.target.value)} placeholder="{{ticker}}" />
              </div>
              {form.collectorType === 'API_REST' ? (
                <>
                  <div className="form-group">
                    <label htmlFor="ds-auth">Autenticação (estrutura)</label>
                    <select id="ds-auth" className="form-input" value={form.authType} disabled={disabled} onChange={(e) => setFormField('authType', e.target.value as AuthType)}>
                      <option value="NONE">Nenhuma</option>
                      <option value="STATIC_BEARER">Token / Bearer (o agent informa o token)</option>
                      <option value="LOGIN_PASSWORD">Login (o agent informa usuário e senha)</option>
                    </select>
                  </div>
                  {form.authType === 'LOGIN_PASSWORD' ? (
                    <div className="agent-auth-card">
                      <div className="form-group">
                        <label htmlFor="ds-login-url">URL de login</label>
                        <input id="ds-login-url" className="form-input" value={form.loginUrl} disabled={disabled} onChange={(e) => setFormField('loginUrl', e.target.value)} />
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label htmlFor="ds-login-method">Método</label>
                          <input id="ds-login-method" className="form-input" value={form.loginMethod} disabled={disabled} onChange={(e) => setFormField('loginMethod', e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label htmlFor="ds-token-path">Caminho do token</label>
                          <input id="ds-token-path" className="form-input" value={form.tokenPath} disabled={disabled} onChange={(e) => setFormField('tokenPath', e.target.value)} />
                        </div>
                      </div>
                      <KeyValueEditor label="Headers do login" entries={form.loginHeaders} disabled={disabled} onChange={(loginHeaders) => setFormField('loginHeaders', loginHeaders)} />
                      <div className="form-group">
                        <label htmlFor="ds-login-body">Body do login</label>
                        <textarea id="ds-login-body" className="form-input" rows={3} value={form.loginBodyTemplate} disabled={disabled} onChange={(e) => setFormField('loginBodyTemplate', e.target.value)} />
                      </div>
                    </div>
                  ) : null}
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="ds-method">Método</label>
                      <input id="ds-method" className="form-input" value={form.method} disabled={disabled} onChange={(e) => setFormField('method', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label htmlFor="ds-file">Arquivo de saída</label>
                      <input id="ds-file" className="form-input" value={form.outputFileName} disabled={disabled} onChange={(e) => setFormField('outputFileName', e.target.value)} placeholder="fonte-{{ticker}}.json" />
                    </div>
                  </div>
                  <KeyValueEditor label="Headers" entries={form.headers} disabled={disabled} onChange={(headers) => setFormField('headers', headers)} />
                  <KeyValueEditor label="Query params" entries={form.queryParams} disabled={disabled} onChange={(queryParams) => setFormField('queryParams', queryParams)} />
                  <div className="form-group">
                    <label htmlFor="ds-body">Body template</label>
                    <textarea id="ds-body" className="form-input" rows={2} value={form.bodyTemplate} disabled={disabled} onChange={(e) => setFormField('bodyTemplate', e.target.value)} placeholder="codes[]={{ticker}}" />
                  </div>
                </>
              ) : null}
              {form.collectorType === 'HTML_SCRAPER' ? (
                <>
                  <div className="form-group">
                    <label htmlFor="ds-css">CSS selectors (um por linha)</label>
                    <textarea id="ds-css" className="form-input" rows={2} value={form.cssSelectorsText} disabled={disabled} onChange={(e) => setFormField('cssSelectorsText', e.target.value)} />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="ds-format">Formato</label>
                      <select id="ds-format" className="form-input" value={form.outputFormat} disabled={disabled} onChange={(e) => setFormField('outputFormat', e.target.value)}>
                        <option value="html">html</option>
                        <option value="text">text</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor="ds-file-html">Arquivo de saída</label>
                      <input id="ds-file-html" className="form-input" value={form.outputFileName} disabled={disabled} onChange={(e) => setFormField('outputFileName', e.target.value)} />
                    </div>
                  </div>
                  <label className="collector-check-row">
                    <input type="checkbox" checked={form.extractLinks} disabled={disabled} onChange={(e) => setFormField('extractLinks', e.target.checked)} style={{ accentColor: '#673de6' }} />
                    Extrair links
                  </label>
                </>
              ) : null}
              {form.collectorType === 'DOCUMENT_FETCHER' ? (
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="ds-ext">Extensões aceitas</label>
                    <input id="ds-ext" className="form-input" value={form.acceptedExtensions} disabled={disabled} onChange={(e) => setFormField('acceptedExtensions', e.target.value)} placeholder=".pdf, .csv" />
                  </div>
                  <div className="form-group">
                    <label htmlFor="ds-max">Tamanho máx. (bytes)</label>
                    <input id="ds-max" className="form-input" value={form.maxFileSizeBytes} disabled={disabled} onChange={(e) => setFormField('maxFileSizeBytes', e.target.value)} />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {formStep === 'defaults' ? (
            <div className="agent-form-panel">
              <p className="agent-form-panel-intro">
                Estes campos pré-preenchem o agent. Preview com {sampleValue}.
              </p>
              <div className="form-group">
                <label htmlFor="ds-name-tpl">Template de nome</label>
                <input id="ds-name-tpl" className="form-input" value={form.nameTemplate} disabled={disabled} onChange={(e) => setFormField('nameTemplate', e.target.value)} placeholder={`${form.name || 'Fonte'} {{ticker}}`} />
                {form.nameTemplate ? <p className="table-cell-muted" style={{ margin: '0.35rem 0 0' }}>Preview: {previewPlaceholders(form.nameTemplate, sampleValue)}</p> : null}
              </div>
              <div className="form-group">
                <label htmlFor="ds-desc-tpl">Template de descrição</label>
                <input id="ds-desc-tpl" className="form-input" value={form.descriptionTemplate} disabled={disabled} onChange={(e) => setFormField('descriptionTemplate', e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="ds-prompt-tpl">Template de prompt</label>
                <textarea id="ds-prompt-tpl" className="form-input" rows={3} value={form.promptTemplate} disabled={disabled} onChange={(e) => setFormField('promptTemplate', e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="ds-context">Contexto padrão</label>
                <input id="ds-context" className="form-input" value={form.defaultContext} disabled={disabled} onChange={(e) => setFormField('defaultContext', e.target.value.toLowerCase())} placeholder="investimentos" />
              </div>
              <div className="form-group">
                <label>Dias da semana</label>
                <div className="collector-days">
                  {WEEKDAYS.map((day) => (
                    <label key={day.value} className={`collector-day ${form.daysOfWeek.includes(day.value) ? 'is-on' : ''}`}>
                      <input
                        type="checkbox"
                        disabled={disabled}
                        checked={form.daysOfWeek.includes(day.value)}
                        onChange={(e) => setForm((current) => ({
                          ...current,
                          daysOfWeek: e.target.checked
                            ? [...current.daysOfWeek, day.value]
                            : current.daysOfWeek.filter((item) => item !== day.value),
                        }))}
                      />
                      {day.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="ds-start">Início</label>
                  <input id="ds-start" className="form-input" type="time" value={form.startTime} disabled={disabled} onChange={(e) => setFormField('startTime', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label htmlFor="ds-end">Fim</label>
                  <input id="ds-end" className="form-input" type="time" value={form.endTime} disabled={disabled} onChange={(e) => setFormField('endTime', e.target.value)} required />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="ds-interval">Intervalo (min)</label>
                  <input id="ds-interval" className="form-input" type="number" min={1} value={form.intervalMinutes} disabled={disabled} onChange={(e) => setFormField('intervalMinutes', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label htmlFor="ds-tz">Timezone</label>
                  <input id="ds-tz" className="form-input" value={form.timezone} disabled={disabled} onChange={(e) => setFormField('timezone', e.target.value)} required />
                </div>
              </div>
            </div>
          ) : null}
        </form>
      </Modal>

      <Modal
        isOpen={!!confirm}
        onClose={() => { if (!submitting) setConfirm(null); }}
        title="Excluir fonte"
        subtitle={confirm?.source.name}
        maxWidth="480px"
      >
        <p>
          Agents vinculados ficam personalizados (o snapshot da coleta permanece).
          {linkedAgents > 0 ? ` ${linkedAgents} agent(s) usam esta fonte.` : ' Nenhum agent vinculado no momento.'}
        </p>
        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={() => setConfirm(null)} disabled={submitting}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={() => void handleConfirmDelete()} disabled={submitting}>Excluir</button>
        </div>
      </Modal>

      <PropagateDataSourceModal
        isOpen={Boolean(propagate)}
        source={propagate?.source || null}
        changedGroups={propagate?.changedGroups}
        lockUnchanged={propagate?.lockUnchanged}
        onClose={() => setPropagate(null)}
        onDone={(result) => {
          if (propagate?.source) {
            setAgentCounts((current) => ({ ...current, [propagate.source.id]: result.totalLinked }));
          }
        }}
      />
    </>
  );
};
