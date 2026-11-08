/**
 * InvestBot / analista: DESATIVADO (abandonado em 08/11/2026). O bff-invest saiu do ar e o front não o chama mais.
 * Este arquivo guarda só os tipos e funções que as telas de Planos e Billing ainda importam, sem rede.
 * Quando a UI de cotas do analista (cartão Freemium e etapa "Cotas" do plano) for removida do BillingOrgView e do
 * BillingView, apague este arquivo.
 */

export interface PlanQuotaDTO {
  planCode: string;
  slots?: number;
  picksAllowed?: number;
  fixedAssetIds?: string[];
  watchlistSlots: number;
  watchlistPicks: number;
  fixedTickers?: string[];
  updatedAt?: string | null;
}

export interface AnalystTickers {
  tickers: string[];
}

export interface SavePlanQuotasPayload {
  quotas: Array<{
    planCode: string;
    slots?: number;
    picksAllowed?: number;
    fixedAssetIds?: string[];
    watchlistSlots?: number;
    watchlistPicks?: number;
    fixedTickers?: string[];
  }>;
}

export function getPlanQuotas(): Promise<PlanQuotaDTO[]> {
  return Promise.resolve([]);
}

export function listKnownTickers(): Promise<AnalystTickers> {
  return Promise.resolve({ tickers: [] });
}

export function savePlanQuotas(_payload: SavePlanQuotasPayload): Promise<void> {
  return Promise.reject(new Error('As cotas do analista (InvestBot) foram desativadas.'));
}
