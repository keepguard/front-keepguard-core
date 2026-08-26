import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider, useToast } from './context/ToastContext';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { authService } from './services/authService';

const MainContent: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const { addToast } = useToast();
  const [healthStatus, setHealthStatus] = useState<'healthy' | 'unhealthy' | 'checking'>('checking');
  const [activeTab, setActiveTab] = useState('domains');

  const checkHealth = async (showSuccessToast = false) => {
    setHealthStatus('checking');
    try {
      await authService.getHealth();
      setHealthStatus('healthy');
      if (showSuccessToast) {
        addToast({
          type: 'success',
          title: 'BFF-Auth Online',
          description: 'Serviço de autenticação e comunicação operando normalmente.',
        });
      }
    } catch (e) {
      setHealthStatus('unhealthy');
    }
  };

  useEffect(() => {
    checkHealth(false);
  }, []);

  return (
    <div className="app-layout">
      <Header
        healthStatus={healthStatus}
        onCheckHealth={() => checkHealth(true)}
      />
      {isAuthenticated ? (
        <div className="app-body-container">
          <Sidebar activeTab={activeTab} onSelectTab={setActiveTab} />
          <main className="app-content">
            <DashboardPage />
          </main>
        </div>
      ) : (
        <main className="app-content">
          <AuthPage />
        </main>
      )}
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <ToastProvider>
      <AuthProvider>
        <MainContent />
      </AuthProvider>
    </ToastProvider>
  );
};

export default App;
