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

export function StatsDashboard() {
  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px' }}>
        
        {/* Sales vs Purchases Chart */}
        <div className="card glass" style={{ height: '350px', padding: '24px' }}>
          <h3 style={{ marginBottom: '24px', color: 'white' }}>Volumen de Negocio (USD)</h3>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip 
                contentStyle={{ background: '#16171d', border: '1px solid var(--border)', borderRadius: '8px' }}
                itemStyle={{ color: 'white' }}
              />
              <Legend />
              <Bar dataKey="ventas" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="compras" fill="var(--accent-green)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Profitability Pie Chart */}
        <div className="card glass" style={{ height: '350px', padding: '24px' }}>
          <h3 style={{ marginBottom: '24px', color: 'white' }}>Distribución de Formas de Pago</h3>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={[
                  { name: 'Contado', value: 400 },
                  { name: 'Crédito', value: 300 },
                  { name: 'Canje', value: 300 }
                ]}
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {COLORS.map((entry, index) => (
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
        <h3 style={{ marginBottom: '24px', color: 'white' }}>Tendencia de Ganancia Neta</h3>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="name" stroke="#9ca3af" />
            <YAxis stroke="#9ca3af" />
            <Tooltip />
            <Line type="monotone" dataKey="ventas" stroke="var(--primary)" strokeWidth={3} dot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
