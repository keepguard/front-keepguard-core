export type PropagateFieldGroup = 'url' | 'headers' | 'method_body' | 'type_config';

export const PROPAGATE_FIELD_GROUPS: Array<{
  id: PropagateFieldGroup;
  label: string;
  hint: string;
}> = [
  { id: 'url', label: 'URL / endpoint', hint: 'URL da API, página ou lista de documentos' },
  { id: 'headers', label: 'Headers e parâmetros', hint: 'Headers, query params e headers de login' },
  { id: 'method_body', label: 'Método, body e login', hint: 'Método HTTP, body e campos de autenticação (sem token/senha)' },
  { id: 'type_config', label: 'Configurações do tipo', hint: 'Seletores HTML, formato, extensões e arquivo de saída' },
];

export function applyPlaceholders(value: string, values: Record<string, string>): string {
  let out = value;
  const ticker = (values.ticker || '').trim().toUpperCase();
  if (ticker) {
    out = out
      .replaceAll('{{ticker}}', ticker)
      .replaceAll('{{ticker_lower}}', ticker.toLowerCase())
      .replaceAll('{{symbol}}', `${ticker}.SA`);
  }
  Object.entries(values).forEach(([key, raw]) => {
    if (!key || key === 'ticker') return;
    const v = String(raw || '').trim();
    if (!v) return;
    out = out.replaceAll(`{{${key}}}`, v);
    out = out.replaceAll(`{{${key}_lower}}`, v.toLowerCase());
  });
  return out;
}

export function applyPlaceholdersDeep(value: unknown, values: Record<string, string>): unknown {
  if (typeof value === 'string') return applyPlaceholders(value, values);
  if (Array.isArray(value)) return value.map((item) => applyPlaceholdersDeep(item, values));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      out[key] = applyPlaceholdersDeep(item, values);
    });
    return out;
  }
  return value;
}

export function tickerFromConfig(cfg: Record<string, unknown>): string {
  return String(cfg.entity_hint || '').trim().toUpperCase().replace(/\.SA$/i, '');
}

export function extractUrlFromConfig(cfg: Record<string, unknown> | null | undefined): string {
  if (!cfg) return '';
  if (typeof cfg.url === 'string' && cfg.url.trim()) return cfg.url;
  if (Array.isArray(cfg.urls) && typeof cfg.urls[0] === 'string') return cfg.urls[0];
  return '';
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function pickGroup(cfg: Record<string, unknown> | null | undefined, group: PropagateFieldGroup): unknown {
  const src = cfg || {};
  const auth = asRecord(src.auth);
  switch (group) {
    case 'url':
      return { url: src.url ?? null, urls: src.urls ?? null };
    case 'headers':
      return {
        headers: src.headers ?? null,
        query_params: src.query_params ?? null,
        login_headers: auth.login_headers ?? null,
      };
    case 'method_body':
      return {
        method: src.method ?? null,
        body_template: src.body_template ?? null,
        type: auth.type ?? null,
        login_url: auth.login_url ?? null,
        login_method: auth.login_method ?? null,
        login_body_template: auth.login_body_template ?? null,
        token_path: auth.token_path ?? null,
        header_name: auth.header_name ?? null,
        header_prefix: auth.header_prefix ?? null,
      };
    case 'type_config':
      return {
        css_selectors: src.css_selectors ?? null,
        extract_links: src.extract_links ?? null,
        output_format: src.output_format ?? null,
        accepted_extensions: src.accepted_extensions ?? null,
        max_file_size_bytes: src.max_file_size_bytes ?? null,
        output_file_name: src.output_file_name ?? null,
      };
    default:
      return null;
  }
}

export function changedFieldGroups(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): PropagateFieldGroup[] {
  return PROPAGATE_FIELD_GROUPS
    .filter((group) => JSON.stringify(pickGroup(before, group.id)) !== JSON.stringify(pickGroup(after, group.id)))
    .map((group) => group.id);
}
