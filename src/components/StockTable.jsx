import React from 'react';
import { ShoppingCart, Calendar } from 'lucide-react';

export function StockTable({ stock, onSellVehicle }) {
  return (
    <div style={{ padding: '0' }}>
      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px', padding: '0 8px' }}>
        <div style={{ 
          background: 'rgba(59, 130, 246, 0.1)', 
          padding: '12px', 
          borderRadius: '14px',
          color: '#3b82f6',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <ShoppingCart size={22} />
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'white' }}>Inventario en Stock</h2>
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            {stock.length} unidades disponibles para venta inmediata.
          </p>
        </div>
      </div>

      <div className="table-container">
        <table style={{ width: '100%', borderCollapse: 'collapse', color: 'white', minWidth: '750px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', background: 'rgba(255,255,255,0.02)' }}>
              <th style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Vehículo</th>
              <th style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Chapa / Chasis</th>
              <th style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ingreso</th>
              <th style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Origen</th>
              <th style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Valor</th>
              <th style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {stock.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '80px', color: 'var(--text-muted)' }}>
                  No hay vehículos en stock actualmente.
                </td>
              </tr>
            ) : (
              stock.map((item, idx) => (
                <tr key={idx} className="table-row" style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }}>
                  <td style={{ padding: '16px 20px' }}>
                    <div style={{ fontWeight: '600', fontSize: '14px' }}>{item.description}</div>
                  </td>
                  <td style={{ padding: '16px 20px' }}>
                    <div style={{ fontSize: '12px', color: '#60a5fa' }}>{item.chapa || 'S/C'}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.chasis || 'S/C'}</div>
                  </td>
                  <td style={{ padding: '16px 20px', fontSize: '13px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Calendar size={14} color="var(--text-muted)" />
                      {item.entry_date}
                    </div>
                  </td>
                  <td style={{ padding: '16px 20px' }}>
                    <span style={{ 
                      fontSize: '10px', 
                      background: item.source_type === 'COMPRA' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(59, 130, 246, 0.1)', 
                      color: item.source_type === 'COMPRA' ? '#10b981' : '#3b82f6', 
                      padding: '4px 10px', 
                      borderRadius: '6px',
                      textTransform: 'uppercase',
                      fontWeight: '800',
                      border: `1px solid ${item.source_type === 'COMPRA' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)'}`
                    }}>
                      {item.source_type === 'COMPRA' ? 'PROPIO' : 'TRADE-IN'}
                    </span>
                  </td>
                  <td style={{ padding: '16px 20px' }}>
                    <div style={{ fontWeight: '700', fontSize: '15px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginRight: '4px' }}>USD</span>
                      {(item.valuation || 0).toLocaleString()}
                    </div>
                  </td>
                  <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                    <button 
                      className="btn btn-primary" 
                      style={{ 
                        padding: '8px 16px', fontSize: '12px', borderRadius: '8px',
                        opacity: onSellVehicle ? 1 : 0.4,
                        cursor: onSellVehicle ? 'pointer' : 'not-allowed',
                        background: onSellVehicle ? 'var(--primary)' : 'rgba(255, 255, 255, 0.1)',
                        border: onSellVehicle ? 'none' : '1px solid rgba(255, 255, 255, 0.1)'
                      }}
                      onClick={onSellVehicle ? (() => onSellVehicle(item)) : null}
                      title={onSellVehicle ? "Vender vehículo" : "No tienes permisos para vender"}
                    >
                      Vender
                    </button>
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
