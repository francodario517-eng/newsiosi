import React from 'react';
import { ShoppingCart, Calendar } from 'lucide-react';

export function StockTable({ stock, onSellVehicle }) {
  return (
    <div style={{ padding: '0' }}>
      <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px', padding: '20px' }}>
        <div style={{ 
          background: 'rgba(59, 130, 246, 0.1)', 
          padding: '10px', 
          borderRadius: '12px',
          color: 'var(--primary)'
        }}>
          <ShoppingCart size={20} />
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px' }}>Inventario en Stock</h2>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)' }}>
            Vehículos disponibles para la venta. {stock.length} unidades encontradas.
          </p>
        </div>
      </div>

      <div className="table-container">
        <table style={{ width: '100%', borderCollapse: 'collapse', color: 'white', minWidth: '750px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
              <th style={{ padding: '16px', color: 'var(--text-muted)' }}>Vehículo</th>
              <th style={{ padding: '16px', color: 'var(--text-muted)' }}>Chapa / Chasis</th>
              <th style={{ padding: '16px', color: 'var(--text-muted)' }}>Fecha Ingreso</th>
              <th style={{ padding: '16px', color: 'var(--text-muted)' }}>Origen</th>
              <th style={{ padding: '16px', color: 'var(--text-muted)' }}>Valor Estimado</th>
              <th style={{ padding: '16px', color: 'var(--text-muted)' }}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {stock.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  No hay vehículos en stock actualmente.
                </td>
              </tr>
            ) : (
              stock.map((item, idx) => (
                <tr key={idx} className="table-row" style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '16px' }}>
                    <div style={{ fontWeight: '600' }}>{item.description}</div>
                  </td>
                  <td style={{ padding: '16px' }}>
                    <div style={{ fontSize: '12px' }}>Chapa: {item.chapa || 'S/C'}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Chasis: {item.chasis || 'S/C'}</div>
                  </td>
                  <td style={{ padding: '16px', fontSize: '13px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Calendar size={14} color="var(--text-muted)" />
                      {item.entry_date}
                    </div>
                  </td>
                  <td style={{ padding: '16px' }}>
                    <span style={{ 
                      fontSize: '10px', 
                      background: item.source_type === 'COMPRA' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)', 
                      color: item.source_type === 'COMPRA' ? '#10b981' : '#3b82f6', 
                      padding: '4px 8px', 
                      borderRadius: '4px',
                      textTransform: 'uppercase',
                      fontWeight: '700'
                    }}>
                      {item.source_type === 'COMPRA' ? 'PROPIO' : 'TRADE-IN'}
                    </span>
                  </td>
                  <td style={{ padding: '16px' }}>
                    <div style={{ fontWeight: '700' }}>
                      USD {(item.valuation || 0).toLocaleString()}
                    </div>
                  </td>
                  <td style={{ padding: '16px' }}>
                    <button 
                      className="btn btn-primary" 
                      style={{ padding: '6px 12px', fontSize: '12px' }}
                      onClick={() => onSellVehicle(item)}
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
