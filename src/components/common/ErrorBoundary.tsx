import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Muda quando o usuário navega: limpa o erro e tenta desenhar a nova tela. */
  resetKey?: string;
}

interface ErrorBoundaryState {
  failed: boolean;
  key?: string;
}

/**
 * Barreira de erro de render. Sem ela, uma exceção ao desenhar uma tela apaga a aplicação inteira (tela
 * branca). Acontece, por exemplo, quando o navegador ainda tem o front antigo aberto depois de uma
 * atualização do sistema: recarregar resolve.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false, key: this.props.resetKey };

  static getDerivedStateFromError(): Partial<ErrorBoundaryState> {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: ErrorBoundaryProps, state: ErrorBoundaryState): Partial<ErrorBoundaryState> | null {
    // Navegar para outra tela limpa o erro e tenta desenhar a nova.
    return props.resetKey !== state.key ? { failed: false, key: props.resetKey } : null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Falha ao desenhar a tela', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="error-boundary" role="alert">
        <h2>Não foi possível exibir esta tela</h2>
        <p>
          Isso costuma acontecer logo depois de uma atualização do sistema. Recarregue a página para carregar a
          versão mais recente.
        </p>
        <div className="error-boundary-actions">
          <button type="button" className="btn btn-primary btn-pill" onClick={() => window.location.reload()}>
            Recarregar a página
          </button>
          <button type="button" className="btn btn-secondary btn-pill" onClick={() => this.setState({ failed: false })}>
            Tentar de novo
          </button>
        </div>
      </div>
    );
  }
}
