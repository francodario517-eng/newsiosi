import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', 
          alignItems: 'center', justifyContent: 'center', background: '#0a0b10', color: 'white',
          textAlign: 'center', padding: '20px', position: 'fixed', top: 0, left: 0, zIndex: 9999
        }}>
          <h2 style={{ marginBottom: '16px' }}>MANTENIMIENTO / ERROR DE CARGA</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
            Hubo un error crítico al procesar los datos de este vehículo. 
          </p>
          <button 
            style={{ 
              background: 'var(--primary)', color: 'white', border: 'none', 
              padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold'
            }}
            onClick={() => {
              localStorage.clear();
              window.location.reload();
            }}
          >
            LIMPIAR CACHÉ Y REINTENTAR
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
