import React, { useState, useEffect } from 'react';
import { db, supabase } from '../services/db';
import { Users, Shield, Edit3, Trash2, Check, X, Loader, UserPlus } from 'lucide-react';

import { createClient } from '@supabase/supabase-js';

export function UserManagement() {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', is_admin: false, can_edit: true, can_delete: false });
  const [isCreating, setIsCreating] = useState(false);

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

  const handleAddUser = () => {
    setNewUser({ email: '', password: '', is_admin: false, can_edit: true, can_delete: false });
    setShowAddModal(true);
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (newUser.password.length < 6) {
      alert("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    setIsCreating(true);
    try {
      // Usamos un cliente temporal sin persistencia de sesión para no desloguear al admin actual
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const tempClient = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false }
      });

      const { data, error } = await tempClient.auth.signUp({
        email: newUser.email.trim(),
        password: newUser.password,
      });

      if (error) throw error;

      if (data.user) {
        // Usamos upsert para asegurar que se cree el perfil si el trigger de la DB falla
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id: data.user.id,
            email: newUser.email,
            is_admin: newUser.is_admin,
            can_edit: newUser.can_edit,
            can_delete: newUser.can_delete
          });

        if (profileError) {
          console.warn('Error al crear perfil inicial (posiblemente ya existe):', profileError);
        }
        
        alert(`Usuario ${newUser.email} registrado. Si el usuario no aparece de inmediato, pídale que confirme su correo electrónico (si está habilitada la confirmación en Supabase).`);
        setShowAddModal(false);
        setNewUser({ email: '', password: '', is_admin: false, can_edit: true, can_delete: false });
        await loadProfiles();
        db.notify(); // Notificar cambios
      }
    } catch (error) {
      console.error('Error al crear usuario:', error);
      alert('Error: ' + (error.message || 'No se pudo crear el usuario'));
    } finally {
      setIsCreating(false);
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
      <div style={{ marginBottom: '32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
        
        <button 
          onClick={handleAddUser}
          className="btn btn-primary" 
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <UserPlus size={18} />
          <span>Nuevo Usuario</span>
        </button>
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

      {showAddModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(8px)' }}>
          <div className="glass card animate-in" style={{ width: '100%', maxWidth: '400px', padding: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h3 style={{ color: 'white', margin: 0 }}>Crear Nuevo Usuario</h3>
              <button onClick={() => setShowAddModal(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <form onSubmit={handleSaveUser}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '8px', fontSize: '13px' }}>Email</label>
                <input 
                  type="email" 
                  required 
                  autoComplete="off"
                  value={newUser.email}
                  onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                  placeholder="ejemplo@motorhaus.com"
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '8px', fontSize: '13px' }}>Contraseña</label>
                <input 
                  type="password" 
                  required 
                  autoComplete="new-password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                  placeholder="Min. 6 caracteres"
                />
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px', marginBottom: '24px' }}>
                <h4 style={{ color: 'white', fontSize: '12px', marginTop: 0, marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Permisos Iniciales</h4>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'white', cursor: 'pointer', fontSize: '14px' }}>
                    <input type="checkbox" checked={newUser.is_admin} onChange={(e) => setNewUser({...newUser, is_admin: e.target.checked})} />
                    Administrador (Control Total)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'white', cursor: 'pointer', fontSize: '14px' }}>
                    <input type="checkbox" checked={newUser.can_edit} onChange={(e) => setNewUser({...newUser, can_edit: e.target.checked})} />
                    Puede Editar Datos
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'white', cursor: 'pointer', fontSize: '14px' }}>
                    <input type="checkbox" checked={newUser.can_delete} onChange={(e) => setNewUser({...newUser, can_delete: e.target.checked})} />
                    Puede Borrar Registros
                  </label>
                </div>
                {!newUser.can_edit && !newUser.is_admin && (
                  <p style={{ margin: '12px 0 0 0', fontSize: '11px', color: '#60a5fa' }}>
                    * El usuario tendrá acceso de <b>Solo Lectura</b>.
                  </p>
                )}
              </div>

              <button type="submit" disabled={isCreating} className="btn btn-primary" style={{ width: '100%', padding: '14px' }}>
                {isCreating ? <Loader className="animate-spin" size={20} /> : 'Guardar'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
