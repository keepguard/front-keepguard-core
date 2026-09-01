export type StringRecord = Record<string, string>;

export type ListQueryAliases<T extends object> = Partial<Record<keyof T & string, string>>;

function paramKey<T extends object>(key: keyof T & string, aliases?: ListQueryAliases<T>): string {
  return aliases?.[key] || key;
}

export function parseListParams<T extends { [K in keyof T]: string }>(
  searchParams: URLSearchParams,
  defaults: T,
  aliases?: ListQueryAliases<T>,
): { filters: T; page: number } {
  const filters = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof T & string)[]) {
    const raw = searchParams.get(paramKey(key, aliases));
    if (raw != null && raw !== '') {
      (filters as Record<string, string>)[key] = raw;
    }
  }
  const pageRaw = searchParams.get('page');
  const parsedPage = pageRaw ? Number.parseInt(pageRaw, 10) : 0;
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 0;
  return { filters, page };
}

export function buildListSearchParams<T extends { [K in keyof T]: string }>(
  state: { filters: T; page?: number },
  defaults: T,
  aliases?: ListQueryAliases<T>,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of Object.keys(defaults) as (keyof T & string)[]) {
    const value = state.filters[key];
    if (value == null || value === '' || value === defaults[key]) continue;
    params.set(paramKey(key, aliases), String(value));
  }
  if (state.page && state.page > 0) {
    params.set('page', String(state.page));
  }
  return params;
}
