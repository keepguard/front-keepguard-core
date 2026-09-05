import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useToast } from '../context/ToastContext';
import { PATHS } from './routes';

export const RequireAccess: React.FC<{
  allowed: boolean;
  children: React.ReactNode;
  description?: string;
}> = ({ allowed, children, description }) => {
  const { addToast } = useToast();

  useEffect(() => {
    if (allowed) return;
    addToast({
      type: 'error',
      title: 'Acesso restrito',
      description: description || 'Você não tem permissão para esta tela.',
    });
  }, [addToast, allowed, description]);

  if (!allowed) {
    return <Navigate to={PATHS.market} replace />;
  }

  return <>{children}</>;
};
