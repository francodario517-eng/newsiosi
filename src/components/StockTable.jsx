import React from 'react';
import { ShoppingCart, Calendar, TrendingUp, TrendingDown, DollarSign, Globe, Loader, GitBranch } from 'lucide-react';
import { db, supabase } from '../services/db';

export function StockTable({
  stock,
  onSellVehicle,
  onViewTree,
  marketData,
  setMarketData
}) {
  const formatMoney = (val) => {
    return new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 }).format(val);
  };

  return (
    <div style={{ padding: '0 4px' }}>
      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
            <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'white' }}>Inventario y Mercado</h2>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              {stock.length} unidades en stock. Análisis de precios online.
            </p>
          </div>
        </div>
      </div>

      <div style={{ overflowX: 'auto', overflowY: 'visible', width: '100%', paddingBottom: '8px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', color: 'white', minWidth: '1280px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', background: 'rgba(255,255,255,0.02)' }}>
              <th style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', width: '250px' }}>Vehículo (Origen)</th>
              <th style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Costo (USD)</th>
              <th style={{ padding: '16px 20px', color: '#f59e0b', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', borderLeft: '1px dashed rgba(255,255,255,0.1)' }}>Clasipar</th>
              <th style={{ padding: '16px 20px', color: '#3b82f6', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Marketplace</th>
              <th style={{ padding: '16px 20px', color: '#ec4899', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Instagram</th>
              <th style={{ padding: '16px 20px', color: 'white', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Internet</th>
              <th style={{ padding: '16px 20px', color: 'white', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', borderLeft: '1px dashed rgba(255,255,255,0.1)' }}>Prom. Mercado</th>
              <th style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>Comp. $</th>
              <th style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>Comp. %</th>
              <th style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {stock.length === 0 ? (
              <tr>
                <td colSpan="9" style={{ textAlign: 'center', padding: '80px', color: 'var(--text-muted)' }}>
                  No hay vehículos en stock actualmente.
                </td>
              </tr>
            ) : (
              stock.map((item, idx) => {
                const vId = (item.chapa || item.chasis || item.description || '').trim().toUpperCase();
                const md = marketData[vId];
                
                return (
                <tr key={idx} className="table-row animate-in" style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s', animationDelay: `${idx * 50}ms` }}>
                  <td style={{ padding: '16px 20px' }}>
                    <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '4px' }}>{item.description}</div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', color: '#60a5fa', background: 'rgba(96, 165, 250, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>{item.chapa || 'S/C'}</span>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{item.chasis || 'S/C'}</span>
                    </div>
                    <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ 
                        fontSize: '9px', 
                        background: item.source_type === 'COMPRA' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(59, 130, 246, 0.1)', 
                        color: item.source_type === 'COMPRA' ? '#10b981' : '#3b82f6', 
                        padding: '2px 6px', 
                        borderRadius: '4px',
                        textTransform: 'uppercase',
                        fontWeight: '800',
                        border: `1px solid ${item.source_type === 'COMPRA' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)'}`
                      }}>
                        {item.source_type === 'COMPRA' ? 'PROPIO' : 'TRADE-IN'}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                        <Calendar size={12} />
                        {item.entry_date}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '16px 20px' }}>
                    <div style={{ fontWeight: '700', fontSize: '15px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginRight: '4px' }}>USD</span>
                      {formatMoney(item.valuation || 0)}
                    </div>
                  </td>
                  
                  {/* Market Data Columns */}
                  {md?.isLoading ? (
                    <td colSpan="7" style={{ padding: '16px 20px', borderLeft: '1px dashed rgba(255,255,255,0.1)' }}>
                       <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)', fontSize: '12px' }}>
                          <Loader size={14} className="animate-spin" /> Buscando precios en línea...
                       </div>
                    </td>
                  ) : md ? (
                    <>
                      <td style={{ padding: '12px 20px', borderLeft: '1px dashed rgba(255,255,255,0.1)' }}>
                        <div style={{ fontWeight: '600', fontSize: '13px', color: md.clasipar > 0 ? 'white' : 'rgba(255,255,255,0.3)' }}>
                          {md.clasipar > 0 ? formatMoney(md.clasipar) : '---'}
                        </div>
                        {md.isError && <span style={{ fontSize: '8px', color: '#f87171' }}>{md.errorMsg}</span>}
                      </td>
                      <td style={{ padding: '12px 20px' }}>
                        <div style={{ fontWeight: '600', fontSize: '13px', color: md.marketplace > 0 ? 'white' : 'rgba(255,255,255,0.3)' }}>
                          {md.marketplace > 0 ? formatMoney(md.marketplace) : '---'}
                        </div>
                      </td>
                      <td style={{ padding: '12px 20px' }}>
                        <div style={{ fontWeight: '600', fontSize: '13px', color: md.instagram > 0 ? 'white' : 'rgba(255,255,255,0.3)' }}>
                          {md.instagram > 0 ? formatMoney(md.instagram) : '---'}
                        </div>
                      </td>
                      <td style={{ padding: '12px 20px' }}>
                        <div style={{ fontWeight: '600', fontSize: '13px', color: md.internet > 0 ? 'white' : 'rgba(255,255,255,0.3)' }}>
                          {md.internet > 0 ? formatMoney(md.internet) : '---'}
                        </div>
                      </td>
                      <td style={{ padding: '12px 20px', borderLeft: '1px dashed rgba(255,255,255,0.1)' }}>
                        <div style={{ fontWeight: '800', fontSize: '14px', color: md.promedio > 0 ? 'white' : 'rgba(255,255,255,0.3)' }}>
                          {md.promedio > 0 ? formatMoney(md.promedio) : 'Sin datos'}
                        </div>
                        {md.isRealData && (
                          <span style={{ fontSize: '9px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '3px', marginTop: '3px' }}>
                            <Globe size={9}/>Datos Reales
                          </span>
                        )}
                        {md.updatedAt && (
                          <div style={{ marginTop: '2px' }}>
                            <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', display: 'block' }}>🕐 {md.updatedAt}</span>
                            {md.usdRate && <span style={{ fontSize: '8px', color: '#60a5fa', display: 'block' }}>💵 Cambio: {md.usdRate} Gs.</span>}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 20px', textAlign: 'center' }}>
                        <div style={{ 
                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                          color: md.diffDollar > 0 ? '#10b981' : '#ef4444',
                          fontWeight: 'bold', fontSize: '13px',
                          background: md.diffDollar > 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                          padding: '4px 8px', borderRadius: '6px'
                        }}>
                          {md.diffDollar > 0 ? '+' : ''}{formatMoney(md.diffDollar)}
                        </div>
                      </td>
                      <td style={{ padding: '12px 20px', textAlign: 'center' }}>
                         <div style={{ 
                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                          color: md.diffPercent > 0 ? '#10b981' : '#ef4444',
                          fontWeight: 'bold', fontSize: '13px'
                        }}>
                          {md.diffPercent > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                          {md.diffPercent}%
                        </div>
                      </td>
                    </>
                  ) : (
                    <td colSpan="7" style={{ padding: '16px 20px', borderLeft: '1px dashed rgba(255,255,255,0.1)', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: '12px' }}>
                      Pendiente de actualización
                    </td>
                  )}

                  <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '8px' }}>
                      <button
                        className="btn btn-outline"
                        style={{
                          padding: '8px 12px', fontSize: '12px', borderRadius: '8px',
                          opacity: onViewTree ? 1 : 0.4,
                          cursor: onViewTree ? 'pointer' : 'not-allowed',
                        }}
                        onClick={onViewTree ? (() => onViewTree(item)) : null}
                        title="Ver árbol de trazabilidad"
                      >
                        <GitBranch size={14} />
                      </button>
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
                        <DollarSign size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} />
                        Vender
                      </button>
                    </div>
                  </td>
                </tr>
              )})
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
