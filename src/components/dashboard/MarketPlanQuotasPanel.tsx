import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Lock,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  getPlanQuotas,
  listKnownTickers,
  savePlanQuotas,
  type PlanQuotaDTO,
} from '../../services/analystService';
import { listBillingPlans, type BillingPlan } from '../../services/billingService';

interface QuotaDraft {
  planCode: string;
  name?: string;
  watchlistSlots: number;
  watchlistPicks: number;
  fixedTickers: string[];
  isNoPlan?: boolean;
  updatedAt?: string | null;
}

const NO_PLAN_CODE = '__NO_PLAN__';
const DEFAULT_NO_PLAN_SLOTS = 2;
const DEFAULT_NO_PLAN_PICKS = 0;
const DEFAULT_PAID_SLOTS = 150;
const DEFAULT_PAID_PICKS = 150;

export const MarketPlanQuotasPanel: React.FC = () => {
  const { getAccessToken } = useAuth();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [drafts, setDrafts] = useState<QuotaDraft[]>([]);
  const [newPlanCode, setNewPlanCode] = useState('');
  const [showAddRow, setShowAddRow] = useState(false);
  const [knownTickers, setKnownTickers] = useState<string[]>([]);
  const [expandedPlans, setExpandedPlans] = useState<Record<string, boolean>>({});
  const [tickerInputs, setTickerInputs] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAccessToken();
      const [existingQuotas, billingPlans, tickersResp] = await Promise.all([
        getPlanQuotas().catch((err) => {
          console.warn('Falha ao carregar cotas salvas:', err);
          return [] as PlanQuotaDTO[];
        }),
        token
          ? listBillingPlans(token).catch((err) => {
              console.warn('Falha ao carregar planos de billing:', err);
              return [] as BillingPlan[];
            })
          : Promise.resolve([] as BillingPlan[]),
        listKnownTickers().catch((err) => {
          console.warn('Falha ao carregar catálogo de tickers:', err);
          return { tickers: [] };
        }),
      ]);

      if (tickersResp && Array.isArray(tickersResp.tickers)) {
        setKnownTickers(tickersResp.tickers);
      }

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
        fixedTickers: noPlanExisting?.fixedTickers ?? [],
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
          fixedTickers: q?.fixedTickers ?? [],
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
            fixedTickers: q.fixedTickers ?? [],
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

  const toggleExpanded = (planCode: string) => {
    setExpandedPlans((prev) => ({
      ...prev,
      [planCode]: !prev[planCode],
    }));
  };

  const updateDraft = (
    planCode: string,
    field: 'watchlistSlots' | 'watchlistPicks',
    value: number
  ) => {
    const num = Math.max(0, Math.min(500, isNaN(value) ? 0 : value));
    setDrafts((prev) =>
      prev.map((d) => (d.planCode === planCode ? { ...d, [field]: num } : d))
    );
  };

  const addFixedTicker = (planCode: string, rawTicker: string) => {
    const sym = rawTicker.trim().toUpperCase();
    if (!sym) return;
    if (!/^[A-Z0-9]{4,6}$/.test(sym)) {
      addToast({
        type: 'error',
        title: 'Ticker Inválido',
        description: `O código "${sym}" é inválido. Digite um ticker no formato correto (ex: PETR4, VALE3).`,
      });
      return;
    }

    setDrafts((prev) =>
      prev.map((d) => {
        if (d.planCode !== planCode) return d;
        if (d.fixedTickers.includes(sym)) {
          addToast({
            type: 'error',
            title: 'Ticker Já Adicionado',
            description: `O ticker "${sym}" já consta na lista de fixos deste plano.`,
          });
          return d;
        }
        const required = Math.max(0, d.watchlistSlots - d.watchlistPicks);
        if (d.fixedTickers.length >= required) {
          addToast({
            type: 'error',
            title: 'Limite de Tickers Fixos Atingido',
            description: `Este plano exige exatamente ${required} ticker(s) fixo(s). Remova um ativo antes de adicionar outro.`,
          });
          return d;
        }
        return {
          ...d,
          fixedTickers: [...d.fixedTickers, sym],
        };
      })
    );

    setTickerInputs((prev) => ({ ...prev, [planCode]: '' }));
  };

  const removeFixedTicker = (planCode: string, ticker: string) => {
    setDrafts((prev) =>
      prev.map((d) =>
        d.planCode === planCode
          ? { ...d, fixedTickers: d.fixedTickers.filter((t) => t !== ticker) }
          : d
      )
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
        fixedTickers: [],
        isNoPlan: false,
      },
    ]);
    setNewPlanCode('');
    setShowAddRow(false);
  };

  const handleSave = async () => {
    // Validação estrita prévia antes de salvar
    for (const draft of drafts) {
      const planLabel = draft.name || draft.planCode;
      if (draft.watchlistPicks > draft.watchlistSlots) {
        addToast({
          type: 'error',
          title: 'Regra de Cotas Inválida',
          description: `No plano "${planLabel}", os picks livres (${draft.watchlistPicks}) não podem exceder os slots totais (${draft.watchlistSlots}).`,
        });
        setExpandedPlans((prev) => ({ ...prev, [draft.planCode]: true }));
        return;
      }
      const requiredFixed = draft.watchlistSlots - draft.watchlistPicks;
      const currentFixed = draft.fixedTickers.length;
      if (requiredFixed !== currentFixed) {
        addToast({
          type: 'error',
          title: 'Tickers Fixos Incompletos',
          description: `No plano "${planLabel}", a regra exige exatamente ${requiredFixed} ticker(s) fixo(s) (Slots: ${draft.watchlistSlots} - Picks: ${draft.watchlistPicks}), mas foram selecionados ${currentFixed}.`,
        });
        setExpandedPlans((prev) => ({ ...prev, [draft.planCode]: true }));
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        quotas: drafts.map((d) => ({
          planCode: d.planCode,
          watchlistSlots: d.watchlistSlots,
          watchlistPicks: d.watchlistPicks,
          fixedTickers: d.fixedTickers,
        })),
      };

      await savePlanQuotas(payload);

      addToast({
        type: 'success',
        title: 'Cotas salvas com sucesso!',
        description: 'Os limites e tickers fixos foram persistidos no banco e o cache Redis foi invalidado imediatamente.',
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
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: 600 }}>
              Configuração de Limites e Cotas por Plano
            </h3>
            <p
              style={{
                margin: 0,
                color: 'var(--text-muted, #5f6368)',
                fontSize: '0.9rem',
                maxWidth: '780px',
                lineHeight: 1.5,
              }}
            >
              Defina as cotas oficiais de análise e favoritos para cada plano de assinatura.
              A quantidade de <strong>Tickers Fixos da Plataforma</strong> é calculada dinamicamente:
              {' '}
              <code style={{ background: '#f1f3f4', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                Fixos = Slots - Picks Livres
              </code>.
              O plano{' '}
              <code style={{ background: '#f1f3f4', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                {NO_PLAN_CODE}
              </code>{' '}
              define os limites para usuários sem assinatura ativa (degustação freemium).
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
            <strong>Cache de Alta Performance:</strong> As consultas dos assinantes usam cache Redis com TTL de 1 hora. Ao clicar em <strong>Salvar Cotas</strong>, o cache da sua organização é limpo instantaneamente.
          </span>
        </div>
      </div>

      <div className="hpanel-table-card desktop-table-view">
        <table className="hpanel-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.75rem 1rem' }}>Plano / Nível</th>
              <th style={{ textAlign: 'left', padding: '0.75rem 1rem' }}>Código (Key)</th>
              <th style={{ textAlign: 'center', padding: '0.75rem 1rem', width: '170px' }}>
                Ativos na Watchlist (Slots)
              </th>
              <th style={{ textAlign: 'center', padding: '0.75rem 1rem', width: '170px' }}>
                Picks / Recomendações
              </th>
              <th style={{ textAlign: 'center', padding: '0.75rem 1rem', width: '200px' }}>
                Tickers Fixos da Plataforma
              </th>
              <th style={{ textAlign: 'right', padding: '0.75rem 1rem', width: '90px' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="table-cell-muted" style={{ textAlign: 'center', padding: '2rem' }}>
                  Carregando configurações de planos e cotas…
                </td>
              </tr>
            ) : drafts.length === 0 ? (
              <tr>
                <td colSpan={6} className="table-cell-muted" style={{ textAlign: 'center', padding: '2rem' }}>
                  Nenhum plano disponível para configuração.
                </td>
              </tr>
            ) : (
              drafts.map((draft) => {
                const slots = draft.watchlistSlots;
                const picks = draft.watchlistPicks;
                const isPicksOver = picks > slots;
                const requiredFixed = Math.max(0, slots - picks);
                const currentFixedCount = draft.fixedTickers.length;
                const isComplete = !isPicksOver && currentFixedCount === requiredFixed;
                const isExpanded = expandedPlans[draft.planCode] ?? (requiredFixed > 0);

                return (
                  <React.Fragment key={draft.planCode}>
                    <tr
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
                            {slots <= 0
                              ? '⚠️ Cota 0 bloqueia acesso ao mercado para quem não assinou plano.'
                              : `Permite degustar o produto com ${slots} ativos (${picks} livres + ${requiredFixed} fixos).`}
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
                            style={{ width: '85px', textAlign: 'center' }}
                            value={draft.watchlistSlots}
                            min={0}
                            max={500}
                            disabled={saving}
                            onChange={(e) =>
                              updateDraft(draft.planCode, 'watchlistSlots', parseInt(e.target.value, 10))
                            }
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
                            style={{
                              width: '85px',
                              textAlign: 'center',
                              borderColor: isPicksOver ? '#d93025' : undefined,
                            }}
                            value={draft.watchlistPicks}
                            min={0}
                            max={500}
                            disabled={saving}
                            onChange={(e) =>
                              updateDraft(draft.planCode, 'watchlistPicks', parseInt(e.target.value, 10))
                            }
                            aria-label={`Picks para ${draft.planCode}`}
                          />
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted, #70757a)' }}>picks</span>
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center', verticalAlign: 'middle' }}>
                        {isPicksOver ? (
                          <span
                            style={{
                              color: '#d93025',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <AlertCircle size={14} /> Picks &gt; Slots
                          </span>
                        ) : requiredFixed === 0 ? (
                          <span
                            style={{
                              background: '#f1f3f4',
                              color: '#5f6368',
                              border: '1px solid #dadce0',
                              borderRadius: '12px',
                              padding: '2px 8px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                            }}
                          >
                            100% Livre (0 fixos)
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-pill"
                            style={{
                              padding: '4px 10px',
                              fontSize: '0.78rem',
                              border: `1px solid ${isComplete ? '#ceead6' : '#ffd8a8'}`,
                              color: isComplete ? '#137333' : '#b06000',
                              background: isComplete ? '#e6f4ea' : '#fff0d4',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              cursor: 'pointer',
                              fontWeight: 600,
                            }}
                            onClick={() => toggleExpanded(draft.planCode)}
                            title="Clique para gerenciar os tickers fixos deste plano"
                          >
                            <Lock size={12} />
                            <span>
                              {currentFixedCount} de {requiredFixed} fixos
                            </span>
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        )}
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

                    {/* Linha expansível para configuração de tickers fixos */}
                    {isExpanded && (
                      <tr key={`${draft.planCode}-expanded`} style={{ background: '#f8fafd' }}>
                        <td
                          colSpan={6}
                          style={{
                            padding: '1rem 1.25rem',
                            borderBottom: '2px solid #e0e3e7',
                            borderTop: '1px dashed #d2e3fc',
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {/* Banner explicativo com status da regra */}
                            {isPicksOver ? (
                              <div
                                style={{
                                  padding: '0.6rem 0.9rem',
                                  background: '#fce8e6',
                                  borderLeft: '4px solid #d93025',
                                  color: '#c5221f',
                                  borderRadius: '4px',
                                  fontSize: '0.85rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.5rem',
                                }}
                              >
                                <AlertCircle size={16} />
                                <span>
                                  <strong>Atenção:</strong> A quantidade de picks de escolha livre ({picks}) não pode ser maior que o total de slots ({slots}). Reduza os picks ou aumente os slots.
                                </span>
                              </div>
                            ) : requiredFixed === 0 ? (
                              <div
                                style={{
                                  padding: '0.6rem 0.9rem',
                                  background: '#e8f0fe',
                                  borderLeft: '4px solid #1a73e8',
                                  color: '#174ea6',
                                  borderRadius: '4px',
                                  fontSize: '0.85rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.5rem',
                                }}
                              >
                                <Check size={16} />
                                <span>
                                  <strong>Liberdade Total:</strong> Como os picks livres ({picks}) são iguais aos slots ({slots}), o usuário escolhe todos os ativos livremente. Nenhum ticker fixo é exigido.
                                </span>
                              </div>
                            ) : (
                              <div
                                style={{
                                  padding: '0.6rem 0.9rem',
                                  background: isComplete ? '#e6f4ea' : '#fef7e0',
                                  borderLeft: `4px solid ${isComplete ? '#137333' : '#ea8600'}`,
                                  color: isComplete ? '#137333' : '#b06000',
                                  borderRadius: '4px',
                                  fontSize: '0.85rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  flexWrap: 'wrap',
                                  gap: '0.5rem',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  {isComplete ? <Check size={16} /> : <AlertCircle size={16} />}
                                  <span>
                                    <strong>Regra do Plano:</strong> {slots} slots totais - {picks} picks livres ={' '}
                                    <strong>{requiredFixed} tickers fixos obrigatórios</strong>.
                                  </span>
                                </div>
                                <div>
                                  {isComplete ? (
                                    <span style={{ fontWeight: 600 }}>✓ Cota de fixos completa ({currentFixedCount} de {requiredFixed})</span>
                                  ) : currentFixedCount < requiredFixed ? (
                                    <span style={{ fontWeight: 600 }}>
                                      ⚠️ Faltam {requiredFixed - currentFixedCount} ticker(s) fixo(s) ({currentFixedCount} de {requiredFixed})
                                    </span>
                                  ) : (
                                    <span style={{ fontWeight: 600, color: '#d93025' }}>
                                      ⚠️ Remova {currentFixedCount - requiredFixed} ticker(s) para casar com a cota ({currentFixedCount} de {requiredFixed})
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Lista de chips de tickers fixos selecionados */}
                            {requiredFixed > 0 && (
                              <div>
                                <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem', color: '#3c4043' }}>
                                  Tickers Fixos Atuais ({currentFixedCount} / {requiredFixed}):
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                                  {draft.fixedTickers.map((ticker) => (
                                    <span
                                      key={ticker}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.35rem',
                                        background: '#ffffff',
                                        border: '1px solid #1a73e8',
                                        color: '#1a73e8',
                                        borderRadius: '6px',
                                        padding: '4px 10px',
                                        fontSize: '0.85rem',
                                        fontWeight: 600,
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                      }}
                                    >
                                      <Lock size={12} />
                                      <span>{ticker}</span>
                                      <button
                                        type="button"
                                        onClick={() => removeFixedTicker(draft.planCode, ticker)}
                                        style={{
                                          background: 'transparent',
                                          border: 'none',
                                          cursor: 'pointer',
                                          padding: '0 2px',
                                          marginLeft: '2px',
                                          color: '#5f6368',
                                          display: 'flex',
                                          alignItems: 'center',
                                        }}
                                        title={`Remover ${ticker}`}
                                      >
                                        <X size={13} />
                                      </button>
                                    </span>
                                  ))}
                                  {draft.fixedTickers.length === 0 && (
                                    <span style={{ fontSize: '0.85rem', color: '#70757a', fontStyle: 'italic' }}>
                                      Nenhum ticker fixo selecionado. Adicione os ativos abaixo.
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Input para adicionar ticker fixo */}
                            {requiredFixed > 0 && currentFixedCount < requiredFixed && (
                              <div
                                style={{
                                  display: 'flex',
                                  gap: '0.5rem',
                                  alignItems: 'center',
                                  flexWrap: 'wrap',
                                  paddingTop: '0.25rem',
                                }}
                              >
                                <input
                                  type="text"
                                  className="form-input"
                                  style={{ width: '160px', textTransform: 'uppercase' }}
                                  placeholder="Ticker (ex: PETR4)"
                                  value={tickerInputs[draft.planCode] || ''}
                                  maxLength={6}
                                  onChange={(e) =>
                                    setTickerInputs((prev) => ({
                                      ...prev,
                                      [draft.planCode]: e.target.value.toUpperCase(),
                                    }))
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      addFixedTicker(draft.planCode, tickerInputs[draft.planCode] || '');
                                    }
                                  }}
                                />
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-pill"
                                  onClick={() =>
                                    addFixedTicker(draft.planCode, tickerInputs[draft.planCode] || '')
                                  }
                                  disabled={!tickerInputs[draft.planCode]?.trim()}
                                >
                                  <Plus size={14} />
                                  <span>Adicionar Ticker Fixo</span>
                                </button>

                                {/* Sugestões rápidas dos tickers cadastrados */}
                                {knownTickers.length > 0 && (
                                  <div
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '0.35rem',
                                      flexWrap: 'wrap',
                                      marginLeft: '0.5rem',
                                    }}
                                  >
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted, #70757a)' }}>
                                      Sugestões do catálogo:
                                    </span>
                                    {knownTickers
                                      .filter((t) => !draft.fixedTickers.includes(t))
                                      .slice(0, 6)
                                      .map((t) => (
                                        <button
                                          key={t}
                                          type="button"
                                          style={{
                                            background: '#ffffff',
                                            border: '1px solid #dadce0',
                                            borderRadius: '4px',
                                            padding: '2px 7px',
                                            fontSize: '0.75rem',
                                            cursor: 'pointer',
                                            fontWeight: 500,
                                            color: '#3c4043',
                                          }}
                                          onClick={() => addFixedTicker(draft.planCode, t)}
                                          title={`Adicionar ${t} aos fixos`}
                                        >
                                          +{t}
                                        </button>
                                      ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
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
