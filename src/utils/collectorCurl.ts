import { applyPlaceholdersDeep } from './collectorTemplate';
import {
  BFF_CORE_URL,
  DEFAULT_CLIENT_ID,
  DEFAULT_TENANT_ID,
  generateUUID,
} from '../services/api';
import { getAccessToken } from '../services/tokenStore';
import { getDeviceInfo } from './deviceUtils';

export interface CollectorCurlBlock {
  id: string;
  label: string;
  description: string;
  command: string;
  hasSecrets?: boolean;
}

const SECRET_PLACEHOLDER = '<ACCESS_TOKEN>';
const USERNAME_PLACEHOLDER = '<USERNAME>';
const PASSWORD_PLACEHOLDER = '<PASSWORD>';

function shellEscapeSingle(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function asStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, raw]) => {
    const k = String(key || '').trim();
    if (!k) return;
    out[k] = String(raw ?? '');
  });
  return out;
}

function appendQueryParams(url: string, queryParams: Record<string, string>): string {
  const entries = Object.entries(queryParams).filter(([k, v]) => k.trim() && v);
  if (!entries.length || !url.trim()) return url;
  try {
    const parsed = new URL(url);
    entries.forEach(([k, v]) => parsed.searchParams.set(k, v));
    return parsed.toString();
  } catch {
    const sep = url.includes('?') ? '&' : '?';
    const qs = entries
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    return `${url}${sep}${qs}`;
  }
}

function formatCurl(parts: string[]): string {
  return parts.join(' \\\n  ');
}

function maskLoginBody(body: string, auth: Record<string, unknown>): string {
  let out = body;
  if (auth.username) {
    out = out.replaceAll(String(auth.username), USERNAME_PLACEHOLDER);
  }
  if (auth.password) {
    out = out.replaceAll(String(auth.password), PASSWORD_PLACEHOLDER);
  }
  if (out.includes('{{username}}') || out.includes('{{password}}')) {
    out = out
      .replaceAll('{{username}}', USERNAME_PLACEHOLDER)
      .replaceAll('{{password}}', PASSWORD_PLACEHOLDER);
  }
  return out;
}

function buildHttpCurl(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: string,
  auth?: Record<string, unknown>,
): { command: string; hasSecrets: boolean } {
  const upperMethod = (method || 'GET').trim().toUpperCase() || 'GET';
  const parts: string[] = ['curl', '-sS', '-X', upperMethod, shellEscapeSingle(url)];
  let hasSecrets = false;

  Object.entries(headers).forEach(([key, value]) => {
    if (!key.trim()) return;
    parts.push('-H', shellEscapeSingle(`${key}: ${value}`));
  });

  if (auth) {
    const authType = String(auth.type || '').toUpperCase();
    if (authType === 'STATIC_BEARER') {
      hasSecrets = true;
      const headerName = String(auth.header_name || 'Authorization').trim() || 'Authorization';
      const prefix = auth.header_prefix !== undefined ? String(auth.header_prefix) : 'Bearer ';
      parts.push('-H', shellEscapeSingle(`${headerName}: ${prefix}${SECRET_PLACEHOLDER}`));
    }
  }

  const trimmedBody = (body || '').trim();
  if (trimmedBody && upperMethod !== 'GET' && upperMethod !== 'HEAD') {
    parts.push('--data-raw', shellEscapeSingle(trimmedBody));
  }

  return { command: formatCurl(parts), hasSecrets };
}

function buildLoginCurl(auth: Record<string, unknown>): CollectorCurlBlock | null {
  const authType = String(auth.type || '').toUpperCase();
  if (authType !== 'LOGIN_PASSWORD') return null;
  const loginUrl = String(auth.login_url || '').trim();
  if (!loginUrl) return null;

  const loginMethod = String(auth.login_method || 'POST');
  const loginHeaders = asStringMap(auth.login_headers);
  const loginBody = maskLoginBody(String(auth.login_body_template || ''), auth);
  const { command, hasSecrets } = buildHttpCurl(loginUrl, loginMethod, loginHeaders, loginBody);
  return {
    id: 'login',
    label: 'Login na origem',
    description: 'O collector executa este passo antes da coleta principal para obter o token.',
    command,
    hasSecrets: hasSecrets || Boolean(auth.username || auth.password),
  };
}

export function buildCollectorOriginCurlBlocks(
  collectorType: string,
  config: Record<string, unknown>,
): CollectorCurlBlock[] {
  const type = String(collectorType || '').toUpperCase();
  const auth = config.auth && typeof config.auth === 'object'
    ? config.auth as Record<string, unknown>
    : undefined;

  if (type === 'HTML_SCRAPER') {
    const url = String(config.url || '').trim();
    if (!url) return [];
    const { command } = buildHttpCurl(url, 'GET', asStringMap(config.headers), undefined, auth);
    return [{
      id: 'origin',
      label: 'Origem (página HTML)',
      description: 'GET na URL configurada. O scraper processa o HTML no collector.',
      command,
    }];
  }

  if (type === 'DOCUMENT_FETCHER') {
    const urls = Array.isArray(config.urls) ? config.urls : [];
    const url = typeof urls[0] === 'string' ? urls[0].trim() : '';
    if (!url) return [];
    const { command } = buildHttpCurl(url, 'GET', asStringMap(config.headers), undefined, auth);
    return [{
      id: 'origin',
      label: 'Origem (documento)',
      description: 'GET no primeiro URL da lista. O collector baixa o arquivo.',
      command,
    }];
  }

  const url = String(config.url || '').trim();
  if (!url) return [];

  const method = String(config.method || 'GET');
  const headers = asStringMap(config.headers);
  const queryParams = asStringMap(config.query_params);
  const fullUrl = appendQueryParams(url, queryParams);
  const body = String(config.body_template || '');
  const { command, hasSecrets } = buildHttpCurl(fullUrl, method, headers, body, auth);

  const blocks: CollectorCurlBlock[] = [{
    id: 'origin',
    label: 'Origem (API)',
    description: 'Replica a chamada HTTP que o collector faz na fonte externa.',
    command,
    hasSecrets,
  }];

  if (auth) {
    const loginBlock = buildLoginCurl(auth);
    if (loginBlock) blocks.unshift(loginBlock);
  }

  return blocks;
}

export function buildCollectorOriginCurlBlocksResolved(
  collectorType: string,
  config: Record<string, unknown>,
  placeholderValues: Record<string, string>,
): CollectorCurlBlock[] {
  const resolved = applyPlaceholdersDeep(config, placeholderValues) as Record<string, unknown>;
  return buildCollectorOriginCurlBlocks(collectorType, resolved);
}

export function buildKeepGuardTestCurl(agentId: string, accessToken?: string | null): CollectorCurlBlock {
  const token = (accessToken || getAccessToken() || SECRET_PLACEHOLDER).trim();
  const correlationId = generateUUID();
  const device = getDeviceInfo();
  const parts = [
    'curl',
    '-sS',
    '-X',
    'POST',
    shellEscapeSingle(`${BFF_CORE_URL}/api/v1/core/collector/agents/${agentId}/test`),
    '-H',
    shellEscapeSingle('Content-Type: application/json'),
    '-H',
    shellEscapeSingle('Accept: application/json'),
    '-H',
    shellEscapeSingle(`Authorization: Bearer ${token}`),
    '-H',
    shellEscapeSingle(`X-Tenant-Id: ${DEFAULT_TENANT_ID}`),
    '-H',
    shellEscapeSingle(`X-Client-Id: ${DEFAULT_CLIENT_ID}`),
    '-H',
    shellEscapeSingle(`X-Correlation-ID: ${correlationId}`),
    '-H',
    shellEscapeSingle(`X-Device-Id: ${device.deviceId}`),
    '-H',
    shellEscapeSingle(`X-Device-Name: ${device.deviceName}`),
    '-H',
    shellEscapeSingle(`X-Device-Type: ${device.deviceType}`),
    '-d',
    shellEscapeSingle('{}'),
  ];
  return {
    id: 'keepguard_test',
    label: 'Teste KeepGuard (dry-run)',
    description: 'Equivalente ao botão “Testar coleta”: não grava no Mongo nem chama a origem via fila.',
    command: formatCurl(parts),
    hasSecrets: true,
  };
}

export function samplePlaceholderValues(
  variables: Array<{ key?: string; placeholder?: string }>,
  tickerFallback?: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  variables.forEach((variable) => {
    const key = String(variable.key || '').trim();
    if (!key) return;
    const placeholder = String(variable.placeholder || '').trim();
    if (!placeholder) return;
    out[key] = key === 'ticker' ? placeholder.toUpperCase() : placeholder;
  });
  const ticker = (tickerFallback || out.ticker || 'PETR4').trim().toUpperCase();
  out.ticker = ticker;
  return out;
}
