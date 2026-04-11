import { useState, useEffect, useMemo } from 'react'
import { 
  Car, 
  ArrowLeftRight, 
  GitBranch, 
  BarChart3, 
  Search, 
  Plus, 
  Download,
  Settings,
  Filter,
  Trash2,
  X,
  TrendingUp,
  Package,
  Calendar as CalendarIcon
} from 'lucide-react'
import './index.css'
import { db } from './services/db'
import { financials } from './services/financials'
import { OperationsTable } from './components/OperationsTable'
import { TreeView } from './components/TreeView'
import { StatsDashboard } from './components/StatsDashboard'
import { Auth } from './components/Auth'
import { supabase } from './services/db'
import * as XLSX from 'xlsx'
import { StockTable } from './components/StockTable'

function App() {
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('activeTab') || 'operations')
  const [selectedTraceability, setSelectedTraceability] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [stats, setStats] = useState({ totalProfit: 0, tradeInCount: 0 })
  const [searchQuery, setSearchQuery] = useState(() => localStorage.getItem('searchQuery') || '')
  const [period, setPeriod] = useState(() => localStorage.getItem('period') || 'all') 
  const [customRange, setCustomRange] = useState({ start: '', end: '' })
  const [operations, setOperations] = useState([])
  const [preFilledData, setPreFilledData] = useState(null)
  const [highlightedId, setHighlightedId] = useState(() => localStorage.getItem('highlightedId') || null)
  const [isTreeLoading, setIsTreeLoading] = useState(false)
  const [session, setSession] = useState(null)
  const [editingOperation, setEditingOperation] = useState(null)

  const stockVehicles = useMemo(() => {
    const entries = [];
    const exits = new Set();

    operations.forEach(op => {
      const isVenta = op.operation_type.toLowerCase() === 'venta';
      const isCompra = op.operation_type.toLowerCase() === 'compra';
      const isRescision = op.operation_type.toLowerCase() === 'rescisión';

      // 1. Record Exits (Principal vehicle of a Venta OR Trade-in of a Compra)
      op.vehicles.forEach(v => {
        const isPrincipalExit = isVenta && v.role === 'principal';
        const isTradeInExit = isCompra && v.role === 'parte_pago';
        
        if (isPrincipalExit || isTradeInExit) {
          const id = (v.chasis || v.chapa || '').trim().toUpperCase();
          if (id) exits.add(id);
        }
      });

      // 2. Record Entries (Principal of a Compra OR Trade-in of a Venta)
      op.vehicles.forEach(v => {
        const isPrincipalEntry = (isCompra || isRescision) && v.role === 'principal';
        const isTradeInEntry = isVenta && v.role === 'parte_pago';
        
        if (isPrincipalEntry || isTradeInEntry) {
          entries.push({
            description: v.description,
            chapa: v.chapa,
            chasis: v.chasis,
            valuation: v.role === 'principal' ? op.total_amount : (v.valuation || 0),
            entry_date: op.date,
            source_type: isPrincipalEntry ? (isRescision ? 'RESCISIÓN' : 'COMPRA') : 'PARTE PAGO RECIBIDO',
            operation_id: op.id
          });
        }
      });
    });

    // 3. Filter out entries that have a corresponding exit
    return entries.filter(entry => {
      const entryId = (entry.chasis || entry.chapa || '').trim().toUpperCase();
      if (!entryId) return true;
      return !exits.has(entryId);
    });
  }, [operations]);
  const [tradeInVehicles, setTradeInVehicles] = useState([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const loadOps = async () => {
      const data = await db.getOperations();
      setOperations(data);
    };
    loadOps();
    return db.subscribe(loadOps);
  }, [])
  
  // Prevent number input value changes on scroll globally
  useEffect(() => {
    const handleWheel = (e) => {
      if (document.activeElement.type === 'number') {
        e.preventDefault();
      }
    };
    document.addEventListener('wheel', handleWheel, { passive: false });
    return () => document.removeEventListener('wheel', handleWheel);
  }, []);

  // Persist basic state
  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
    localStorage.setItem('searchQuery', searchQuery);
    localStorage.setItem('period', period);
    if (highlightedId) localStorage.setItem('highlightedId', highlightedId);
    else localStorage.removeItem('highlightedId');
  }, [activeTab, searchQuery, period, highlightedId]);

  // Restore traceability if there was a highlighted vehicle
  useEffect(() => {
    if (activeTab === 'tree' && highlightedId && operations.length > 0 && !selectedTraceability && !isTreeLoading) {
      // Find a vehicle from any operation that matches the highlightedId (which we use as vehicle identifier)
      // Actually, handleSelectOperation expects the operation object.
      const op = operations.find(o => o.id === highlightedId || o.vehicles.some(v => v.chasis === highlightedId || v.chapa === highlightedId));
      if (op) {
        handleSelectOperation(op);
      }
    }
  }, [operations, activeTab]);

  const handleSelectOperation = async (op) => {
    const vehicleId = op.vehicles[0]?.chasis || op.vehicles[0]?.chapa || op.vehicles[0]?.id || op.vehicles[0]?.identifier;
    if (vehicleId) {
      setHighlightedId(op.id);
      setActiveTab('tree');
      setIsTreeLoading(true);
      
      try {
        const trace = await db.getVehicleTraceability(vehicleId);
        setSelectedTraceability(trace);
        setStats(financials.getTreeStats(trace));
      } catch (err) {
        console.error("Error loading tree:", err);
      } finally {
        setIsTreeLoading(false);
      }
    }
  }

  const handleOpenBranchModal = (vehicleInfo) => {
    setPreFilledData({
      description: vehicleInfo.description,
      chapa: vehicleInfo.chapa,
      chasis: vehicleInfo.chasis,
      parentId: vehicleInfo.operation_id,
      type: 'Venta' // Default to sale for branches
    });
    setEditingOperation(null);
    setTradeInVehicles([]);
    setShowModal(true);
  }

  const handleEditOperation = (op) => {
    setEditingOperation(op);
    let dateInput = op.date;
    if (op.date.includes('/')) {
      dateInput = op.date.split('/').reverse().join('-');
    } else if (op.date.includes('-') && op.date.split('-')[0].length === 2) {
      // Handle cases like DD-MM-YYYY if they exist
      dateInput = op.date.split('-').reverse().join('-');
    }
    // ensure leading zeros for HTML date input (YYYY-MM-DD)
    if (dateInput.match(/^\d{4}-\d{1,2}-\d{1,2}$/)) {
      const parts = dateInput.split('-');
      dateInput = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
    setPreFilledData({
       id: op.id,
       type: op.operation_type.charAt(0).toUpperCase() + op.operation_type.slice(1),
       payment: op.payment_type.charAt(0).toUpperCase() + op.payment_type.slice(1),
       date: dateInput,
       buyer: op.buyer,
       amount: op.total_amount,
       delivery_amount: op.delivery_amount,
       installments: op.installments,
       credit_amount: op.credit_amount,
       description: op.vehicles?.find(v => v.role === 'principal')?.description || '',
       chapa: op.vehicles?.find(v => v.role === 'principal')?.chapa || '',
       chasis: op.vehicles?.find(v => v.role === 'principal')?.chasis || '',
    });
    setTradeInVehicles(op.vehicles?.filter(v => v.role === 'parte_pago').map(v => ({
      description: v.description,
      chapa: v.chapa,
      chasis: v.chasis,
      valuation: v.valuation
    })) || []);
    setShowModal(true);
  }

  const handleAddTradeIn = () => {
    setTradeInVehicles([...tradeInVehicles, { description: '', chapa: '', chasis: '', valuation: 0 }]);
  }

  const handleRemoveTradeIn = (index) => {
    setTradeInVehicles(tradeInVehicles.filter((_, i) => i !== index));
  }

  const handleTradeInChange = (index, field, value) => {
    const updated = [...tradeInVehicles];
    updated[index][field] = value;
    setTradeInVehicles(updated);
  }

  const handleSaveOperation = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    const vehiclesData = [{ 
      chapa: formData.get('chapa'),
      chasis: formData.get('chasis'),
      description: formData.get('description'), 
      role: 'principal' 
    }];

    tradeInVehicles.forEach(v => {
      if (v.description) {
        vehiclesData.push({
          chapa: v.chapa,
          chasis: v.chasis,
          description: v.description,
          role: 'parte_pago',
          valuation: Number(v.valuation || 0)
        });
      }
    });

    const opData = {
      user_id: session.user.id,
      operation_type: formData.get('type').toLowerCase(),
      payment_type: formData.get('payment').toLowerCase(),
      date: (() => {
        const dateVal = formData.get('date');
        if (!dateVal) return new Date().toLocaleDateString('es-PY');
        const [y, m, d] = dateVal.split('-');
        return `${d}/${m}/${y}`;
      })(), 
      currency: 'USD',
      total_amount: Number(formData.get('amount')),
      buyer: formData.get('buyer'),
      delivery_amount: Number(formData.get('delivery_amount') || 0),
      installments: Number(formData.get('installments') || 0),
      credit_amount: Number(formData.get('credit_amount') || 0),
      vehicles: vehiclesData,
      parentId: editingOperation?.parentId || preFilledData?.parentId
    };

    try {
      let savedOp = null;
      if (editingOperation) {
        savedOp = await db.updateOperation(editingOperation.id, opData);
      } else {
        savedOp = await db.addOperation(opData);
      }

      setShowModal(false);
      setEditingOperation(null);
      setPreFilledData(null);
      setTradeInVehicles([]);
      
      // Always navigate to the tree view for the saved operation
      handleSelectOperation({ ...opData, id: savedOp?.id || editingOperation?.id });
    } catch (err) {
      console.error("Error al guardar operación:", err);
      alert("Error al guardar: " + (err.message || "Error desconocido"));
    }
  }

  const handleDeleteOperation = async (op) => {
    if (window.confirm(`¿Estás seguro de eliminar esta operación del ${op.date}? Se borrarán también los vehículos asociados.`)) {
      try {
        await db.deleteOperation(op.id);
        // Local refresh is handled via subscription in useEffect
      } catch (err) {
        alert('Error al eliminar: ' + err.message);
      }
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
        const principal = lineageOp.vehicles?.find(v => v.role === 'principal');
        const tradeIns = lineageOp.vehicles?.filter(v => v.role === 'parte_pago') || [];

        exportData.push({
          'ID Cadena': root.id,
          'Fecha': lineageOp.date,
          'Operacion': lineageOp.operation_type.toUpperCase(),
          'Comprador/Vendedor': lineageOp.buyer,
          'Vehículo Principal': principal?.description || 'N/A',
          'Chapa': principal?.chapa || 'N/A',
          'Chasis': principal?.chasis || 'N/A',
          'Parte de Pago': tradeIns.map(v => `${v.description} (${v.chapa || 'S/C'})`).join(' | '),
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
      {wch: 12}, {wch: 12}, {wch: 15}, {wch: 30}, {wch: 30}, {wch: 15}, {wch: 25}, {wch: 40}, {wch: 15}, {wch: 22}, {wch: 15}, {wch: 15}
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

  if (!session) {
    return <Auth onSession={setSession} />;
  }

  return (
    <div className="app-container">
      {/* Sidebar - Same as before */}
      <aside className="sidebar">
        <div className="logo-section">
          <Car size={32} color="var(--primary)" />
          <h2 style={{ color: 'white', marginTop: '12px', letterSpacing: '1px' }}>MH</h2>
        </div>
        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button className={`btn ${activeTab === 'operations' ? 'btn-primary' : 'btn-outline'}`} onClick={() => { setActiveTab('operations'); setSelectedTraceability(null); }} style={{ width: '100%', justifyContent: 'flex-start' }}><ArrowLeftRight size={20} /> Operaciones</button>
          <button className={`btn ${activeTab === 'stock' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab('stock')} style={{ width: '100%', justifyContent: 'flex-start' }}><Package size={20} /> Stock</button>
          <button className={`btn ${activeTab === 'tree' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab('tree')} style={{ width: '100%', justifyContent: 'flex-start' }}><GitBranch size={20} /> Trazabilidad</button>
          <button className={`btn ${activeTab === 'stats' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab('stats')} style={{ width: '100%', justifyContent: 'flex-start' }}><BarChart3 size={20} /> Estadísticas</button>
        </nav>
        <div className="sidebar-footer">
          <div className="card glass" style={{ padding: '12px', fontSize: '12px', marginBottom: '16px' }}>
            <div style={{ color: 'var(--text-muted)' }}>Usuario</div>
            <div style={{ color: 'var(--primary)', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis' }}>{session?.user?.email}</div>
          </div>
          <button className="btn btn-outline" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => supabase.auth.signOut()}>
            <X size={20} /> Salir del Sistema
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '48px' }}>
          <div className="animate-in">
            <h1>{activeTab === 'operations' ? 'Operaciones' : activeTab === 'stock' ? 'Inventario' : activeTab === 'tree' ? 'Trazabilidad' : 'Analítica'}</h1>
            <h2 style={{ color: 'var(--text-muted)' }}>{activeTab === 'operations' ? 'Gestión de transacciones' : activeTab === 'stock' ? 'Vehículos disponibles para venta' : activeTab === 'tree' ? 'Cadena de valor comercial' : 'KPIs Financieros Globales'}</h2>
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
            <button className="btn btn-primary" onClick={() => { setPreFilledData(null); setEditingOperation(null); setTradeInVehicles([]); setShowModal(true); }} style={{ height: '44px' }}><Plus size={18} /> Nuevo</button>
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

        {activeTab === 'tree' && (selectedTraceability || isTreeLoading) && (
          <div className="animate-in" style={{ display: 'flex', gap: '24px', marginBottom: '32px' }}>
            <div className="card glass" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '12px', borderRadius: '12px' }}>
                <Package color="#3b82f6" size={24} />
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Inversión Inicial (Costo)</div>
                {isTreeLoading ? (
                  <div className="skeleton" style={{ height: '28px', width: '120px', marginTop: '4px' }}></div>
                ) : (
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#3b82f6' }}>USD {stats.totalInvestment.toLocaleString()}</div>
                )}
              </div>
            </div>

            <div className="card glass" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div style={{ background: stats.totalProfit > 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', padding: '12px', borderRadius: '12px' }}>
                <TrendingUp color={stats.totalProfit > 0 ? '#10b981' : '#ef4444'} size={24} />
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Ganancia Estimada</div>
                {isTreeLoading ? (
                  <div className="skeleton" style={{ height: '28px', width: '120px', marginTop: '4px' }}></div>
                ) : (
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: stats.totalProfit > 0 ? '#10b981' : '#ef4444' }}>USD {stats.totalProfit.toLocaleString()}</div>
                )}
              </div>
            </div>
            
            <div className="card glass" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div style={{ background: 'rgba(170, 59, 255, 0.1)', padding: '12px', borderRadius: '12px' }}>
                <Package color="var(--primary)" size={24} />
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Vehículos en el Árbol</div>
                {isTreeLoading ? (
                  <div className="skeleton" style={{ height: '28px', width: '120px', marginTop: '4px' }}></div>
                ) : (
                  <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{stats.tradeInCount} unidades</div>
                )}
              </div>
            </div>

            <div className="card glass" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '12px', borderRadius: '12px' }}>
                <Package color="#3b82f6" size={24} />
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Total en Stock</div>
                {isTreeLoading ? (
                  <div className="skeleton" style={{ height: '28px', width: '120px', marginTop: '4px' }}></div>
                ) : (
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#3b82f6' }}>{stockVehicles.length} unidades</div>
                )}
              </div>
            </div>
          </div>
        )}

        <section className="animate-in">
          {activeTab === 'operations' && (
            <div className="card glass">
              <OperationsTable 
                operations={filteredOperations} 
                onSelectOperation={handleSelectOperation} 
                onDeleteOperation={handleDeleteOperation}
                onEditOperation={handleEditOperation}
              />
            </div>
          )}
          {activeTab === 'stock' && (
            <div className="card glass">
              <StockTable 
                stock={stockVehicles} 
                onSellVehicle={handleOpenBranchModal} 
              />
            </div>
          )}
          {activeTab === 'tree' && (
            <div className="card glass" style={{ padding: '0' }}>
               <div style={{ padding: '24px', borderBottom: '1px solid var(--border)' }}>
                 <h3 style={{ color: 'white' }}>Diagrama de Flujo Comercial</h3>
                 <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Hacé click en el (+) de un nodo para abrir una nueva rama de la operación.</p>
               </div>
               <TreeView 
                 data={selectedTraceability} 
                 onAddBranch={handleOpenBranchModal} 
                 onEditOperation={handleEditOperation}
                 onDeleteOperation={handleDeleteOperation}
                 highlightedId={highlightedId}
                 isLoading={isTreeLoading}
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
              <h2 style={{ color: 'white' }}>{editingOperation ? 'Editar Registro' : preFilledData ? 'Nueva Rama Comercial' : 'Nueva Operación'}</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'white' }}><X size={24} /></button>
            </div>

            <form onSubmit={handleSaveOperation}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div><label>Tipo</label><select name="type" required defaultValue={preFilledData?.type || 'Venta'}><option value="">Seleccionar...</option><option value="Venta">Venta</option><option value="Compra">Compra</option><option value="Rescisión">Rescisión</option></select></div>
                <div><label>Pago</label><select name="payment" required defaultValue={preFilledData?.payment || 'Contado'}><option value="">Seleccionar...</option><option value="Crédito">Crédito</option><option value="Contado">Contado</option></select></div>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div><label>Fecha</label><input name="date" type="date" required defaultValue={preFilledData?.date || new Date().toISOString().split('T')[0]} /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div><label>Chapa</label><input name="chapa" defaultValue={preFilledData?.chapa || ''} /></div>
                  <div><label>Chasis</label><input name="chasis" defaultValue={preFilledData?.chasis || ''} /></div>
                </div>
              </div>

              <label>Descripción del Vehículo</label>
              <input name="description" defaultValue={preFilledData?.description || ''} />
              
              <label>Comprador / Vendedor</label>
              <input name="buyer" defaultValue={preFilledData?.buyer || ''} placeholder="Nombre completo" />

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginTop: '16px' }}>
                 <div><label>Entrega Contado</label><input name="delivery_amount" type="number" defaultValue={preFilledData?.delivery_amount || 0} placeholder="0" /></div>
                 <div><label>Cuotas</label><input name="installments" type="number" defaultValue={preFilledData?.installments || 0} placeholder="0" /></div>
                 <div><label>Monto Crédito</label><input name="credit_amount" type="number" defaultValue={preFilledData?.credit_amount || 0} placeholder="0" /></div>
              </div>

              <label style={{ marginTop: '16px' }}>Monto Total (Total Operación)</label>
              <input name="amount" type="number" defaultValue={preFilledData?.amount || 0} placeholder="0.00" />
              
              <div style={{ marginTop: '24px', padding: '20px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h4 style={{ color: 'white', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                    <Package size={18} color="var(--primary)" />
                    Vehículos en Parte de Pago
                  </h4>
                  <button type="button" className="btn btn-outline" onClick={handleAddTradeIn} style={{ padding: '4px 12px', fontSize: '11px' }}>
                    <Plus size={14} /> Agregar
                  </button>
                </div>

                {tradeInVehicles.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>
                    No hay vehículos adicionales cargados.
                  </div>
                )}

                {tradeInVehicles.map((v, index) => (
                  <div key={index} style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '8px', marginBottom: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--primary)' }}>Vehículo #{index + 1}</span>
                      <button type="button" onClick={() => handleRemoveTradeIn(index)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={16} /></button>
                    </div>
                    <div style={{ marginBottom: '8px' }}>
                      <label style={{ fontSize: '11px' }}>Descripción</label>
                      <input value={v.description} onChange={(e) => handleTradeInChange(index, 'description', e.target.value)} placeholder="Ej: KIA PICANTO 2020" />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '8px' }}>
                      <div>
                        <label style={{ fontSize: '11px' }}>Chapa</label>
                        <input value={v.chapa} onChange={(e) => handleTradeInChange(index, 'chapa', e.target.value)} placeholder="Chapa" />
                      </div>
                      <div>
                        <label style={{ fontSize: '11px' }}>Chasis</label>
                        <input value={v.chasis} onChange={(e) => handleTradeInChange(index, 'chasis', e.target.value)} placeholder="Chasis" />
                      </div>
                    </div>
                    <label style={{ fontSize: '11px' }}>Valuación</label>
                    <input type="number" value={v.valuation} onChange={(e) => handleTradeInChange(index, 'valuation', e.target.value)} placeholder="0.00" />
                  </div>
                ))}
              </div>

              <div style={{ marginTop: '32px' }}>
                <button type="submit" className="btn btn-primary" style={{ width: '100%', height: '50px' }}>
                  {editingOperation ? 'Guardar Cambios' : 'Finalizar y Vincular'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
