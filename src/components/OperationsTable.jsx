import React from 'react';
import { Eye, Calendar, Trash2, Pencil } from 'lucide-react';
import { lastModification, creation } from '../services/audit';

// Última modificación de la operación; si nadie la tocó después de cargarla, quién la cargó.
function AuditCell({ op }) {
  const mod = lastModification(op);
  const alta = creation(op);
  if (!mod && !(alta && alta.quien)) {
    return <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>—</span>;
  }
  return (
    <div style={{ fontSize: '12px', lineHeight: 1.4 }}>
      {mod ? (
        <div title="Última persona que modificó esta operación">
          <span style={{ color: '#d1d5db', fontWeight: 600 }}>{mod.quien}</span>
          <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>modificó · {mod.cuando}</div>
        </div>
      ) : (
        <div title="Nadie la modificó después de cargarla">
          <span style={{ color: '#d1d5db' }}>{alta.quien}</span>
          <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>cargó · {alta.cuando}</div>
        </div>
      )}
    </div>
  );
}

export function OperationsTable({ operations, onSelectOperation, onDeleteOperation, onEditOperation }) {
  return (
    <div style={{ padding: '0' }}>
      <div className="table-container">
        <table style={{ width: '100%', borderCollapse: 'collapse', color: 'white', minWidth: '1000px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', background: 'rgba(255,255,255,0.02)' }}>
              <th style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fecha</th>
              <th style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tipo</th>
              <th style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cliente</th>
              <th style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Monto</th>
              <th style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Vehículos</th>
              <th style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Últ. modificación</th>
              <th style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {operations.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                  No se encontraron operaciones en este período.
                </td>
              </tr>
            ) : (
              operations.map((op) => (
                <tr key={op.id} className="table-row" style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }}>
                  <td style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                      <Calendar size={14} color="var(--text-muted)" />
                      {op.date}
                    </div>
                  </td>
                  <td style={{ padding: '16px 20px' }}>
                    <span style={{ 
                      padding: '4px 10px', 
                      borderRadius: '6px', 
                      fontSize: '11px',
                      fontWeight: '700',
                      background: op.operation_type === 'compra' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(170, 59, 255, 0.1)',
                      color: op.operation_type === 'compra' ? '#10b981' : '#aa3bff',
                      textTransform: 'uppercase',
                      border: `1px solid ${op.operation_type === 'compra' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(170, 59, 255, 0.2)'}`
                    }}>
                      {op.operation_type}
                    </span>
                  </td>
                  <td style={{ padding: '16px 20px', fontSize: '14px', fontWeight: '500' }}>
                    {op.buyer}
                    {op.seller_name && (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'normal', marginTop: '2px' }}>
                        Asesor: {op.seller_name}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '16px 20px' }}>
                    <div style={{ fontWeight: '700', fontSize: '15px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginRight: '4px' }}>{op.currency}</span>
                      {(op.total_amount || 0).toLocaleString()}
                    </div>
                  </td>
                  <td style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {op.vehicles.map(v => (
                        <span key={v.id} style={{ fontSize: '10px', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                          {v.chapa || v.chasis || v.description}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '16px 20px' }}>
                    <AuditCell op={op} />
                  </td>
                  <td style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button 
                        className="btn btn-outline" 
                        style={{ padding: '8px 12px', fontSize: '12px', height: '36px' }}
                        onClick={() => onSelectOperation(op)}
                      >
                        <Eye size={14} />
                        Árbol
                      </button>
                      <button 
                        className="btn btn-outline" 
                        style={{ 
                          padding: '8px', 
                          height: '36px',
                          width: '36px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: onEditOperation ? 'var(--primary)' : 'var(--text-muted)', 
                          borderColor: onEditOperation ? 'rgba(170, 59, 255, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                          opacity: onEditOperation ? 1 : 0.4,
                          cursor: onEditOperation ? 'pointer' : 'not-allowed'
                        }}
                        onClick={onEditOperation ? (() => onEditOperation(op)) : null}
                        title={onEditOperation ? "Editar" : "No tienes permisos para editar"}
                      >
                        <Pencil size={14} />
                      </button>
                      <button 
                        className="btn btn-outline" 
                        style={{ 
                          padding: '8px', 
                          height: '36px',
                          width: '36px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: onDeleteOperation ? '#ef4444' : 'var(--text-muted)', 
                          borderColor: onDeleteOperation ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                          opacity: onDeleteOperation ? 1 : 0.4,
                          cursor: onDeleteOperation ? 'pointer' : 'not-allowed'
                        }}
                        onClick={onDeleteOperation ? (() => onDeleteOperation(op)) : null}
                        title={onDeleteOperation ? "Eliminar" : "No tienes permisos para eliminar"}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
