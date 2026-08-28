import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Ban, Trash2 } from 'lucide-react';
import { Modal } from '../common/Modal';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { authService } from '../../services/authService';
import type { MeProfile } from '../../types/auth';
import { canSelfServiceAccount, assertAccountSelfServiceVisibility } from '../../utils/roles';

const selfServiceVisibilityFailures = assertAccountSelfServiceVisibility();
if (selfServiceVisibilityFailures.length > 0) {
  console.error('Falha na visibilidade de self-service da conta', selfServiceVisibilityFailures);
}

type DangerAction = 'block' | 'delete';

function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR');
}

function initialsFrom(name?: string, email?: string): string {
  if (name) return name.charAt(0).toUpperCase();
  if (email) return email.charAt(0).toUpperCase();
  return 'U';
}

export const AccountView: React.FC = () => {
  const { user, accessToken, logout } = useAuth();
  const { addToast } = useToast();
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dangerAction, setDangerAction] = useState<DangerAction | null>(null);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const token = accessToken || (typeof window !== 'undefined' ? localStorage.getItem('keepguard_access_token') : null);
  const canBlock = canSelfServiceAccount(token, user?.roles, 'block');
  const canDelete = canSelfServiceAccount(token, user?.roles, 'delete');
  const showDangerZone = canBlock || canDelete;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!token) {
        setLoadError('Sessão inválida. Faça login novamente.');
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setLoadError(null);
      try {
        const me = await authService.getMe(token);
        if (!cancelled) {
          setProfile(me);
        }
      } catch (err: any) {
        if (!cancelled) {
          setLoadError(err?.message || 'Não foi possível carregar os dados da conta.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const displayName = profile?.personProfile?.fullName || profile?.displayHandle || user?.name || user?.username || '—';
  const jwtRoles = useMemo(() => user?.roles || [], [user?.roles]);

  const closeModal = () => {
    if (isSubmitting) return;
    setDangerAction(null);
    setReason('');
  };

  const handleConfirmDanger = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed) {
      addToast({
        type: 'warning',
        title: 'Motivo obrigatório',
        description: 'Informe o motivo para continuar.',
      });
      return;
    }
    if (!token || !dangerAction) {
      addToast({
        type: 'error',
        title: 'Sessão inválida',
        description: 'Não foi possível confirmar a ação.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      if (dangerAction === 'block') {
        await authService.blockMe({ reason: trimmed }, token);
      } else {
        await authService.deleteMe({ reason: trimmed }, token);
      }
      addToast({
        type: 'success',
        title: dangerAction === 'block' ? 'Conta bloqueada' : 'Conta excluída',
        description: 'Sua sessão será encerrada.',
      });
      await logout();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Não foi possível concluir',
        description: err?.message || 'Tente novamente em instantes.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {isLoading && (
        <div className="dash-card">
          <p className="text-muted">Carregando dados da conta...</p>
        </div>
      )}

      {!isLoading && loadError && (
        <div className="dash-card">
          <p className="text-muted">{loadError}</p>
        </div>
      )}

      {!isLoading && !loadError && (
        <div className="dashboard-grid">
          <div className="dash-card">
            <div className="dash-card-header">
              <h3>Perfil</h3>
            </div>
            <div className="dash-card-body">
              <div className="account-profile-head">
                {profile?.avatarUrl ? (
                  <img className="account-avatar" src={profile.avatarUrl} alt="" />
                ) : (
                  <div className="account-avatar account-avatar-fallback" aria-hidden="true">
                    {initialsFrom(displayName, profile?.email || user?.email)}
                  </div>
                )}
                <div>
                  <strong className="account-display-name">{displayName}</strong>
                  {profile?.displayHandle && (
                    <p className="text-muted">@{profile.displayHandle}</p>
                  )}
                </div>
              </div>

              <div className="info-row">
                <span className="info-label">Nome completo</span>
                <span className="info-value">{profile?.personProfile?.fullName || '—'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">E-mail</span>
                <span className="info-value">{profile?.email || user?.email || '—'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Telefone</span>
                <span className="info-value">{profile?.phoneE164 || '—'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Tipo</span>
                <span className="info-value">{profile?.type || '—'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Status</span>
                <span className="info-value">{profile?.status || '—'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Idioma</span>
                <span className="info-value">{profile?.preferredLocale || '—'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Fuso horário</span>
                <span className="info-value">{profile?.timezone || '—'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Criado em</span>
                <span className="info-value">{formatDate(profile?.createdAt)}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Perfis de acesso</span>
                <div className="roles-list">
                  {jwtRoles.length > 0 ? jwtRoles.map((role) => (
                    <span key={role} className="badge-role">{role}</span>
                  )) : (
                    <span className="info-value">—</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {showDangerZone && (
            <div className="dash-card account-danger-zone">
              <div className="dash-card-header">
                <div className="dash-card-icon"><AlertTriangle size={18} /></div>
                <h3>Zona de risco</h3>
              </div>
              <div className="dash-card-body">
                <p className="account-danger-copy">
                  Essas ações afetam apenas a sua conta e não podem ser desfeitas pelo painel.
                </p>
                <div className="account-danger-actions">
                  {canBlock && (
                    <button
                      type="button"
                      className="btn btn-danger btn-pill"
                      onClick={() => setDangerAction('block')}
                    >
                      <Ban size={16} />
                      Bloquear minha conta
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      className="btn btn-danger btn-pill"
                      onClick={() => setDangerAction('delete')}
                    >
                      <Trash2 size={16} />
                      Excluir minha conta
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <Modal
        isOpen={dangerAction !== null}
        onClose={closeModal}
        title={dangerAction === 'delete' ? 'Excluir minha conta' : 'Bloquear minha conta'}
        subtitle="Esta ação é permanente para esta sessão. Informe o motivo para confirmar."
      >
        <form onSubmit={handleConfirmDanger}>
          <div className="form-group">
            <label htmlFor="account-lifecycle-reason">Motivo</label>
            <textarea
              id="account-lifecycle-reason"
              className="form-input"
              rows={4}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Descreva o motivo"
              required
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-outline" onClick={closeModal} disabled={isSubmitting}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-danger" disabled={isSubmitting}>
              {isSubmitting ? 'Confirmando...' : 'Confirmar'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
};
