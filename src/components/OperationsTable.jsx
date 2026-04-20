import React from 'react';
import { Eye, Calendar, Trash2, Pencil } from 'lucide-react';

export function OperationsTable({ operations, onSelectOperation, onDeleteOperation, onEditOperation }) {
  return (
    <div style={{ padding: '0' }}>
      <div className="table-container">
        <table style={{ width: '100%', borderCollapse: 'collapse', color: 'white', minWidth: '850px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', background: 'rgba(255,255,255,0.02)' }}>
              <th style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fecha</th>
              <th style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tipo</th>
              <th style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cliente</th>
              <th style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Monto</th>
              <th style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Vehículos</th>
              <th style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {operations.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
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
                  <td style={{ padding: '16px 20px', fontSize: '14px', fontWeight: '500' }}>{op.buyer}</td>
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
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button 
                        className="btn btn-outline" 
                        style={{ padding: '8px 12px', fontSize: '12px', height: '36px' }}
                        onClick={() => onSelectOperation(op)}
                      >
                        <Eye size={14} />
                        Árbol
                      </button>
                      {onEditOperation && (
                        <button 
                          className="btn btn-outline" 
                          style={{ 
                            padding: '8px', 
                            height: '36px',
                            width: '36px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--primary)', 
                            borderColor: 'rgba(170, 59, 255, 0.2)'
                          }}
                          onClick={() => onEditOperation(op)}
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                      {onDeleteOperation && (
                        <button 
                          className="btn btn-outline" 
                          style={{ 
                            padding: '8px', 
                            height: '36px',
                            width: '36px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#ef4444', 
                            borderColor: 'rgba(239, 68, 68, 0.2)'
                          }}
                          onClick={() => onDeleteOperation(op)}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
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
