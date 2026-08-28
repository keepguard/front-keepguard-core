import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Ban, KeyRound, Trash2 } from 'lucide-react';
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

const ROLE_LABELS: Record<string, string> = {
  ROLE_USER: 'Usuário',
  ROLE_USER_SELF_SERVICE: 'Autoatendimento',
  ROLE_ADMIN: 'Administrador',
  ROLE_MANAGER: 'Gestor',
  ROLE_SYSTEM: 'Sistema',
};

interface AccountViewProps {
  onChangePassword: () => void;
}

function formatDate(value?: string): string {
  if (!value) return 'Não informado';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function initialsFrom(name?: string, email?: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return 'U';
}

function formatAccountType(type?: string): string {
  if (type === 'PERSON') return 'Pessoa física';
  if (type === 'COMPANY') return 'Pessoa jurídica';
  return type || 'Não informado';
}

function formatStatus(status?: string): { label: string; tone: 'ok' | 'warn' | 'muted' } {
  if (status === 'ACTIVE') return { label: 'Ativa', tone: 'ok' };
  if (status === 'BLOCKED') return { label: 'Bloqueada', tone: 'warn' };
  if (!status) return { label: 'Não informado', tone: 'muted' };
  return { label: status, tone: 'muted' };
}

function formatLocale(locale?: string): string {
  if (locale === 'pt-BR') return 'Português (Brasil)';
  if (locale === 'en-US') return 'English (United States)';
  if (locale === 'es-ES') return 'Español';
  return locale || 'Não informado';
}

function formatRole(role: string): string {
  if (ROLE_LABELS[role]) return ROLE_LABELS[role];
  return role.replace(/^ROLE_/, '').replace(/_/g, ' ').toLowerCase();
}

function FieldRow({
  label,
  value,
  muted,
}: {
  label: string;
  value: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="account-field">
      <dt>{label}</dt>
      <dd className={muted ? 'is-muted' : undefined}>{value}</dd>
    </div>
  );
}

export const AccountView: React.FC<AccountViewProps> = ({ onChangePassword }) => {
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

  const displayName = profile?.personProfile?.fullName || profile?.displayHandle || user?.name || user?.username || 'Conta';
  const jwtRoles = useMemo(() => user?.roles || [], [user?.roles]);
  const status = formatStatus(profile?.status);
  const phone = profile?.phoneE164;

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

  if (isLoading) {
    return (
      <div className="account-page" aria-busy="true">
        <div className="account-card account-skeleton">
          <div className="account-skel account-skel-avatar" />
          <div className="account-skel-lines">
            <div className="account-skel account-skel-lg" />
            <div className="account-skel account-skel-sm" />
          </div>
        </div>
        <div className="account-card account-skeleton">
          <div className="account-skel account-skel-lg" />
          <div className="account-skel account-skel-md" />
          <div className="account-skel account-skel-md" />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="account-page">
        <div className="account-card">
          <p className="account-empty">{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="account-page">
        <section className="account-card account-identity" aria-labelledby="account-identity-title">
          {profile?.avatarUrl ? (
            <img className="account-avatar" src={profile.avatarUrl} alt="" />
          ) : (
            <div className="account-avatar account-avatar-fallback" aria-hidden="true">
              {initialsFrom(displayName, profile?.email || user?.email)}
            </div>
          )}
          <div className="account-identity-copy">
            <h2 id="account-identity-title" className="account-display-name">{displayName}</h2>
            {profile?.displayHandle && (
              <p className="account-handle">@{profile.displayHandle}</p>
            )}
            <div className="account-identity-meta">
              <span className={`account-status account-status-${status.tone}`}>{status.label}</span>
              <span className="account-meta-dot" aria-hidden="true" />
              <span className="account-meta-text">{formatAccountType(profile?.type)}</span>
            </div>
          </div>
        </section>

        <section className="account-card" aria-labelledby="account-info-title">
          <header className="account-section-head">
            <h3 id="account-info-title">Informações pessoais</h3>
            <p>Dados usados para identificar você neste tenant.</p>
          </header>
          <dl className="account-fields">
            <FieldRow label="Nome completo" value={profile?.personProfile?.fullName || 'Não informado'} muted={!profile?.personProfile?.fullName} />
            <FieldRow label="E-mail" value={profile?.email || user?.email || 'Não informado'} />
            <FieldRow label="Telefone" value={phone || 'Não informado'} muted={!phone} />
            <FieldRow label="Conta criada em" value={formatDate(profile?.createdAt)} />
          </dl>
        </section>

        <section className="account-card" aria-labelledby="account-prefs-title">
          <header className="account-section-head">
            <h3 id="account-prefs-title">Preferências</h3>
            <p>Idioma e fuso usados na exibição de datas e comunicações.</p>
          </header>
          <dl className="account-fields">
            <FieldRow label="Idioma" value={formatLocale(profile?.preferredLocale)} />
            <FieldRow label="Fuso horário" value={profile?.timezone || 'Não informado'} muted={!profile?.timezone} />
          </dl>
        </section>

        <section className="account-card" aria-labelledby="account-access-title">
          <header className="account-section-head">
            <h3 id="account-access-title">Acesso</h3>
            <p>Perfis associados à sua sessão atual.</p>
          </header>
          <div className="account-roles">
            {jwtRoles.length > 0 ? jwtRoles.map((role) => (
              <span key={role} className="account-role-chip" title={role}>
                {formatRole(role)}
              </span>
            )) : (
              <span className="account-empty">Nenhum perfil nesta sessão.</span>
            )}
          </div>
        </section>

        <section className="account-card" aria-labelledby="account-security-title">
          <header className="account-section-head">
            <h3 id="account-security-title">Segurança</h3>
            <p>Credenciais de acesso à plataforma.</p>
          </header>
          <div className="account-setting-row">
            <div>
              <p className="account-setting-title">Senha</p>
              <p className="account-setting-hint">Altere a senha desta conta. Você continuará autenticado nesta sessão.</p>
            </div>
            <button type="button" className="btn btn-outline btn-pill" onClick={onChangePassword}>
              <KeyRound size={16} />
              Alterar senha
            </button>
          </div>
        </section>

        {showDangerZone && (
          <section className="account-card account-danger" aria-labelledby="account-danger-title">
            <header className="account-section-head">
              <h3 id="account-danger-title">
                <AlertTriangle size={16} />
                Zona de risco
              </h3>
              <p>Ações irreversíveis pelo painel. Afetam somente a sua conta.</p>
            </header>

            {canBlock && (
              <div className="account-danger-row">
                <div>
                  <p className="account-setting-title">Bloquear conta</p>
                  <p className="account-setting-hint">
                    Encerra o acesso imediatamente. Um administrador precisa desbloquear depois.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-danger btn-pill"
                  onClick={() => setDangerAction('block')}
                >
                  <Ban size={16} />
                  Bloquear
                </button>
              </div>
            )}

            {canDelete && (
              <div className="account-danger-row">
                <div>
                  <p className="account-setting-title">Excluir conta</p>
                  <p className="account-setting-hint">
                    Remove a conta de forma permanente. Esta ação não pode ser desfeita aqui.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-danger btn-pill"
                  onClick={() => setDangerAction('delete')}
                >
                  <Trash2 size={16} />
                  Excluir
                </button>
              </div>
            )}
          </section>
        )}
      </div>

      <Modal
        isOpen={dangerAction !== null}
        onClose={closeModal}
        title={dangerAction === 'delete' ? 'Excluir minha conta' : 'Bloquear minha conta'}
        subtitle="Esta ação encerra a sessão atual. Informe o motivo para confirmar."
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
