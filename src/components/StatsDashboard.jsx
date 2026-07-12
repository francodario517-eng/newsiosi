import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import { TrendingUp, TrendingDown, GitBranch, Users, Eye } from 'lucide-react';

const COLORS = ['#aa3bff', '#10b981', '#3b82f6', '#ef4444'];
const fmt = (val) => `USD ${new Intl.NumberFormat('de-DE').format(Math.round(val || 0))}`;
const fmtInt = (val) => new Intl.NumberFormat('de-DE').format(Math.round(val || 0));

// Tarjeta KPI reutilizable
function Kpi({ label, value, color = 'white', accent, hint }) {
  return (
    <div className="card glass" style={{ padding: '20px', borderLeft: accent ? `4px solid ${accent}` : undefined }}>
      <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{label}</div>
      <div style={{ fontSize: '20px', fontWeight: 'bold', color, marginTop: '8px' }}>{value}</div>
      {hint && <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '4px' }}>{hint}</div>}
    </div>
  );
}

export function StatsDashboard({ metrics, trees, stock, onSelectTree }) {
  if (!metrics || !metrics.timeline) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
        No hay datos suficientes para generar estadísticas.
      </div>
    );
  }

  const { timeline, paymentMethods, summary, sellers = [] } = metrics;
  const s = summary;
  const stockValue = (stock || []).reduce((sum, v) => sum + (v.valuation || 0), 0);
  const stockCount = (stock || []).length;

  const treeList = (trees && trees.trees) || [];
  const topTrees = treeList.slice(0, 8).map(t => ({
    name: (t.label || 'Sin veh.').slice(0, 18),
    utilidad: Math.round(t.totalProfit || 0),
    status: t.status
  }));

  return (
    <div style={{ padding: '24px' }}>
      {/* KPIs principales */}
      <div className="stats-grid" style={{ marginBottom: '16px' }}>
        <Kpi label="Ventas Totales" value={fmt(s.totalSales)} hint={`${fmtInt(s.salesCount)} ventas`} />
        <Kpi label="Inversión en Compras" value={fmt(s.totalPurchases)} color="var(--accent-green)" hint={`${fmtInt(s.purchasesCount)} compras`} />
        <Kpi label="Utilidad Cash Flow" value={fmt(s.netProfit)} color={s.netProfit >= 0 ? '#10b981' : '#ef4444'} hint="Ventas − Compras" />
        <Kpi label="Utilidad Neta" value={fmt(s.netAfterCommission)} color={s.netAfterCommission >= 0 ? '#10b981' : '#ef4444'} accent={s.netAfterCommission >= 0 ? '#10b981' : '#ef4444'} hint="Descontada comisión 3%" />
      </div>

      {/* KPIs secundarios */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <Kpi label="Ticket Promedio (Venta)" value={fmt(s.avgTicket)} color="#3b82f6" />
        <Kpi label="Comisión y Gastos (3%)" value={fmt(s.totalCommission)} color="#ef4444" />
        <Kpi label="Crédito Otorgado" value={fmt(s.totalCredit)} color="#fbbf24" hint={`${fmtInt(s.creditSalesCount)} a crédito · ${fmtInt(s.contadoSalesCount)} contado`} />
        <Kpi label="Valor en Stock" value={fmt(stockValue)} color="#3b82f6" accent="#3b82f6" hint={`${fmtInt(stockCount)} unidades`} />
      </div>

      <div className="charts-grid">
        {/* Ventas vs Compras */}
        <div className="card glass" style={{ height: '350px', padding: '24px' }}>
          <h3 style={{ marginBottom: '24px', color: 'white' }}>Volumen de Negocio (USD)</h3>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={timeline}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} />
              <YAxis stroke="#9ca3af" fontSize={12} tickFormatter={(val) => `$${val / 1000}k`} />
              <Tooltip
                formatter={(value) => fmt(value)}
                contentStyle={{ background: '#16171d', border: '1px solid var(--border)', borderRadius: '8px' }}
                itemStyle={{ color: 'white' }}
              />
              <Legend />
              <Bar name="Ventas" dataKey="ventas" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              <Bar name="Compras" dataKey="compras" fill="var(--accent-green)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Formas de pago */}
        <div className="card glass" style={{ height: '350px', padding: '24px' }}>
          <h3 style={{ marginBottom: '24px', color: 'white' }}>Distribución de Formas de Pago</h3>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={paymentMethods} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                {paymentMethods.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: '#16171d', border: '1px solid var(--border)', borderRadius: '8px' }} itemStyle={{ color: 'white' }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tendencia de ganancia mensual */}
      <div className="card glass" style={{ height: '300px', padding: '24px', marginTop: '24px' }}>
        <h3 style={{ marginBottom: '24px', color: 'white' }}>Tendencia de Flujo (Ganancia Mensual)</h3>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={timeline}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="name" stroke="#9ca3af" />
            <YAxis stroke="#9ca3af" tickFormatter={(val) => `$${val / 1000}k`} />
            <Tooltip formatter={(value) => fmt(value)} contentStyle={{ background: '#16171d', border: '1px solid var(--border)', borderRadius: '8px' }} itemStyle={{ color: 'white' }} />
            <Line name="Ganancia Neta" type="monotone" dataKey="profit" stroke="var(--primary)" strokeWidth={3} dot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ───────── Rendimiento por Árbol ───────── */}
      <div style={{ marginTop: '32px' }}>
        <h3 style={{ color: 'white', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <GitBranch size={18} color="var(--primary)" /> Rendimiento por Árbol
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>
          Utilidad de cada cadena comercial (histórico completo). Hacé click en una fila para abrir su árbol.
        </p>

        {treeList.length === 0 ? (
          <div className="card glass" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Todavía no hay cadenas para analizar.
          </div>
        ) : (
          <>
            {/* Chips resumen */}
            <div className="stats-grid" style={{ marginBottom: '20px' }}>
              <Kpi label="Árboles" value={fmtInt(trees.totalTrees)} />
              <Kpi label="En Ganancia" value={fmtInt(trees.profitable)} color="#10b981" accent="#10b981" />
              <Kpi label="En Pérdida" value={fmtInt(trees.losing)} color="#ef4444" accent="#ef4444" />
              <Kpi label="Utilidad Agregada" value={fmt(trees.aggregateProfit)} color={trees.aggregateProfit >= 0 ? '#10b981' : '#ef4444'} />
            </div>

            {/* Top cadenas por utilidad */}
            <div className="card glass" style={{ height: '340px', padding: '24px', marginBottom: '20px' }}>
              <h3 style={{ marginBottom: '20px', color: 'white', fontSize: '15px' }}>Mejores cadenas por utilidad</h3>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topTrees} layout="vertical" margin={{ left: 20, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                  <XAxis type="number" stroke="#9ca3af" fontSize={12} tickFormatter={(val) => `$${val / 1000}k`} />
                  <YAxis type="category" dataKey="name" stroke="#9ca3af" fontSize={11} width={130} />
                  <Tooltip
                    formatter={(value) => fmt(value)}
                    contentStyle={{ background: '#16171d', border: '1px solid var(--border)', borderRadius: '8px' }}
                    itemStyle={{ color: 'white' }}
                    cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  />
                  <Bar name="Utilidad" dataKey="utilidad" radius={[0, 4, 4, 0]}>
                    {topTrees.map((t, i) => (
                      <Cell key={i} fill={t.status === 'ganancia' ? '#10b981' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Tabla por árbol */}
            <div className="card glass" style={{ padding: 0 }}>
              <div className="table-container" style={{ maxHeight: '460px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', color: 'white', minWidth: '760px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', background: 'rgba(255,255,255,0.02)', position: 'sticky', top: 0 }}>
                      {['Vehículo', 'Ops (V/C)', 'Inversión', 'Ingresos', 'Utilidad', 'Estado', ''].map((h, i) => (
                        <th key={i} style={{ padding: '14px 18px', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: i >= 2 && i <= 4 ? 'right' : 'left' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {treeList.map((t) => (
                      <tr
                        key={t.id}
                        className="table-row"
                        style={{ borderBottom: '1px solid var(--border)', cursor: onSelectTree ? 'pointer' : 'default' }}
                        onClick={onSelectTree ? () => onSelectTree(t) : undefined}
                      >
                        <td style={{ padding: '12px 18px' }}>
                          <div style={{ fontSize: '14px', fontWeight: 600 }}>{t.label}</div>
                          {t.chapa && <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{t.chapa}</div>}
                        </td>
                        <td style={{ padding: '12px 18px', fontSize: '13px', color: 'var(--text-muted)' }}>
                          {fmtInt(t.ventasCount)}/{fmtInt(t.comprasCount)}
                        </td>
                        <td style={{ padding: '12px 18px', textAlign: 'right', fontSize: '13px' }}>{fmt(t.totalInvestment)}</td>
                        <td style={{ padding: '12px 18px', textAlign: 'right', fontSize: '13px' }}>{fmt(t.totalRevenue)}</td>
                        <td style={{ padding: '12px 18px', textAlign: 'right', fontSize: '14px', fontWeight: 700, color: t.status === 'ganancia' ? '#10b981' : '#ef4444' }}>{fmt(t.totalProfit)}</td>
                        <td style={{ padding: '12px 18px' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
                            background: t.status === 'ganancia' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                            color: t.status === 'ganancia' ? '#10b981' : '#ef4444',
                            border: `1px solid ${t.status === 'ganancia' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`
                          }}>
                            {t.status === 'ganancia' ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                            {t.status}
                          </span>
                        </td>
                        <td style={{ padding: '12px 18px', textAlign: 'right', color: 'var(--text-muted)' }}>
                          {onSelectTree && <Eye size={15} />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ───────── Asesores de Venta ───────── */}
      {sellers.length > 0 && (
        <div style={{ marginTop: '32px' }}>
          <h3 style={{ color: 'white', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Users size={18} color="var(--primary)" /> Asesores de Venta
          </h3>
          <div className="card glass" style={{ padding: 0 }}>
            <div className="table-container">
              <table style={{ width: '100%', borderCollapse: 'collapse', color: 'white', minWidth: '480px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', background: 'rgba(255,255,255,0.02)' }}>
                    {['#', 'Asesor', 'Ventas', 'Volumen', 'Ticket Prom.'].map((h, i) => (
                      <th key={i} style={{ padding: '14px 18px', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: i >= 2 ? 'right' : 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sellers.map((seller, i) => (
                    <tr key={seller.name} className="table-row" style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 18px', color: 'var(--text-muted)', fontWeight: 700 }}>{i + 1}</td>
                      <td style={{ padding: '12px 18px', fontSize: '14px', fontWeight: 600 }}>{seller.name}</td>
                      <td style={{ padding: '12px 18px', textAlign: 'right', fontSize: '13px' }}>{fmtInt(seller.count)}</td>
                      <td style={{ padding: '12px 18px', textAlign: 'right', fontSize: '13px', fontWeight: 700 }}>{fmt(seller.volume)}</td>
                      <td style={{ padding: '12px 18px', textAlign: 'right', fontSize: '13px', color: 'var(--text-muted)' }}>{fmt(seller.count > 0 ? seller.volume / seller.count : 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
