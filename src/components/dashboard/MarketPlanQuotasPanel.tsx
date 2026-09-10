import React, { useCallback, useEffect, useState } from 'react';
import { Check, Plus, RefreshCw, Save, ShieldAlert, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  getPlanQuotas,
  savePlanQuotas,
  type PlanQuotaDTO,
} from '../../services/analystService';
import { listBillingPlans, type BillingPlan } from '../../services/billingService';

interface QuotaDraft {
  planCode: string;
  name?: string;
  watchlistSlots: number;
  watchlistPicks: number;
  isNoPlan?: boolean;
  updatedAt?: string | null;
}

const NO_PLAN_CODE = '__NO_PLAN__';
const DEFAULT_NO_PLAN_SLOTS = 2;
const DEFAULT_NO_PLAN_PICKS = 0;
const DEFAULT_PAID_SLOTS = 150;
const DEFAULT_PAID_PICKS = 1;

export const MarketPlanQuotasPanel: React.FC = () => {
  const { getAccessToken } = useAuth();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [drafts, setDrafts] = useState<QuotaDraft[]>([]);
  const [newPlanCode, setNewPlanCode] = useState('');
  const [showAddRow, setShowAddRow] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAccessToken();
      const [existingQuotas, billingPlans] = await Promise.all([
        getPlanQuotas().catch((err) => {
          console.warn('Falha ao carregar cotas salvas:', err);
          return [] as PlanQuotaDTO[];
        }),
        token ? listBillingPlans(token).catch((err) => {
          console.warn('Falha ao carregar planos de billing:', err);
          return [] as BillingPlan[];
        }) : Promise.resolve([] as BillingPlan[]),
      ]);

      const quotaMap = new Map<string, PlanQuotaDTO>();
      for (const q of existingQuotas) {
        quotaMap.set(q.planCode, q);
      }

      const billingMap = new Map<string, BillingPlan>();
      for (const p of billingPlans) {
        billingMap.set(p.code, p);
      }

      const merged: QuotaDraft[] = [];

      // 1. Linha especial para usuários sem plano
      const noPlanExisting = quotaMap.get(NO_PLAN_CODE);
      merged.push({
        planCode: NO_PLAN_CODE,
        name: 'Usuários sem Assinatura (Freemium)',
        watchlistSlots: noPlanExisting ? noPlanExisting.watchlistSlots : DEFAULT_NO_PLAN_SLOTS,
        watchlistPicks: noPlanExisting ? noPlanExisting.watchlistPicks : DEFAULT_NO_PLAN_PICKS,
        isNoPlan: true,
        updatedAt: noPlanExisting?.updatedAt,
      });

      // 2. Planos cadastrados no ms-billing
      for (const p of billingPlans) {
        if (p.code === NO_PLAN_CODE) continue;
        const q = quotaMap.get(p.code);
        merged.push({
          planCode: p.code,
          name: p.name,
          watchlistSlots: q ? q.watchlistSlots : DEFAULT_PAID_SLOTS,
          watchlistPicks: q ? q.watchlistPicks : DEFAULT_PAID_PICKS,
          isNoPlan: false,
          updatedAt: q?.updatedAt,
        });
      }

      // 3. Outros planos que porventura já tenham sido salvos no mongo mas não estão na lista de billing
      for (const q of existingQuotas) {
        if (q.planCode === NO_PLAN_CODE) continue;
        if (!billingMap.has(q.planCode)) {
          merged.push({
            planCode: q.planCode,
            name: `Plano customizado (${q.planCode})`,
            watchlistSlots: q.watchlistSlots,
            watchlistPicks: q.watchlistPicks,
            isNoPlan: false,
            updatedAt: q.updatedAt,
          });
        }
      }

      setDrafts(merged);
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Erro ao carregar configurações de cotas',
        description: err instanceof Error ? err.message : 'Falha na comunicação com os serviços.',
      });
    } finally {
      setLoading(false);
    }
  }, [addToast, getAccessToken]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const updateDraft = (planCode: string, field: 'watchlistSlots' | 'watchlistPicks', value: number) => {
    const num = Math.max(0, Math.min(500, isNaN(value) ? 0 : value));
    setDrafts((prev) =>
      prev.map((d) => (d.planCode === planCode ? { ...d, [field]: num } : d))
    );
  };

  const removeDraft = (planCode: string) => {
    if (planCode === NO_PLAN_CODE) return;
    setDrafts((prev) => prev.filter((d) => d.planCode !== planCode));
  };

  const handleAddNewPlan = () => {
    const code = newPlanCode.trim().toLowerCase();
    if (!code) return;
    if (drafts.some((d) => d.planCode === code)) {
      addToast({
        type: 'error',
        title: 'Plano já existente',
        description: `O código de plano "${code}" já consta na lista de cotas.`,
      });
      return;
    }
    setDrafts((prev) => [
      ...prev,
      {
        planCode: code,
        name: `Plano ${code}`,
        watchlistSlots: DEFAULT_PAID_SLOTS,
        watchlistPicks: DEFAULT_PAID_PICKS,
        isNoPlan: false,
      },
    ]);
    setNewPlanCode('');
    setShowAddRow(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        quotas: drafts.map((d) => ({
          planCode: d.planCode,
          watchlistSlots: d.watchlistSlots,
          watchlistPicks: d.watchlistPicks,
        })),
      };

      await savePlanQuotas(payload);

      addToast({
        type: 'success',
        title: 'Cotas salvas com sucesso!',
        description: 'Os limites foram persistidos no banco e o cache Redis foi invalidado imediatamente.',
      });

      await loadData();
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Falha ao salvar cotas',
        description: err instanceof Error ? err.message : 'Erro ao persistir configurações no servidor.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="market-plan-quotas-panel" style={{ marginTop: '1.5rem' }}>
      <div
        className="hpanel-card"
        style={{
          padding: '1.25rem',
          borderRadius: '8px',
          background: 'var(--card-bg, #ffffff)',
          border: '1px solid var(--border-color, #e0e3e7)',
          marginBottom: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: 600 }}>
              Configuração de Limites e Cotas por Plano
            </h3>
            <p style={{ margin: 0, color: 'var(--text-muted, #5f6368)', fontSize: '0.9rem', maxWidth: '750px' }}>
              Defina as cotas oficiais de análise e favoritos para cada plano de assinatura. O plano{' '}
              <code style={{ background: '#f1f3f4', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                {NO_PLAN_CODE}
              </code>{' '}
              define a quantidade disponível para novos usuários ou visitantes sem plano ativo (degustação freemium).
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              type="button"
              className="btn btn-secondary btn-pill"
              onClick={() => void loadData()}
              disabled={loading || saving}
              title="Recarregar planos e cotas"
            >
              <RefreshCw size={15} className={loading ? 'spin' : ''} />
              <span>Atualizar</span>
            </button>
            <button
              type="button"
              className="btn btn-primary btn-pill"
              onClick={() => void handleSave()}
              disabled={loading || saving}
              title="Persistir alterações e invalidar cache Redis"
            >
              <Save size={15} />
              <span>{saving ? 'Salvando…' : 'Salvar Cotas'}</span>
            </button>
          </div>
        </div>

        <div
          style={{
            marginTop: '1rem',
            padding: '0.75rem 1rem',
            background: '#e8f0fe',
            borderLeft: '4px solid #1a73e8',
            borderRadius: '4px',
            fontSize: '0.85rem',
            color: '#174ea6',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <Check size={16} />
          <span>
            <strong>Cache de Alta Performance:</strong> As leituras dos usuários consultam o Redis com TTL de 1 hora. Ao clicar em <strong>Salvar Cotas</strong>, o cache da sua organização é limpo instantaneamente.
          </span>
        </div>
      </div>

      <div className="hpanel-table-card desktop-table-view">
        <table className="hpanel-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.75rem 1rem' }}>Plano / Nível</th>
              <th style={{ textAlign: 'left', padding: '0.75rem 1rem' }}>Código (Key)</th>
              <th style={{ textAlign: 'center', padding: '0.75rem 1rem', width: '180px' }}>
                Ativos na Watchlist (Slots)
              </th>
              <th style={{ textAlign: 'center', padding: '0.75rem 1rem', width: '180px' }}>
                Picks / Recomendações
              </th>
              <th style={{ textAlign: 'right', padding: '0.75rem 1rem', width: '100px' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="table-cell-muted" style={{ textAlign: 'center', padding: '2rem' }}>
                  Carregando configurações de planos e cotas…
                </td>
              </tr>
            ) : drafts.length === 0 ? (
              <tr>
                <td colSpan={5} className="table-cell-muted" style={{ textAlign: 'center', padding: '2rem' }}>
                  Nenhum plano disponível para configuração.
                </td>
              </tr>
            ) : (
              drafts.map((draft) => (
                <tr
                  key={draft.planCode}
                  style={
                    draft.isNoPlan
                      ? { background: 'rgba(255, 244, 229, 0.4)' }
                      : undefined
                  }
                >
                  <td style={{ padding: '0.75rem 1rem', verticalAlign: 'middle' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <strong>{draft.name || draft.planCode}</strong>
                      {draft.isNoPlan ? (
                        <span
                          style={{
                            background: '#fff0d4',
                            color: '#b36b00',
                            border: '1px solid #ffd8a8',
                            borderRadius: '12px',
                            padding: '2px 8px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                          }}
                        >
                          Sem Assinatura (Freemium)
                        </span>
                      ) : (
                        <span
                          style={{
                            background: '#e6f4ea',
                            color: '#137333',
                            border: '1px solid #ceead6',
                            borderRadius: '12px',
                            padding: '2px 8px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                          }}
                        >
                          Plano Ativo
                        </span>
                      )}
                    </div>
                    {draft.isNoPlan && (
                      <div style={{ fontSize: '0.8rem', color: '#805b10', marginTop: '4px' }}>
                        {draft.watchlistSlots <= 0
                          ? '⚠️ Cota 0 bloqueia acesso ao mercado para quem não assinou plano.'
                          : 'Permite degustar o produto adicionando até ' + draft.watchlistSlots + ' ativos.'}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', verticalAlign: 'middle' }}>
                    <code style={{ background: '#f1f3f4', padding: '2px 6px', borderRadius: '4px', fontSize: '0.85rem' }}>
                      {draft.planCode}
                    </code>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center', verticalAlign: 'middle' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                      <input
                        type="number"
                        className="form-input"
                        style={{ width: '90px', textAlign: 'center' }}
                        value={draft.watchlistSlots}
                        min={0}
                        max={500}
                        disabled={saving}
                        onChange={(e) => updateDraft(draft.planCode, 'watchlistSlots', parseInt(e.target.value, 10))}
                        aria-label={`Slots para ${draft.planCode}`}
                      />
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted, #70757a)' }}>ativos</span>
                    </div>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center', verticalAlign: 'middle' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                      <input
                        type="number"
                        className="form-input"
                        style={{ width: '90px', textAlign: 'center' }}
                        value={draft.watchlistPicks}
                        min={0}
                        max={500}
                        disabled={saving}
                        onChange={(e) => updateDraft(draft.planCode, 'watchlistPicks', parseInt(e.target.value, 10))}
                        aria-label={`Picks para ${draft.planCode}`}
                      />
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted, #70757a)' }}>picks</span>
                    </div>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right', verticalAlign: 'middle' }}>
                    {!draft.isNoPlan ? (
                      <button
                        type="button"
                        className="btn btn-icon"
                        onClick={() => removeDraft(draft.planCode)}
                        disabled={saving}
                        title="Remover plano da lista de cotas"
                        style={{ color: '#d93025' }}
                      >
                        <Trash2 size={16} />
                      </button>
                    ) : (
                      <span title="Obrigatório para controle de degustação" style={{ color: '#805b10' }}>
                        <ShieldAlert size={16} />
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {showAddRow ? (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="text"
              className="form-input"
              placeholder="Código do plano (ex: vip, gold)"
              value={newPlanCode}
              onChange={(e) => setNewPlanCode(e.target.value)}
              style={{ width: '240px' }}
            />
            <button
              type="button"
              className="btn btn-primary btn-pill"
              onClick={handleAddNewPlan}
              disabled={!newPlanCode.trim()}
            >
              Adicionar
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-pill"
              onClick={() => {
                setShowAddRow(false);
                setNewPlanCode('');
              }}
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-secondary btn-pill"
            onClick={() => setShowAddRow(true)}
            disabled={loading || saving}
          >
            <Plus size={15} />
            <span>Adicionar Outro Plano</span>
          </button>
        )}

        <button
          type="button"
          className="btn btn-primary btn-pill"
          onClick={() => void handleSave()}
          disabled={loading || saving || drafts.length === 0}
        >
          <Save size={15} />
          <span>{saving ? 'Salvando…' : 'Salvar Alterações'}</span>
        </button>
      </div>
    </div>
  );
};
