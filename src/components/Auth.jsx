import React, { useState } from 'react';
import { supabase } from '../services/db';
import { Car, Lock, Mail, Loader } from 'lucide-react';

export function Auth({ onSession }) {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState(null);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      if (isSignUp) {
        const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        alert('Revisá tu email para confirmar el registro.');
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        if (data.session) onSession(data.session);
      }
    } catch (err) {
      setError(err.message === 'Invalid login credentials' ? 'Credenciales inválidas' : err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      width: '100%', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      background: 'radial-gradient(circle at top right, #1e1b4b, #0f1016)',
      padding: '20px'
    }}>
      <div className="glass card animate-in" style={{ 
        width: '400px', 
        padding: '48px', 
        textAlign: 'center',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
      }}>
        <div style={{ 
          background: 'rgba(170, 59, 255, 0.1)', 
          width: '64px', 
          height: '64px', 
          borderRadius: '16px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          margin: '0 auto 24px'
        }}>
          <Car size={32} color="var(--primary)" />
        </div>
        
        <h1 style={{ fontSize: '24px', marginBottom: '8px' }}>VTS Pro</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '32px' }}>
          {isSignUp ? 'Creá tu cuenta de administrador' : 'Ingresá al panel de control'}
        </p>

        {error && (
          <div style={{ 
            background: 'rgba(239, 68, 68, 0.1)', 
            color: '#ef4444', 
            padding: '12px', 
            borderRadius: '8px', 
            fontSize: '13px', 
            marginBottom: '20px',
            border: '1px solid rgba(239, 68, 68, 0.2)'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleAuth}>
          <div style={{ marginBottom: '16px', textAlign: 'left' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', display: 'block' }}>Email</label>
            <div style={{ position: 'relative' }}>
              <Mail size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: 'rgba(255,255,255,0.3)' }} />
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com" 
                required
                style={{ paddingLeft: '40px', marginBottom: 0 }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '32px', textAlign: 'left' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', display: 'block' }}>Contraseña</label>
            <div style={{ position: 'relative' }}>
              <Lock size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: 'rgba(255,255,255,0.3)' }} />
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" 
                required
                style={{ paddingLeft: '40px', marginBottom: 0 }}
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="btn btn-primary" 
            style={{ width: '100%', height: '48px', justifyContent: 'center' }}
          >
            {loading ? <Loader className="animate-spin" size={20} /> : (isSignUp ? 'Registrarse' : 'Entrar')}
          </button>
        </form>

        <div style={{ marginTop: '24px' }}>
          <button 
            onClick={() => setIsSignUp(!isSignUp)}
            style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '13px' }}
          >
            {isSignUp ? '¿Ya tenés cuenta? Inicia sesión' : '¿No tenés cuenta? Registrate'}
          </button>
        </div>
      </div>
    </div>
  );
}
