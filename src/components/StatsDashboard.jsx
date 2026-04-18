import React from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts';

const data = [
  { name: 'Ene', ventas: 4000, compras: 2400 },
  { name: 'Feb', ventas: 3000, compras: 1398 },
  { name: 'Mar', ventas: 2000, compras: 9800 },
  { name: 'Abr', ventas: 2780, compras: 3908 },
];

const COLORS = ['#aa3bff', '#10b981', '#3b82f6', '#ef4444'];
const formatCurrency = (val) => `USD ${new Intl.NumberFormat('de-DE').format(val)}`;

export function StatsDashboard({ metrics, stock }) {
  if (!metrics || !metrics.timeline) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
        No hay datos suficientes para generar estadísticas.
      </div>
    );
  }

  const { timeline, paymentMethods, summary } = metrics;
  const stockValue = (stock || []).reduce((sum, v) => sum + (v.valuation || 0), 0);
  const stockCount = (stock || []).length;

  return (
    <div style={{ padding: '24px' }}>
      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px', marginBottom: '24px' }}>
        <div className="card glass" style={{ padding: '20px' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Ventas Totales</div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: 'white', marginTop: '8px' }}>
            {formatCurrency(summary.totalSales)}
          </div>
        </div>
        <div className="card glass" style={{ padding: '20px' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Inversión en Compras</div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--accent-green)', marginTop: '8px' }}>
            {formatCurrency(summary.totalPurchases)}
          </div>
        </div>
        <div className="card glass" style={{ padding: '20px' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Utilidad Cash Flow</div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: summary.netProfit >= 0 ? '#10b981' : '#ef4444', marginTop: '8px' }}>
            {formatCurrency(summary.netProfit)}
          </div>
        </div>
        <div className="card glass" style={{ padding: '20px', borderLeft: '4px solid #3b82f6' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Valor en Stock ({stockCount} uni)</div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#3b82f6', marginTop: '8px' }}>
            {formatCurrency(stockValue)}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px' }}>
        
        {/* Sales vs Purchases Chart */}
        <div className="card glass" style={{ height: '350px', padding: '24px' }}>
          <h3 style={{ marginBottom: '24px', color: 'white' }}>Volumen de Negocio (USD)</h3>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={timeline}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} />
              <YAxis stroke="#9ca3af" fontSize={12} tickFormatter={(val) => `$${val/1000}k`} />
              <Tooltip 
                formatter={(value) => formatCurrency(value)}
                contentStyle={{ background: '#16171d', border: '1px solid var(--border)', borderRadius: '8px' }}
                itemStyle={{ color: 'white' }}
              />
              <Legend />
              <Bar name="Ventas" dataKey="ventas" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              <Bar name="Compras" dataKey="compras" fill="var(--accent-green)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Payment Methods Chart */}
        <div className="card glass" style={{ height: '350px', padding: '24px' }}>
          <h3 style={{ marginBottom: '24px', color: 'white' }}>Distribución de Formas de Pago</h3>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={paymentMethods}
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {paymentMethods.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

      </div>

      {/* Historical Trend */}
      <div className="card glass" style={{ height: '300px', padding: '24px', marginTop: '24px' }}>
        <h3 style={{ marginBottom: '24px', color: 'white' }}>Tendencia de Flujo (Ganancia Mensual)</h3>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={timeline}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="name" stroke="#9ca3af" />
            <YAxis stroke="#9ca3af" tickFormatter={(val) => `$${val/1000}k`} />
            <Tooltip formatter={(value) => formatCurrency(value)} />
            <Line name="Ganancia Neta" type="monotone" dataKey="profit" stroke="var(--primary)" strokeWidth={3} dot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

