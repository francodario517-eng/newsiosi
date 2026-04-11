import { useState, useEffect } from 'react'
import { 
  Car, 
  ArrowLeftRight, 
  GitBranch, 
  BarChart3, 
  Search, 
  Plus, 
  Download,
  Settings,
  X,
  TrendingUp,
  Package,
  Calendar as CalendarIcon,
  Filter
} from 'lucide-react'
import './index.css'
import { db } from './services/db'
import { financials } from './services/financials'
import { OperationsTable } from './components/OperationsTable'
import { TreeView } from './components/TreeView'
import { StatsDashboard } from './components/StatsDashboard'
import * as XLSX from 'xlsx'

function App() {
  const [activeTab, setActiveTab] = useState('operations')
  const [selectedTraceability, setSelectedTraceability] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [stats, setStats] = useState({ totalProfit: 0, tradeInCount: 0 })
  const [searchQuery, setSearchQuery] = useState('')
  const [period, setPeriod] = useState('all') 
  const [customRange, setCustomRange] = useState({ start: '', end: '' })
  const [operations, setOperations] = useState([])
  const [preFilledData, setPreFilledData] = useState(null)
  const [highlightedId, setHighlightedId] = useState(null)

  useEffect(() => {
    const loadOps = async () => {
      const data = await db.getOperations();
      setOperations(data);
    };
    loadOps();
    return db.subscribe(loadOps);
  }, [])

  const handleSelectOperation = async (op) => {
    const vehicleId = op.vehicles[0]?.chasis || op.vehicles[0]?.chapa || op.vehicles[0]?.id || op.vehicles[0]?.identifier;
    if (vehicleId) {
      setHighlightedId(op.id);
      const trace = await db.getVehicleTraceability(vehicleId);
      setSelectedTraceability(trace);
      setStats(financials.getTreeStats(trace));
      setActiveTab('tree');
    }
  }

  const handleOpenBranchModal = (nodeData) => {
    setPreFilledData({
      description: nodeData.trade_in?.description || nodeData.vehicle_description,
      chapa: nodeData.trade_in?.chapa || nodeData.chapa,
      chasis: nodeData.trade_in?.chasis || nodeData.chasis,
      parentId: nodeData.operation_id
    });
    setShowModal(true);
  }

  const handleAddOperation = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const tradeInDesc = formData.get('trade_in_description');
    const vehiclesData = [{ 
      id: Date.now(), 
      chapa: formData.get('chapa'),
      chasis: formData.get('chasis'),
      description: formData.get('description'), 
      role: 'principal' 
    }];

    if (tradeInDesc) {
      vehiclesData.push({
        id: Date.now() + 1,
        chapa: formData.get('trade_in_chapa'),
        chasis: formData.get('trade_in_chasis'),
        description: tradeInDesc,
        role: 'parte_pago',
        valuation: Number(formData.get('trade_in_valuation') || 0)
      });
    }

    const newOp = {
      operation_type: formData.get('type').toLowerCase(),
      payment_type: formData.get('payment').toLowerCase(),
      date: new Date(formData.get('date')).toLocaleDateString('es-PY'), 
      currency: 'USD',
      total_amount: Number(formData.get('amount')),
      buyer: formData.get('buyer'),
      delivery_amount: Number(formData.get('delivery_amount') || 0),
      installments: Number(formData.get('installments') || 0),
      credit_amount: Number(formData.get('credit_amount') || 0),
      vehicles: vehiclesData,
      parentId: preFilledData?.parentId
    };
    await db.addOperation(newOp);
    setShowModal(false);
    setPreFilledData(null);
    
    // Refresh tree if currently viewing one
    if (selectedTraceability) {
       handleSelectOperation(newOp);
    }
  }

  const exportToExcel = async () => {
    // Determine which operations to export (only those currently filtered)
    const targetOps = filteredOperations;
    const processedIds = new Set();
    const exportData = [];

    // Grouping logic based ONLY on filtered items, but keeping lineage context
    targetOps.forEach(op => {
      if (processedIds.has(op.id)) return;

      // Find all operations in the same chain that are ALSO in the filtered set
      // We first find the root of this operation's chain (even if root is filtered out)
      const findRoot = (o) => {
        if (!o.parentId) return o;
        const parent = operations.find(p => p.id === o.parentId);
        return parent ? findRoot(parent) : o;
      };

      const root = findRoot(op);
      
      // Get all descendants in the FULL database to calculate accurate stats
      const getFullLineage = (parentId) => {
        const children = operations.filter(o => o.parentId === parentId);
        let results = [...children];
        children.forEach(child => {
          results = [...results, ...getFullLineage(child.id)];
        });
        return results;
      };
      
      const fullLineage = [root, ...getFullLineage(root.id)];
      const stats = financials.getTreeStats({ 
        nodes: fullLineage.map(o => ({ data: { ...o, total_amount: o.total_amount } })) 
      });

      // Export the WHOLE lineage if at least one member is in our targeted (filtered) set
      fullLineage.forEach((lineageOp) => {
        processedIds.add(lineageOp.id);
        exportData.push({
          'ID Cadena': root.id,
          'Fecha': lineageOp.date,
          'Operacion': lineageOp.operation_type.toUpperCase(),
          'Comprador/Vendedor': lineageOp.buyer,
          'Vehículos': lineageOp.vehicles.map(v => `${v.description} (CHAPA: ${v.chapa || 'N/A'}, CHASIS: ${v.chasis || 'N/A'})`).join(' | '),
          'Monto Operación': lineageOp.total_amount,
          'Costo Inversión (Origen)': root.total_amount,
          'Ganancia Neta': stats.totalProfit,
          'Estatus': stats.totalProfit > 0 ? 'RENTABLE' : 'PERDIDA'
        });
      });

      // Add a spacer row between chains
      if (fullLineage.length > 0) exportData.push({});
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte Filtrado");
    
    const wscols = [
      {wch: 12}, {wch: 12}, {wch: 15}, {wch: 40}, {wch: 60}, {wch: 15}, {wch: 25}, {wch: 22}, {wch: 15}
    ];
    worksheet['!cols'] = wscols;

    const fileName = searchQuery ? `Reporte_${searchQuery}_${period}.xlsx` : `Reporte_Filtrado_${period}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  }

  const isDateInRange = (dateStr) => {
    const [d, m, y] = dateStr.split('/').map(Number);
    const date = new Date(y, m - 1, d);
    const now = new Date(2026, 3, 11);

    switch (period) {
      case 'today': return date.toDateString() === now.toDateString();
      case 'week': {
        const start = new Date(now); start.setDate(now.getDate() - now.getDay());
        return date >= start && date <= now;
      }
      case 'month': return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
      case 'lastMonth': {
        const last = new Date(now); last.setMonth(now.getMonth() - 1);
        return date.getMonth() === last.getMonth() && date.getFullYear() === last.getFullYear();
      }
      case 'year': return date.getFullYear() === now.getFullYear();
      case 'lastYear': return date.getFullYear() === now.getFullYear() - 1;
      case 'custom': {
        if (!customRange.start || !customRange.end) return true;
        const s = new Date(customRange.start); const e = new Date(customRange.end);
        return date >= s && date <= e;
      }
      default: return true;
    }
  };

  const filteredOperations = operations.filter(o => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return isDateInRange(o.date);

    const matchesBuyer = (o.buyer || '').toLowerCase().includes(query);
    const matchesVehicles = (o.vehicles || []).some(v => 
      (v.chapa || '').toLowerCase().includes(query) || 
      (v.chasis || '').toLowerCase().includes(query) || 
      (v.description || '').toLowerCase().includes(query)
    );
    
    // Also search in general operation fields like currency or payment type
    const matchesGeneral = (o.currency || '').toLowerCase().includes(query) || 
                           (o.payment_type || '').toLowerCase().includes(query);

    return (matchesBuyer || matchesVehicles || matchesGeneral) && isDateInRange(o.date);
  });

  return (
    <div className="app-container">
      {/* Sidebar - Same as before */}
      <aside className="sidebar">
        <div className="logo-section">
          <Car size={32} color="var(--primary)" />
          <h2 style={{ color: 'white', marginTop: '12px' }}>VTS Pro</h2>
        </div>
        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button className={`btn ${activeTab === 'operations' ? 'btn-primary' : 'btn-outline'}`} onClick={() => { setActiveTab('operations'); setSelectedTraceability(null); }} style={{ width: '100%', justifyContent: 'flex-start' }}><ArrowLeftRight size={20} /> Operaciones</button>
          <button className={`btn ${activeTab === 'tree' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab('tree')} style={{ width: '100%', justifyContent: 'flex-start' }}><GitBranch size={20} /> Trazabilidad</button>
          <button className={`btn ${activeTab === 'stats' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab('stats')} style={{ width: '100%', justifyContent: 'flex-start' }}><BarChart3 size={20} /> Estadísticas</button>
        </nav>
        <div className="sidebar-footer">
          <div className="card glass" style={{ padding: '12px', fontSize: '12px', marginBottom: '16px' }}><div style={{ color: 'var(--text-muted)' }}>Status</div><div style={{ color: '#10b981', fontWeight: 'bold' }}>● Sistema Online</div></div>
          <button className="btn btn-outline" style={{ width: '100%', justifyContent: 'flex-start' }}><Settings size={20} /> Configuración</button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '48px' }}>
          <div className="animate-in">
            <h1>{activeTab === 'operations' ? 'Operaciones' : activeTab === 'tree' ? 'Trazabilidad' : 'Analítica'}</h1>
            <h2 style={{ color: 'var(--text-muted)' }}>{activeTab === 'operations' ? 'Gestión de transacciones' : activeTab === 'tree' ? 'Cadena de valor comercial' : 'KPIs Financieros Globales'}</h2>
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div className="glass" style={{ display: 'flex', alignItems: 'center', padding: '0 16px', gap: '8px', height: '44px' }}>
              <Search size={18} color="var(--text-muted)" />
              <input type="text" placeholder="Buscar..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ background: 'none', border: 'none', marginBottom: 0, paddingLeft: 0, width: '140px' }} />
            </div>
            <div className="glass" style={{ display: 'flex', alignItems: 'center', padding: '0 12px', gap: '8px', height: '44px' }}>
              <Filter size={18} color="var(--text-muted)" />
              <select value={period} onChange={(e) => setPeriod(e.target.value)} style={{ background: 'none', border: 'none', color: 'white', outline: 'none', cursor: 'pointer', fontSize: '13px', width: '160px', appearance: 'none', paddingRight: '20px' }}>
                <option value="all" style={{ background: '#1a1b23' }}>Todo el tiempo</option>
                <option value="today" style={{ background: '#1a1b23' }}>Hoy</option>
                <option value="week" style={{ background: '#1a1b23' }}>Esta Semana</option>
                <option value="month" style={{ background: '#1a1b23' }}>Este Mes</option>
                <option value="lastMonth" style={{ background: '#1a1b23' }}>Mes Anterior</option>
                <option value="year" style={{ background: '#1a1b23' }}>Este Año</option>
                <option value="lastYear" style={{ background: '#1a1b23' }}>Año Anterior</option>
                <option value="custom" style={{ background: '#1a1b23' }}>Personalizado</option>
              </select>
            </div>
            {period === 'custom' && (
              <div className="glass animate-in" style={{ display: 'flex', alignItems: 'center', padding: '0 12px', gap: '8px', height: '44px' }}>
                <input 
                  type="date" 
                  value={customRange.start} 
                  onChange={(e) => setCustomRange({ ...customRange, start: e.target.value })} 
                  style={{ background: 'none', border: 'none', color: 'white', fontSize: '12px', width: '120px', marginBottom: 0 }} 
                />
                <span style={{ color: 'var(--text-muted)' }}>al</span>
                <input 
                  type="date" 
                  value={customRange.end} 
                  onChange={(e) => setCustomRange({ ...customRange, end: e.target.value })} 
                  style={{ background: 'none', border: 'none', color: 'white', fontSize: '12px', width: '120px', marginBottom: 0 }} 
                />
              </div>
            )}
            <button className="btn btn-outline" onClick={exportToExcel} style={{ height: '44px' }}><Download size={18} /></button>
            <button className="btn btn-primary" onClick={() => { setPreFilledData(null); setShowModal(true); }} style={{ height: '44px' }}><Plus size={18} /> Nuevo</button>
          </div>
        </header>

        {(searchQuery || period !== 'all') && (
          <div className="animate-in" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Filtros activos:</span>
            {searchQuery && (
              <div className="glass" style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', border: '1px solid var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Search size={12} color="var(--primary)" />
                <span>Búsqueda: <b>{searchQuery}</b></span>
                <X size={14} style={{ cursor: 'pointer' }} onClick={() => setSearchQuery('')} />
              </div>
            )}
            {period !== 'all' && (
              <div className="glass" style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', border: '1px solid var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CalendarIcon size={12} color="var(--primary)" />
                <span>Período: <b>{period === 'custom' ? `${customRange.start} / ${customRange.end}` : period.charAt(0).toUpperCase() + period.slice(1)}</b></span>
                <X size={14} style={{ cursor: 'pointer' }} onClick={() => setPeriod('all')} />
              </div>
            )}
            <span style={{ color: 'var(--primary)', fontSize: '13px', fontWeight: 'bold', marginLeft: 'auto' }}>
              {filteredOperations.length} resultados encontrados
            </span>
          </div>
        )}

        {activeTab === 'tree' && selectedTraceability && (
          <div className="animate-in" style={{ display: 'flex', gap: '24px', marginBottom: '32px' }}>
            <div className="card glass" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '12px', borderRadius: '12px' }}>
                <Package color="#3b82f6" size={24} />
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Inversión Inicial (Costo)</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#3b82f6' }}>USD {stats.totalInvestment.toLocaleString()}</div>
              </div>
            </div>

            <div className="card glass" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div style={{ background: stats.totalProfit > 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', padding: '12px', borderRadius: '12px' }}>
                <TrendingUp color={stats.totalProfit > 0 ? '#10b981' : '#ef4444'} size={24} />
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Ganancia Estimada</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: stats.totalProfit > 0 ? '#10b981' : '#ef4444' }}>USD {stats.totalProfit.toLocaleString()}</div>
              </div>
            </div>
            
            <div className="card glass" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div style={{ background: 'rgba(170, 59, 255, 0.1)', padding: '12px', borderRadius: '12px' }}>
                <Package color="var(--primary)" size={24} />
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Vehículos en el Árbol</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{stats.tradeInCount} unidades</div>
              </div>
            </div>
          </div>
        )}

        <section className="animate-in">
          {activeTab === 'operations' && <div className="card glass"><OperationsTable operations={filteredOperations} onSelectOperation={handleSelectOperation} /></div>}
          {activeTab === 'tree' && (
            <div className="card glass" style={{ padding: '0' }}>
               <div style={{ padding: '24px', borderBottom: '1px solid var(--border)' }}>
                 <h3 style={{ color: 'white' }}>Diagrama de Flujo Comercial</h3>
                 <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Hacé click en el (+) de un nodo para abrir una nueva rama de la operación.</p>
               </div>
               <TreeView 
                 data={selectedTraceability} 
                 onAddBranch={handleOpenBranchModal} 
                 highlightedId={highlightedId}
               />
            </div>
          )}
          {activeTab === 'stats' && <StatsDashboard />}
        </section>
      </main>

      {/* Register Modal */}
      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(8px)' }}>
          <div className="glass card animate-in" style={{ width: '600px', padding: '32px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h2 style={{ color: 'white' }}>{preFilledData ? 'Nueva Rama Comercial' : 'Nueva Operación'}</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'white' }}><X size={24} /></button>
            </div>

            <form onSubmit={handleAddOperation}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div><label>Tipo</label><select name="type"><option>Venta</option><option>Compra</option></select></div>
                <div><label>Pago</label><select name="payment"><option>Crédito</option><option>Contado</option></select></div>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div><label>Fecha</label><input name="date" type="date" defaultValue={new Date().toISOString().split('T')[0]} /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div><label>Chapa</label><input name="chapa" defaultValue={preFilledData?.chapa || ''} /></div>
                  <div><label>Chasis</label><input name="chasis" defaultValue={preFilledData?.chasis || ''} /></div>
                </div>
              </div>

              <label>Descripción del Vehículo</label>
              <input name="description" defaultValue={preFilledData?.description || ''} />
              
              <label>Comprador / Vendedor</label>
              <input name="buyer" placeholder="Nombre completo" />

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginTop: '16px' }}>
                 <div><label>Entrega Contado</label><input name="delivery_amount" type="number" placeholder="0" /></div>
                 <div><label>Cuotas</label><input name="installments" type="number" placeholder="0" /></div>
                 <div><label>Monto Crédito</label><input name="credit_amount" type="number" placeholder="0" /></div>
              </div>

              <label style={{ marginTop: '16px' }}>Monto Total (Total Operación)</label>
              <input name="amount" type="number" placeholder="0.00" />
              
              <div style={{ marginTop: '24px', padding: '20px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed var(--border)' }}>
                <h4 style={{ color: 'white', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Package size={18} color="var(--primary)" />
                  Vehículo en Parte de Pago (Opcional)
                </h4>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '11px' }}>Descripción</label>
                  <input name="trade_in_description" placeholder="Ej: KIA PICANTO 2020" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ fontSize: '11px' }}>Chapa</label>
                    <input name="trade_in_chapa" placeholder="Chapa" />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px' }}>Chasis</label>
                    <input name="trade_in_chasis" placeholder="Chasis" />
                  </div>
                </div>
                <label style={{ fontSize: '11px' }}>Valuación del Vehículo</label>
                <input name="trade_in_valuation" type="number" placeholder="0.00" />
              </div>

              <div style={{ marginTop: '32px' }}>
                <button type="submit" className="btn btn-primary" style={{ width: '100%', height: '50px' }}>Finalizar y Vincular</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
