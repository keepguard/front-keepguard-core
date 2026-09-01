import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  buildListSearchParams,
  parseListParams,
  type ListQueryAliases,
} from '../utils/listQueryParams';

type HistoryMode = 'push' | 'replace';

export function useAppliedListUrl<T extends { [K in keyof T]: string }>(
  defaults: T,
  options?: {
    aliases?: ListQueryAliases<T>;
  },
) {
  const [searchParams, setSearchParams] = useSearchParams();
  const aliases = options?.aliases;
  const urlKey = searchParams.toString();

  const parsed = useMemo(
    () => parseListParams(new URLSearchParams(urlKey), defaults, aliases),
    [aliases, defaults, urlKey],
  );

  const [filters, setFilters] = useState<T>(parsed.filters);
  const [syncedUrlKey, setSyncedUrlKey] = useState(urlKey);
  if (syncedUrlKey !== urlKey) {
    setSyncedUrlKey(urlKey);
    setFilters(parsed.filters);
  }

  const writeUrl = useCallback(
    (nextFilters: T, nextPage: number, history: HistoryMode) => {
      const next = buildListSearchParams({ filters: nextFilters, page: nextPage }, defaults, aliases);
      if (next.toString() === urlKey) return;
      setSearchParams(next, { replace: history === 'replace' });
    },
    [aliases, defaults, setSearchParams, urlKey],
  );

  const applyFilters = useCallback(
    (next: T, history: HistoryMode = 'push') => {
      setFilters(next);
      writeUrl(next, 0, history);
    },
    [writeUrl],
  );

  const goToPage = useCallback(
    (page: number, history: HistoryMode = 'push') => {
      writeUrl(parsed.filters, Math.max(0, page), history);
    },
    [parsed.filters, writeUrl],
  );

  return {
    filters,
    setFilters,
    applied: parsed.filters,
    page: parsed.page,
    applyFilters,
    goToPage,
  };
}
