import React from 'react';
import { ShoppingCart, Calendar, Info } from 'lucide-react';

export function StockTable({ stock, onSellVehicle }) {
  return (
    <div style={{ padding: '20px' }}>
      <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
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

      <table style={{ width: '100%', borderCollapse: 'collapse', color: 'white' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '16px', color: 'var(--text-muted)' }}>Vehículo</th>
            <th style={{ padding: '16px', color: 'var(--text-muted)' }}>Chapa / Chasis</th>
            <th style={{ padding: '16px', color: 'var(--text-muted)' }}>Ingreso</th>
            <th style={{ padding: '16px', color: 'var(--text-muted)' }}>Veredicto</th>
            <th style={{ padding: '16px', color: 'var(--text-muted)' }}>Valor Ingreso</th>
            <th style={{ padding: '16px', color: 'var(--text-muted)' }}>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {stock.length === 0 ? (
            <tr>
              <td colSpan="6" style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                No hay vehículos en stock actualmente.
              </td>
            </tr>
          ) : (
            stock.map((item, idx) => (
              <tr key={idx} className="table-row" style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }}>
                <td style={{ padding: '16px' }}>
                  <div style={{ fontWeight: '600' }}>{item.description}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Procedente de {item.source_type}</div>
                </td>
                <td style={{ padding: '16px' }}>
                  <div style={{ fontSize: '12px', color: '#60a5fa' }}>CHAPA: {item.chapa || 'N/A'}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>CHASIS: {item.chasis || 'N/A'}</div>
                </td>
                <td style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                    <Calendar size={14} color="var(--text-muted)" />
                    {item.entry_date}
                  </div>
                </td>
                <td style={{ padding: '16px' }}>
                  <span style={{ 
                    padding: '4px 10px', 
                    borderRadius: '12px', 
                    fontSize: '11px',
                    background: item.source_type === 'COMPRA' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(249, 115, 22, 0.1)',
                    color: item.source_type === 'COMPRA' ? '#10b981' : '#f97316'
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
                    style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '8px' }}
                    onClick={() => onSellVehicle({
                      description: item.description,
                      chapa: item.chapa,
                      chasis: item.chasis,
                      operation_id: item.operation_id
                    })}
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
  );
}
