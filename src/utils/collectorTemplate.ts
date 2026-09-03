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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeExtractedKey(name: string, raw: string): { key: string; value: string } | null {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  if (name === 'symbol') {
    return { key: 'ticker', value: trimmed.replace(/\.SA$/i, '').toUpperCase() };
  }
  if (name.endsWith('_lower')) {
    const base = name.slice(0, -'_lower'.length);
    if (!base) return null;
    return { key: base, value: base === 'ticker' ? trimmed.toUpperCase() : trimmed };
  }
  return {
    key: name,
    value: name === 'ticker' ? trimmed.toUpperCase() : trimmed,
  };
}

/** Alinha template com string resolvida e devolve capturas de {{placeholders}}. */
export function extractFromTemplateString(
  template: string,
  resolved: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!template || !resolved || !template.includes('{{')) return out;

  type Part = { type: 'lit'; value: string } | { type: 'ph'; name: string };
  const parts: Part[] = [];
  let last = 0;
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(template)) !== null) {
    if (match.index > last) {
      parts.push({ type: 'lit', value: template.slice(last, match.index) });
    }
    parts.push({ type: 'ph', name: match[1] });
    last = match.index + match[0].length;
  }
  if (last < template.length) {
    parts.push({ type: 'lit', value: template.slice(last) });
  }

  let pattern = '^';
  const captureNames: string[] = [];
  for (const part of parts) {
    if (part.type === 'lit') {
      pattern += escapeRegex(part.value);
    } else {
      pattern += '(.+?)';
      captureNames.push(part.name);
    }
  }
  pattern += '$';

  const hit = new RegExp(pattern).exec(resolved);
  if (!hit) return out;

  captureNames.forEach((name, index) => {
    const normalized = normalizeExtractedKey(name, hit[index + 1] || '');
    if (!normalized) return;
    if (!out[normalized.key]) out[normalized.key] = normalized.value;
  });
  return out;
}

function mergeExtracted(
  target: Record<string, string>,
  partial: Record<string, string>,
): void {
  Object.entries(partial).forEach(([key, value]) => {
    const trimmed = String(value || '').trim();
    if (!trimmed || target[key]) return;
    target[key] = trimmed;
  });
}

export function extractVariableValuesDeep(
  template: unknown,
  resolved: unknown,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof template === 'string' && typeof resolved === 'string') {
    mergeExtracted(out, extractFromTemplateString(template, resolved));
    return out;
  }
  if (Array.isArray(template) && Array.isArray(resolved)) {
    template.forEach((item, index) => {
      mergeExtracted(out, extractVariableValuesDeep(item, resolved[index]));
    });
    return out;
  }
  if (
    template
    && resolved
    && typeof template === 'object'
    && typeof resolved === 'object'
    && !Array.isArray(template)
    && !Array.isArray(resolved)
  ) {
    Object.entries(template as Record<string, unknown>).forEach(([key, item]) => {
      mergeExtracted(
        out,
        extractVariableValuesDeep(item, (resolved as Record<string, unknown>)[key]),
      );
    });
  }
  return out;
}

export type RehydrateVariableValuesInput = {
  variableKeys: string[];
  configTemplate?: Record<string, unknown> | null;
  collectorConfig?: Record<string, unknown> | null;
  nameTemplate?: string | null;
  descriptionTemplate?: string | null;
  promptTemplate?: string | null;
  name?: string | null;
  description?: string | null;
  prompt?: string | null;
};

/**
 * Reidrata variableValues a partir do config/nome/prompt do agent vs templates da fonte.
 * Cobre variáveis além de ticker (ex.: codigo, serie_nome do BCB SGS).
 */
export function rehydrateVariableValues(
  input: RehydrateVariableValuesInput,
): Record<string, string> {
  const collected: Record<string, string> = {};
  mergeExtracted(
    collected,
    extractVariableValuesDeep(input.configTemplate || {}, input.collectorConfig || {}),
  );
  if (input.nameTemplate && input.name) {
    mergeExtracted(collected, extractFromTemplateString(input.nameTemplate, input.name));
  }
  if (input.descriptionTemplate && input.description) {
    mergeExtracted(
      collected,
      extractFromTemplateString(input.descriptionTemplate, input.description),
    );
  }
  if (input.promptTemplate && input.prompt) {
    mergeExtracted(collected, extractFromTemplateString(input.promptTemplate, input.prompt));
  }

  const hint = tickerFromConfig(input.collectorConfig || {});
  if (hint) {
    if (!collected.ticker) collected.ticker = hint;
    if (!collected.serie_nome) collected.serie_nome = hint;
  }

  const keys = input.variableKeys
    .map((key) => String(key || '').trim())
    .filter(Boolean);
  const out: Record<string, string> = {};
  if (keys.length === 0) {
    if (collected.ticker) out.ticker = collected.ticker;
    return out;
  }
  keys.forEach((key) => {
    if (collected[key]) out[key] = collected[key];
  });
  return out;
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
