import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { Users, Shield, Edit3, Trash2, Check, X, Loader } from 'lucide-react';

export function UserManagement() {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);

  const loadProfiles = async () => {
    setLoading(true);
    const data = await db.getAllProfiles();
    setProfiles(data);
    setLoading(false);
  };

  useEffect(() => {
    loadProfiles();
  }, []);

  const handleToggle = async (userId, field, currentValue) => {
    setUpdating(userId);
    try {
      await db.updateProfile(userId, { [field]: !currentValue });
      await loadProfiles();
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Error al actualizar permisos');
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '100px' }}>
        <Loader className="animate-spin" color="var(--primary)" size={48} />
      </div>
    );
  }

  return (
    <div className="animate-in" style={{ padding: '0 8px' }}>
      <div style={{ marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ 
          background: 'rgba(170, 59, 255, 0.1)', 
          padding: '12px', 
          borderRadius: '14px',
          color: 'var(--primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Users size={22} />
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', color: 'white' }}>Gestión de Usuarios</h2>
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            Administra los roles y permisos de acceso al sistema.
          </p>
        </div>
      </div>

      <div className="table-container">
        <table style={{ width: '100%', borderCollapse: 'collapse', color: 'white' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', background: 'rgba(255,255,255,0.02)' }}>
              <th style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}>Usuario</th>
              <th style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', textAlign: 'center' }}>Admin</th>
              <th style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', textAlign: 'center' }}>Puede Editar</th>
              <th style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', textAlign: 'center' }}>Puede Borrar</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((profile) => (
              <tr key={profile.id} className="table-row" style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '16px 20px' }}>
                  <div style={{ fontWeight: '600', fontSize: '14px' }}>{profile.email}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>ID: {profile.id.substring(0, 8)}...</div>
                </td>
                
                <td style={{ padding: '16px 20px', textAlign: 'center' }}>
                  <button 
                    onClick={() => handleToggle(profile.id, 'is_admin', profile.is_admin)}
                    disabled={updating === profile.id}
                    style={{ 
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: profile.is_admin ? '#10b981' : 'rgba(255,255,255,0.1)'
                    }}
                  >
                    <Shield size={20} />
                  </button>
                </td>

                <td style={{ padding: '16px 20px', textAlign: 'center' }}>
                  <button 
                    onClick={() => handleToggle(profile.id, 'can_edit', profile.can_edit)}
                    disabled={updating === profile.id}
                    style={{ 
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: profile.can_edit ? '#3b82f6' : 'rgba(255,255,255,0.1)'
                    }}
                  >
                    <Edit3 size={20} />
                  </button>
                </td>

                <td style={{ padding: '16px 20px', textAlign: 'center' }}>
                  <button 
                    onClick={() => handleToggle(profile.id, 'can_delete', profile.can_delete)}
                    disabled={updating === profile.id}
                    style={{ 
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: profile.can_delete ? '#ef4444' : 'rgba(255,255,255,0.1)'
                    }}
                  >
                    <Trash2 size={20} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div style={{ marginTop: '24px', padding: '16px', background: 'rgba(170, 59, 255, 0.05)', borderRadius: '12px', border: '1px border var(--border)' }}>
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Shield size={14} /> Los permisos se aplican instantáneamente tras cada cambio.
        </p>
      </div>
    </div>
  );
}
