import React, { useState, useEffect } from 'react';
import { RotateCw, Mail, MessageSquare, ShieldCheck, ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Modal } from '../common/Modal';
import { OtpInput } from '../common/OtpInput';
import { useToast } from '../../context/ToastContext';
import { registerService } from '../../services/registerService';

import type { RegisterConfirmResponse } from '../../types/register';

interface RegisterTokenModalProps {
  isOpen: boolean;
  onClose: () => void;
  email: string;
  phone?: string;
  sessionId: string;
  requiredChannels?: string[];
  onSuccess: (response: RegisterConfirmResponse) => void;
}

export const RegisterTokenModal: React.FC<RegisterTokenModalProps> = ({
  isOpen,
  onClose,
  email,
  phone,
  sessionId,
  requiredChannels = ['EMAIL'],
  onSuccess,
}) => {
  const { addToast } = useToast();

  // Lista de canais requeridos normalizados
  const channels = requiredChannels.length > 0 ? requiredChannels : ['EMAIL'];
  const hasSms = channels.includes('SMS');

  // Estado da etapa: 0 = EMAIL, 1 = SMS (se aplicável)
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [emailToken, setEmailToken] = useState('');
  const [smsToken, setSmsToken] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(60);

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
      setEmailToken('');
      setSmsToken('');
      setResendCooldown(60);
    }
  }, [isOpen]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (emailToken.length !== 6) {
      addToast({
        type: 'warning',
        title: 'Código incompleto',
        description: 'Digite o código de 6 dígitos recebido no e-mail.',
      });
      return;
    }

    if (hasSms && currentStep === 0) {
      addToast({
        type: 'info',
        title: 'Código de E-mail preenchido!',
        description: 'Agora informe o código de 6 dígitos enviado por SMS.',
      });
      setCurrentStep(1);
    } else {
      handleFinalSubmit();
    }
  };

  const handleFinalSubmit = async () => {
    setIsLoading(true);
    try {
      const confirmResponse = await registerService.confirm({
        email,
        registrationSessionId: sessionId,
        token: emailToken.trim(),
        emailToken: emailToken.trim(),
        smsToken: hasSms ? smsToken.trim() : undefined,
      });

      addToast({
        type: 'success',
        title: 'Conta verificada com sucesso!',
        description: 'Seus dados de segurança foram confirmados. Entrando no sistema...',
      });

      onSuccess(confirmResponse);
      onClose();
    } catch (err: any) {
      console.error('Erro na validação do token de registro:', err);
      addToast({
        type: 'error',
        title: 'Código Inválido',
        description: err.message || 'Código de confirmação incorreto ou expirado.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || isResending) return;

    setIsResending(true);
    try {
      const res = await registerService.resend({
        email,
        registrationSessionId: sessionId,
      });

      addToast({
        type: 'info',
        title: 'Códigos reenviados!',
        description: res.message || 'Novos códigos de segurança foram enviados aos seus canais cadastrados.',
      });

      setResendCooldown(60);
    } catch (err: any) {
      console.error('Erro ao reenviar token:', err);
      addToast({
        type: 'error',
        title: 'Falha no reenvio',
        description: err.message || 'Não foi possível reenviar o código no momento.',
      });
    } finally {
      setIsResending(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Verificação de Segurança"
      subtitle={
        hasSms
          ? `Etapa ${currentStep + 1} de 2: Confirmação em duas etapas`
          : `Enviamos um código de segurança para ${email}`
      }
    >
      {/* Indicador de passos se houver SMS e EMAIL */}
      {hasSms && (
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div
            style={{
              flex: 1,
              padding: '0.5rem 0.75rem',
              borderRadius: '8px',
              background: currentStep === 0 ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.05)',
              border: currentStep === 0 ? '1px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.85rem',
              fontWeight: 600,
              color: currentStep === 0 ? '#60a5fa' : '#94a3b8',
            }}
          >
            {emailToken.length === 6 && currentStep > 0 ? (
              <CheckCircle2 size={16} color="#10b981" />
            ) : (
              <Mail size={16} />
            )}
            1. E-mail
          </div>

          <div
            style={{
              flex: 1,
              padding: '0.5rem 0.75rem',
              borderRadius: '8px',
              background: currentStep === 1 ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.05)',
              border: currentStep === 1 ? '1px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.85rem',
              fontWeight: 600,
              color: currentStep === 1 ? '#60a5fa' : '#94a3b8',
            }}
          >
            <MessageSquare size={16} />
            2. SMS (Celular)
          </div>
        </div>
      )}

      {currentStep === 0 ? (
        <form onSubmit={handleNextStep}>
          <div className="token-info-card">
            <Mail className="text-primary" size={24} />
            <div>
              <div className="token-info-title">Código enviado para o E-mail</div>
              <div className="token-info-desc">
                Digite o código de 6 dígitos enviado para <strong>{email}</strong>.
              </div>
            </div>
          </div>

          <div className="form-group" style={{ margin: '1.5rem 0' }}>
            <OtpInput
              value={emailToken}
              onChange={setEmailToken}
              disabled={isLoading}
            />
          </div>

          <div className="resend-row">
            <span>Não recebeu o e-mail?</span>
            <button
              type="button"
              className="link-btn bold"
              onClick={handleResend}
              disabled={resendCooldown > 0 || isResending}
            >
              {isResending ? (
                'Reenviando...'
              ) : resendCooldown > 0 ? (
                `Reenviar em ${resendCooldown}s`
              ) : (
                <>
                  <RotateCw size={14} /> Reenviar Código
                </>
              )}
            </button>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isLoading}
            >
              <ArrowLeft size={16} /> Voltar
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isLoading || emailToken.length !== 6}
            >
              {hasSms ? (
                <>
                  Avançar para SMS <ArrowRight size={16} />
                </>
              ) : isLoading ? (
                <span className="btn-spinner-content">
                  <span className="spinner-small" /> Validando...
                </span>
              ) : (
                <>
                  <ShieldCheck size={16} /> Confirmar & Ativar
                </>
              )}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); handleFinalSubmit(); }}>
          <div className="token-info-card">
            <MessageSquare className="text-primary" size={24} />
            <div>
              <div className="token-info-title">Código enviado para o Celular (SMS)</div>
              <div className="token-info-desc">
                Digite o código de 6 dígitos enviado por SMS para <strong>{phone || 'seu telefone'}</strong>.
              </div>
            </div>
          </div>

          <div className="form-group" style={{ margin: '1.5rem 0' }}>
            <OtpInput
              value={smsToken}
              onChange={setSmsToken}
              disabled={isLoading}
            />
          </div>

          <div className="resend-row">
            <span>Não recebeu o SMS?</span>
            <button
              type="button"
              className="link-btn bold"
              onClick={handleResend}
              disabled={resendCooldown > 0 || isResending}
            >
              {isResending ? (
                'Reenviando...'
              ) : resendCooldown > 0 ? (
                `Reenviar em ${resendCooldown}s`
              ) : (
                <>
                  <RotateCw size={14} /> Reenviar Código
                </>
              )}
            </button>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setCurrentStep(0)}
              disabled={isLoading}
            >
              <ArrowLeft size={16} /> Voltar para E-mail
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isLoading || smsToken.length !== 6}
            >
              {isLoading ? (
                <span className="btn-spinner-content">
                  <span className="spinner-small" /> Validando...
                </span>
              ) : (
                <>
                  <ShieldCheck size={16} /> Confirmar & Ativar
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
};
