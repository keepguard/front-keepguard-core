import React, { useState, useEffect } from 'react';
import {
  Mail,
  Smartphone,
  MessageSquare,
  ShieldCheck,
  RotateCw,
  ArrowLeft,
  ArrowRight,
  Lock,
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { OtpInput } from '../common/OtpInput';
import { useToast } from '../../context/ToastContext';
import { authService } from '../../services/authService';
import type { AvailableMfaChannel, AuthLoginResponse } from '../../types/auth';

interface DeviceChallengeModalProps {
  isOpen: boolean;
  challengeSessionId: string;
  availableChannels: AvailableMfaChannel[];
  username: string;
  onSuccess: (authResponse: AuthLoginResponse) => void;
  onCancel: () => void;
}

export const DeviceChallengeModal: React.FC<DeviceChallengeModalProps> = ({
  isOpen,
  challengeSessionId,
  availableChannels,
  username,
  onSuccess,
  onCancel,
}) => {
  const { addToast } = useToast();

  const [selectedChannel, setSelectedChannel] = useState<string>(() => {
    return availableChannels.length > 0 ? availableChannels[0].channel : 'EMAIL';
  });
  const [step, setStep] = useState<'SELECT_CHANNEL' | 'INPUT_CODE'>('SELECT_CHANNEL');
  const [code, setCode] = useState<string>('');
  const [trustDevice, setTrustDevice] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isResending, setIsResending] = useState<boolean>(false);
  const [resendCooldown, setResendCooldown] = useState<number>(0);

  useEffect(() => {
    if (isOpen) {
      if (availableChannels.length > 0) {
        setSelectedChannel(availableChannels[0].channel);
      }
      setStep('SELECT_CHANNEL');
      setCode('');
      setTrustDevice(true);
      setResendCooldown(0);
    }
  }, [isOpen, availableChannels]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  if (!isOpen) return null;

  const getChannelIcon = (ch: string) => {
    switch (ch) {
      case 'EMAIL':
        return <Mail size={20} className="text-primary" />;
      case 'SMS':
        return <Smartphone size={20} className="text-primary" />;
      case 'WHATSAPP':
        return <MessageSquare size={20} className="text-primary" />;
      default:
        return <ShieldCheck size={20} className="text-primary" />;
    }
  };

  const handleSendCode = async (channelToSend?: string) => {
    const channel = channelToSend || selectedChannel;
    setIsLoading(true);
    try {
      const res = await authService.sendDeviceChallenge({
        challengeSessionId,
        channel,
      });
      addToast({
        type: 'success',
        title: 'Código Enviado!',
        description: res.message || `Código de segurança enviado com sucesso.`,
      });
      setResendCooldown(res.resendCooldown || 60);
      setStep('INPUT_CODE');
    } catch (err: any) {
      console.error('Erro ao enviar desafio de dispositivo:', err);
      addToast({
        type: 'error',
        title: 'Falha no Envio',
        description: err?.message || 'Não foi possível enviar o código de verificação.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || isResending) return;
    setIsResending(true);
    try {
      const res = await authService.sendDeviceChallenge({
        challengeSessionId,
        channel: selectedChannel,
      });
      addToast({
        type: 'info',
        title: 'Código Reenviado!',
        description: res.message || 'Um novo código foi enviado ao seu canal.',
      });
      setResendCooldown(res.resendCooldown || 60);
    } catch (err: any) {
      console.error('Erro ao reenviar código:', err);
      addToast({
        type: 'error',
        title: 'Erro no Reenvio',
        description: err?.message || 'Falha ao reenviar código de segurança.',
      });
    } finally {
      setIsResending(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (code.length !== 6) {
      addToast({
        type: 'warning',
        title: 'Código incompleto',
        description: 'Por favor digite todos os 6 dígitos do código.',
      });
      return;
    }

    setIsLoading(true);
    try {
      const res = await authService.verifyDeviceChallenge({
        challengeSessionId,
        code: code.trim(),
        trustDevice,
      });

      addToast({
        type: 'success',
        title: 'Dispositivo Autorizado!',
        description: 'Identidade confirmada com sucesso. Entrando...',
      });

      onSuccess(res);
    } catch (err: any) {
      console.error('Erro ao verificar desafio de dispositivo:', err);
      addToast({
        type: 'error',
        title: 'Código Inválido',
        description: err?.message || 'Código de verificação incorreto ou expirado.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const activeChannelObj = availableChannels.find((c) => c.channel === selectedChannel);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title="Autorização de Dispositivo"
      subtitle={`Novo acesso identificado para ${username}`}
      maxWidth="500px"
    >
      {step === 'SELECT_CHANNEL' ? (
        <div>
          <div className="token-info-card" style={{ marginBottom: '1.25rem' }}>
            <Lock className="text-primary" size={24} />
            <div>
              <div className="token-info-title">Verificação de Segurança (MFA)</div>
              <div className="token-info-desc">
                Este dispositivo ainda não é reconhecido como confiável. Escolha onde deseja receber o código de autorização:
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1.5rem' }}>
            {availableChannels.map((item) => {
              const isSelected = selectedChannel === item.channel;
              return (
                <div
                  key={item.channel}
                  onClick={() => setSelectedChannel(item.channel)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.85rem 1rem',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    background: isSelected ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                    border: isSelected ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                    <div
                      style={{
                        padding: '0.5rem',
                        borderRadius: '8px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {getChannelIcon(item.channel)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem', color: isSelected ? 'var(--primary)' : 'inherit' }}>
                        {item.description}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {item.targetMasked}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      border: isSelected ? '5px solid var(--primary)' : '2px solid var(--border)',
                      background: isSelected ? '#fff' : 'transparent',
                      transition: 'all 0.2s ease',
                    }}
                  />
                </div>
              );
            })}
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onCancel}
              disabled={isLoading}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => handleSendCode()}
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="btn-spinner-content">
                  <span className="spinner-small" /> Enviando...
                </span>
              ) : (
                <>
                  Enviar Código <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleVerifyCode}>
          <div className="token-info-card" style={{ marginBottom: '1.5rem' }}>
            {getChannelIcon(selectedChannel)}
            <div>
              <div className="token-info-title">
                Código enviado via {selectedChannel === 'EMAIL' ? 'E-mail' : selectedChannel === 'SMS' ? 'SMS' : 'WhatsApp'}
              </div>
              <div className="token-info-desc">
                Digite o código de 6 dígitos enviado para{' '}
                <strong>{activeChannelObj?.targetMasked || username}</strong>.
              </div>
            </div>
          </div>

          <div className="form-group" style={{ margin: '1.5rem 0' }}>
            <OtpInput
              value={code}
              onChange={setCode}
              disabled={isLoading}
            />
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              margin: '1.25rem 0',
              padding: '0.75rem 1rem',
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border)',
            }}
          >
            <input
              type="checkbox"
              id="trustDeviceCheck"
              checked={trustDevice}
              onChange={(e) => setTrustDevice(e.target.checked)}
              style={{
                width: '18px',
                height: '18px',
                cursor: 'pointer',
                accentColor: 'var(--primary)',
              }}
            />
            <label
              htmlFor="trustDeviceCheck"
              style={{
                fontSize: '0.84rem',
                color: 'var(--text-main)',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              Lembrar e confiar neste dispositivo por 30 dias
            </label>
          </div>

          <div className="resend-row" style={{ marginBottom: '1.25rem' }}>
            <span>Não recebeu o código?</span>
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
              onClick={() => setStep('SELECT_CHANNEL')}
              disabled={isLoading}
            >
              <ArrowLeft size={16} /> Trocar Canal
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isLoading || code.length !== 6}
            >
              {isLoading ? (
                <span className="btn-spinner-content">
                  <span className="spinner-small" /> Verificando...
                </span>
              ) : (
                <>
                  <ShieldCheck size={16} /> Confirmar e Acessar
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
};
