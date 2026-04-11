import React from 'react';
import { Eye, Calendar, Trash2, Pencil } from 'lucide-react';

export function OperationsTable({ operations, onSelectOperation, onDeleteOperation, onEditOperation }) {
  return (
    <div style={{ padding: '20px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', color: 'white' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '16px', color: 'var(--text-muted)' }}>Fecha</th>
            <th style={{ padding: '16px', color: 'var(--text-muted)' }}>Tipo</th>
            <th style={{ padding: '16px', color: 'var(--text-muted)' }}>Comprador / Vendedor</th>
            <th style={{ padding: '16px', color: 'var(--text-muted)' }}>Monto Total</th>
            <th style={{ padding: '16px', color: 'var(--text-muted)' }}>Vehículos</th>
            <th style={{ padding: '16px', color: 'var(--text-muted)' }}>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {operations.length === 0 ? (
            <tr>
              <td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                No se encontraron operaciones con ese criterio.
              </td>
            </tr>
          ) : (
            operations.map((op) => (
              <tr key={op.id} className="table-row" style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }}>
                <td style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Calendar size={16} color="var(--text-muted)" />
                    {op.date}
                  </div>
                </td>
                <td style={{ padding: '16px' }}>
                  <span style={{ 
                    padding: '4px 12px', 
                    borderRadius: '20px', 
                    fontSize: '12px',
                    fontWeight: '600',
                    background: op.operation_type === 'compra' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(170, 59, 255, 0.15)',
                    color: op.operation_type === 'compra' ? '#10b981' : '#aa3bff',
                    textTransform: 'uppercase'
                  }}>
                    {op.operation_type}
                  </span>
                </td>
                <td style={{ padding: '16px' }}>{op.buyer}</td>
                <td style={{ padding: '16px' }}>
                  <div style={{ fontWeight: '700' }}>
                    {op.currency} {(op.total_amount || 0).toLocaleString()}
                  </div>
                </td>
                <td style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {op.vehicles.map(v => (
                      <span key={v.id} style={{ fontSize: '11px', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px' }}>
                        {v.chapa || v.chasis || v.description}
                      </span>
                    ))}
                  </div>
                </td>
                <td style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                      className="btn btn-outline" 
                      style={{ padding: '6px 12px', fontSize: '12px' }}
                      onClick={() => onSelectOperation(op)}
                    >
                      <Eye size={14} />
                      Ver Árbol
                    </button>
                    <button 
                      className="btn btn-outline" 
                      style={{ 
                        padding: '6px', 
                        fontSize: '12px', 
                        color: 'var(--primary)', 
                        borderColor: 'rgba(59, 130, 246, 0.2)',
                        minWidth: '32px' 
                      }}
                      onClick={() => onEditOperation(op)}
                      title="Editar Registro"
                    >
                      <Pencil size={14} />
                    </button>
                    <button 
                      className="btn btn-outline" 
                      style={{ 
                        padding: '6px', 
                        fontSize: '12px', 
                        color: '#ef4444', 
                        borderColor: 'rgba(239, 68, 68, 0.2)',
                        minWidth: '32px' 
                      }}
                      onClick={() => onDeleteOperation(op)}
                      title="Eliminar Registro"
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
  );
}
