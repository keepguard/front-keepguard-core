import React, { useState, useEffect } from 'react';
import { ShieldCheck, FileText, ExternalLink, Check, AlertCircle, Lock } from 'lucide-react';
import type { TermsManifest, TermsManifestDocument } from '../../types/consent';
import { consentService } from '../../services/consentService';
import { termsSyncService } from '../../services/termsSyncService';

interface TermsConsentModalProps {
  isOpen: boolean;
  manifest?: TermsManifest;
  pendingDocuments: TermsManifestDocument[];
  tenantId: string;
  userId: string;
  userEmail: string;
  token?: string;
  onSuccess: () => void;
  onLogout?: () => void;
}

export const TermsConsentModal: React.FC<TermsConsentModalProps> = ({
  isOpen,
  manifest,
  pendingDocuments,
  tenantId,
  userId,
  userEmail,
  token,
  onSuccess,
  onLogout
}) => {
  const [selectedDocs, setSelectedDocs] = useState<Record<string, boolean>>(() => {
    const initialMap: Record<string, boolean> = {};
    (pendingDocuments || []).forEach(doc => {
      initialMap[doc.id] = false;
    });
    return initialMap;
  });
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sincroniza se a lista de pendingDocuments mudar
  useEffect(() => {
    if (pendingDocuments && pendingDocuments.length > 0) {
      const initialMap: Record<string, boolean> = {};
      pendingDocuments.forEach(doc => {
        initialMap[doc.id] = false;
      });
      setSelectedDocs(initialMap);
    }
  }, [pendingDocuments]);

  if (!isOpen || !pendingDocuments || pendingDocuments.length === 0) {
    return null;
  }

  const mandatoryDocs = pendingDocuments.filter(d => d.mandatory);
  const optionalDocs = pendingDocuments.filter(d => !d.mandatory);

  const allMandatoryAccepted = mandatoryDocs.every(d => selectedDocs[d.id] === true);

  const toggleDoc = (id: string) => {
    setSelectedDocs(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleBatchAccept = async () => {
    if (!allMandatoryAccepted) {
      setErrorMessage('Por favor, aceite todos os documentos obrigatórios para continuar utilizando a plataforma.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const payload = {
        userId,
        email: userEmail,
        acceptedAt: new Date().toISOString(),
        geolocation: 'São Paulo, BR',
        consents: pendingDocuments.map(doc => ({
          documentId: doc.id,
          version: doc.version,
          accepted: !!selectedDocs[doc.id],
          contentHash: doc.contentHash
        }))
      };

      await consentService.acceptBatch(payload, token);

      // Salva os aceites no localStorage por tenant
      const acceptedList = pendingDocuments
        .filter(doc => !!selectedDocs[doc.id])
        .map(doc => ({ documentId: doc.id, version: doc.version }));

      termsSyncService.recordLocalAcceptance(
        tenantId,
        userId,
        manifest?.version || '1.0',
        acceptedList
      );

      onSuccess();
    } catch (error: any) {
      console.error('[TermsModal] Erro ao registrar aceites:', error);
      setErrorMessage(error?.message || 'Ocorreu um erro ao salvar o consentimento. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" style={{ zIndex: 9999, backgroundColor: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(6px)' }}>
      <div className="modal-card animate-scale-in" style={{ maxWidth: '580px', width: '90%', borderRadius: '16px', overflow: 'hidden' }}>
        
        {/* Header com visual de segurança KeepGuard */}
        <div style={{
          padding: '24px 28px 18px',
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.95) 100%)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: '16px'
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(59, 130, 246, 0.35)',
            flexShrink: 0
          }}>
            <ShieldCheck size={26} color="#ffffff" />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: '#f8fafc' }}>
              {pendingDocuments.length === 1 ? 'Atualização de Termos' : 'Termos de Uso e Privacidade'}
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.875rem', color: '#94a3b8' }}>
              Versão {manifest?.version || '2.0'} • Atualizado em {new Date(manifest?.publishedAt || Date.now()).toLocaleDateString('pt-BR')}
            </p>
          </div>
        </div>

        {/* Corpo do Modal */}
        <div style={{ padding: '24px 28px', maxHeight: '60vh', overflowY: 'auto' }}>
          
          <p style={{ fontSize: '0.925rem', color: '#cbd5e1', lineHeight: '1.5', marginTop: 0, marginBottom: '20px' }}>
            Para continuar garantindo a segurança da sua conta e a conformidade com a <strong>LGPD</strong>, 
            por favor revise e confirme os documentos atualizados abaixo:
          </p>

          {errorMessage && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 16px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: '8px',
              color: '#f87171',
              fontSize: '0.875rem',
              marginBottom: '20px'
            }}>
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Seção 1: Documentos Obrigatórios */}
          {mandatoryDocs.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Lock size={15} color="#60a5fa" />
                <span style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#60a5fa' }}>
                  Obrigatório para continuidade do serviço ({mandatoryDocs.length})
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {mandatoryDocs.map(doc => {
                  const isChecked = !!selectedDocs[doc.id];
                  const docUrl = consentService.formatDocumentUrl(doc.url);

                  return (
                    <div
                      key={doc.id}
                      onClick={() => toggleDoc(doc.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '14px',
                        padding: '14px 16px',
                        borderRadius: '10px',
                        backgroundColor: isChecked ? 'rgba(59, 130, 246, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                        border: isChecked ? '1px solid rgba(59, 130, 246, 0.35)' : '1px solid rgba(255, 255, 255, 0.07)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div
                        style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '6px',
                          border: isChecked ? '2px solid #3b82f6' : '2px solid #64748b',
                          backgroundColor: isChecked ? '#3b82f6' : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginTop: '2px',
                          flexShrink: 0,
                          transition: 'all 0.2s ease'
                        }}
                      >
                        {isChecked && <Check size={14} color="#ffffff" strokeWidth={3} />}
                      </div>

                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                          <span style={{ fontSize: '0.925rem', fontWeight: 600, color: '#f1f5f9' }}>
                            {doc.title} <span style={{ fontSize: '0.775rem', color: '#94a3b8', fontWeight: 400 }}>(v{doc.version}.0)</span>
                          </span>
                          
                          {doc.url && (
                            <a
                              href={docUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '0.8rem',
                                color: '#60a5fa',
                                textDecoration: 'none',
                                padding: '3px 8px',
                                borderRadius: '4px',
                                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                                border: '1px solid rgba(59, 130, 246, 0.2)'
                              }}
                            >
                              <FileText size={13} />
                              <span>Ler documento</span>
                              <ExternalLink size={11} />
                            </a>
                          )}
                        </div>
                        <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#94a3b8', lineHeight: '1.4' }}>
                          Li e concordo com os termos e condições deste documento.
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Seção 2: Preferências Opcionais (Marketing/Analytics) */}
          {optionalDocs.length > 0 && (
            <div>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8', display: 'block', marginBottom: '10px' }}>
                Preferências Opcionais
              </span>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {optionalDocs.map(doc => {
                  const isChecked = !!selectedDocs[doc.id];
                  const docUrl = consentService.formatDocumentUrl(doc.url);

                  return (
                    <div
                      key={doc.id}
                      onClick={() => toggleDoc(doc.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '14px',
                        padding: '14px 16px',
                        borderRadius: '10px',
                        backgroundColor: isChecked ? 'rgba(59, 130, 246, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                        border: isChecked ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid rgba(255, 255, 255, 0.05)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div
                        style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '6px',
                          border: isChecked ? '2px solid #3b82f6' : '2px solid #64748b',
                          backgroundColor: isChecked ? '#3b82f6' : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginTop: '2px',
                          flexShrink: 0,
                          transition: 'all 0.2s ease'
                        }}
                      >
                        {isChecked && <Check size={14} color="#ffffff" strokeWidth={3} />}
                      </div>

                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                          <span style={{ fontSize: '0.925rem', fontWeight: 500, color: '#f1f5f9' }}>
                            {doc.title}
                          </span>
                          {doc.url && (
                            <a
                              href={docUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '0.775rem',
                                color: '#94a3b8',
                                textDecoration: 'none'
                              }}
                            >
                              <ExternalLink size={12} />
                            </a>
                          )}
                        </div>
                        <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#94a3b8', lineHeight: '1.4' }}>
                          Desejo receber avisos de atualizações, dicas de segurança e comunicações por e-mail. (Opcional)
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>

        {/* Rodapé de Ações */}
        <div style={{
          padding: '16px 28px 20px',
          background: 'rgba(15, 23, 42, 0.95)',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px'
        }}>
          {onLogout ? (
            <button
              type="button"
              onClick={onLogout}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                fontSize: '0.875rem',
                cursor: 'pointer',
                padding: '8px 12px'
              }}
            >
              Sair da Conta
            </button>
          ) : <div />}

          <button
            type="button"
            disabled={!allMandatoryAccepted || submitting}
            onClick={handleBatchAccept}
            style={{
              padding: '10px 24px',
              borderRadius: '8px',
              fontSize: '0.925rem',
              fontWeight: 600,
              color: '#ffffff',
              background: allMandatoryAccepted && !submitting
                ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
                : 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              cursor: allMandatoryAccepted && !submitting ? 'pointer' : 'not-allowed',
              opacity: allMandatoryAccepted && !submitting ? 1 : 0.6,
              boxShadow: allMandatoryAccepted && !submitting ? '0 4px 14px rgba(37, 99, 235, 0.35)' : 'none',
              transition: 'all 0.2s ease',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            {submitting ? 'Registrando...' : 'Concordar e Continuar'}
          </button>
        </div>

      </div>
    </div>
  );
};
