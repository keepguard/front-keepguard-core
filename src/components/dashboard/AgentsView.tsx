import React, { useCallback, useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Cpu,
  FlaskConical,
  KeyRound,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  COLLECTOR_SERVICE_CLIENT_ID,
  createCollectorAgent,
  deleteCollectorAgent,
  disableCollectorAgent,
  enableCollectorAgent,
  getCollectorAgent,
  searchCollectorAgents,
  testCollectorAgent,
  updateCollectorAgent,
  type CollectorAgent,
  type CollectorAgentTestResult,
  type CollectorSchedule,
  type CollectorType,
} from '../../services/agentService';
import { searchOAuthClients, type OAuthClient } from '../../services/oauthClientService';

type Filters = {
  q: string;
  enabled: '' | 'true' | 'false';
  collectorType: '' | CollectorType;
  sort: 'createdAt' | 'name' | 'enabled' | 'collectorType';
  dir: 'asc' | 'desc';
};

type CredentialState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'missing' }
  | { kind: 'found'; client: OAuthClient };

type AgentForm = {
  name: string;
  description: string;
  collectorType: CollectorType;
  prompt: string;
  enabled: boolean;
  url: string;
  method: string;
  headersText: string;
  queryParamsText: string;
  bodyTemplate: string;
  outputFileName: string;
  cssSelectorsText: string;
  extractLinks: boolean;
  outputFormat: string;
  urlsText: string;
  acceptedExtensions: string;
  maxFileSizeBytes: string;
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

function emptyForm(): AgentForm {
  return {
    name: '',
    description: '',
    collectorType: 'API_REST',
    prompt: '',
    enabled: false,
    url: '',
    method: 'GET',
    headersText: '',
    queryParamsText: '',
    bodyTemplate: '',
    outputFileName: '',
    cssSelectorsText: '',
    extractLinks: false,
    outputFormat: 'html',
    urlsText: '',
    acceptedExtensions: '',
    maxFileSizeBytes: '',
    daysOfWeek: [1, 2, 3, 4, 5],
    startTime: '09:00',
    endTime: '17:00',
    intervalMinutes: '60',
    timezone: 'America/Sao_Paulo',
  };
}

function formatDate(isoDate?: string) {
  if (!isoDate) return '—';
  try {
    return new Date(isoDate).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoDate;
  }
}

function typeLabel(type?: string): string {
  if (type === 'API_REST') return 'API REST';
  if (type === 'HTML_SCRAPER') return 'HTML scraper';
  if (type === 'DOCUMENT_FETCHER') return 'Documentos';
  return type || '—';
}

function scheduleSummary(schedule?: CollectorSchedule): string {
  if (!schedule) return '—';
  const days = (schedule.daysOfWeek || [])
    .map((day) => WEEKDAYS.find((item) => item.value === day)?.label)
    .filter(Boolean)
    .join(', ');
  const window = `${schedule.startTime || '—'}–${schedule.endTime || '—'}`;
  const interval = schedule.intervalMinutes ? `${schedule.intervalMinutes} min` : '';
  return [days || '—', window, interval].filter(Boolean).join(' · ');
}

function parseMapText(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  text.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const sep = trimmed.includes('=') ? '=' : ':';
    const index = trimmed.indexOf(sep);
    if (index <= 0) return;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (key) out[key] = value;
  });
  return out;
}

function mapToText(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  return Object.entries(value as Record<string, string>)
    .map(([key, item]) => `${key}: ${item}`)
    .join('\n');
}

function linesToList(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function buildCollectorConfig(form: AgentForm): Record<string, unknown> {
  if (form.collectorType === 'HTML_SCRAPER') {
    return {
      url: form.url.trim(),
      css_selectors: linesToList(form.cssSelectorsText),
      extract_links: form.extractLinks,
      output_format: form.outputFormat || 'html',
      output_file_name: form.outputFileName.trim() || undefined,
    };
  }
  if (form.collectorType === 'DOCUMENT_FETCHER') {
    const maxSize = Number(form.maxFileSizeBytes);
    return {
      urls: linesToList(form.urlsText),
      accepted_extensions: form.acceptedExtensions
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      max_file_size_bytes: Number.isFinite(maxSize) && maxSize > 0 ? maxSize : undefined,
    };
  }
  const headers = parseMapText(form.headersText);
  const queryParams = parseMapText(form.queryParamsText);
  return {
    url: form.url.trim(),
    method: form.method.trim() || 'GET',
    headers: Object.keys(headers).length ? headers : undefined,
    query_params: Object.keys(queryParams).length ? queryParams : undefined,
    body_template: form.bodyTemplate.trim() || undefined,
    output_file_name: form.outputFileName.trim() || undefined,
  };
}

function buildSchedule(form: AgentForm): CollectorSchedule {
  return {
    daysOfWeek: [...form.daysOfWeek].sort((a, b) => a - b),
    startTime: form.startTime,
    endTime: form.endTime,
    intervalMinutes: Number(form.intervalMinutes) || 60,
    timezone: form.timezone.trim() || 'America/Sao_Paulo',
  };
}

function formFromAgent(agent: CollectorAgent): AgentForm {
  const cfg = (agent.collectorConfig || {}) as Record<string, unknown>;
  return {
    ...emptyForm(),
    name: agent.name || '',
    description: agent.description || '',
    collectorType: (agent.collectorType as CollectorType) || 'API_REST',
    prompt: agent.prompt || '',
    enabled: agent.enabled,
    url: String(cfg.url || ''),
    method: String(cfg.method || 'GET'),
    headersText: mapToText(cfg.headers),
    queryParamsText: mapToText(cfg.query_params),
    bodyTemplate: String(cfg.body_template || ''),
    outputFileName: String(cfg.output_file_name || ''),
    cssSelectorsText: Array.isArray(cfg.css_selectors) ? (cfg.css_selectors as string[]).join('\n') : '',
    extractLinks: Boolean(cfg.extract_links),
    outputFormat: String(cfg.output_format || 'html'),
    urlsText: Array.isArray(cfg.urls) ? (cfg.urls as string[]).join('\n') : '',
    acceptedExtensions: Array.isArray(cfg.accepted_extensions)
      ? (cfg.accepted_extensions as string[]).join(', ')
      : '',
    maxFileSizeBytes: cfg.max_file_size_bytes ? String(cfg.max_file_size_bytes) : '',
    daysOfWeek: agent.schedule?.daysOfWeek?.length ? agent.schedule.daysOfWeek : [1, 2, 3, 4, 5],
    startTime: agent.schedule?.startTime || '09:00',
    endTime: agent.schedule?.endTime || '17:00',
    intervalMinutes: String(agent.schedule?.intervalMinutes || 60),
    timezone: agent.schedule?.timezone || 'America/Sao_Paulo',
  };
}

type FormStep = 'identity' | 'collector' | 'schedule';

const FORM_STEPS: Array<{
  id: FormStep;
  label: string;
  hint: string;
}> = [
  { id: 'identity', label: 'Identidade', hint: 'Nome e tipo' },
  { id: 'collector', label: 'Coleta', hint: 'Fonte e config' },
  { id: 'schedule', label: 'Agenda', hint: 'Quando roda' },
];

function CredentialBanner({
  state,
  onOpenClientSystem,
}: {
  state: CredentialState;
  onOpenClientSystem?: () => void;
}) {
  const link = onOpenClientSystem ? (
    <button type="button" className="collector-credential-link" onClick={onOpenClientSystem}>
      Ver na Client system
    </button>
  ) : null;

  if (state.kind === 'loading') {
    return (
      <div className="collector-credential-banner is-loading">
        <strong>Credencial de coleta</strong>
        <p>Verificando o client `srv-data-collector` desta organização...</p>
      </div>
    );
  }
  if (state.kind === 'error') {
    return (
      <div className="collector-credential-banner is-warn">
        <strong>Não foi possível verificar a credencial de coleta</strong>
        <p>{state.message}</p>
        {link}
      </div>
    );
  }
  if (state.kind === 'missing') {
    return (
      <div className="collector-credential-banner is-warn">
        <strong>Não há client `srv-data-collector` nesta organização</strong>
        <p>O agent pode ser salvo, mas a coleta não emite token até a credencial existir e estar ativa.</p>
        {link}
      </div>
    );
  }

  const active = (state.client.status || '').toUpperCase() === 'ACTIVE';
  return (
    <div className={`collector-credential-banner ${active ? 'is-ok' : 'is-blocked'}`}>
      <div className="collector-credential-title-row">
        <strong>{active ? 'Credencial de coleta ativa' : 'Credencial de coleta bloqueada'}</strong>
        <span className="badge-role" style={active
          ? { background: '#e6f7f3', color: '#00b090', borderColor: '#b3ebd9' }
          : { background: '#fdecea', color: '#c0392b', borderColor: '#f5c6cb' }}
        >
          {active ? 'Ativo' : 'Bloqueado'}
        </span>
      </div>
      <p>
        {active
          ? 'Este agent usa a credencial de serviço da organização, não uma chave por agent.'
          : 'A execução não autentica no knowledge até desbloquear em Client system.'}
      </p>
      <div className="collector-credential-meta">
        <span className="text-mono">{state.client.clientId}</span>
        <span>{state.client.serviceRoleName || '—'}</span>
        <span>TTL {state.client.tokenTtlSeconds}s</span>
      </div>
      {link}
    </div>
  );
}

function CredentialChip({
  state,
  onOpenClientSystem,
}: {
  state: CredentialState;
  onOpenClientSystem?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (state.kind === 'loading') {
    return (
      <div className="collector-credential-chip">
        <span className="collector-credential-chip-icon"><KeyRound size={14} /></span>
        <div className="collector-credential-chip-body">
          <div className="collector-credential-chip-title">Verificando credencial…</div>
          <div className="collector-credential-chip-meta">Client compartilhado da organização</div>
        </div>
      </div>
    );
  }

  if (state.kind === 'error' || state.kind === 'missing') {
    return (
      <div className="collector-credential-chip is-warn">
        <span className="collector-credential-chip-icon"><KeyRound size={14} /></span>
        <div className="collector-credential-chip-body">
          <div className="collector-credential-chip-title">
            {state.kind === 'missing' ? 'Credencial ausente' : 'Credencial indisponível'}
          </div>
          <div className="collector-credential-chip-meta">
            {state.kind === 'missing'
              ? 'O agent pode ser salvo; a coleta só autentica quando o client existir.'
              : state.message}
          </div>
          {onOpenClientSystem ? (
            <div className="collector-credential-chip-actions">
              <button type="button" onClick={onOpenClientSystem}>Abrir Client system</button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const active = (state.client.status || '').toUpperCase() === 'ACTIVE';
  const authorities = state.client.authorities || [];

  return (
    <div className={`collector-credential-chip ${active ? 'is-ok' : 'is-blocked'}`}>
      <span className="collector-credential-chip-icon"><KeyRound size={14} /></span>
      <div className="collector-credential-chip-body">
        <div className="collector-credential-chip-title">
          {active ? 'Usa credencial da organização' : 'Credencial bloqueada'}
          <span className="badge-role" style={active
            ? { background: '#e6f7f3', color: '#00b090', borderColor: '#b3ebd9' }
            : { background: '#fdecea', color: '#c0392b', borderColor: '#f5c6cb' }}
          >
            {active ? 'Ativo' : 'Bloqueado'}
          </span>
        </div>
        <div className="collector-credential-chip-meta">
          <span className="text-mono">{state.client.clientId}</span>
          {' · '}
          {state.client.serviceRoleName || 'sem role'}
          {' · TTL '}
          {state.client.tokenTtlSeconds}s
        </div>
        <div className="collector-credential-chip-actions">
          <button type="button" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Ocultar detalhes' : 'Ver detalhes'}
          </button>
          {onOpenClientSystem ? (
            <button type="button" onClick={onOpenClientSystem}>Client system</button>
          ) : null}
        </div>
        {expanded ? (
          <div className="collector-credential-chip-details">
            {state.client.description || 'Sem descrição.'}
            {authorities.length > 0 ? (
              <div className="collector-credential-chip-authorities">
                {authorities.map((authority) => (
                  <span key={authority}>{authority}</span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const AgentPager: React.FC<{
  loading: boolean;
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  leading?: React.ReactNode;
}> = ({ loading, page, totalPages, onPrev, onNext, leading }) => (
  <div className="audits-pager">
    <div className="audits-pager-leading">{leading}</div>
    <div className="audits-pager-actions">
      <button
        type="button"
        className="btn btn-outline btn-pill btn-icon-pager"
        disabled={loading || page <= 0}
        onClick={onPrev}
        aria-label="Página anterior"
        title="Página anterior"
      >
        <ChevronLeft size={18} />
      </button>
      <button
        type="button"
        className="btn btn-outline btn-pill btn-icon-pager"
        disabled={loading || page >= totalPages - 1}
        onClick={onNext}
        aria-label="Próxima página"
        title="Próxima página"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  </div>
);

export const AgentsView: React.FC<{ onNavigateTab?: (tab: string) => void }> = ({ onNavigateTab }) => {
  const { accessToken } = useAuth();
  const { addToast } = useToast();
  const token = accessToken || (typeof window !== 'undefined' ? localStorage.getItem('keepguard_access_token') : null);

  const [filters, setFilters] = useState<Filters>({
    q: '',
    enabled: '',
    collectorType: '',
    sort: 'createdAt',
    dir: 'desc',
  });
  const [applied, setApplied] = useState<Filters>(filters);
  const [items, setItems] = useState<CollectorAgent[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [credential, setCredential] = useState<CredentialState>({ kind: 'loading' });
  const [formOpen, setFormOpen] = useState(false);
  const [formStep, setFormStep] = useState<FormStep>('identity');
  const [editing, setEditing] = useState<CollectorAgent | null>(null);
  const [form, setForm] = useState<AgentForm>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<CollectorAgent | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    agentName: string;
    result: CollectorAgentTestResult;
  } | null>(null);

  const loadCredential = useCallback(async () => {
    if (!token) {
      setCredential({ kind: 'error', message: 'Sessão inválida.' });
      return;
    }
    setCredential({ kind: 'loading' });
    try {
      const result = await searchOAuthClients({ clientId: COLLECTOR_SERVICE_CLIENT_ID, size: 20 }, token);
      const match = (result.content || []).find((item) => item.clientId === COLLECTOR_SERVICE_CLIENT_ID);
      setCredential(match ? { kind: 'found', client: match } : { kind: 'missing' });
    } catch (error) {
      setCredential({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Falha ao consultar Client system.',
      });
    }
  }, [token]);

  const loadPage = useCallback(async (nextPage: number, nextFilters: Filters) => {
    if (!token) return;
    setLoading(true);
    try {
      const result = await searchCollectorAgents({
        q: nextFilters.q,
        enabled: nextFilters.enabled || undefined,
        collectorType: nextFilters.collectorType || undefined,
        page: nextPage,
        size: 20,
        sort: nextFilters.sort,
        dir: nextFilters.dir,
      }, token);
      setItems(result.content || []);
      setPage(result.page || 0);
      setTotalPages(Math.max(result.totalPages || 1, 1));
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Falha ao listar agents',
        description: error instanceof Error ? error.message : 'Tente novamente.',
      });
    } finally {
      setLoading(false);
    }
  }, [addToast, token]);

  useEffect(() => {
    loadCredential();
  }, [loadCredential]);

  useEffect(() => {
    loadPage(0, applied);
  }, [applied, loadPage]);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setApplied(filters);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setFormStep('identity');
    setFormOpen(true);
  };

  const openEdit = async (item: CollectorAgent, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!token) return;
    try {
      const detail = await getCollectorAgent(item.id, token);
      setEditing(detail);
      setForm(formFromAgent(detail));
      setFormStep('identity');
      setFormOpen(true);
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Falha ao carregar agent',
        description: error instanceof Error ? error.message : 'Tente novamente.',
      });
    }
  };

  const validateStep = (step: FormStep): boolean => {
    if (step === 'identity') {
      if (!form.name.trim()) {
        addToast({ type: 'error', title: 'Nome é obrigatório' });
        return false;
      }
      return true;
    }
    if (step === 'collector') {
      if (form.collectorType === 'DOCUMENT_FETCHER') {
        if (!form.urlsText.trim()) {
          addToast({ type: 'error', title: 'Informe ao menos uma URL' });
          return false;
        }
      } else if (!form.url.trim()) {
        addToast({ type: 'error', title: 'URL é obrigatória' });
        return false;
      }
      return true;
    }
    if (form.daysOfWeek.length === 0) {
      addToast({ type: 'error', title: 'Selecione ao menos um dia na agenda' });
      return false;
    }
    return true;
  };

  const goToStep = (step: FormStep) => {
    const order: FormStep[] = ['identity', 'collector', 'schedule'];
    const currentIdx = order.indexOf(formStep);
    const targetIdx = order.indexOf(step);
    if (targetIdx <= currentIdx) {
      setFormStep(step);
      return;
    }
    for (let i = currentIdx; i < targetIdx; i += 1) {
      if (!validateStep(order[i])) return;
    }
    setFormStep(step);
  };

  const handleNextStep = () => {
    if (!validateStep(formStep)) return;
    if (formStep === 'identity') setFormStep('collector');
    else if (formStep === 'collector') setFormStep('schedule');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;
    if (!validateStep('identity') || !validateStep('collector') || !validateStep('schedule')) {
      if (!form.name.trim()) setFormStep('identity');
      else if (form.collectorType === 'DOCUMENT_FETCHER' ? !form.urlsText.trim() : !form.url.trim()) {
        setFormStep('collector');
      } else setFormStep('schedule');
      return;
    }
    setSubmitting(true);
    try {
      if (editing) {
        await updateCollectorAgent(editing.id, {
          name: form.name.trim(),
          description: form.description.trim(),
          collectorConfig: buildCollectorConfig(form),
          prompt: form.prompt,
          schedule: buildSchedule(form),
        }, token);
        addToast({ type: 'success', title: 'Agent atualizado' });
      } else {
        await createCollectorAgent({
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          collectorType: form.collectorType,
          collectorConfig: buildCollectorConfig(form),
          prompt: form.prompt || undefined,
          schedule: buildSchedule(form),
          enabled: form.enabled,
        }, token);
        addToast({ type: 'success', title: 'Agent criado' });
      }
      setFormOpen(false);
      setEditing(null);
      setFormStep('identity');
      await loadPage(page, applied);
    } catch (error) {
      addToast({
        type: 'error',
        title: editing ? 'Falha ao atualizar agent' : 'Falha ao criar agent',
        description: error instanceof Error ? error.message : 'Tente novamente.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (item: CollectorAgent, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!token) return;
    try {
      if (item.enabled) {
        await disableCollectorAgent(item.id, token);
        addToast({ type: 'success', title: 'Agent desativado' });
      } else {
        await enableCollectorAgent(item.id, token);
        addToast({ type: 'success', title: 'Agent ativado' });
      }
      await loadPage(page, applied);
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Falha ao alterar status',
        description: error instanceof Error ? error.message : 'Tente novamente.',
      });
    }
  };

  const handleTest = async (item: CollectorAgent, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!token) return;
    setTestingId(item.id);
    setTestResult(null);
    try {
      const result = await testCollectorAgent(item.id, token);
      setTestResult({ agentName: item.name, result });
      if (result.success) {
        addToast({
          type: 'success',
          title: 'Teste ok',
          description: `${result.itemsCollected} item(ns) em ${result.durationMs}ms`,
        });
      } else {
        addToast({
          type: 'error',
          title: 'Teste falhou',
          description: result.error || 'A coleta retornou erro.',
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      setTestResult({
        agentName: item.name,
        result: {
          success: false,
          agentId: item.id,
          collectorType: String(item.collectorType || ''),
          itemsCollected: 0,
          durationMs: 0,
          error: message,
          preview: [],
        },
      });
      addToast({
        type: 'error',
        title: 'Falha ao testar agent',
        description: message,
      });
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = async () => {
    if (!token || !confirmDelete) return;
    try {
      await deleteCollectorAgent(confirmDelete.id, token);
      addToast({ type: 'success', title: 'Agent excluído' });
      setConfirmDelete(null);
      await loadPage(page, applied);
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Falha ao excluir agent',
        description: error instanceof Error ? error.message : 'Tente novamente.',
      });
    }
  };

  const filterActions = (
    <div className="audits-filter-actions">
      <button type="submit" className="btn btn-secondary btn-pill audits-filter-submit" disabled={loading}>
        <Search size={15} />
        <span>Filtrar</span>
      </button>
    </div>
  );

  const pager = (includeFilter = false) => (
    <AgentPager
      loading={loading}
      page={page}
      totalPages={totalPages}
      onPrev={() => loadPage(page - 1, applied)}
      onNext={() => loadPage(page + 1, applied)}
      leading={includeFilter ? filterActions : undefined}
    />
  );

  const renderActions = (item: CollectorAgent) => (
    <div className="table-actions-group" style={{ justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="btn-table-icon"
        title="Testar coleta"
        aria-label="Testar coleta do agent"
        disabled={testingId === item.id}
        onClick={(e) => handleTest(item, e)}
      >
        <FlaskConical size={15} />
      </button>
      <button type="button" className="btn-table-icon" title="Editar" aria-label="Editar agent" onClick={(e) => openEdit(item, e)}>
        <Pencil size={15} />
      </button>
      <button
        type="button"
        className="btn-table-icon"
        title={item.enabled ? 'Desativar' : 'Ativar'}
        aria-label={item.enabled ? 'Desativar agent' : 'Ativar agent'}
        onClick={(e) => handleToggle(item, e)}
      >
        {item.enabled ? <PowerOff size={15} /> : <Power size={15} />}
      </button>
      <button
        type="button"
        className="btn-table-icon"
        title="Excluir"
        aria-label="Excluir agent"
        onClick={(e) => {
          e.stopPropagation();
          setConfirmDelete(item);
        }}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );

  const goClientSystem = () => onNavigateTab?.('client-system');

  return (
    <div>
      <CredentialBanner state={credential} onOpenClientSystem={onNavigateTab ? goClientSystem : undefined} />

      <div className="client-system-create-row">
        <button type="button" className="btn btn-primary btn-pill" onClick={openCreate}>
          <Plus size={15} />
          <span>Criar</span>
        </button>
      </div>

      {testResult ? (
        <div className={`agent-test-result ${testResult.result.success ? 'is-ok' : 'is-error'}`}>
          <div className="agent-test-result-header">
            <strong>
              {testResult.result.success ? 'Teste ok' : 'Teste falhou'}
              {' · '}
              {testResult.agentName}
            </strong>
            <button
              type="button"
              className="agent-test-result-close"
              aria-label="Fechar resultado do teste"
              onClick={() => setTestResult(null)}
            >
              <X size={16} />
            </button>
          </div>
          {testResult.result.success ? (
            <p>
              {testResult.result.itemsCollected} item(ns) em {testResult.result.durationMs}ms.
              Dry-run com a config do agent (headers/URL); sem upload no knowledge.
            </p>
          ) : (
            <p className="agent-test-result-error">{testResult.result.error || 'Erro desconhecido na coleta.'}</p>
          )}
          {testResult.result.preview?.length ? (
            <pre className="agent-test-result-preview">
              {testResult.result.preview.map((item) => (
                `${item.fileName} (${item.sizeBytes} bytes)\n${item.previewText || '(sem preview textual)'}\n`
              )).join('\n---\n')}
            </pre>
          ) : null}
        </div>
      ) : null}

      {testingId ? (
        <p className="agent-test-running">Testando coleta…</p>
      ) : null}

      <form className="audits-toolbar" onSubmit={handleSearch}>
        <div className="audits-filter-row client-system-filter-row">
          <div className="search-input-wrapper audits-search-field">
            <Search size={16} className="search-icon" />
            <input
              className="search-input"
              placeholder="Nome do agent"
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            />
          </div>
          <select
            className="form-input audits-compact-select"
            value={filters.collectorType}
            onChange={(e) => setFilters((f) => ({ ...f, collectorType: e.target.value as Filters['collectorType'] }))}
            aria-label="Tipo"
          >
            <option value="">Todos os tipos</option>
            <option value="API_REST">API REST</option>
            <option value="HTML_SCRAPER">HTML scraper</option>
            <option value="DOCUMENT_FETCHER">Documentos</option>
          </select>
          <select
            className="form-input audits-compact-select"
            value={filters.enabled}
            onChange={(e) => setFilters((f) => ({ ...f, enabled: e.target.value as Filters['enabled'] }))}
            aria-label="Status"
          >
            <option value="">Todos os status</option>
            <option value="true">Ativo</option>
            <option value="false">Inativo</option>
          </select>
          <div className="audits-sort-group">
            <select
              className="form-input audits-sort-select"
              value={filters.sort}
              onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as Filters['sort'] }))}
              aria-label="Ordenar por"
            >
              <option value="createdAt">Criado em</option>
              <option value="name">Nome</option>
              <option value="enabled">Status</option>
              <option value="collectorType">Tipo</option>
            </select>
            <select
              className="form-input audits-dir-select"
              value={filters.dir}
              onChange={(e) => setFilters((f) => ({ ...f, dir: e.target.value as Filters['dir'] }))}
              aria-label="Direção"
            >
              <option value="desc">Decrescente</option>
              <option value="asc">Crescente</option>
            </select>
          </div>
        </div>
        {pager(true)}
      </form>

      <div className="hpanel-table-card desktop-table-view">
        <table className="hpanel-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Tipo</th>
              <th>Status</th>
              <th>Agenda</th>
              <th>Criado</th>
              <th style={{ textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: '#5f6368' }}>
                  Carregando agents...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: '#5f6368' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                    <Cpu size={22} />
                    <span>Nenhum agent para os filtros atuais.</span>
                  </div>
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <span className="table-cell-title" title={item.name}>{item.name}</span>
                    {item.description ? <div className="table-cell-muted">{item.description}</div> : null}
                  </td>
                  <td>{typeLabel(item.collectorType)}</td>
                  <td>
                    <span className="badge-role" style={item.enabled
                      ? { background: '#e6f7f3', color: '#00b090', borderColor: '#b3ebd9' }
                      : { background: '#fdecea', color: '#c0392b', borderColor: '#f5c6cb' }}
                    >
                      {item.enabled ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td><span className="id-compact">{scheduleSummary(item.schedule)}</span></td>
                  <td>{formatDate(item.createdAt)}</td>
                  <td>{renderActions(item)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mobile-cards-container">
        {items.map((item) => (
          <div key={item.id} className="mobile-domain-card">
            <div className="mobile-card-top">
              <span className="mobile-domain-name">{item.name}</span>
              <span
                className="badge-role"
                style={item.enabled
                  ? { background: '#e6f7f3', color: '#00b090', borderColor: '#b3ebd9' }
                  : { background: '#fdecea', color: '#c0392b', borderColor: '#f5c6cb' }}
              >
                {item.enabled ? 'Ativo' : 'Inativo'}
              </span>
            </div>
            <div className="mobile-card-subinfo">{typeLabel(item.collectorType)} · {formatDate(item.createdAt)}</div>
            <div className="mobile-card-meta">{scheduleSummary(item.schedule)}</div>
            <div className="mobile-card-actions table-actions-group">{renderActions(item)}</div>
          </div>
        ))}
      </div>

      {pager(false)}

      <Modal
        isOpen={formOpen}
        onClose={() => {
          if (submitting) return;
          setFormOpen(false);
          setFormStep('identity');
        }}
        title={editing ? 'Editar agent' : 'Criar agent'}
        subtitle={editing ? editing.code : 'Job de coleta desta organização'}
        maxWidth="720px"
        maxHeight="min(90vh, 820px)"
        footer={(
          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                if (submitting) return;
                setFormOpen(false);
                setFormStep('identity');
              }}
              disabled={submitting}
            >
              Cancelar
            </button>
            {formStep !== 'identity' ? (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setFormStep(formStep === 'schedule' ? 'collector' : 'identity')}
                disabled={submitting}
              >
                Voltar
              </button>
            ) : null}
            {formStep !== 'schedule' ? (
              <button type="button" className="btn btn-primary" onClick={handleNextStep} disabled={submitting}>
                Continuar
              </button>
            ) : (
              <button type="submit" form="agent-form" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Salvando...' : editing ? 'Salvar' : 'Criar'}
              </button>
            )}
          </div>
        )}
      >
        <form id="agent-form" className="oauth-create-form agent-form" onSubmit={handleSubmit}>
          <nav className="agent-form-steps" aria-label="Etapas do formulário">
            {FORM_STEPS.map((step, index) => {
              const order: FormStep[] = ['identity', 'collector', 'schedule'];
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
                Defina o job e confirme a credencial compartilhada da organização.
              </p>
              <CredentialChip
                state={credential}
                onOpenClientSystem={onNavigateTab ? goClientSystem : undefined}
              />
              <div className="form-group">
                <label htmlFor="agent-name">Nome</label>
                <input
                  id="agent-name"
                  className="form-input"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ex.: scraper-noticias-diarias"
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label htmlFor="agent-desc">Descrição</label>
                <input
                  id="agent-desc"
                  className="form-input"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Opcional"
                />
              </div>
              <div className="form-group">
                <label htmlFor="agent-type">Tipo de coleta</label>
                <select
                  id="agent-type"
                  className="form-input"
                  value={form.collectorType}
                  disabled={Boolean(editing)}
                  onChange={(e) => setForm((f) => ({ ...f, collectorType: e.target.value as CollectorType }))}
                >
                  <option value="API_REST">API REST</option>
                  <option value="HTML_SCRAPER">HTML scraper</option>
                  <option value="DOCUMENT_FETCHER">Documentos</option>
                </select>
              </div>
              {!editing ? (
                <label className="collector-check-row">
                  <input
                    type="checkbox"
                    checked={form.enabled}
                    onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                    style={{ accentColor: '#673de6' }}
                  />
                  Ativar agora após criar
                </label>
              ) : null}
            </div>
          ) : null}

          {formStep === 'collector' ? (
            <div className="agent-form-panel">
              <p className="agent-form-panel-intro">
                Configure a fonte ({typeLabel(form.collectorType)}). Campos mudam conforme o tipo.
              </p>

              {form.collectorType !== 'DOCUMENT_FETCHER' ? (
                <div className="form-group">
                  <label htmlFor="agent-url">URL</label>
                  <input
                    id="agent-url"
                    className="form-input"
                    value={form.url}
                    onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                    placeholder="https://..."
                    required
                  />
                </div>
              ) : (
                <div className="form-group">
                  <label htmlFor="agent-urls">URLs (uma por linha)</label>
                  <textarea
                    id="agent-urls"
                    className="form-input"
                    rows={3}
                    value={form.urlsText}
                    onChange={(e) => setForm((f) => ({ ...f, urlsText: e.target.value }))}
                    required
                  />
                </div>
              )}

              {form.collectorType === 'API_REST' ? (
                <>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="agent-method">Método</label>
                      <input
                        id="agent-method"
                        className="form-input"
                        value={form.method}
                        onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="agent-file">Arquivo de saída</label>
                      <input
                        id="agent-file"
                        className="form-input"
                        value={form.outputFileName}
                        onChange={(e) => setForm((f) => ({ ...f, outputFileName: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label htmlFor="agent-headers">Headers (chave: valor)</label>
                    <textarea id="agent-headers" className="form-input" rows={2} value={form.headersText} onChange={(e) => setForm((f) => ({ ...f, headersText: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="agent-query">Query params (chave: valor)</label>
                    <textarea id="agent-query" className="form-input" rows={2} value={form.queryParamsText} onChange={(e) => setForm((f) => ({ ...f, queryParamsText: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="agent-body">Body template</label>
                    <textarea id="agent-body" className="form-input" rows={2} value={form.bodyTemplate} onChange={(e) => setForm((f) => ({ ...f, bodyTemplate: e.target.value }))} />
                  </div>
                </>
              ) : null}

              {form.collectorType === 'HTML_SCRAPER' ? (
                <>
                  <div className="form-group">
                    <label htmlFor="agent-css">CSS selectors (um por linha)</label>
                    <textarea id="agent-css" className="form-input" rows={2} value={form.cssSelectorsText} onChange={(e) => setForm((f) => ({ ...f, cssSelectorsText: e.target.value }))} />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="agent-format">Formato</label>
                      <select id="agent-format" className="form-input" value={form.outputFormat} onChange={(e) => setForm((f) => ({ ...f, outputFormat: e.target.value }))}>
                        <option value="html">html</option>
                        <option value="text">text</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor="agent-file-html">Arquivo de saída</label>
                      <input id="agent-file-html" className="form-input" value={form.outputFileName} onChange={(e) => setForm((f) => ({ ...f, outputFileName: e.target.value }))} />
                    </div>
                  </div>
                  <label className="collector-check-row">
                    <input type="checkbox" checked={form.extractLinks} onChange={(e) => setForm((f) => ({ ...f, extractLinks: e.target.checked }))} style={{ accentColor: '#673de6' }} />
                    Extrair links
                  </label>
                </>
              ) : null}

              {form.collectorType === 'DOCUMENT_FETCHER' ? (
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="agent-ext">Extensões aceitas</label>
                    <input id="agent-ext" className="form-input" placeholder=".pdf, .csv" value={form.acceptedExtensions} onChange={(e) => setForm((f) => ({ ...f, acceptedExtensions: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="agent-max">Tamanho máx. (bytes)</label>
                    <input id="agent-max" className="form-input" type="number" min={0} value={form.maxFileSizeBytes} onChange={(e) => setForm((f) => ({ ...f, maxFileSizeBytes: e.target.value }))} />
                  </div>
                </div>
              ) : null}

              <div className="form-group">
                <label htmlFor="agent-prompt">Prompt (opcional)</label>
                <textarea
                  id="agent-prompt"
                  className="form-input"
                  rows={3}
                  value={form.prompt}
                  onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
                  placeholder="Instruções para o processamento do conteúdo coletado"
                />
              </div>
            </div>
          ) : null}

          {formStep === 'schedule' ? (
            <div className="agent-form-panel">
              <p className="agent-form-panel-intro">
                Defina em quais dias e horários este agent deve executar.
              </p>
              <div className="agent-form-summary">
                <strong>{form.name.trim() || 'Sem nome'}</strong>
                {' · '}
                {typeLabel(form.collectorType)}
                {' · '}
                {form.collectorType === 'DOCUMENT_FETCHER'
                  ? `${form.urlsText.split('\n').filter(Boolean).length || 0} URL(s)`
                  : (form.url || 'sem URL')}
              </div>
              <div className="form-group">
                <label>Dias da semana</label>
                <div className="collector-days">
                  {WEEKDAYS.map((day) => (
                    <label key={day.value} className={`collector-day ${form.daysOfWeek.includes(day.value) ? 'is-on' : ''}`}>
                      <input
                        type="checkbox"
                        checked={form.daysOfWeek.includes(day.value)}
                        onChange={(e) => setForm((f) => ({
                          ...f,
                          daysOfWeek: e.target.checked
                            ? [...f.daysOfWeek, day.value]
                            : f.daysOfWeek.filter((item) => item !== day.value),
                        }))}
                      />
                      {day.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="agent-start">Início</label>
                  <input id="agent-start" className="form-input" type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label htmlFor="agent-end">Fim</label>
                  <input id="agent-end" className="form-input" type="time" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} required />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="agent-interval">Intervalo (min)</label>
                  <input id="agent-interval" className="form-input" type="number" min={1} value={form.intervalMinutes} onChange={(e) => setForm((f) => ({ ...f, intervalMinutes: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label htmlFor="agent-tz">Timezone</label>
                  <input id="agent-tz" className="form-input" value={form.timezone} onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))} required />
                </div>
              </div>
            </div>
          ) : null}
        </form>
      </Modal>

      <Modal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Excluir agent"
        subtitle={confirmDelete?.name}
        maxWidth="480px"
      >
        <p>Excluir este agent não altera a credencial OAuth da organização.</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={() => setConfirmDelete(null)}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={handleDelete}>Excluir</button>
        </div>
      </Modal>
    </div>
  );
};
