import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ChevronUp,
  Cpu,
  FlaskConical,
  File,
  FileCode,
  FileJson,
  FileSpreadsheet,
  FileText,
  FileType,
  History,
  Inbox,
  KeyRound,
  Pencil,
  Play,
  Plus,
  Power,
  PowerOff,
  Search,
  ShieldAlert,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import { ListPager } from '../common/ListPager';
import { Modal } from '../common/Modal';
import { RefreshCombo } from '../common/RefreshCombo';
import { RowActionsMenu, useRowActionsMenu } from '../common/RowActionsMenu';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useAppliedListUrl } from '../../hooks/useAppliedListUrl';
import { PATHS } from '../../navigation/routes';
import {
  applyPlaceholders,
  applyPlaceholdersDeep,
  rehydrateVariableValues,
  tickerFromConfig,
} from '../../utils/collectorTemplate';
import {
  buildCollectorOriginCurlBlocksResolved,
  buildKeepGuardTestCurl,
  type CollectorCurlBlock,
} from '../../utils/collectorCurl';
import { CollectorCurlModal } from './CollectorCurlModal';
import {
  COLLECTOR_SERVICE_CLIENT_ID,
  bulkCollectorAgents,
  createCollectorAgent,
  deleteCollectorAgent,
  disableCollectorAgent,
  enableCollectorAgent,
  getCollectorAgent,
  getCollectorActiveBulkOperation,
  getCollectorBulkOperation,
  getExecutionPayloads,
  getCollectorIncidentSuggestion,
  acknowledgeCollectorIncident,
  applyCollectorIncidentSuccessor,
  listCollectorAgentExecutions,
  listCollectorAgentIncidents,
  listCollectorDataSources,
  resolveCollectorIncident,
  runCollectorAgent,
  searchCollectorAgents,
  testCollectorAgent,
  updateCollectorAgent,
  type CollectorAgent,
  type CollectorAgentSummary,
  type CollectorAgentTestResult,
  type CollectorBulkAction,
  type CollectorBulkProgress,
  type CollectorDataSource,
  type CollectorExecution,
  type CollectorIncident,
  type CollectorIncidentSuggestion,
  type CollectorSchedule,
  type CollectorType,
  type ExecutionPayloadItem,
} from '../../services/agentService';
import { searchOAuthClients, type OAuthClient } from '../../services/oauthClientService';

type Filters = {
  q: string;
  enabled: '' | 'true' | 'false';
  collectorType: '' | CollectorType;
  dataSourceId: string;
  lastExecutionStatus: '' | 'SUCCESS' | 'FAILED' | 'PARTIAL' | 'RUNNING' | 'NONE';
  hasOpenIncident: '' | 'true';
  sort: 'name' | 'enabled' | 'lastExecution';
  dir: 'asc' | 'desc';
};

const EMPTY_FILTERS: Filters = {
  q: '',
  enabled: '',
  collectorType: '',
  dataSourceId: '',
  lastExecutionStatus: '',
  hasOpenIncident: '',
  sort: 'name',
  dir: 'asc',
};

function agentSort(value: string): Filters['sort'] {
  if (value === 'enabled' || value === 'lastExecution' || value === 'name') return value;
  // legado: sort por status da execução → data da última execução
  if (value === 'lastExecutionStatus') return 'lastExecution';
  return 'name';
}

function toApiSort(sort: Filters['sort']): string {
  if (sort === 'lastExecution') return 'lastExecution';
  return sort;
}

type CredentialState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'missing' }
  | { kind: 'found'; client: OAuthClient };

type KeyValueEntry = {
  id: string;
  key: string;
  value: string;
};

type AuthType = 'NONE' | 'STATIC_BEARER' | 'LOGIN_PASSWORD';

type AgentForm = {
  name: string;
  description: string;
  context: string;
  collectorType: CollectorType;
  dataSourceId: string;
  ticker: string;
  variableValues: Record<string, string>;
  prompt: string;
  enabled: boolean;
  url: string;
  method: string;
  headers: KeyValueEntry[];
  queryParams: KeyValueEntry[];
  bodyTemplate: string;
  outputFileName: string;
  parse: string;
  authType: AuthType;
  authToken: string;
  hasToken: boolean;
  authUsername: string;
  authPassword: string;
  hasPassword: boolean;
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
    context: 'geral',
    collectorType: 'API_REST',
    dataSourceId: '',
    ticker: '',
    variableValues: {},
    prompt: '',
    enabled: false,
    url: '',
    method: 'GET',
    headers: [],
    queryParams: [],
    bodyTemplate: '',
    outputFileName: '',
    parse: '',
    authType: 'NONE',
    authToken: '',
    hasToken: false,
    authUsername: '',
    authPassword: '',
    hasPassword: false,
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

function executionStatusLabel(status?: string): string {
  switch ((status || '').toUpperCase()) {
    case 'SUCCESS':
      return 'Sucesso';
    case 'FAILED':
      return 'Falha';
    case 'PARTIAL':
      return 'Parcial';
    case 'RUNNING':
      return 'Em andamento';
    default:
      return status || '—';
  }
}

function executionStatusStyle(status?: string): React.CSSProperties {
  switch ((status || '').toUpperCase()) {
    case 'SUCCESS':
      return { background: '#e6f7f3', color: '#00b090', borderColor: '#b3ebd9' };
    case 'FAILED':
      return { background: '#fdecea', color: '#c0392b', borderColor: '#f5c6cb' };
    case 'PARTIAL':
      return { background: '#fff8e6', color: '#b7791f', borderColor: '#f3e0a8' };
    case 'RUNNING':
      return { background: '#eef0ff', color: '#673de6', borderColor: '#d5ccf8' };
    default:
      return {};
  }
}

function executionDuration(item: CollectorExecution): string {
  if ((item.status || '').toUpperCase() === 'RUNNING' || !item.finishedAt) {
    return 'Em andamento';
  }
  const start = new Date(item.startedAt).getTime();
  const end = new Date(item.finishedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return '—';
  }
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60_000)} min`;
}

type ExecutionFileKind = 'json' | 'html' | 'text' | 'pdf' | 'csv' | 'markdown' | 'generic';

function looksLikeJson(value?: string): boolean {
  const normalized = (value || '').trim().toLowerCase();
  return normalized.includes('json') || normalized.endsWith('.json');
}

function fileKindFromNameOrType(fileName?: string, contentType?: string): ExecutionFileKind | null {
  const name = (fileName || '').trim().toLowerCase();
  const type = (contentType || '').trim().toLowerCase();
  if (looksLikeJson(name) || type.includes('json')) return 'json';
  if (name.endsWith('.html') || type.includes('html')) return 'html';
  if (name.endsWith('.md') || type.includes('markdown')) return 'markdown';
  if (name.endsWith('.csv') || type.includes('csv')) return 'csv';
  if (name.endsWith('.pdf') || type.includes('pdf')) return 'pdf';
  if (name.endsWith('.txt') || type === 'text/plain') return 'text';
  return null;
}

function agentDefaultFileKind(agent: CollectorAgent | null): ExecutionFileKind {
  if (!agent) return 'generic';
  const collectorType = String(agent.collectorType || '').toUpperCase();
  const cfg = agent.collectorConfig || {};
  const outputName = String(cfg.output_file_name || cfg.outputFileName || '');
  const fromOutput = fileKindFromNameOrType(outputName);
  if (fromOutput) return fromOutput;

  if (collectorType === 'API_REST') return 'json';
  if (collectorType === 'HTML_SCRAPER') {
    const format = String(cfg.output_format || cfg.outputFormat || 'html').toLowerCase();
    return format === 'text' ? 'text' : 'html';
  }
  if (collectorType === 'DOCUMENT_FETCHER') {
    const extensions = cfg.accepted_extensions ?? cfg.acceptedExtensions;
    const normalized = Array.isArray(extensions)
      ? extensions.map((item) => String(item).toLowerCase()).join(',')
      : String(extensions || '').toLowerCase();
    if (normalized.includes('pdf')) return 'pdf';
    if (normalized.includes('csv')) return 'csv';
    if (normalized.includes('html')) return 'html';
    if (normalized.includes('md')) return 'markdown';
    if (normalized.includes('txt')) return 'text';
  }
  return 'generic';
}

function executionFileKind(item: CollectorExecution, agent: CollectorAgent | null): ExecutionFileKind {
  const refs = payloadRefsFromMetadata(item.metadata);
  if (refs.some((ref) => ref.kind === 'snapshot')) return 'json';
  if (refs.some((ref) => ref.kind === 'document')) return agentDefaultFileKind(agent);
  return agentDefaultFileKind(agent);
}

function executionFileLabel(kind: ExecutionFileKind): string {
  const labels: Record<ExecutionFileKind, string> = {
    json: 'JSON',
    html: 'HTML',
    text: 'texto',
    pdf: 'PDF',
    csv: 'CSV',
    markdown: 'Markdown',
    generic: 'arquivo',
  };
  return labels[kind];
}

function executionFileIcon(kind: ExecutionFileKind) {
  switch (kind) {
    case 'json':
      return FileJson;
    case 'html':
      return FileCode;
    case 'text':
    case 'markdown':
      return FileText;
    case 'csv':
      return FileSpreadsheet;
    case 'pdf':
      return FileType;
    default:
      return File;
  }
}

function ExecutionFileIcon({ kind, size = 16 }: { kind: ExecutionFileKind; size?: number }) {
  const Icon = executionFileIcon(kind);
  return <Icon size={size} aria-hidden="true" />;
}

function payloadRefsFromMetadata(meta?: Record<string, unknown>): Array<{ kind: string; id: string }> {
  const raw = meta?.payload_refs;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const item = entry as Record<string, unknown>;
    const kind = String(item.kind || '').trim().toLowerCase();
    const id = String(item.id || '').trim();
    if (!kind || !id) return [];
    return [{ kind, id }];
  });
}

function executionHasFilePayload(item: CollectorExecution): boolean {
  const status = (item.status || '').toUpperCase();
  if (item.itemsUploaded <= 0 || status === 'RUNNING') return false;
  return true;
}

function isJsonPayloadItem(item: ExecutionPayloadItem): boolean {
  if (item.kind === 'snapshot') return true;
  if (looksLikeJson(item.contentType) || looksLikeJson(item.fileName)) return true;
  if (item.payload && Object.keys(item.payload).length > 0) return true;
  if (item.previewText) {
    try {
      JSON.parse(item.previewText);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

function prettyPayloadJson(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function payloadItemKind(item: ExecutionPayloadItem, agent: CollectorAgent | null): ExecutionFileKind {
  if (item.kind === 'snapshot') return 'json';
  const fromMeta = fileKindFromNameOrType(item.fileName, item.contentType);
  if (fromMeta) return fromMeta;
  return agentDefaultFileKind(agent);
}

function payloadItemBody(item: ExecutionPayloadItem): string {
  if (item.payload && Object.keys(item.payload).length > 0) {
    return isJsonPayloadItem(item) ? prettyPayloadJson(item.payload) : prettyPayloadJson(item.payload);
  }
  if (item.previewText) {
    return isJsonPayloadItem(item) ? prettyPayloadJson(item.previewText) : item.previewText;
  }
  if (item.fileName) {
    const suffix = item.contentType ? ` (${item.contentType})` : '';
    return `Arquivo: ${item.fileName}${suffix}`;
  }
  return '';
}

function formatExecutionWhen(isoDate?: string): { primary: string; secondary: string } {
  if (!isoDate) return { primary: '—', secondary: '' };
  try {
    const date = new Date(isoDate);
    const primary = date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const secondary = date.toLocaleString('pt-BR', { weekday: 'short' });
    return { primary, secondary };
  } catch {
    return { primary: isoDate, secondary: '' };
  }
}

type HistorySortKey = 'startedAt' | 'duration' | 'status' | 'itemsCollected' | 'itemsUploaded';
type HistorySortDir = 'asc' | 'desc';
type HistoryStatusFilter = '' | 'SUCCESS' | 'FAILED' | 'PARTIAL' | 'RUNNING';

const HISTORY_PAGE_SIZE = 10;

function executionDurationMs(item: CollectorExecution): number {
  if ((item.status || '').toUpperCase() === 'RUNNING' || !item.finishedAt) {
    return -1;
  }
  const start = new Date(item.startedAt).getTime();
  const end = new Date(item.finishedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return 0;
  }
  return end - start;
}

function compareHistoryExecutions(a: CollectorExecution, b: CollectorExecution, key: HistorySortKey): number {
  switch (key) {
    case 'startedAt':
      return new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime();
    case 'duration':
      return executionDurationMs(a) - executionDurationMs(b);
    case 'status':
      return executionStatusLabel(a.status).localeCompare(executionStatusLabel(b.status), 'pt-BR');
    case 'itemsCollected':
      return a.itemsCollected - b.itemsCollected;
    case 'itemsUploaded':
      return a.itemsUploaded - b.itemsUploaded;
    default:
      return 0;
  }
}

function compactExecutionId(value?: string): string {
  if (!value) return '—';
  const trimmed = value.trim();
  if (trimmed.length <= 14) return trimmed;
  return `${trimmed.slice(0, 8)}…${trimmed.slice(-4)}`;
}

function executionSummary(items: CollectorExecution[]) {
  const normalized = items.map((item) => (item.status || '').toUpperCase());
  const success = normalized.filter((status) => status === 'SUCCESS').length;
  const completed = normalized.filter((status) => status !== 'RUNNING').length;
  return {
    total: items.length,
    success,
    failed: normalized.filter((status) => status === 'FAILED').length,
    partial: normalized.filter((status) => status === 'PARTIAL').length,
    running: normalized.filter((status) => status === 'RUNNING').length,
    successRate: completed > 0 ? Math.round((success / completed) * 100) : null,
    last: items[0],
  };
}

function typeLabel(type?: string): string {
  if (type === 'API_REST') return 'API REST';
  if (type === 'HTML_SCRAPER') return 'HTML scraper';
  if (type === 'DOCUMENT_FETCHER') return 'Documentos';
  return type || '—';
}

function scheduleLines(schedule?: CollectorSchedule): { days: string; hours: string } {
  if (!schedule) return { days: '—', hours: '' };
  const days = [...(schedule.daysOfWeek || [])]
    .sort((a, b) => a - b)
    .map((day) => WEEKDAYS.find((item) => item.value === day)?.label)
    .filter(Boolean)
    .join(', ');
  const window = `${schedule.startTime || '—'}–${schedule.endTime || '—'}`;
  const interval = schedule.intervalMinutes ? `${schedule.intervalMinutes} min` : '';
  return {
    days: days || '—',
    hours: [window, interval].filter(Boolean).join(' · '),
  };
}

function ScheduleCell({ schedule }: { schedule?: CollectorSchedule }) {
  const { days, hours } = scheduleLines(schedule);
  return (
    <div className="agent-schedule" title={hours ? `${days} · ${hours}` : days}>
      <span className="agent-schedule-days">{days}</span>
      {hours ? <span className="agent-schedule-hours">{hours}</span> : null}
    </div>
  );
}

function LastExecutionWhen({ execution }: { execution?: CollectorAgent['lastExecution'] }) {
  if (!execution?.startedAt) return <span className="table-cell-muted">—</span>;
  return <span>{formatDate(execution.startedAt)}</span>;
}

function LastExecutionStatus({ execution }: { execution?: CollectorAgent['lastExecution'] }) {
  if (!execution?.status) return <span className="table-cell-muted">—</span>;
  return (
    <span className="badge-role" style={executionStatusStyle(execution.status)}>
      {executionStatusLabel(execution.status)}
    </span>
  );
}

function incidentClassificationLabel(classification?: string): string {
  switch ((classification || '').toLowerCase()) {
    case 'source_changed':
      return 'Fonte mudou';
    case 'auth':
      return 'Auth';
    case 'rate_limited':
      return 'Rate limit';
    case 'transient_exhausted':
      return 'Transiente';
    case 'not_found':
      return 'Não encontrado';
    default:
      return classification ? classification : 'Incidente';
  }
}

function IncidentBadge({ incident }: { incident?: CollectorAgent['openIncident'] }) {
  if (!incident) return null;
  const label = incidentClassificationLabel(incident.classification);
  return (
    <span
      className="agent-incident-badge"
      title={`${label} · ${incident.occurrences} ocorrência(s)`}
    >
      {label}
      {incident.occurrences > 1 ? ` · ${incident.occurrences}` : ''}
    </span>
  );
}

function activeIncident(items: CollectorIncident[]): CollectorIncident | null {
  return items.find((item) => item.status === 'open' || item.status === 'acknowledged') || null;
}

function newKeyValueId(): string {
  return `kv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function pairsToMap(entries: KeyValueEntry[]): Record<string, string> {
  const out: Record<string, string> = {};
  entries.forEach((entry) => {
    const key = entry.key.trim();
    if (!key) return;
    out[key] = entry.value;
  });
  return out;
}

function mapToPairs(value: unknown): KeyValueEntry[] {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, string>).map(([key, item]) => ({
    id: newKeyValueId(),
    key,
    value: String(item ?? ''),
  }));
}

function linesToList(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function attachTickerHint(config: Record<string, unknown>, form: AgentForm): Record<string, unknown> {
  const hint = (
    form.ticker
    || form.variableValues.ticker
    || form.variableValues.serie_nome
    || ''
  ).trim().toUpperCase();
  if (hint) config.entity_hint = hint;
  return config;
}

function buildCollectorConfig(form: AgentForm): Record<string, unknown> {
  if (form.collectorType === 'HTML_SCRAPER') {
    return attachTickerHint({
      url: form.url.trim(),
      css_selectors: linesToList(form.cssSelectorsText),
      extract_links: form.extractLinks,
      output_format: form.outputFormat || 'html',
      output_file_name: form.outputFileName.trim() || undefined,
    }, form);
  }
  if (form.collectorType === 'DOCUMENT_FETCHER') {
    const maxSize = Number(form.maxFileSizeBytes);
    return attachTickerHint({
      urls: linesToList(form.urlsText),
      accepted_extensions: form.acceptedExtensions
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      max_file_size_bytes: Number.isFinite(maxSize) && maxSize > 0 ? maxSize : undefined,
    }, form);
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
  };
  if (form.parse.trim()) {
    config.parse = form.parse.trim().toLowerCase();
  }
  if (form.authType !== 'NONE') {
    const loginHeaders = pairsToMap(form.loginHeaders);
    const auth: Record<string, unknown> = {
      type: form.authType,
      header_name: form.authHeaderName.trim() || 'Authorization',
      header_prefix: form.authHeaderPrefix,
    };
    if (form.authType === 'STATIC_BEARER' && form.authToken.trim()) {
      auth.token = form.authToken.trim();
    }
    if (form.authType === 'LOGIN_PASSWORD') {
      auth.username = form.authUsername.trim();
      if (form.authPassword) auth.password = form.authPassword;
      auth.login_url = form.loginUrl.trim();
      auth.login_method = form.loginMethod.trim() || 'POST';
      auth.login_headers = Object.keys(loginHeaders).length ? loginHeaders : undefined;
      auth.login_body_template = form.loginBodyTemplate.trim() || undefined;
      auth.token_path = form.tokenPath.trim() || 'token';
      auth.renew_before_seconds = 300;
    }
    config.auth = auth;
  }
  return attachTickerHint(config, form);
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

function asConfigRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function dataSourceLabel(name?: string | null): string {
  return name?.trim() ? name : '—';
}

function metadataDataSourceName(meta?: Record<string, unknown>): string {
  if (!meta) return '—';
  const name = meta.data_source_name ?? meta.dataSourceName;
  return typeof name === 'string' && name.trim() ? name : '—';
}

function formFromCollectorConfig(cfg: Record<string, unknown>, base: AgentForm): AgentForm {
  const auth = (cfg.auth && typeof cfg.auth === 'object' ? cfg.auth : {}) as Record<string, unknown>;
  const authTypeRaw = String(auth.type || 'NONE').toUpperCase();
  const authType: AuthType = authTypeRaw === 'STATIC_BEARER' || authTypeRaw === 'LOGIN_PASSWORD'
    ? authTypeRaw
    : 'NONE';
  return {
    ...base,
    url: String(cfg.url || ''),
    method: String(cfg.method || 'GET'),
    headers: mapToPairs(cfg.headers),
    queryParams: mapToPairs(cfg.query_params),
    bodyTemplate: String(cfg.body_template || ''),
    outputFileName: String(cfg.output_file_name || ''),
    parse: typeof cfg.parse === 'string' ? cfg.parse : '',
    authType,
    authToken: base.authToken,
    hasToken: Boolean(auth.has_token),
    authUsername: String(auth.username || ''),
    authPassword: base.authPassword,
    hasPassword: Boolean(auth.has_password),
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
    acceptedExtensions: Array.isArray(cfg.accepted_extensions)
      ? (cfg.accepted_extensions as string[]).join(', ')
      : '',
    maxFileSizeBytes: cfg.max_file_size_bytes ? String(cfg.max_file_size_bytes) : '',
  };
}

function applyDataSource(base: AgentForm, source: CollectorDataSource, values: Record<string, string>): AgentForm {
  const ticker = (values.ticker || values.serie_nome || '').trim().toUpperCase();
  const resolved = { ...values, ...(ticker ? { ticker } : {}) };
  const filled = applyPlaceholdersDeep(asConfigRecord(source.configTemplate), resolved);
  const next = formFromCollectorConfig(asConfigRecord(filled), {
    ...base,
    dataSourceId: source.id,
    ticker,
    variableValues: resolved,
    collectorType: (source.collectorType as CollectorType) || 'API_REST',
  });
  const sched = source.defaultSchedule;
  return {
    ...next,
    name: applyPlaceholders(source.nameTemplate || next.name, resolved),
    description: applyPlaceholders(source.descriptionTemplate || next.description, resolved),
    prompt: applyPlaceholders(source.promptTemplate || next.prompt, resolved),
    context: source.defaultContext || next.context,
    daysOfWeek: sched?.daysOfWeek?.length ? sched.daysOfWeek : next.daysOfWeek,
    startTime: sched?.startTime || next.startTime,
    endTime: sched?.endTime || next.endTime,
    intervalMinutes: String(sched?.intervalMinutes || next.intervalMinutes),
    timezone: sched?.timezone || next.timezone,
  };
}

function variableKeysFromSource(source?: CollectorDataSource | null): string[] {
  return (source?.variables || [])
    .map((item) => String(item.key || '').trim())
    .filter(Boolean);
}

function variableValuesFromAgent(
  agent: CollectorAgent,
  cfg: Record<string, unknown>,
  source?: CollectorDataSource | null,
): Record<string, string> {
  const keys = variableKeysFromSource(source);
  if (source) {
    return rehydrateVariableValues({
      variableKeys: keys,
      configTemplate: source.configTemplate || null,
      collectorConfig: cfg,
      nameTemplate: source.nameTemplate,
      descriptionTemplate: source.descriptionTemplate,
      promptTemplate: source.promptTemplate,
      name: agent.name,
      description: agent.description,
      prompt: agent.prompt,
    });
  }
  const ticker = tickerFromConfig(cfg);
  return ticker ? { ticker } : {};
}

function formFromAgent(agent: CollectorAgent, source?: CollectorDataSource | null): AgentForm {
  const cfg = (agent.collectorConfig || {}) as Record<string, unknown>;
  const variableValues = variableValuesFromAgent(agent, cfg, source);
  const ticker = (
    variableValues.ticker
    || tickerFromConfig(cfg)
    || variableValues.serie_nome
    || ''
  ).trim().toUpperCase();
  return {
    ...formFromCollectorConfig(cfg, emptyForm()),
    name: agent.name || '',
    description: agent.description || '',
    context: agent.context || 'geral',
    collectorType: (agent.collectorType as CollectorType) || 'API_REST',
    dataSourceId: agent.dataSourceId || '',
    ticker,
    variableValues,
    prompt: agent.prompt || '',
    enabled: agent.enabled,
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
  { id: 'identity', label: 'Identidade', hint: 'Fonte, nome e tipo' },
  { id: 'collector', label: 'Coleta', hint: 'URL e config' },
  { id: 'schedule', label: 'Agenda', hint: 'Quando roda' },
];

function KeyValueEditor({
  label,
  entries,
  onChange,
  keyPlaceholder = 'Chave',
  valuePlaceholder = 'Valor',
}: {
  label: string;
  entries: KeyValueEntry[];
  onChange: (next: KeyValueEntry[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}) {
  const [draftKey, setDraftKey] = useState('');
  const [draftValue, setDraftValue] = useState('');

  const addEntry = () => {
    const key = draftKey.trim();
    if (!key) return;
    onChange([...entries.filter((item) => item.key.trim().toLowerCase() !== key.toLowerCase()), {
      id: newKeyValueId(),
      key,
      value: draftValue,
    }]);
    setDraftKey('');
    setDraftValue('');
  };

  return (
    <div className="form-group kv-editor">
      <label>{label}</label>
      <div className="kv-editor-add">
        <input
          className="form-input"
          value={draftKey}
          onChange={(e) => setDraftKey(e.target.value)}
          placeholder={keyPlaceholder}
          aria-label={`${label} chave`}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addEntry();
            }
          }}
        />
        <input
          className="form-input"
          value={draftValue}
          onChange={(e) => setDraftValue(e.target.value)}
          placeholder={valuePlaceholder}
          aria-label={`${label} valor`}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addEntry();
            }
          }}
        />
        <button
          type="button"
          className="btn btn-outline btn-pill"
          onClick={addEntry}
          disabled={!draftKey.trim()}
          title="Adicionar"
          aria-label={`Adicionar ${label}`}
        >
          <Plus size={15} />
          <span>Adicionar</span>
        </button>
      </div>
      {entries.length > 0 ? (
        <div className="kv-editor-table-wrap">
          <table className="kv-editor-table">
            <thead>
              <tr>
                <th>Chave</th>
                <th>Valor</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <input
                      className="form-input"
                      value={entry.key}
                      onChange={(e) => onChange(entries.map((item) => (
                        item.id === entry.id ? { ...item, key: e.target.value } : item
                      )))}
                      aria-label="Chave"
                    />
                  </td>
                  <td>
                    <input
                      className="form-input"
                      value={entry.value}
                      onChange={(e) => onChange(entries.map((item) => (
                        item.id === entry.id ? { ...item, value: e.target.value } : item
                      )))}
                      aria-label="Valor"
                    />
                  </td>
                  <td className="kv-editor-actions">
                    <button
                      type="button"
                      className="btn-table-icon"
                      title="Excluir"
                      aria-label={`Excluir ${entry.key || 'item'}`}
                      onClick={() => onChange(entries.filter((item) => item.id !== entry.id))}
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
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

export const AgentsView: React.FC = () => {
  const { getAccessToken } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const { filters, setFilters, applied, page, applyFilters, goToPage } = useAppliedListUrl(EMPTY_FILTERS);
  const [items, setItems] = useState<CollectorAgent[]>([]);
  const [summary, setSummary] = useState<CollectorAgentSummary>({ total: 0, enabled: 0, disabled: 0 });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectPageRef = useRef<HTMLInputElement>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState<{ action: CollectorBulkAction; ids: string[] } | null>(null);
  const [bulkProgress, setBulkProgress] = useState<CollectorBulkProgress | null>(null);
  const [bulkProgressOpen, setBulkProgressOpen] = useState(false);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [credential, setCredential] = useState<CredentialState>({ kind: 'loading' });
  const [formOpen, setFormOpen] = useState(false);
  const [formStep, setFormStep] = useState<FormStep>('identity');
  const [editing, setEditing] = useState<CollectorAgent | null>(null);
  const [form, setForm] = useState<AgentForm>(emptyForm());
  const [dataSources, setDataSources] = useState<CollectorDataSource[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<CollectorAgent | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    agentName: string;
    result: CollectorAgentTestResult;
  } | null>(null);
  const [historyAgent, setHistoryAgent] = useState<CollectorAgent | null>(null);
  const [historyItems, setHistoryItems] = useState<CollectorExecution[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRefreshing, setHistoryRefreshing] = useState(false);
  const [historyStatusFilter, setHistoryStatusFilter] = useState<HistoryStatusFilter>('');
  const [historySortKey, setHistorySortKey] = useState<HistorySortKey | null>(null);
  const [historySortDir, setHistorySortDir] = useState<HistorySortDir>('desc');
  const [historyPage, setHistoryPage] = useState(0);
  const [historyDetail, setHistoryDetail] = useState<CollectorExecution | null>(null);
  const [historyPayloadExecution, setHistoryPayloadExecution] = useState<CollectorExecution | null>(null);
  const [historyPayloadData, setHistoryPayloadData] = useState<ExecutionPayloadItem[]>([]);
  const [historyPayloadLoading, setHistoryPayloadLoading] = useState(false);
  const [historyPayloadError, setHistoryPayloadError] = useState<string | null>(null);
  const [historyIncidents, setHistoryIncidents] = useState<CollectorIncident[]>([]);
  const [historyIncidentError, setHistoryIncidentError] = useState<string | null>(null);
  const [historyIncidentBusy, setHistoryIncidentBusy] = useState<'ack' | 'resolve' | 'apply' | null>(null);
  const [historyIncidentConfirm, setHistoryIncidentConfirm] = useState<'ack' | 'resolve' | 'apply' | null>(null);
  const [historySuggestion, setHistorySuggestion] = useState<CollectorIncidentSuggestion | null>(null);
  const actionsMenu = useRowActionsMenu();
  const [curlModal, setCurlModal] = useState<{
    title: string;
    subtitle?: string;
    blocks: CollectorCurlBlock[];
  } | null>(null);
  const historyItemsRef = useRef(historyItems);
  historyItemsRef.current = historyItems;

  const loadCredential = useCallback(async () => {
    const token = getAccessToken();
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
  }, [getAccessToken]);

  const loadPage = useCallback(async (nextPage: number, nextFilters: Filters, opts?: { silent?: boolean }) => {
    const token = getAccessToken();
    if (!token) return;
    if (opts?.silent) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await searchCollectorAgents({
        q: nextFilters.q,
        enabled: nextFilters.enabled || undefined,
        collectorType: nextFilters.collectorType || undefined,
        dataSourceId: nextFilters.dataSourceId || undefined,
        lastExecutionStatus: nextFilters.lastExecutionStatus || undefined,
        hasOpenIncident: nextFilters.hasOpenIncident || undefined,
        page: nextPage,
        size: 20,
        sort: toApiSort(agentSort(nextFilters.sort)),
        dir: nextFilters.dir,
      }, token);
      setItems(result.content || []);
      setSummary(result.summary || { total: result.totalElements || 0, enabled: 0, disabled: 0 });
      setTotalPages(Math.max(result.totalPages || 1, 1));
    } catch (error) {
      if (!opts?.silent) {
        addToast({
          type: 'error',
          title: 'Falha ao listar agents',
          description: error instanceof Error ? error.message : 'Tente novamente.',
        });
      }
    } finally {
      if (opts?.silent) setRefreshing(false);
      else setLoading(false);
    }
  }, [addToast, getAccessToken]);

  /** Atualiza data/status da última execução após enfileirar coleta (assíncrona). */
  const refreshAgentLastExecution = useCallback(async (agentId: string, token: string, baselineIso: string) => {
    const baselineMs = Date.parse(baselineIso) || Date.now();
    const waitsMs = [1200, 2500, 4000, 6000, 8000];
    for (const wait of waitsMs) {
      await new Promise((resolve) => window.setTimeout(resolve, wait));
      try {
        const executions = await listCollectorAgentExecutions(agentId, token);
        const latest = executions?.[0];
        if (!latest?.startedAt) continue;
        const startedMs = Date.parse(latest.startedAt);
        // Ignora histórico antigo até aparecer execução desta corrida (ou mais nova).
        if (Number.isFinite(startedMs) && startedMs < baselineMs - 5000) continue;

        setItems((prev) => prev.map((row) => (
          row.id === agentId
            ? {
              ...row,
              lastExecution: {
                id: latest.id,
                startedAt: latest.startedAt,
                finishedAt: latest.finishedAt,
                status: latest.status,
              },
            }
            : row
        )));
        if (latest.status !== 'RUNNING') return;
      } catch {
        /* próximo intervalo */
      }
    }
  }, []);

  useEffect(() => {
    loadCredential();
  }, [loadCredential]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    void listCollectorDataSources(token)
      .then((sources) => setDataSources(Array.isArray(sources) ? sources : []))
      .catch(() => setDataSources([]));
  }, [getAccessToken]);

  // Reidrata variáveis se a fonte chegar depois de abrir o modal de edição.
  useEffect(() => {
    if (!formOpen || !editing?.dataSourceId || dataSources.length === 0) return;
    const source = dataSources.find((entry) => entry.id === editing.dataSourceId);
    if (!source) return;
    const keys = variableKeysFromSource(source);
    if (keys.length === 0) return;

    setForm((current) => {
      if (current.dataSourceId !== source.id) return current;
      const missing = keys.some((key) => {
        const value = key === 'ticker'
          ? (current.variableValues.ticker || current.ticker)
          : current.variableValues[key];
        return !String(value || '').trim();
      });
      if (!missing) return current;

      const cfg = (editing.collectorConfig || {}) as Record<string, unknown>;
      const rehydrated = variableValuesFromAgent(editing, cfg, source);
      if (!Object.keys(rehydrated).length) return current;

      const filledCurrent = Object.fromEntries(
        Object.entries(current.variableValues).filter(([, value]) => String(value || '').trim()),
      );
      const variableValues = { ...rehydrated, ...filledCurrent };
      const ticker = (
        current.ticker
        || variableValues.ticker
        || tickerFromConfig(cfg)
        || variableValues.serie_nome
        || ''
      ).trim().toUpperCase();
      return { ...current, variableValues, ticker };
    });
  }, [dataSources, editing, formOpen]);

  useEffect(() => {
    loadPage(page, applied);
  }, [applied, loadPage, page]);

  const appliedKey = JSON.stringify(applied);
  useEffect(() => {
    setSelectedIds(new Set());
  }, [appliedKey]);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    applyFilters(filters);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setFormStep('identity');
    setFormOpen(true);
  };

  const openEdit = async (item: CollectorAgent, event?: React.MouseEvent) => {
    event?.stopPropagation();
    const token = getAccessToken();
    if (!token) return;
    try {
      const detail = await getCollectorAgent(item.id, token);
      const source = dataSources.find((entry) => entry.id === detail.dataSourceId) || null;
      setEditing(detail);
      setForm(formFromAgent(detail, source));
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

  const selectedSource = useMemo(
    () => dataSources.find((source) => source.id === form.dataSourceId) || null,
    [dataSources, form.dataSourceId],
  );

  const sourceVariables = selectedSource?.variables || [];

  const handleDataSourceChange = (id: string) => {
    if (!id) {
      setForm((current) => ({ ...current, dataSourceId: '', ticker: current.ticker }));
      return;
    }
    const source = dataSources.find((item) => item.id === id);
    if (!source) return;
    setForm((current) => {
      const values: Record<string, string> = { ...current.variableValues };
      if (current.ticker) values.ticker = current.ticker;
      (source.variables || []).forEach((item) => {
        if (values[item.key] === undefined) {
          values[item.key] = item.key === 'ticker' ? (current.ticker || '') : '';
        }
      });
      return applyDataSource(current, source, values);
    });
  };

  const handleVariableChange = (key: string, value: string) => {
    setForm((current) => {
      const nextValue = key === 'ticker' ? value.toUpperCase() : value;
      const values = { ...current.variableValues, [key]: nextValue };
      const source = dataSources.find((item) => item.id === current.dataSourceId);
      if (!source) {
        return { ...current, variableValues: values, ticker: key === 'ticker' ? nextValue : current.ticker };
      }
      return applyDataSource({ ...current, ticker: key === 'ticker' ? nextValue : current.ticker, variableValues: values }, source, values);
    });
  };

  const validateStep = (step: FormStep): boolean => {
    if (step === 'identity') {
      if (selectedSource) {
        const missing = (selectedSource.variables || []).find((item) => {
          if (!item.required) return false;
          const value = item.key === 'ticker'
            ? (form.variableValues.ticker || form.ticker)
            : form.variableValues[item.key];
          return !String(value || '').trim();
        });
        if (missing) {
          addToast({ type: 'error', title: `${missing.label || missing.key} é obrigatório para esta fonte` });
          return false;
        }
      }
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
      if (form.collectorType === 'API_REST' && form.authType === 'STATIC_BEARER') {
        if (!form.authToken.trim() && !form.hasToken) {
          addToast({ type: 'error', title: 'Informe o token Bearer' });
          return false;
        }
      }
      if (form.collectorType === 'API_REST' && form.authType === 'LOGIN_PASSWORD') {
        if (!form.loginUrl.trim()) {
          addToast({ type: 'error', title: 'URL de login é obrigatória' });
          return false;
        }
        if (!form.authUsername.trim()) {
          addToast({ type: 'error', title: 'Usuário de login é obrigatório' });
          return false;
        }
        if (!form.authPassword && !form.hasPassword) {
          addToast({ type: 'error', title: 'Senha de login é obrigatória' });
          return false;
        }
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
    if (formStep !== 'schedule') {
      handleNextStep();
      return;
    }
    const token = getAccessToken();
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
          context: form.context.trim() || 'geral',
          collectorConfig: buildCollectorConfig(form),
          prompt: form.prompt,
          schedule: buildSchedule(form),
          dataSourceId: form.dataSourceId || undefined,
        }, token);
        addToast({ type: 'success', title: 'Agent atualizado' });
      } else {
        await createCollectorAgent({
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          context: form.context.trim() || 'geral',
          collectorType: form.collectorType,
          collectorConfig: buildCollectorConfig(form),
          prompt: form.prompt || undefined,
          schedule: buildSchedule(form),
          enabled: form.enabled,
          dataSourceId: form.dataSourceId || undefined,
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

  const handleToggle = async (item: CollectorAgent, event?: React.MouseEvent) => {
    event?.stopPropagation();
    const token = getAccessToken();
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

  const handleTest = async (item: CollectorAgent, event?: React.MouseEvent) => {
    event?.stopPropagation();
    const token = getAccessToken();
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

  const attachActiveBulk = useCallback(async (token: string, openModal: boolean) => {
    try {
      const active = await getCollectorActiveBulkOperation(token);
      if (!active || active.status === 'completed' || active.status === 'failed') {
        return false;
      }
      setBulkProgress(active);
      if (openModal) setBulkProgressOpen(true);
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    void attachActiveBulk(token, false);
  }, [attachActiveBulk, getAccessToken]);

  const handleRun = async (item: CollectorAgent, event?: React.MouseEvent) => {
    event?.stopPropagation();
    const token = getAccessToken();
    if (!token) return;
    const bulkBusyNow = !!bulkProgress && bulkProgress.status !== 'completed' && bulkProgress.status !== 'failed';
    if (bulkBusyNow) {
      addToast({
        type: 'error',
        title: 'Lote em andamento',
        description: 'Aguarde o lote atual terminar para executar um agent.',
      });
      return;
    }
    setRunningId(item.id);
    try {
      const result = await runCollectorAgent(item.id, token);
      const startedAt = new Date().toISOString();
      setItems((prev) => prev.map((row) => (
        row.id === item.id
          ? {
            ...row,
            lastExecution: {
              id: row.lastExecution?.id || `running-${item.id}`,
              startedAt,
              status: 'RUNNING',
            },
          }
          : row
      )));
      addToast({
        type: 'success',
        title: 'Coleta enfileirada',
        description: result.status === 'queued'
          ? `${item.name} vai executar agora, fora da agenda. Acompanhe no Histórico.`
          : `${item.name}: ${result.status}`,
      });
      void refreshAgentLastExecution(item.id, token, startedAt);
    } catch (error) {
      const status = (error as { status?: number } | null)?.status;
      if (status === 409 && await attachActiveBulk(token, true)) {
        addToast({
          type: 'info',
          title: 'Lote em andamento',
          description: 'Já existe um lote nesta organização. Acompanhe o progresso; itens parados são liberados automaticamente.',
        });
        return;
      }
      addToast({
        type: 'error',
        title: 'Falha ao executar agent',
        description: error instanceof Error ? error.message : 'Tente novamente.',
      });
    } finally {
      setRunningId(null);
    }
  };

  const loadHistoryData = useCallback(async (agentId: string, silent = false) => {
    const token = getAccessToken();
    if (!token) return;
    if (silent) {
      setHistoryRefreshing(true);
    } else {
      setHistoryLoading(true);
    }
    try {
      const executions = await listCollectorAgentExecutions(agentId, token);
      setHistoryItems(Array.isArray(executions) ? executions : []);
      try {
        const incidents = await listCollectorAgentIncidents(agentId, token);
        const list = Array.isArray(incidents) ? incidents : [];
        setHistoryIncidents(list);
        setHistoryIncidentError(null);
        const current = activeIncident(list);
        if (current && (current.status === 'open' || current.status === 'acknowledged')) {
          const suggestion = await getCollectorIncidentSuggestion(current.id, token).catch(() => null);
          setHistorySuggestion(suggestion && suggestion.incidentId ? suggestion : null);
        } else {
          setHistorySuggestion(null);
        }
      } catch (incidentError) {
        setHistoryIncidentError(incidentError instanceof Error ? incidentError.message : 'Falha ao carregar incidente.');
      }
    } catch (error) {
      if (!silent) {
        setHistoryAgent(null);
        addToast({
          type: 'error',
          title: 'Falha ao carregar histórico',
          description: error instanceof Error ? error.message : 'Tente novamente.',
        });
      }
    } finally {
      setHistoryLoading(false);
      setHistoryRefreshing(false);
    }
  }, [addToast, getAccessToken]);

  const runIncidentAction = async (action: 'ack' | 'resolve' | 'apply') => {
    const token = getAccessToken();
    const current = activeIncident(historyIncidents);
    if (!token || !current) return;
    setHistoryIncidentBusy(action);
    setHistoryIncidentError(null);
    try {
      let updated: CollectorIncident;
      if (action === 'ack') updated = await acknowledgeCollectorIncident(current.id, token);
      else if (action === 'resolve') updated = await resolveCollectorIncident(current.id, token);
      else updated = await applyCollectorIncidentSuccessor(current.id, token);
      setHistoryIncidents((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setHistoryIncidentConfirm(null);
      if (action === 'resolve' || action === 'apply') {
        setHistorySuggestion(null);
        setItems((prev) => prev.map((row) => (
          row.id === current.agentId ? { ...row, openIncident: undefined } : row
        )));
      }
      addToast({
        type: 'success',
        title: action === 'ack' ? 'Incidente reconhecido' : action === 'resolve' ? 'Incidente resolvido' : 'Sucessor aplicado',
        description: action === 'ack'
          ? 'A coleta continua.'
          : action === 'resolve'
            ? 'Uma nova falha abre outro incidente.'
            : 'Configuração atualizada e incidente fechado.',
      });
    } catch (error) {
      setHistoryIncidentError(error instanceof Error ? error.message : 'Falha ao atualizar incidente.');
    } finally {
      setHistoryIncidentBusy(null);
    }
  };

  const closeHistory = () => {
    setHistoryAgent(null);
    setHistoryItems([]);
    setHistoryDetail(null);
    setHistoryPayloadExecution(null);
    setHistoryPayloadData([]);
    setHistoryPayloadError(null);
    setHistoryIncidents([]);
    setHistoryIncidentError(null);
    setHistoryIncidentBusy(null);
    setHistoryIncidentConfirm(null);
    setHistorySuggestion(null);
    setHistoryPage(0);
    setHistoryStatusFilter('');
    setHistorySortKey(null);
    setHistorySortDir('desc');
  };

  const openHistory = async (item: CollectorAgent, event?: React.MouseEvent) => {
    event?.stopPropagation();
    const token = getAccessToken();
    if (!token) return;
    setHistoryAgent(item);
    setHistoryItems([]);
    setHistoryDetail(null);
    setHistoryPayloadExecution(null);
    setHistoryPayloadData([]);
    setHistoryPayloadError(null);
    setHistoryIncidents([]);
    setHistoryIncidentError(null);
    setHistoryIncidentBusy(null);
    setHistoryIncidentConfirm(null);
    setHistorySuggestion(null);
    setHistoryPage(0);
    setHistoryStatusFilter('');
    setHistorySortKey(null);
    setHistorySortDir('desc');
    await loadHistoryData(item.id, false);
  };

  useEffect(() => {
    if (!historyAgent) return undefined;
    const intervalId = window.setInterval(() => {
      const hasRunning = historyItemsRef.current.some(
        (item) => (item.status || '').toUpperCase() === 'RUNNING',
      );
      if (hasRunning) {
        void loadHistoryData(historyAgent.id, true);
      }
    }, 4000);
    return () => window.clearInterval(intervalId);
  }, [historyAgent, loadHistoryData]);

  const historyFiltered = useMemo(() => {
    if (!historyStatusFilter) return historyItems;
    return historyItems.filter(
      (item) => (item.status || '').toUpperCase() === historyStatusFilter,
    );
  }, [historyItems, historyStatusFilter]);

  const historySorted = useMemo(() => {
    if (!historySortKey) return historyFiltered;
    const sorted = [...historyFiltered].sort((a, b) => compareHistoryExecutions(a, b, historySortKey));
    return historySortDir === 'asc' ? sorted : sorted.reverse();
  }, [historyFiltered, historySortKey, historySortDir]);

  const historyTotalPages = Math.max(1, Math.ceil(historySorted.length / HISTORY_PAGE_SIZE));

  const historyDisplayed = useMemo(() => {
    const start = historyPage * HISTORY_PAGE_SIZE;
    return historySorted.slice(start, start + HISTORY_PAGE_SIZE);
  }, [historySorted, historyPage]);

  useEffect(() => {
    setHistoryPage(0);
  }, [historyStatusFilter, historySortKey, historySortDir]);

  useEffect(() => {
    if (historyPage > historyTotalPages - 1) {
      setHistoryPage(Math.max(historyTotalPages - 1, 0));
    }
  }, [historyPage, historyTotalPages]);

  const toggleHistorySort = (key: HistorySortKey) => {
    if (historySortKey === key) {
      setHistorySortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setHistorySortKey(key);
    setHistorySortDir(key === 'startedAt' || key === 'duration' ? 'desc' : 'asc');
  };

  const historySortIcon = (key: HistorySortKey) => {
    if (historySortKey !== key) return <ChevronsUpDown size={13} />;
    return historySortDir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />;
  };

  const openHistoryDetail = (execution: CollectorExecution) => {
    setHistoryDetail(execution);
  };

  const closeHistoryPayload = () => {
    setHistoryPayloadExecution(null);
    setHistoryPayloadData([]);
    setHistoryPayloadError(null);
    setHistoryPayloadLoading(false);
  };

  const openHistoryPayload = async (execution: CollectorExecution, event?: React.MouseEvent) => {
    event?.stopPropagation();
    const token = getAccessToken();
    if (!token) return;
    setHistoryPayloadExecution(execution);
    setHistoryPayloadData([]);
    setHistoryPayloadError(null);
    setHistoryPayloadLoading(true);
    try {
      const raw = await getExecutionPayloads(execution.id, token);
      setHistoryPayloadData(Array.isArray(raw) ? raw : []);
    } catch (error) {
      setHistoryPayloadError(error instanceof Error ? error.message : 'Não foi possível carregar o payload.');
    } finally {
      setHistoryPayloadLoading(false);
    }
  };

  const handleDelete = async () => {
    const token = getAccessToken();
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

  const pageIds = useMemo(() => items.map((item) => item.id), [items]);
  const selectedCount = selectedIds.size;
  const selectedOnPage = pageIds.filter((id) => selectedIds.has(id)).length;
  const selectedOffPage = selectedCount - selectedOnPage;
  const allPageSelected = pageIds.length > 0 && selectedOnPage === pageIds.length;
  const somePageSelected = selectedOnPage > 0 && selectedOnPage < pageIds.length;

  useEffect(() => {
    const input = selectPageRef.current;
    if (input) input.indeterminate = somePageSelected;
  }, [somePageSelected]);

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const togglePageSelection = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      pageIds.forEach((id) => {
        if (checked) next.add(id);
        else next.delete(id);
      });
      return next;
    });
  };

  const needsConfirm = (action: CollectorBulkAction, count: number) => {
    if (action === 'delete' || action === 'scan_incidents') return true;
    if (action === 'run') return count >= 2;
    return count >= 5;
  };

  const requestBulk = (action: CollectorBulkAction) => {
    const bulkBusyNow = !!bulkProgress && bulkProgress.status !== 'completed' && bulkProgress.status !== 'failed';
    if (bulkBusyNow || bulkBusy) return;
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (needsConfirm(action, ids.length)) {
      setBulkConfirm({ action, ids });
      return;
    }
    void executeBulk(action, ids);
  };

  const bulkCopy = (action: CollectorBulkAction, count: number) => {
    if (action === 'delete') {
      return {
        title: 'Excluir agents',
        body: `Excluir ${count} agents? Isso não remove a credencial OAuth da organização.`,
        confirm: 'Excluir',
      };
    }
    if (action === 'run') {
      return {
        title: 'Executar agents',
        body: `Enfileirar coleta agora para ${count} agents (fora da agenda)? Acompanhe o progresso do lote; você pode sair desta tela.`,
        confirm: 'Executar',
      };
    }
    if (action === 'enable') {
      return {
        title: 'Ativar agents',
        body: `Ativar ${count} agents selecionados?`,
        confirm: 'Ativar',
      };
    }
    if (action === 'scan_incidents') {
      return {
        title: 'Varrer incidentes',
        body: `Classificar offline ${count} agents (último log + reprobe)? Não enfileira coleta. Acompanhe o progresso do lote.`,
        confirm: 'Varrer',
      };
    }
    return {
      title: 'Desativar agents',
      body: `Desativar ${count} agents selecionados?`,
      confirm: 'Desativar',
    };
  };

  const executeBulk = async (action: CollectorBulkAction, ids: string[]) => {
    const token = getAccessToken();
    if (!token) return;
    setBulkBusy(true);
    setBulkConfirm(null);
    try {
      const result = await bulkCollectorAgents(action, ids, token);
      const failed = result.failed?.length || 0;
      const ok = result.succeeded?.length || 0;
      if ((action === 'run' || action === 'scan_incidents') && result.bulkId) {
        if (action === 'run') {
          const startedAt = new Date().toISOString();
          const succeeded = new Set(result.succeeded || []);
          setItems((prev) => prev.map((row) => (
            succeeded.has(row.id)
              ? {
                ...row,
                lastExecution: {
                  id: row.lastExecution?.id || `running-${row.id}`,
                  startedAt,
                  status: 'RUNNING',
                },
              }
              : row
          )));
        }
        addToast({
          type: failed ? 'error' : 'success',
          title: action === 'scan_incidents' ? 'Varredura iniciada' : 'Lote enfileirado',
          description: failed ? `${ok} na fila, ${failed} falharam.` : `${ok} agents na fila.`,
        });
        setBulkProgress({
          id: result.bulkId,
          action: result.action,
          status: 'running',
          commands: { total: result.requested, succeeded: ok, failed },
          collections: { pending: ok, running: 0, succeeded: 0, failed: 0 },
        });
        setBulkProgressOpen(true);
      } else {
        addToast({
          type: failed ? 'error' : 'success',
          title: failed ? 'Lote parcial' : 'Lote concluído',
          description: failed ? `${ok} ok, ${failed} falharam.` : `${ok} agents atualizados.`,
        });
        setSelectedIds(new Set());
        await loadPage(page, applied);
      }
    } catch (error) {
      const status = (error as { status?: number } | null)?.status;
      if (status === 409 && await attachActiveBulk(token, true)) {
        addToast({
          type: 'info',
          title: 'Lote em andamento',
          description: 'Já existe um lote nesta organização. Acompanhe o progresso; itens parados são liberados automaticamente.',
        });
        return;
      }
      addToast({
        type: 'error',
        title: 'Falha no lote',
        description: error instanceof Error ? error.message : 'Tente novamente.',
      });
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkProgressId = bulkProgress?.id;
  const bulkProgressDone = bulkProgress?.status === 'completed' || bulkProgress?.status === 'failed';
  const bulkLocked = bulkBusy || (!!bulkProgress && !bulkProgressDone);

  useEffect(() => {
    if (!bulkProgressId || bulkProgressDone) return;
    const token = getAccessToken();
    if (!token) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const next = await getCollectorBulkOperation(bulkProgressId, token);
        if (cancelled) return;
        setBulkProgress(next);
        // Atualiza última execução na tabela enquanto o lote (run) progride.
        if (next.action === 'run') {
          await loadPage(page, applied, { silent: true });
        }
        if (next.status === 'completed' || next.status === 'failed') {
          setSelectedIds(new Set());
          await loadPage(page, applied, { silent: true });
        }
      } catch {
        /* poll continua no próximo intervalo */
      }
    };
    const timer = window.setInterval(() => { void tick(); }, 4000);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [applied, bulkProgressDone, bulkProgressId, getAccessToken, loadPage, page]);

  const filterActions = (
    <div className="audits-filter-actions">
      <button type="submit" className="btn btn-secondary btn-pill audits-filter-submit" disabled={loading || refreshing}>
        <Search size={15} />
        <span>Filtrar</span>
      </button>
      <RefreshCombo
        onRefresh={() => void loadPage(page, applied, { silent: true })}
        disabled={loading || refreshing}
        refreshing={refreshing}
      />
    </div>
  );

  const pager = (includeFilter = false) => (
    <ListPager
      loading={loading}
      refreshing={refreshing}
      page={page}
      totalPages={totalPages}
      onPrev={() => goToPage(page - 1)}
      onNext={() => goToPage(page + 1)}
      leading={includeFilter ? filterActions : undefined}
    />
  );

  const openAgentCurl = (
    title: string,
    agentId: string | undefined,
    collectorType: CollectorType | string,
    config: Record<string, unknown>,
    ticker: string,
    variableValues: Record<string, string>,
  ) => {
    const normalizedTicker = ticker.trim().toUpperCase() || tickerFromConfig(config) || 'PETR4';
    const values = { ...variableValues, ticker: normalizedTicker };
    const originBlocks = buildCollectorOriginCurlBlocksResolved(collectorType, config, values);
    const blocks: CollectorCurlBlock[] = [...originBlocks];
    if (agentId) {
      blocks.push(buildKeepGuardTestCurl(agentId, getAccessToken()));
    }
    if (!blocks.length) {
      addToast({
        type: 'error',
        title: 'CURL indisponível',
        description: 'Configure a URL (ou salve o agent) antes de gerar o CURL.',
      });
      return;
    }
    setCurlModal({
      title,
      subtitle: agentId
        ? `Origem (${normalizedTicker}) + dry-run KeepGuard sem gravar no Mongo.`
        : `Origem (${normalizedTicker}). Salve o agent para incluir o CURL de teste KeepGuard.`,
      blocks,
    });
  };

  const openAgentCurlFromItem = (agent: CollectorAgent) => {
    const cfg = asConfigRecord(agent.collectorConfig);
    const source = dataSources.find((entry) => entry.id === agent.dataSourceId) || null;
    const variableValues = variableValuesFromAgent(agent, cfg, source);
    openAgentCurl(
      `CURL — ${agent.name}`,
      agent.id,
      agent.collectorType,
      cfg,
      variableValues.ticker || tickerFromConfig(cfg) || agent.name,
      variableValues,
    );
  };

  const openAgentCurlFromForm = () => {
    const config = buildCollectorConfig(form);
    openAgentCurl(
      editing ? `CURL — ${form.name.trim() || editing.name}` : 'CURL do agent (rascunho)',
      editing?.id,
      form.collectorType,
      config,
      form.ticker,
      form.variableValues,
    );
  };

  const renderActions = (item: CollectorAgent, prefix = 'desktop') => (
    <RowActionsMenu
      id={`${prefix}-${item.id}`}
      ariaLabel={`Ações do agent ${item.name}`}
      menuState={actionsMenu}
      items={[
        {
          id: 'history',
          label: 'Histórico',
          icon: <History size={15} />,
          onSelect: () => { void openHistory(item); },
        },
        {
          id: 'curl',
          label: 'Copiar CURL',
          icon: <Terminal size={15} />,
          onSelect: () => openAgentCurlFromItem(item),
        },
        {
          id: 'test',
          label: testingId === item.id ? 'Testando…' : 'Testar coleta',
          icon: <FlaskConical size={15} />,
          disabled: testingId === item.id,
          onSelect: () => { void handleTest(item); },
        },
        {
          id: 'run',
          label: runningId === item.id ? 'Enfileirando…' : 'Executar',
          icon: <Play size={15} />,
          disabled: runningId === item.id || bulkLocked,
          onSelect: () => { void handleRun(item); },
        },
        {
          id: 'edit',
          label: 'Editar',
          icon: <Pencil size={15} />,
          onSelect: () => { void openEdit(item); },
        },
        {
          id: 'toggle',
          label: item.enabled ? 'Desativar' : 'Ativar',
          icon: item.enabled ? <PowerOff size={15} /> : <Power size={15} />,
          disabled: bulkLocked,
          onSelect: () => { void handleToggle(item); },
        },
        {
          id: 'delete',
          label: 'Excluir',
          icon: <Trash2 size={15} />,
          isDanger: true,
          dividerBefore: true,
          disabled: bulkLocked,
          onSelect: () => setConfirmDelete(item),
        },
      ]}
    />
  );

  const goClientSystem = () => navigate(PATHS.clientSystem);

  return (
    <div>
      <div className="client-system-create-row">
        <div className="client-system-create-actions">
          <button type="button" className="btn btn-primary btn-pill" onClick={openCreate}>
            <Plus size={15} />
            <span>Criar</span>
          </button>
        </div>
      </div>

      {bulkLocked && bulkProgress ? (
        <div className="agents-bulk-running" role="status">
          <span>Lote em andamento ({bulkProgress.action}). Outras ações em massa e a execução manual ficam bloqueadas até concluir.</span>
          <button type="button" className="btn btn-outline btn-pill" onClick={() => setBulkProgressOpen(true)}>
            Ver progresso
          </button>
        </div>
      ) : null}

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

      <form className="audits-toolbar agents-toolbar" onSubmit={handleSearch}>
        <div className="audits-filter-row client-system-filter-row agents-filter-row">
          <div className="search-input-wrapper audits-search-field">
            <Search size={16} className="search-icon" />
            <input
              className="search-input"
              placeholder="Nome do agent"
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              aria-label="Nome do agent"
            />
          </div>
          <select
            className="form-input audits-compact-select"
            value={filters.dataSourceId}
            onChange={(e) => setFilters((f) => ({ ...f, dataSourceId: e.target.value }))}
            aria-label="Fonte"
          >
            <option value="">Todas as fontes</option>
            <option value="none">Personalizada</option>
            {dataSources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </select>
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
            aria-label="Status do agent"
          >
            <option value="">Agent: todos</option>
            <option value="true">Ativo</option>
            <option value="false">Inativo</option>
          </select>
          <select
            className="form-input audits-compact-select agents-exec-status-filter"
            value={filters.lastExecutionStatus}
            onChange={(e) => setFilters((f) => ({
              ...f,
              lastExecutionStatus: e.target.value as Filters['lastExecutionStatus'],
            }))}
            aria-label="Status da execução"
          >
            <option value="">Execução: todas</option>
            <option value="SUCCESS">Sucesso</option>
            <option value="FAILED">Falha</option>
            <option value="PARTIAL">Parcial</option>
            <option value="RUNNING">Em andamento</option>
            <option value="NONE">Sem execução</option>
          </select>
        </div>
        <div className="audits-filter-row client-system-filter-row-sort">
          <div className="audits-sort-group" role="group" aria-label="Ordenação">
            <select
              className="form-input audits-sort-select"
              value={agentSort(filters.sort)}
              onChange={(e) => setFilters((f) => ({ ...f, sort: agentSort(e.target.value) }))}
              aria-label="Ordenar por"
              title="Ordenar por"
            >
              <option value="name">Nome</option>
              <option value="enabled">Status</option>
              <option value="lastExecution">Última execução</option>
            </select>
            <select
              className="form-input audits-dir-select"
              value={filters.dir}
              onChange={(e) => setFilters((f) => ({ ...f, dir: e.target.value as Filters['dir'] }))}
              aria-label="Ordem"
              title="Ordem (crescente ou decrescente)"
            >
              <option value="asc">Crescente</option>
              <option value="desc">Decrescente</option>
            </select>
          </div>
        </div>
        {pager(true)}
      </form>

      {selectedCount > 0 ? (
        <div className="agents-bulk-bar" role="region" aria-label="Ações em massa">
          <span className="agents-bulk-count" aria-live="polite">
            {selectedCount} selecionados{selectedOffPage > 0 ? ' (incluindo outras páginas)' : ''}
          </span>
          <button type="button" className="btn btn-primary btn-pill" disabled={bulkLocked} onClick={() => requestBulk('run')}>
            <Play size={14} />
            Executar
          </button>
          <button type="button" className="btn btn-outline btn-pill" disabled={bulkLocked} onClick={() => requestBulk('scan_incidents')}>
            <ShieldAlert size={14} />
            Varrer incidentes
          </button>
          <button type="button" className="btn btn-outline btn-pill" disabled={bulkLocked} onClick={() => requestBulk('enable')}>
            <Power size={14} />
            Ativar
          </button>
          <button type="button" className="btn btn-outline btn-pill" disabled={bulkLocked} onClick={() => requestBulk('disable')}>
            <PowerOff size={14} />
            Desativar
          </button>
          <button type="button" className="btn btn-danger btn-pill" disabled={bulkLocked} onClick={() => requestBulk('delete')}>
            <Trash2 size={14} />
            Excluir
          </button>
          <button type="button" className="btn btn-outline btn-pill" disabled={bulkLocked} onClick={() => setSelectedIds(new Set())}>
            Limpar
          </button>
        </div>
      ) : null}

      <div className="hpanel-table-card desktop-table-view has-row-action-menus">
        <table className="hpanel-table">
          <thead>
            <tr>
              <th className="agents-select-col">
                <input
                  ref={selectPageRef}
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={(e) => togglePageSelection(e.target.checked)}
                  aria-label="Selecionar página"
                  disabled={items.length === 0 || bulkLocked}
                />
              </th>
              <th>Fonte</th>
              <th>Nome</th>
              <th>Tipo</th>
              <th>Status</th>
              <th>Agenda</th>
              <th>Última execução</th>
              <th>Status da execução</th>
              <th style={{ textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '2.5rem', color: '#5f6368' }}>
                  Carregando agents...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '2.5rem', color: '#5f6368' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                    <Cpu size={22} />
                    <span>Nenhum agent para os filtros atuais.</span>
                  </div>
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr
                  key={item.id}
                  className={`agent-row-clickable${actionsMenu.openId === `desktop-${item.id}` ? ' has-open-menu' : ''}`}
                  onClick={() => openHistory(item)}
                >
                  <td
                    className="agents-select-col"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={(e) => toggleSelected(item.id, e.target.checked)}
                      aria-label={`Selecionar ${item.name}`}
                      disabled={bulkLocked}
                    />
                  </td>
                  <td>{dataSourceLabel(item.dataSourceName)}</td>
                  <td>
                    <span className="table-cell-title" title={item.name}>{item.name}</span>
                    <IncidentBadge incident={item.openIncident} />
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
                  <td><ScheduleCell schedule={item.schedule} /></td>
                  <td><LastExecutionWhen execution={item.lastExecution} /></td>
                  <td><LastExecutionStatus execution={item.lastExecution} /></td>
                  <td style={{ textAlign: 'right' }}>{renderActions(item, 'desktop')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mobile-cards-container">
        {items.map((item) => (
          <div
            key={item.id}
            className={`mobile-domain-card agent-row-clickable${actionsMenu.openId === `mobile-${item.id}` ? ' has-open-menu' : ''}`}
            onClick={() => openHistory(item)}
          >
            <div className="mobile-card-subinfo agents-mobile-select">
              <label onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(item.id)}
                  onChange={(e) => toggleSelected(item.id, e.target.checked)}
                  aria-label={`Selecionar ${item.name}`}
                  disabled={bulkLocked}
                />
              </label>
              <span>{dataSourceLabel(item.dataSourceName)}</span>
            </div>
            <div className="mobile-card-top">
              <span className="mobile-domain-name">
                {item.name}
                <IncidentBadge incident={item.openIncident} />
              </span>
              <span
                className="badge-role"
                style={item.enabled
                  ? { background: '#e6f7f3', color: '#00b090', borderColor: '#b3ebd9' }
                  : { background: '#fdecea', color: '#c0392b', borderColor: '#f5c6cb' }}
              >
                {item.enabled ? 'Ativo' : 'Inativo'}
              </span>
            </div>
            <div className="mobile-card-subinfo">
              {typeLabel(item.collectorType)}
              {' · '}
              <LastExecutionWhen execution={item.lastExecution} />
            </div>
            <div className="mobile-card-subinfo">
              <LastExecutionStatus execution={item.lastExecution} />
            </div>
            <div className="mobile-card-meta"><ScheduleCell schedule={item.schedule} /></div>
            <div className="mobile-card-actions">{renderActions(item, 'mobile')}</div>
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
              <button
                key="agent-form-continue"
                type="button"
                className="btn btn-primary"
                onClick={handleNextStep}
                disabled={submitting}
              >
                Continuar
              </button>
            ) : (
              <button
                key="agent-form-submit"
                type="button"
                className="btn btn-primary"
                disabled={submitting}
                onClick={() => {
                  const form = document.getElementById('agent-form') as HTMLFormElement | null;
                  form?.requestSubmit();
                }}
              >
                {submitting ? 'Salvando...' : editing ? 'Salvar' : 'Criar'}
              </button>
            )}
          </div>
        )}
      >
        <form
          id="agent-form"
          className="oauth-create-form agent-form"
          onSubmit={handleSubmit}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || formStep === 'schedule') return;
            const tag = (event.target as HTMLElement).tagName;
            if (tag === 'TEXTAREA' || tag === 'BUTTON') return;
            event.preventDefault();
            handleNextStep();
          }}
        >
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
                Uma fonte pré-preenche URL, headers, agenda e prompt — você só personaliza o ticker.
              </p>
              <CredentialChip
                state={credential}
                onOpenClientSystem={goClientSystem}
              />
              <div className="form-group">
                <div className="form-label-row">
                  <label htmlFor="agent-data-source">Fonte de dados</label>
                  <Link to={PATHS.dataSources} className="oauth-authorities-count">Nova fonte</Link>
                </div>
                <select
                  id="agent-data-source"
                  className="form-input"
                  value={form.dataSourceId}
                  onChange={(e) => handleDataSourceChange(e.target.value)}
                >
                  <option value="">Personalizada</option>
                  {dataSources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.name}
                    </option>
                  ))}
                </select>
                {selectedSource?.description ? (
                  <p className="table-cell-muted" style={{ margin: '0.35rem 0 0' }}>
                    {selectedSource.description}
                  </p>
                ) : null}
                {selectedSource?.notes ? (
                  <p className="table-cell-muted" style={{ margin: '0.25rem 0 0' }}>
                    {selectedSource.notes}
                  </p>
                ) : null}
              </div>
              {sourceVariables.length > 0 ? (
                sourceVariables.map((item, index) => {
                  const fieldId = `agent-var-${item.key}`;
                  const value = item.key === 'ticker'
                    ? (form.variableValues.ticker || form.ticker)
                    : (form.variableValues[item.key] || '');
                  return (
                    <div className="form-group" key={item.key}>
                      <label htmlFor={fieldId}>{item.label || item.key}</label>
                      <input
                        id={fieldId}
                        className="form-input"
                        value={value}
                        onChange={(e) => handleVariableChange(item.key, e.target.value)}
                        placeholder={item.placeholder || item.key}
                        autoFocus={index === 0}
                        required={item.required}
                      />
                    </div>
                  );
                })
              ) : null}
              <div className="form-group">
                <label htmlFor="agent-name">Nome</label>
                <input
                  id="agent-name"
                  className="form-input"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ex.: scraper-noticias-diarias"
                  required
                  autoFocus={sourceVariables.length === 0}
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
                <label htmlFor="agent-context">Contexto</label>
                <input
                  id="agent-context"
                  className="form-input"
                  value={form.context}
                  onChange={(e) => setForm((f) => ({ ...f, context: e.target.value.toLowerCase() }))}
                  placeholder="ops, juridico"
                />
              </div>
              <div className="form-group">
                <label htmlFor="agent-type">Tipo de coleta</label>
                <select
                  id="agent-type"
                  className="form-input"
                  value={form.collectorType}
                  disabled={Boolean(editing) || Boolean(form.dataSourceId)}
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
              <div style={{ marginBottom: '0.75rem' }}>
                <button type="button" className="btn btn-outline btn-pill" onClick={openAgentCurlFromForm} disabled={submitting}>
                  <Terminal size={15} />
                  <span>Ver CURL</span>
                </button>
              </div>

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
                  <div className="form-group">
                    <label htmlFor="agent-auth-type">Autenticação</label>
                    <select
                      id="agent-auth-type"
                      className="form-input"
                      value={form.authType}
                      onChange={(e) => setForm((f) => ({ ...f, authType: e.target.value as AuthType }))}
                    >
                      <option value="NONE">Nenhuma (busca simples)</option>
                      <option value="STATIC_BEARER">Token / Bearer</option>
                      <option value="LOGIN_PASSWORD">Usuário e senha</option>
                    </select>
                  </div>

                  {form.authType === 'STATIC_BEARER' ? (
                    <div className="agent-auth-card">
                      <p className="agent-form-panel-intro">O agent envia este token no header da coleta.</p>
                      <div className="form-group">
                        <label htmlFor="agent-auth-token">Token</label>
                        <input
                          id="agent-auth-token"
                          className="form-input"
                          type="password"
                          autoComplete="off"
                          value={form.authToken}
                          onChange={(e) => setForm((f) => ({ ...f, authToken: e.target.value, hasToken: f.hasToken && !e.target.value ? f.hasToken : f.hasToken }))}
                          placeholder={form.hasToken ? 'Deixe vazio para manter o token atual' : 'Cole o JWT ou API key'}
                        />
                      </div>
                    </div>
                  ) : null}

                  {form.authType === 'LOGIN_PASSWORD' ? (
                    <div className="agent-auth-card">
                      <p className="agent-form-panel-intro">
                        Primeiro o agent faz login; depois chama a URL de coleta com o token extraído.
                      </p>
                      <div className="form-group">
                        <label htmlFor="agent-login-url">URL de login</label>
                        <input
                          id="agent-login-url"
                          className="form-input"
                          value={form.loginUrl}
                          onChange={(e) => setForm((f) => ({ ...f, loginUrl: e.target.value }))}
                          placeholder="http://bff-auth:8381/api/v1/auth/login"
                        />
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label htmlFor="agent-login-method">Método do login</label>
                          <input
                            id="agent-login-method"
                            className="form-input"
                            value={form.loginMethod}
                            onChange={(e) => setForm((f) => ({ ...f, loginMethod: e.target.value }))}
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor="agent-token-path">Caminho do token</label>
                          <input
                            id="agent-token-path"
                            className="form-input"
                            value={form.tokenPath}
                            onChange={(e) => setForm((f) => ({ ...f, tokenPath: e.target.value }))}
                            placeholder="token"
                          />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label htmlFor="agent-auth-user">Usuário</label>
                          <input
                            id="agent-auth-user"
                            className="form-input"
                            value={form.authUsername}
                            onChange={(e) => setForm((f) => ({ ...f, authUsername: e.target.value }))}
                            autoComplete="off"
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor="agent-auth-pass">Senha</label>
                          <input
                            id="agent-auth-pass"
                            className="form-input"
                            type="password"
                            autoComplete="new-password"
                            value={form.authPassword}
                            onChange={(e) => setForm((f) => ({ ...f, authPassword: e.target.value }))}
                            placeholder={form.hasPassword ? 'Vazio para manter a senha atual' : ''}
                          />
                        </div>
                      </div>
                      <KeyValueEditor
                        label="Headers do login"
                        entries={form.loginHeaders}
                        onChange={(loginHeaders) => setForm((f) => ({ ...f, loginHeaders }))}
                        keyPlaceholder="X-Tenant-Id"
                        valuePlaceholder="uuid da organização"
                      />
                      <div className="form-group">
                        <label htmlFor="agent-login-body">Body do login</label>
                        <textarea
                          id="agent-login-body"
                          className="form-input"
                          rows={4}
                          value={form.loginBodyTemplate}
                          onChange={(e) => setForm((f) => ({ ...f, loginBodyTemplate: e.target.value }))}
                        />
                      </div>
                    </div>
                  ) : null}

                  <p className="agent-form-panel-intro">Requisição de coleta (depois da autenticação, se houver).</p>
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
                  <KeyValueEditor
                    label="Headers"
                    entries={form.headers}
                    onChange={(headers) => setForm((f) => ({ ...f, headers }))}
                    keyPlaceholder="Accept"
                    valuePlaceholder="application/json"
                  />
                  <KeyValueEditor
                    label="Query params"
                    entries={form.queryParams}
                    onChange={(queryParams) => setForm((f) => ({ ...f, queryParams }))}
                    keyPlaceholder="page"
                    valuePlaceholder="0"
                  />
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
                  placeholder="Dica da fonte para o briefing (não substitui os fatos)"
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
          <button type="button" className="btn btn-danger" onClick={handleDelete}>Excluir</button>
        </div>
      </Modal>

      <Modal
        isOpen={!!bulkConfirm}
        onClose={() => setBulkConfirm(null)}
        title={bulkConfirm ? bulkCopy(bulkConfirm.action, bulkConfirm.ids.length).title : ''}
        maxWidth="480px"
      >
        {bulkConfirm ? (
          <>
            <p>{bulkCopy(bulkConfirm.action, bulkConfirm.ids.length).body}</p>
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setBulkConfirm(null)}>Cancelar</button>
              <button
                type="button"
                className={bulkConfirm.action === 'delete' ? 'btn btn-danger' : 'btn btn-primary'}
                disabled={bulkLocked}
                onClick={() => void executeBulk(bulkConfirm.action, bulkConfirm.ids)}
              >
                {bulkCopy(bulkConfirm.action, bulkConfirm.ids.length).confirm}
              </button>
            </div>
          </>
        ) : null}
      </Modal>

      <Modal
        isOpen={bulkProgressOpen && !!bulkProgress}
        onClose={() => setBulkProgressOpen(false)}
        title="Progresso do lote"
        subtitle={bulkProgress ? `${bulkProgress.action} · ${bulkProgress.status}` : undefined}
        maxWidth="520px"
      >
        {bulkProgress ? (
          <>
            <p>Comandos: {bulkProgress.commands.succeeded}/{bulkProgress.commands.total} ok{bulkProgress.commands.failed ? ` · ${bulkProgress.commands.failed} falharam` : ''}.</p>
            {bulkProgress.collections ? (
              <p>
                Coletas: {bulkProgress.collections.succeeded} ok
                {bulkProgress.collections.running ? ` · ${bulkProgress.collections.running} em andamento` : ''}
                {bulkProgress.collections.pending ? ` · ${bulkProgress.collections.pending} na fila` : ''}
                {bulkProgress.collections.failed ? ` · ${bulkProgress.collections.failed} falharam` : ''}.
              </p>
            ) : null}
            <p className="table-cell-muted">A coleta continua na fila. Fechar esta janela não cancela o lote nem libera novas ações.</p>
            <div className="modal-actions">
              <button type="button" className="btn btn-primary" onClick={() => setBulkProgressOpen(false)}>Fechar</button>
            </div>
          </>
        ) : null}
      </Modal>

      <Modal
        isOpen={!!historyAgent}
        onClose={closeHistory}
        title="Histórico de coletas"
        subtitle={
          historyAgent
            ? `${historyAgent.name}${historyAgent.dataSourceName ? ` · ${historyAgent.dataSourceName}` : ''}`
            : undefined
        }
        maxWidth="min(96vw, 1100px)"
        maxHeight="min(92vh, 820px)"
        footer={
          !historyLoading && historyItems.length > 0 ? (
            <div className="agent-history-footer">
              <p className="agent-history-footer-note">
                {historyStatusFilter
                  ? `${historyFiltered.length} de ${historyItems.length} execuções (filtro ativo)`
                  : `Últimas ${historyItems.length} execuções`}
                {historySortKey ? ' · ordenação personalizada' : ' · mais recente primeiro'}
              </p>
              {historySorted.length > HISTORY_PAGE_SIZE ? (
                <div className="agent-history-footer-pager">
                  <button
                    type="button"
                    className="btn btn-outline btn-pill btn-icon-pager"
                    disabled={historyPage <= 0}
                    onClick={() => setHistoryPage((p) => Math.max(p - 1, 0))}
                    aria-label="Página anterior"
                    title="Página anterior"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span className="agent-history-page-label">
                    Página {historyPage + 1} de {historyTotalPages}
                  </span>
                  <button
                    type="button"
                    className="btn btn-outline btn-pill btn-icon-pager"
                    disabled={historyPage >= historyTotalPages - 1}
                    onClick={() => setHistoryPage((p) => Math.min(p + 1, historyTotalPages - 1))}
                    aria-label="Próxima página"
                    title="Próxima página"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              ) : null}
            </div>
          ) : undefined
        }
      >
        {historyLoading ? (
          <div className="agent-history-loading" role="status" aria-live="polite">
            <span className="spinner-small" style={{ borderTopColor: '#673de6', borderColor: '#dcd2f9' }} />
            <span>Carregando execuções…</span>
          </div>
        ) : (
          <>
            {(() => {
              const current = activeIncident(historyIncidents);
              const resolved = !current;
              return (
                <section className="agent-incident-panel" aria-label="Incidente de coleta">
                  <div className="agent-incident-panel-head">
                    <strong>Incidente</strong>
                    {current ? (
                      <span className="agent-incident-badge">{incidentClassificationLabel(current.classification)}</span>
                    ) : null}
                  </div>
                  {historyIncidentError ? (
                    <p className="agent-incident-error" role="alert">{historyIncidentError}</p>
                  ) : null}
                  {resolved ? (
                    <p className="agent-incident-empty">Nenhum incidente aberto</p>
                  ) : (
                    <>
                      <dl className="agent-incident-meta">
                        <div>
                          <dt>Host</dt>
                          <dd>{current.sourceHost || '—'}</dd>
                        </div>
                        <div>
                          <dt>Ocorrências</dt>
                          <dd>{current.occurrences}</dd>
                        </div>
                        <div>
                          <dt>Primeira vista</dt>
                          <dd>{current.firstSeenAt ? formatDate(current.firstSeenAt) : '—'}</dd>
                        </div>
                        <div>
                          <dt>Última vista</dt>
                          <dd>{current.lastSeenAt ? formatDate(current.lastSeenAt) : '—'}</dd>
                        </div>
                      </dl>
                      {current.errorExcerpt ? (
                        <p className="agent-incident-excerpt" title={current.errorExcerpt}>{current.errorExcerpt}</p>
                      ) : null}
                      {historySuggestion ? (
                        <p className="agent-incident-suggestion">
                          Sucessor sugerido: <strong>{historySuggestion.newHint}</strong>
                          {historySuggestion.reason ? ` — ${historySuggestion.reason}` : ''}
                        </p>
                      ) : null}
                      <div className="agent-incident-actions">
                        {historyIncidentConfirm ? (
                          <>
                            <span className="agent-incident-confirm-copy">
                              {historyIncidentConfirm === 'ack'
                                ? 'Marca que alguém viu. A coleta continua.'
                                : historyIncidentConfirm === 'resolve'
                                  ? 'Fecha o caso. Nova falha abre outro incidente.'
                                  : 'Atualiza nome/config e fecha o incidente.'}
                            </span>
                            <button
                              type="button"
                              className="btn btn-primary btn-pill"
                              disabled={!!historyIncidentBusy}
                              onClick={() => void runIncidentAction(historyIncidentConfirm)}
                            >
                              {historyIncidentBusy ? 'Aplicando…' : 'Confirmar'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline btn-pill"
                              disabled={!!historyIncidentBusy}
                              onClick={() => setHistoryIncidentConfirm(null)}
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="btn btn-outline btn-pill"
                              disabled={current.status !== 'open' || !!historyIncidentBusy}
                              onClick={() => setHistoryIncidentConfirm('ack')}
                            >
                              Reconhecer
                            </button>
                            <button
                              type="button"
                              className="btn btn-primary btn-pill"
                              disabled={current.status === 'resolved' || !!historyIncidentBusy}
                              onClick={() => setHistoryIncidentConfirm('resolve')}
                            >
                              Resolver
                            </button>
                            {historySuggestion ? (
                              <button
                                type="button"
                                className="btn btn-outline btn-pill"
                                disabled={!!historyIncidentBusy}
                                onClick={() => setHistoryIncidentConfirm('apply')}
                              >
                                Aplicar sucessor
                              </button>
                            ) : null}
                          </>
                        )}
                      </div>
                    </>
                  )}
                </section>
              );
            })()}
            {historyItems.length === 0 ? (
          <div className="agent-history-empty-state">
            <Inbox size={32} strokeWidth={1.5} aria-hidden="true" />
            <p className="agent-history-empty-title">Nenhuma coleta registrada</p>
            <p className="agent-history-empty-desc">
              Execuções via agenda ou botão <strong>Executar</strong> aparecem aqui.
              O <strong>Testar</strong> não grava histórico.
            </p>
          </div>
            ) : (
          <div className="agent-history-modal-body">
            {(() => {
              const summary = executionSummary(historyItems);
              const lastWhen = formatExecutionWhen(summary.last?.startedAt);
              return (
                <div className="agent-history-summary" aria-label="Resumo do histórico">
                  <div className="agent-history-stat">
                    <span className="agent-history-stat-label">Execuções</span>
                    <span className="agent-history-stat-value">{summary.total}</span>
                  </div>
                  <div className="agent-history-stat">
                    <span className="agent-history-stat-label">Sucesso</span>
                    <span className="agent-history-stat-value agent-history-stat-value--success">
                      {summary.success}
                    </span>
                    {summary.successRate !== null ? (
                      <span className="agent-history-stat-hint">{summary.successRate}% taxa</span>
                    ) : null}
                  </div>
                  <div className="agent-history-stat">
                    <span className="agent-history-stat-label">Falhas / parciais</span>
                    <span className="agent-history-stat-value agent-history-stat-value--warn">
                      {summary.failed + summary.partial}
                    </span>
                    {summary.running > 0 ? (
                      <span className="agent-history-stat-hint">{summary.running} em andamento</span>
                    ) : null}
                  </div>
                  <div className="agent-history-stat">
                    <span className="agent-history-stat-label">Última coleta</span>
                    <span className="agent-history-stat-value agent-history-stat-value--compact">
                      {lastWhen.primary}
                    </span>
                    {lastWhen.secondary ? (
                      <span className="agent-history-stat-hint">{lastWhen.secondary}</span>
                    ) : null}
                  </div>
                </div>
              );
            })()}

            <div className="agent-history-toolbar">
              <div className="agent-history-filters">
                <select
                  className="form-input audits-sort-select"
                  value={historyStatusFilter}
                  onChange={(e) => setHistoryStatusFilter(e.target.value as HistoryStatusFilter)}
                  aria-label="Filtrar por status"
                >
                  <option value="">Todos os status</option>
                  <option value="SUCCESS">Sucesso</option>
                  <option value="FAILED">Falha</option>
                  <option value="PARTIAL">Parcial</option>
                  <option value="RUNNING">Em andamento</option>
                </select>
                <select
                  className="form-input audits-sort-select"
                  value={historySortKey || ''}
                  onChange={(e) => {
                    const value = e.target.value as HistorySortKey | '';
                    if (!value) {
                      setHistorySortKey(null);
                      setHistorySortDir('desc');
                      return;
                    }
                    setHistorySortKey(value);
                    setHistorySortDir(value === 'startedAt' || value === 'duration' ? 'desc' : 'asc');
                  }}
                  aria-label="Ordenar por"
                >
                  <option value="">Ordenação padrão</option>
                  <option value="startedAt">Quando</option>
                  <option value="duration">Duração</option>
                  <option value="status">Status</option>
                  <option value="itemsCollected">Coletados</option>
                  <option value="itemsUploaded">Enviados</option>
                </select>
                {historySortKey ? (
                  <select
                    className="form-input audits-dir-select"
                    value={historySortDir}
                    onChange={(e) => setHistorySortDir(e.target.value as HistorySortDir)}
                    aria-label="Direção da ordenação"
                  >
                    {historySortKey === 'status' ? (
                      <>
                        <option value="asc">A–Z</option>
                        <option value="desc">Z–A</option>
                      </>
                    ) : historySortKey === 'startedAt' || historySortKey === 'duration' ? (
                      <>
                        <option value="desc">Mais recentes</option>
                        <option value="asc">Mais antigos</option>
                      </>
                    ) : (
                      <>
                        <option value="desc">Maior</option>
                        <option value="asc">Menor</option>
                      </>
                    )}
                  </select>
                ) : null}
              </div>
              <RefreshCombo
                onRefresh={() => historyAgent && void loadHistoryData(historyAgent.id, true)}
                disabled={!historyAgent}
                refreshing={historyRefreshing}
              />
            </div>

            {historyFiltered.length === 0 ? (
              <div className="agent-history-filter-empty">
                <p>Nenhuma execução com o status selecionado.</p>
                <button
                  type="button"
                  className="btn btn-outline btn-pill"
                  onClick={() => setHistoryStatusFilter('')}
                >
                  Limpar filtro
                </button>
              </div>
            ) : (
              <>
                <div className="hpanel-table-card desktop-table-view agent-history-table-card">
                  <table className="hpanel-table agent-history-hpanel-table">
                    <colgroup>
                      <col className="agent-history-col-when" />
                      <col className="agent-history-col-duration" />
                      <col className="agent-history-col-status" />
                      <col className="agent-history-col-count" />
                      <col className="agent-history-col-count" />
                      <col className="agent-history-col-error" />
                      <col className="agent-history-col-payload" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>
                          <button type="button" className="th-sort" onClick={() => toggleHistorySort('startedAt')}>
                            Quando {historySortIcon('startedAt')}
                          </button>
                        </th>
                        <th>
                          <button type="button" className="th-sort" onClick={() => toggleHistorySort('duration')}>
                            Duração {historySortIcon('duration')}
                          </button>
                        </th>
                        <th>
                          <button type="button" className="th-sort" onClick={() => toggleHistorySort('status')}>
                            Status {historySortIcon('status')}
                          </button>
                        </th>
                        <th className="agent-history-th-num">
                          <button type="button" className="th-sort" onClick={() => toggleHistorySort('itemsCollected')}>
                            Coletados {historySortIcon('itemsCollected')}
                          </button>
                        </th>
                        <th className="agent-history-th-num">
                          <button type="button" className="th-sort" onClick={() => toggleHistorySort('itemsUploaded')}>
                            Enviados {historySortIcon('itemsUploaded')}
                          </button>
                        </th>
                        <th>Erro</th>
                        <th className="agent-history-th-payload">Arquivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyDisplayed.map((execution) => {
                        const when = formatExecutionWhen(execution.startedAt);
                        const status = (execution.status || '').toUpperCase();
                        const isRunning = status === 'RUNNING';
                        const hasError = Boolean((execution.errorMessage || '').trim());
                        const uploadGap = execution.itemsUploaded < execution.itemsCollected;
                        const rowClass = [
                          'agent-history-row-clickable',
                          hasError ? 'agent-history-row--error' : '',
                          uploadGap && !hasError ? 'agent-history-row--warn' : '',
                        ].filter(Boolean).join(' ');
                        return (
                          <tr
                            key={execution.id}
                            className={rowClass}
                            onClick={() => openHistoryDetail(execution)}
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                openHistoryDetail(execution);
                              }
                            }}
                            aria-label={`Execução ${when.primary}, ${executionStatusLabel(execution.status)}`}
                          >
                            <td>
                              <div className="agent-history-when">
                                <span className="agent-history-when-primary">{when.primary}</span>
                                {when.secondary ? (
                                  <span className="agent-history-when-secondary">{when.secondary}</span>
                                ) : null}
                              </div>
                            </td>
                            <td>
                              <span className="agent-history-duration">
                                {isRunning ? (
                                  <>
                                    <span className="spinner-mini" aria-hidden="true" />
                                    {executionDuration(execution)}
                                  </>
                                ) : (
                                  executionDuration(execution)
                                )}
                              </span>
                            </td>
                            <td>
                              <span className="badge-role" style={executionStatusStyle(execution.status)}>
                                {executionStatusLabel(execution.status)}
                              </span>
                            </td>
                            <td className="agent-history-num">{execution.itemsCollected}</td>
                            <td className="agent-history-num">
                              <span className="agent-history-upload">
                                {execution.itemsUploaded}
                                {uploadGap ? (
                                  <AlertCircle
                                    size={14}
                                    className="agent-history-upload-warn"
                                    aria-label="Menos itens enviados que coletados"
                                  />
                                ) : null}
                              </span>
                            </td>
                            <td>
                              {hasError ? (
                                <span className="agent-history-error" title={execution.errorMessage}>
                                  {execution.errorMessage}
                                </span>
                              ) : uploadGap ? (
                                <span className="agent-history-detail-hint">
                                  <AlertCircle size={14} aria-hidden="true" />
                                  Envio incompleto
                                </span>
                              ) : (
                                <span className="agent-history-detail-ok">
                                  <CheckCircle2 size={14} aria-hidden="true" />
                                  Sem erro
                                </span>
                              )}
                            </td>
                            <td className="agent-history-payload-cell">
                              {executionHasFilePayload(execution) ? (
                                (() => {
                                  const fileKind = executionFileKind(execution, historyAgent);
                                  const fileLabel = executionFileLabel(fileKind);
                                  return (
                                <button
                                  type="button"
                                  className="agent-history-payload-btn"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void openHistoryPayload(execution, event);
                                  }}
                                  aria-label={`Ver ${fileLabel} da coleta de ${when.primary}`}
                                  title={`Ver ${fileLabel}`}
                                >
                                  <ExecutionFileIcon kind={fileKind} />
                                </button>
                                  );
                                })()
                              ) : (
                                <span className="agent-history-payload-empty">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="agent-history-mobile-list">
                  {historyDisplayed.map((execution) => {
                    const when = formatExecutionWhen(execution.startedAt);
                    const hasError = Boolean((execution.errorMessage || '').trim());
                    const uploadGap = execution.itemsUploaded < execution.itemsCollected;
                    return (
                      <div key={execution.id} className="agent-history-mobile-card">
                        <button
                          type="button"
                          className="agent-history-mobile-card-main"
                          onClick={() => openHistoryDetail(execution)}
                        >
                          <div className="agent-history-mobile-card-top">
                            <span className="agent-history-when-primary">{when.primary}</span>
                            <span className="badge-role" style={executionStatusStyle(execution.status)}>
                              {executionStatusLabel(execution.status)}
                            </span>
                          </div>
                          <div className="agent-history-mobile-card-meta">
                            {executionDuration(execution)} · {execution.itemsCollected} coletados · {execution.itemsUploaded} enviados
                          </div>
                          {hasError ? (
                            <p className="agent-history-mobile-card-error">{execution.errorMessage}</p>
                          ) : uploadGap ? (
                            <p className="agent-history-mobile-card-warn">Envio incompleto</p>
                          ) : null}
                        </button>
                        {executionHasFilePayload(execution) ? (
                          (() => {
                            const fileKind = executionFileKind(execution, historyAgent);
                            const fileLabel = executionFileLabel(fileKind);
                            return (
                          <button
                            type="button"
                            className="agent-history-payload-btn"
                            onClick={(event) => void openHistoryPayload(execution, event)}
                            aria-label={`Ver ${fileLabel} da coleta de ${when.primary}`}
                            title={`Ver ${fileLabel}`}
                          >
                            <ExecutionFileIcon kind={fileKind} />
                          </button>
                            );
                          })()
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
            )}
          </>
        )}
      </Modal>

      <Modal
        isOpen={!!historyDetail}
        onClose={() => setHistoryDetail(null)}
        title="Detalhe da execução"
        subtitle={historyDetail ? formatExecutionWhen(historyDetail.startedAt).primary : undefined}
        maxWidth="640px"
      >
        {historyDetail ? (
          <div className="agent-history-detail">
            <div className="info-row">
              <span className="info-label">Status</span>
              <span className="badge-role" style={executionStatusStyle(historyDetail.status)}>
                {executionStatusLabel(historyDetail.status)}
              </span>
            </div>
            <div className="info-row">
              <span className="info-label">Fonte</span>
              <span className="info-value">
                {metadataDataSourceName(historyDetail.metadata) !== '—'
                  ? metadataDataSourceName(historyDetail.metadata)
                  : dataSourceLabel(historyAgent?.dataSourceName)}
              </span>
            </div>
            <div className="info-row">
              <span className="info-label">ID</span>
              <span className="info-value text-mono" title={historyDetail.id}>
                {compactExecutionId(historyDetail.id)}
              </span>
            </div>
            <div className="info-row">
              <span className="info-label">Início</span>
              <span className="info-value">{formatDate(historyDetail.startedAt)}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Fim</span>
              <span className="info-value">
                {historyDetail.finishedAt ? formatDate(historyDetail.finishedAt) : '—'}
              </span>
            </div>
            <div className="info-row">
              <span className="info-label">Duração</span>
              <span className="info-value">{executionDuration(historyDetail)}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Coletados</span>
              <span className="info-value">{historyDetail.itemsCollected}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Enviados</span>
              <span className="info-value">
                {historyDetail.itemsUploaded}
                {historyDetail.itemsUploaded < historyDetail.itemsCollected ? (
                  <span className="agent-history-detail-gap">
                    <AlertCircle size={14} aria-hidden="true" />
                    Menos itens enviados que coletados
                  </span>
                ) : null}
              </span>
            </div>
            {historyDetail.errorMessage ? (
              <div className="agent-history-detail-error-block">
                <span className="info-label">Erro</span>
                <p>{historyDetail.errorMessage}</p>
              </div>
            ) : null}
            {executionHasFilePayload(historyDetail) ? (
              (() => {
                const fileKind = executionFileKind(historyDetail, historyAgent);
                const fileLabel = executionFileLabel(fileKind);
                return (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => void openHistoryPayload(historyDetail)}
              >
                <ExecutionFileIcon kind={fileKind} />
                Ver {fileLabel}
              </button>
                );
              })()
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={!!historyPayloadExecution}
        onClose={closeHistoryPayload}
        title="Arquivo da coleta"
        subtitle={historyPayloadExecution ? formatExecutionWhen(historyPayloadExecution.startedAt).primary : undefined}
        maxWidth="760px"
        maxHeight="80vh"
      >
        {historyPayloadLoading ? (
          <div className="agent-history-loading" role="status" aria-live="polite">
            <span className="spinner-mini" aria-hidden="true" />
            Carregando arquivo…
          </div>
        ) : historyPayloadError ? (
          <div className="agent-history-payload-empty-state">
            <p className="agent-history-empty-title">Não foi possível carregar o arquivo</p>
            <p className="agent-history-empty-desc">{historyPayloadError}</p>
          </div>
        ) : historyPayloadData.length === 0 ? (
          <div className="agent-history-payload-empty-state">
            <p className="agent-history-empty-title">Arquivo não encontrado</p>
            <p className="agent-history-empty-desc">
              Esta execução não tem um arquivo salvo no knowledge.
            </p>
          </div>
        ) : (
          <div className="agent-history-payload-list">
            {historyPayloadData.map((item, index) => {
              const body = payloadItemBody(item);
              const itemKind = payloadItemKind(item, historyAgent);
              return (
                <div key={`${item.kind}-${item.id}-${index}`} className="agent-history-payload-item">
                  {historyPayloadData.length > 1 ? (
                    <div className="agent-history-payload-item-head">
                      <span className="agent-history-payload-kind">
                        {item.fileName || executionFileLabel(itemKind)}
                      </span>
                    </div>
                  ) : null}
                  <pre className="agent-history-json-pre">
                    {body || 'Nenhum conteúdo disponível para visualização.'}
                  </pre>
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      <CollectorCurlModal
        isOpen={Boolean(curlModal)}
        onClose={() => setCurlModal(null)}
        title={curlModal?.title || 'CURL'}
        subtitle={curlModal?.subtitle}
        blocks={curlModal?.blocks || []}
      />
    </div>
  );
};
