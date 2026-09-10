import React, { useState, useMemo, useEffect } from 'react';
import { Search, AlertTriangle, Check, ArrowLeft, Sparkles, Lock } from 'lucide-react';
import { Modal } from '../common/Modal';

interface PickTickersModalProps {
  isOpen: boolean;
  onClose: () => void;
  catalog: string[];
  fixedTickers: string[];
  alreadyPickedTickers: string[];
  picksRemaining: number;
  onConfirmPick: (ticker: string) => Promise<void>;
}

export const PickTickersModal: React.FC<PickTickersModalProps> = ({
  isOpen,
  onClose,
  catalog,
  fixedTickers,
  alreadyPickedTickers,
  picksRemaining,
  onConfirmPick,
}) => {
  const [step, setStep] = useState<'select' | 'confirm'>('select');
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setStep('select');
      setSelectedTicker(null);
      setSearch('');
      setError('');
      setLoading(false);
    }
  }, [isOpen]);

  const fixedSet = useMemo(() => new Set(fixedTickers.map((t) => t.toUpperCase())), [fixedTickers]);
  const pickedSet = useMemo(() => new Set(alreadyPickedTickers.map((t) => t.toUpperCase())), [alreadyPickedTickers]);

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toUpperCase();
    const sorted = [...catalog].sort((a, b) => a.localeCompare(b));
    if (!q) return sorted;
    return sorted.filter((t) => t.toUpperCase().includes(q));
  }, [catalog, search]);

  const handleNextToConfirm = () => {
    if (!selectedTicker) return;
    setError('');
    setStep('confirm');
  };

  const handleBackToSelect = () => {
    setStep('select');
  };

  const handleConfirm = async () => {
    if (!selectedTicker) return;
    setLoading(true);
    setError('');
    try {
      await onConfirmPick(selectedTicker);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao confirmar a escolha do ativo.';
      setError(msg);
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={loading ? () => {} : onClose}
      title={step === 'select' ? 'Personalizar Carteira do Plano' : 'Confirmar Escolha Definitiva'}
      subtitle={
        step === 'select'
          ? `Você possui ${picksRemaining} ativo${picksRemaining > 1 ? 's' : ''} disponível${picksRemaining > 1 ? 'is' : ''} para adicionar à sua carteira.`
          : 'Esta escolha é irreversível e ficará vinculada à sua assinatura.'
      }
      maxWidth="540px"
      footer={
        step === 'select' ? (
          <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!selectedTicker}
              onClick={handleNextToConfirm}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
            >
              Avançar para Confirmação
            </button>
          </div>
        ) : (
          <div className="modal-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleBackToSelect}
              disabled={loading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <ArrowLeft size={16} /> Voltar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleConfirm}
              disabled={loading}
              style={{
                background: 'linear-gradient(135deg, #673de6 0%, #5025d1 100%)',
                color: '#ffffff',
                fontWeight: 600,
                boxShadow: '0 4px 12px rgba(103, 61, 230, 0.35)',
              }}
            >
              {loading ? 'Confirmando...' : 'Confirmar Definitivamente'}
            </button>
          </div>
        )
      }
    >
      {error && (
        <div
          style={{
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            background: 'var(--danger-light, #fee2e2)',
            color: 'var(--danger, #eb1e3a)',
            border: '1px solid var(--danger-border, #fca5a5)',
            borderRadius: '8px',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      {step === 'select' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.625rem',
              padding: '0.75rem 1rem',
              background: 'linear-gradient(135deg, rgba(103, 61, 230, 0.08) 0%, rgba(103, 61, 230, 0.02) 100%)',
              border: '1px solid var(--primary-border, #dcd2f9)',
              borderRadius: '8px',
            }}
          >
            <Sparkles size={18} color="var(--primary, #673de6)" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: '0.85rem', color: 'var(--text-body, #3c4043)' }}>
              Selecione o ativo da B3 que deseja acompanhar. Os 4 ativos recomendados já estão fixos no seu plano.
            </div>
          </div>

          <div style={{ position: 'relative' }}>
            <Search
              size={18}
              style={{
                position: 'absolute',
                left: '0.875rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted, #5f6368)',
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              className="input"
              placeholder="Buscar por código (ex: WEGE3, BBAS3, RENT3)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                paddingLeft: '2.5rem',
                height: '42px',
                borderRadius: '8px',
              }}
              autoFocus
            />
          </div>

          <div
            style={{
              maxHeight: '320px',
              overflowY: 'auto',
              border: '1px solid var(--border, #e3e5e8)',
              borderRadius: '8px',
              padding: '0.5rem',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
              gap: '0.5rem',
              background: 'var(--bg-muted, #f8f9fa)',
            }}
          >
            {filteredCatalog.length === 0 ? (
              <div
                style={{
                  gridColumn: '1 / -1',
                  textAlign: 'center',
                  padding: '2rem 1rem',
                  color: 'var(--text-muted, #5f6368)',
                  fontSize: '0.875rem',
                }}
              >
                Nenhum ativo encontrado para "{search}".
              </div>
            ) : (
              filteredCatalog.map((ticker) => {
                const isFixed = fixedSet.has(ticker);
                const isPicked = pickedSet.has(ticker);
                const isSelected = selectedTicker === ticker;
                const isDisabled = isFixed || isPicked;

                let subtitle = 'Disponível';
                if (isFixed) subtitle = 'Fixo do Plano';
                else if (isPicked) subtitle = 'Já Escolhido';

                return (
                  <button
                    key={ticker}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => setSelectedTicker(ticker)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0.75rem 0.5rem',
                      borderRadius: '8px',
                      border: isSelected
                        ? '2px solid var(--primary, #673de6)'
                        : '1px solid var(--border, #e3e5e8)',
                      background: isSelected
                        ? 'var(--primary-light, #f0ecfc)'
                        : isDisabled
                        ? 'transparent'
                        : 'var(--bg-card, #ffffff)',
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                      opacity: isDisabled ? 0.5 : 1,
                      transition: 'all 0.15s ease-in-out',
                      position: 'relative',
                    }}
                  >
                    {isSelected && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '6px',
                          right: '6px',
                          width: '16px',
                          height: '16px',
                          borderRadius: '50%',
                          background: 'var(--primary, #673de6)',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Check size={12} strokeWidth={3} />
                      </div>
                    )}
                    {isFixed && (
                      <div style={{ position: 'absolute', top: '6px', right: '6px', color: 'var(--text-muted)' }}>
                        <Lock size={12} />
                      </div>
                    )}
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: '1rem',
                        color: isSelected ? 'var(--primary, #673de6)' : 'var(--text-main, #1d2129)',
                        letterSpacing: '0.5px',
                      }}
                    >
                      {ticker}
                    </span>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        color: isSelected
                          ? 'var(--primary, #673de6)'
                          : isDisabled
                          ? 'var(--text-muted, #5f6368)'
                          : 'var(--success, #00b090)',
                        fontWeight: 500,
                        marginTop: '0.25rem',
                      }}
                    >
                      {subtitle}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : (
        /* Etapa 2: Confirmação Definitiva e Irreversível */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '0.5rem 0' }}>
          <div
            style={{
              padding: '1rem',
              borderRadius: '10px',
              background: 'rgba(235, 30, 58, 0.08)',
              border: '1px solid var(--danger-border, #fca5a5)',
              display: 'flex',
              gap: '0.875rem',
              alignItems: 'flex-start',
            }}
          >
            <AlertTriangle
              size={24}
              style={{ color: 'var(--danger, #eb1e3a)', flexShrink: 0, marginTop: '2px' }}
            />
            <div>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  color: 'var(--danger, #eb1e3a)',
                  marginBottom: '0.25rem',
                }}
              >
                Atenção: A escolha deste ativo é definitiva!
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-body, #3c4043)', lineHeight: 1.5 }}>
                Após confirmar, o ativo selecionado será vinculado permanentemente à sua carteira do plano.
                <strong> Não será possível alterar ou substituir este ativo posteriormente.</strong>
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1.5rem',
              background: 'var(--bg-muted, #f8f9fa)',
              border: '1px dashed var(--primary-border, #dcd2f9)',
              borderRadius: '12px',
              gap: '0.5rem',
            }}
          >
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted, #5f6368)', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Ativo Selecionado
            </span>
            <span
              style={{
                fontSize: '2rem',
                fontWeight: 800,
                color: 'var(--primary, #673de6)',
                letterSpacing: '1px',
              }}
            >
              {selectedTicker}
            </span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-sub, #80868b)' }}>
              Ações B3 • Análise Inteligente Ativa
            </span>
          </div>
        </div>
      )}
    </Modal>
  );
};
