import React, { useState, useEffect } from 'react';
import { User, Mail, Phone, Lock, Building, ArrowRight, CheckSquare, Square, LogIn, ExternalLink } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { registerService } from '../../services/registerService';
import { consentService } from '../../services/consentService';
import type { UserType } from '../../types/register';
import type { ConsentDocument } from '../../types/consent';

interface RegisterFormProps {
  onSuccess: (data: { email: string; phone: string; sessionId: string; requiredChannels: string[]; password?: string }) => void;
  onBackToLogin: () => void;
}

export const RegisterForm: React.FC<RegisterFormProps> = ({
  onSuccess,
  onBackToLogin,
}) => {
  const { addToast } = useToast();

  const [nameFull, setNameFull] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [type, setType] = useState<UserType>('PERSON');
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(true);
  const [acceptedMarketing, setAcceptedMarketing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Links dinâmicos dos documentos legais publicados
  const [termsUrl, setTermsUrl] = useState<string>('#');
  const [privacyUrl, setPrivacyUrl] = useState<string>('#');

  useEffect(() => {
    async function loadConsents() {
      try {
        const docs = await consentService.getPublishedConsents();
        const terms = docs.find((d: ConsentDocument) => d.type === 'TERMS_OF_USE');
        const privacy = docs.find((d: ConsentDocument) => d.type === 'PRIVACY_POLICY');

        if (terms?.s3Url) {
          setTermsUrl(consentService.formatDocumentUrl(terms.s3Url));
        }
        if (privacy?.s3Url) {
          setPrivacyUrl(consentService.formatDocumentUrl(privacy.s3Url));
        }
      } catch (err) {
        console.warn('Não foi possível carregar URLs dinâmicas de termos:', err);
      }
    }
    loadConsents();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!nameFull || !email || !phone || !password || !confirmPassword) {
      addToast({
        type: 'warning',
        title: 'Campos obrigatórios',
        description: 'Por favor preencha todos os campos do formulário.',
      });
      return;
    }

    if (password !== confirmPassword) {
      addToast({
        type: 'warning',
        title: 'Senhas incompatíveis',
        description: 'A confirmação da senha não corresponde à senha informada.',
      });
      return;
    }

    if (!hasAcceptedTerms) {
      addToast({
        type: 'warning',
        title: 'Termos de Uso',
        description: 'É necessário aceitar os termos de privacidade para continuar.',
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await registerService.init({
        nameFull: nameFull.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
        confirmPassword,
        type,
        hasAcceptedTermsAndPrivacy: hasAcceptedTerms,
        acceptedMarketing,
      });

      addToast({
        type: 'success',
        title: 'Cadastro inicializado!',
        description: 'Enviamos um código de 6 dígitos para confirmar seu e-mail.',
      });

      onSuccess({
        email: email.trim(),
        phone: phone.trim(),
        sessionId: response.registrationSessionId,
        requiredChannels: response.requiredChannels || ['EMAIL'],
      });
    } catch (err: any) {
      console.error('Erro na inicialização de cadastro:', err);
      addToast({
        type: 'error',
        title: 'Falha no cadastro',
        description: err.message || 'Erro ao criar conta. Verifique os dados informados.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <div className="type-toggle-group">
        <button
          type="button"
          className={`type-toggle-btn ${type === 'PERSON' ? 'active' : ''}`}
          onClick={() => setType('PERSON')}
        >
          <User size={16} /> Pessoa Física
        </button>
        <button
          type="button"
          className={`type-toggle-btn ${type === 'COMPANY' ? 'active' : ''}`}
          onClick={() => setType('COMPANY')}
        >
          <Building size={16} /> Empresa (PJ)
        </button>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="reg-name">
          {type === 'PERSON' ? 'Nome Completo' : 'Razão Social'}
        </label>
        <div className="input-icon-wrapper">
          <User className="input-icon" size={18} />
          <input
            id="reg-name"
            type="text"
            className="form-input with-icon"
            placeholder="Ex: João da Silva"
            value={nameFull}
            onChange={e => setNameFull(e.target.value)}
            disabled={isLoading}
            required
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label" htmlFor="reg-email">
            E-mail
          </label>
          <div className="input-icon-wrapper">
            <Mail className="input-icon" size={18} />
            <input
              id="reg-email"
              type="email"
              className="form-input with-icon"
              placeholder="seu.email@exemplo.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={isLoading}
              required
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="reg-phone">
            Telefone / WhatsApp
          </label>
          <div className="input-icon-wrapper">
            <Phone className="input-icon" size={18} />
            <input
              id="reg-phone"
              type="text"
              className="form-input with-icon"
              placeholder="(11) 99999-9999"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              disabled={isLoading}
              required
            />
          </div>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label" htmlFor="reg-pwd">
            Senha
          </label>
          <div className="input-icon-wrapper">
            <Lock className="input-icon" size={18} />
            <input
              id="reg-pwd"
              type="password"
              className="form-input with-icon"
              placeholder="Min. 8 caracteres"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={isLoading}
              required
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="reg-confirm-pwd">
            Confirmar Senha
          </label>
          <div className="input-icon-wrapper">
            <Lock className="input-icon" size={18} />
            <input
              id="reg-confirm-pwd"
              type="password"
              className="form-input with-icon"
              placeholder="Repita a senha"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              disabled={isLoading}
              required
            />
          </div>
        </div>
      </div>

      <div className="checkbox-group">
        <button
          type="button"
          className="checkbox-btn"
          onClick={() => setHasAcceptedTerms(!hasAcceptedTerms)}
        >
          {hasAcceptedTerms ? <CheckSquare size={18} className="text-primary" /> : <Square size={18} />}
        </button>
        <span className="checkbox-label">
          Li e concordo com os{' '}
          <a
            href={termsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="legal-link"
            onClick={e => e.stopPropagation()}
            title="Abrir Termos de Uso em nova aba"
          >
            Termos de Uso <ExternalLink size={12} className="inline-icon" />
          </a>{' '}
          e{' '}
          <a
            href={privacyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="legal-link"
            onClick={e => e.stopPropagation()}
            title="Abrir Política de Privacidade em nova aba"
          >
            Políticas de Privacidade <ExternalLink size={12} className="inline-icon" />
          </a>.
        </span>
      </div>

      <div className="checkbox-group" onClick={() => setAcceptedMarketing(!acceptedMarketing)}>
        <button type="button" className="checkbox-btn" tabIndex={-1}>
          {acceptedMarketing ? <CheckSquare size={18} className="text-primary" /> : <Square size={18} />}
        </button>
        <span className="checkbox-label">
          Desejo receber novidades e atualizações por e-mail (opcional).
        </span>
      </div>

      <button
        type="submit"
        className="btn btn-primary btn-block btn-glow"
        disabled={isLoading || !hasAcceptedTerms}
      >
        {isLoading ? (
          <span className="btn-spinner-content">
            <span className="spinner-small" /> Processando Cadastro...
          </span>
        ) : (
          <>
            Continuar e Receber Código <ArrowRight size={18} />
          </>
        )}
      </button>

      <div className="form-footer">
        <span>Já possui uma conta?</span>
        <button
          type="button"
          className="link-btn bold"
          onClick={onBackToLogin}
        >
          <LogIn size={14} /> Fazer Login
        </button>
      </div>
    </form>
  );
};
