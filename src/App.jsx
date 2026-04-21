import React, { useState, useEffect, useMemo } from 'react'
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
  Calendar as CalendarIcon,
  LogOut,
  Users,
  Shield,
  Menu
} from 'lucide-react'
import './index.css'
import { db } from './services/db'
import { financials } from './services/financials'
import { OperationsTable } from './components/OperationsTable'
import { TreeView } from './components/TreeView'
import { StatsDashboard } from './components/StatsDashboard'
import { Auth } from './components/Auth'
import { UserManagement } from './components/UserManagement'
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
  const [userProfile, setUserProfile] = useState(null)
  const [editingOperation, setEditingOperation] = useState(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  
  // Money formatting helpers
  const formatMoney = (val) => {
    if (val === null || val === undefined || val === '') return '';
    const stringVal = val.toString().replace(/\D/g, '');
    return stringVal.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  };

  const parseMoney = (val) => {
    if (!val) return 0;
    return Number(val.toString().replace(/\./g, '')) || 0;
  };

  const stockVehicles = useMemo(() => {
    const entryMap = new Map(); // identifier -> entry data[]
    const exitCounts = new Map(); // identifier -> count

    operations.forEach(op => {
      const type = (op.operation_type || '').toLowerCase();
      const isVenta = type === 'venta';
      const isCompra = type === 'compra';
      const isRescision = type === 'rescisión';

      // Record Exits
      op.vehicles?.forEach(v => {
        if (!v) return;
        const isPrincipalExit = isVenta && v.role === 'principal';
        const isTradeInExit = isCompra && v.role === 'parte_pago';
        
        if (isPrincipalExit || isTradeInExit) {
          const id = (v.chasis || v.chapa || '').trim().toUpperCase();
          if (id) {
            exitCounts.set(id, (exitCounts.get(id) || 0) + 1);
          }
        }
      });

      // Record Entries
      op.vehicles?.forEach(v => {
        if (!v) return;
        const isPrincipalEntry = (isCompra || isRescision) && v.role === 'principal';
        const isTradeInEntry = isVenta && v.role === 'parte_pago';
        
        if (isPrincipalEntry || isTradeInEntry) {
          const id = (v.chasis || v.chapa || '').trim().toUpperCase();
          if (id) {
            if (!entryMap.has(id)) entryMap.set(id, []);
            entryMap.get(id).push({
              description: v.description,
              chapa: v.chapa,
              chasis: v.chasis,
              valuation: v.role === 'principal' ? (op.total_amount || 0) : (v.valuation || 0),
              entry_date: op.date,
              source_type: isPrincipalEntry ? (isRescision ? 'RESCISIÓN' : 'COMPRA') : 'PARTE PAGO RECIBIDO',
              operation_id: op.id
            });
          }
        }
      });
    });

    const activeStock = [];
    entryMap.forEach((entries, id) => {
      const exits = exitCounts.get(id) || 0;
      // If we have more entries than exits, the REMAINING ones are in stock
      // Typically the most recent ones.
      if (entries.length > exits) {
        // We take the difference
        const countInStock = entries.length - exits;
        // Add the last 'n' entries back to stock
        const remaining = entries.slice(-countInStock);
        activeStock.push(...remaining);
      }
    });

    return activeStock;
  }, [operations]);
  const [tradeInVehicles, setTradeInVehicles] = useState([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        db.getProfile(session.user.id).then(profile => setUserProfile(profile));
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        db.getProfile(session.user.id).then(profile => setUserProfile(profile));
      } else {
        setUserProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const loadAll = async () => {
      // Load operations
      const data = await db.getOperations();
      setOperations(data);
      
      // Reload profile if we have a session (to handle permission changes)
      if (session?.user) {
        const profile = await db.getProfile(session.user.id);
        setUserProfile(profile);
      }
    };
    loadAll();
    return db.subscribe(loadAll);
  }, [session])
  
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
    setIsMenuOpen(false); // Close menu on tab change
  }, [activeTab, searchQuery, period, highlightedId]);

  // Restore/Refresh traceability if there was a highlighted vehicle or operations change
  useEffect(() => {
    const refreshTree = async () => {
      if (activeTab === 'tree' && highlightedId && operations.length > 0) {
        // Find a vehicle from any operation that matches the highlightedId
        const op = operations.find(o => o.id === highlightedId || o.vehicles.some(v => v.chasis === highlightedId || v.chapa === highlightedId));
        if (op) {
          const vehicleId = op.vehicles[0]?.chasis || op.vehicles[0]?.chapa || op.vehicles[0]?.id;
          if (vehicleId) {
            const trace = await db.getVehicleTraceability(vehicleId, operations);
            setSelectedTraceability(trace);
            setStats(financials.getTreeStats(trace));
          }
        }
      }
    };
    refreshTree();
  }, [operations, activeTab, highlightedId]);

  const handleSelectOperation = async (op) => {
    const vehicleId = op.vehicles[0]?.chasis || op.vehicles[0]?.chapa || op.vehicles[0]?.id || op.vehicles[0]?.identifier;
    if (vehicleId) {
      setHighlightedId(op.id);
      setActiveTab('tree');
      setIsTreeLoading(true);
      
      try {
        const trace = await db.getVehicleTraceability(vehicleId, operations);
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
      operation_id: vehicleInfo.operation_id,
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
    setTradeInVehicles((op.vehicles || [])
        .filter(v => v.role === 'parte_pago')
        .map(v => ({ ...v, valuation: formatMoney(v.valuation) }))
      );
    setShowModal(true);
  }

  const handleAddTradeIn = () => {
    setTradeInVehicles([...tradeInVehicles, { description: '', chapa: '', chasis: '', valuation: '' }]);
  }

  const handleRemoveTradeIn = (index) => {
    setTradeInVehicles(tradeInVehicles.filter((_, i) => i !== index));
  }

  const handleTradeInChange = (index, field, value) => {
    const newTradeIns = [...tradeInVehicles];
    if (field === 'valuation') {
      newTradeIns[index][field] = formatMoney(value);
    } else {
      newTradeIns[index][field] = value;
    }
    setTradeInVehicles(newTradeIns);
  }

  const handleSaveOperation = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    const dateVal = formData.get('date');
    const opData = {
      user_id: session.user.id,
      operation_type: formData.get('type').toLowerCase(),
      payment_type: formData.get('payment').toLowerCase(),
      date: (() => {
        const dVal = formData.get('date');
        if (!dVal) return new Date().toLocaleDateString('es-PY');
        const [y, m, d] = dVal.split('-');
        return `${d}/${m}/${y}`;
      })(), 
      currency: formData.get('currency') || 'USD',
      total_amount: parseMoney(formData.get('amount')),
      buyer: formData.get('buyer'),
      delivery_amount: parseMoney(formData.get('delivery_amount')),
      installments: Number(formData.get('installments')) || 0,
      credit_amount: parseMoney(formData.get('credit_amount')),
      parentId: preFilledData?.operation_id || editingOperation?.parentId || null,
      vehicles: [
        {
          chapa: formData.get('chapa'),
          chasis: formData.get('chasis'),
          description: formData.get('description'),
          role: 'principal'
        },
        ...tradeInVehicles.map(v => ({
          ...v,
          role: 'parte_pago',
          valuation: parseMoney(v.valuation)
        }))
      ]
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
    try {
      const targetOps = filteredOperations;
      const processedIds = new Set();
      const exportData = [];
      const getVehId = (v) => (v && (v.chasis || v.chapa || '').trim().toUpperCase()) || '';
      const parseDate = (d) => {
        if (!d) return new Date(0);
        const parts = d.toString().split(/[-/]/).map(Number);
        if (parts.length === 3) {
          // YYYY-MM-DD
          if (parts[0] > 1000) return new Date(parts[0], parts[1] - 1, parts[2]);
          // DD-MM-YYYY
          return new Date(parts[2], parts[1] - 1, parts[0]);
        }
        const parsed = new Date(d);
        return isNaN(parsed.getTime()) ? new Date(0) : parsed;
      };

      targetOps.forEach(op => {
        if (processedIds.has(op.id)) return;

        const chainOps = new Set();
        const toCheck = [op.id];
        
        while (toCheck.length > 0) {
          const currentId = toCheck.pop();
          if (chainOps.has(currentId)) continue;
          const currentOp = operations.find(o => o.id === currentId);
          if (!currentOp) continue;
          
          chainOps.add(currentId);
          if (currentOp.parentId && !chainOps.has(currentOp.parentId)) toCheck.push(currentOp.parentId);
          operations.filter(o => o.parentId === currentId && !chainOps.has(o.id)).forEach(o => toCheck.push(o.id));
          
          const principal = (currentOp.vehicles || []).find(v => v.role === 'principal');
          const pId = getVehId(principal);
          if (pId) {
            operations.filter(o => !chainOps.has(o.id) && (o.vehicles || []).some(v => getVehId(v) === pId)).forEach(o => toCheck.push(o.id));
          }
          (currentOp.vehicles || []).filter(v => v.role === 'parte_pago').forEach(t => {
            const tId = getVehId(t);
            if (tId) {
              operations.filter(o => !chainOps.has(o.id) && (o.vehicles || []).some(v => getVehId(v) === tId)).forEach(o => toCheck.push(o.id));
            }
          });
        }

        const fullChain = Array.from(chainOps).map(id => operations.find(o => o.id === id));
        
        const roots = fullChain.filter(o => {
            // 1. Explicit parent in chain?
            if (o.parentId && fullChain.some(p => p.id === o.parentId)) return false;
            
            const princ = (o.vehicles || []).find(v => v.role === 'principal');
            const pId = getVehId(princ);
            
            // 2. Was its principal vehicle a trade-in of another op in this chain?
            // (Trade-in -> Purchase link means Purchase is not root)
            const isTradeInOfOther = fullChain.some(other => 
              other.id !== o.id && (other.vehicles || []).some(v => v.role === 'parte_pago' && getVehId(v) === pId)
            );
            if (isTradeInOfOther) return false;

            // 3. Business Priority: A VENTA is NEVER a root if there's a COMPRA of the same car
            if (o.operation_type.toLowerCase() === 'venta' && pId) {
              const hasCompraInChain = fullChain.some(other => 
                other.operation_type.toLowerCase() === 'compra' && 
                (other.vehicles || []).some(v => v.role === 'principal' && getVehId(v) === pId)
              );
              if (hasCompraInChain) return false;
            }
            
            // 4. If multiple COMPRAs of same car, keep earliest
            if (o.operation_type.toLowerCase() === 'compra' && pId) {
              const earlierCompra = fullChain.some(other => 
                other.id !== o.id && 
                other.operation_type.toLowerCase() === 'compra' && 
                (other.vehicles || []).some(v => v.role === 'principal' && getVehId(v) === pId) &&
                parseDate(other.date) < parseDate(o.date)
              );
              if (earlierCompra) return false;
            }

            return true;
        });

        roots.sort((a, b) => parseDate(a.date) - parseDate(b.date));

        const pushToExport = (node, depth = 0) => {
          if (processedIds.has(node.id)) return;
          processedIds.add(node.id);

          const nodeType = node.operation_type.toLowerCase();
          const principal = node.vehicles?.find(v => v.role === 'principal');
          const pId = getVehId(principal);
          const tradeIns = node.vehicles?.filter(v => v.role === 'parte_pago') || [];
          const indent = depth > 0 ? ' '.repeat(depth * 3) + '↳ ' : '';

          exportData.push({
            'ID Cadena': roots[0]?.id.substring(0, 13) || node.id.substring(0, 13),
            'Fecha': node.date,
            'Operacion': node.operation_type.toUpperCase(),
            'Comprador/Vendedor': node.buyer,
            'Vehículo': indent + (principal?.description || 'N/A'),
            'Principal': node.total_amount,
            'Chapa': principal?.chapa || 'N/A',
            'Chasis': principal?.chasis || 'N/A',
            'Parte de Pago': tradeIns.reduce((sum, v) => sum + (v.valuation || 0), 0),
            'Vehículos en Parte de Pago': tradeIns.map(v => `${v.description} (CHAPA: ${v.chapa || 'S/C'})`).join(' | '),
            'su valor': node.total_amount,
            'Costo Inversión (Origen)': roots[0]?.total_amount || 0,
            'clasipar': '',
            'Marketplace': '',
            'Instagram': '',
            'Precio Promedio del mercado': '',
            '# Comparativa del Precio Prom vs Precio USD': '',
            '% Comparativa del Prom vs Precio USD': ''
          });

          const children = fullChain.filter(o => {
              if (processedIds.has(o.id)) return false;
              
              // Link A: Explicit manually linked via UI
              if (o.parentId === node.id) return true;
              
              // Link B: Compra (Same Car) -> Venta (Same Car)
              if (nodeType === 'compra' && pId) {
                  const isVentaOfSameCar = o.operation_type.toLowerCase() === 'venta' && 
                                           (o.vehicles || []).some(v => v.role === 'principal' && getVehId(v) === pId);
                  if (isVentaOfSameCar) return true;
              }

              // Link C: Venta (Principal) -> Compra (of a trade-in vehicle)
              if (nodeType === 'venta') {
                  const isCompraOfTradeIn = o.operation_type.toLowerCase() === 'compra' && 
                                            (o.vehicles || []).some(v => v.role === 'principal' && tradeIns.some(t => getVehId(t) === getVehId(v)));
                  if (isCompraOfTradeIn) return true;
              }

              return false;
          });

          children.sort((a, b) => parseDate(a.date) - parseDate(b.date));
          children.forEach(c => pushToExport(c, depth + 1));
        };

        roots.forEach(r => pushToExport(r, 0));
        if (fullChain.length > 0) exportData.push({});
      });

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte Filtrado");
      
      const wscols = [
        {wch: 12}, {wch: 12}, {wch: 15}, {wch: 30}, {wch: 30}, {wch: 15}, {wch: 15}, {wch: 25}, {wch: 15}, {wch: 40}, {wch: 15}, {wch: 22}, {wch: 15}, {wch: 15}, {wch: 15}, {wch: 25}, {wch: 25}, {wch: 25}
      ];
      worksheet['!cols'] = wscols;

      const fileName = searchQuery ? `Reporte_${searchQuery}_${period}.xlsx` : `Reporte_Filtrado_${period}.xlsx`;
      XLSX.writeFile(workbook, fileName);
    } catch (error) {
      console.error("Error al exportar Excel:", error);
      alert("Hubo un error al generar el archivo Excel. Por favor, revisa la consola para más detalles.");
    }
  }

  const isDateInRange = (dateStr) => {
    if (!dateStr || typeof dateStr !== 'string') return true;
    try {
      const parseLocal = (str) => {
        const parts = str.split(/[-/]/).map(Number);
        if (parts.length !== 3) return new Date(str);
        // If first part is 4 digits, it's YYYY-MM-DD
        if (parts[0] > 1000) return new Date(parts[0], parts[1] - 1, parts[2]);
        // Otherwise assume DD-MM-YYYY
        return new Date(parts[2], parts[1] - 1, parts[0]);
      };

      const date = parseLocal(dateStr);
      if (isNaN(date.getTime())) return true;
      const now = new Date();
      
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
        case 'thisQuarter': {
          const currentQ = Math.floor(now.getMonth() / 3);
          return Math.floor(date.getMonth() / 3) === currentQ && date.getFullYear() === now.getFullYear();
        }
        case 'lastQuarter': {
          const currentQ = Math.floor(now.getMonth() / 3);
          const lastQ = currentQ === 0 ? 3 : currentQ - 1;
          const lastQYear = currentQ === 0 ? now.getFullYear() - 1 : now.getFullYear();
          return Math.floor(date.getMonth() / 3) === lastQ && date.getFullYear() === lastQYear;
        }
        case 'custom': {
          if (!customRange.start || !customRange.end) return true;
          const s = new Date(customRange.start); const e = new Date(customRange.end);
          return date >= s && date <= e;
        }
        default: return true;
      }
    } catch (e) {
      return true;
    }
  };

  const filteredOperations = operations.filter(o => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return isDateInRange(o.date);

    const matchesBuyer = (o.buyer || '').toLowerCase().includes(query);
    const matchesVehicles = (o.vehicles || []).some(v => 
      v && (
        (v.chapa || '').toLowerCase().includes(query) || 
        (v.chasis || '').toLowerCase().includes(query) || 
        (v.description || '').toLowerCase().includes(query)
      )
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
      {/* Mobile Header */}
      <div className="mobile-header">
        <button onClick={() => setIsMenuOpen(!isMenuOpen)} style={{ background: 'none', border: 'none', color: 'white', display: 'flex', alignItems: 'center', padding: '8px' }}>
          {isMenuOpen ? <X size={26} /> : <Menu size={26} />} 
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 'bold', fontSize: '18px', color: 'var(--text-main)' }}>MH</span>
          <Car size={22} color="var(--primary)" />
        </div>
      </div>

      {/* Menu Overlay */}
      {isMenuOpen && <div className="menu-overlay" onClick={() => setIsMenuOpen(false)}></div>}

      {/* Sidebar */}
      <aside className={`sidebar ${isMenuOpen ? 'open' : ''}`}>
        <div className="logo-section">
          <div style={{ background: 'rgba(170, 59, 255, 0.1)', padding: '16px', borderRadius: '16px', marginBottom: '8px' }}>
            <Car size={32} color="var(--primary)" />
          </div>
          <h2>MH</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px', letterSpacing: '2px' }}>MOTOR HAUS</p>
        </div>

        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button className={`btn ${activeTab === 'operations' ? 'btn-primary' : ''}`} onClick={() => { setActiveTab('operations'); setSelectedTraceability(null); setIsMenuOpen(false); }}>
            <ArrowLeftRight size={20} /> Operaciones
          </button>
          <button className={`btn ${activeTab === 'stock' ? 'btn-primary' : ''}`} onClick={() => { setActiveTab('stock'); setIsMenuOpen(false); }}>
            <Package size={20} /> Inventario
          </button>
          <button className={`btn ${activeTab === 'tree' ? 'btn-primary' : ''}`} onClick={() => { setActiveTab('tree'); setIsMenuOpen(false); }}>
            <GitBranch size={20} /> Trazabilidad
          </button>
          <button className={`btn ${activeTab === 'stats' ? 'btn-primary' : ''}`} onClick={() => { setActiveTab('stats'); setIsMenuOpen(false); }}>
            <BarChart3 size={20} /> Analítica
          </button>
          {userProfile?.is_admin && (
            <button className={`btn ${activeTab === 'users' ? 'btn-primary' : ''}`} onClick={() => { setActiveTab('users'); setIsMenuOpen(false); }}>
              <Users size={20} /> Usuarios
            </button>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="glass" style={{ padding: '16px', borderRadius: '14px', marginBottom: '16px', background: 'rgba(255,255,255,0.02)', border: !userProfile ? '1px solid #ef4444' : '1px solid transparent' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
              <span>Sesión activa</span>
              <span style={{ color: userProfile?.can_edit ? '#10b981' : '#ef4444' }}>{userProfile ? (userProfile.can_edit ? 'MODO EDITOR' : 'MODO LECTURA') : 'PERFIL NO ENCONTRADO'}</span>
            </div>
            <div style={{ color: 'white', fontWeight: 'bold', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{session?.user?.email}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', fontFamily: 'monospace' }}>ID: {session?.user?.id}</div>
            <div style={{ marginTop: '8px', display: 'flex', gap: '4px' }}>
               <Shield size={12} title="Admin" color={userProfile?.is_admin ? 'var(--primary)' : 'rgba(255,255,255,0.1)'} />
               <Edit2 size={12} title="Edit" color={userProfile?.can_edit ? '#3b82f6' : 'rgba(255,255,255,0.1)'} />
               <Trash2 size={12} title="Delete" color={userProfile?.can_delete ? '#ef4444' : 'rgba(255,255,255,0.1)'} />
            </div>
          </div>
          <button className="btn btn-outline" style={{ width: '100%', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.2)' }} onClick={() => supabase.auth.signOut()}>
            <LogOut size={20} /> Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div className="animate-in" style={{ flex: 'none', width: '100%', marginBottom: '4px' }}>
            <h1 className="h1-responsive">{activeTab === 'operations' ? 'Operaciones' : activeTab === 'stock' ? 'Inventario' : activeTab === 'tree' ? 'Trazabilidad' : 'Analítica'}</h1>
            <h2 style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>{activeTab === 'operations' ? 'Gestión de transacciones' : activeTab === 'stock' ? 'Vehículos en stock' : activeTab === 'tree' ? 'Cadena de valor' : 'KPIs Financieros'}</h2>
          </div>

          <div className="tools-bar" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', flex: '1 1 auto' }}>
            <div className="glass" style={{ display: 'flex', alignItems: 'center', padding: '0 12px', gap: '8px', height: '40px', flex: '1 1 180px' }}>
              <Search size={16} color="var(--text-muted)" />
              <input type="text" placeholder="Buscar..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ background: 'none', border: 'none', marginBottom: 0, paddingLeft: 0, width: '100%', fontSize: '14px' }} />
            </div>
            <div className="glass" style={{ display: 'flex', alignItems: 'center', padding: '0 10px', gap: '6px', height: '40px', flex: '1 1 140px' }}>
              <Filter size={16} color="var(--text-muted)" />
              <select value={period} onChange={(e) => setPeriod(e.target.value)} style={{ background: 'none', border: 'none', color: 'white', outline: 'none', cursor: 'pointer', fontSize: '13px', width: '100%', appearance: 'none' }}>
                <option value="all" style={{ background: '#1a1b23' }}>Todo el tiempo</option>
                <option value="today" style={{ background: '#1a1b23' }}>Hoy</option>
                <option value="week" style={{ background: '#1a1b23' }}>Esta Semana</option>
                <option value="month" style={{ background: '#1a1b23' }}>Este Mes</option>
                <option value="lastMonth" style={{ background: '#1a1b23' }}>Mes Anterior</option>
                <option value="thisQuarter" style={{ background: '#1a1b23' }}>Este Trimestre</option>
                <option value="lastQuarter" style={{ background: '#1a1b23' }}>Trimestre Anterior</option>
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
            <button className="btn btn-outline" onClick={exportToExcel} style={{ height: '40px', padding: '0 12px' }}><Download size={16} /></button>
            <button 
              className="btn btn-primary" 
              onClick={userProfile?.can_edit ? (() => { setPreFilledData(null); setEditingOperation(null); setTradeInVehicles([]); setShowModal(true); }) : null} 
              title={userProfile?.can_edit ? "Nueva Operación" : "No tienes permisos para crear"}
              style={{ 
                height: '40px', padding: '0 16px', fontSize: '14px',
                opacity: userProfile?.can_edit ? 1 : 0.4,
                cursor: userProfile?.can_edit ? 'pointer' : 'not-allowed',
                background: userProfile?.can_edit ? 'var(--primary)' : 'rgba(255,255,255,0.1)',
                border: userProfile?.can_edit ? 'none' : '1px solid rgba(255,255,255,0.1)'
              }}
            >
              <Plus size={16} /> Nuevo
            </button>
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
          <div className="animate-in metrics-grid" style={{ marginBottom: '32px' }}>
            <div className="card glass" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '8px', borderRadius: '10px', display: 'flex', flexShrink: 0 }}>
                <Package color="#3b82f6" size={18} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '11px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>Inversión Inicial</div>
                {isTreeLoading ? (
                  <div className="skeleton" style={{ height: '20px', width: '80%', marginTop: '4px' }}></div>
                ) : (
                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#3b82f6' }}>USD {stats.totalInvestment.toLocaleString()}</div>
                )}
              </div>
            </div>

            <div className="card glass" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ background: stats.totalProfit > 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', padding: '8px', borderRadius: '10px', display: 'flex', flexShrink: 0 }}>
                <TrendingUp color={stats.totalProfit > 0 ? '#10b981' : '#ef4444'} size={18} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '11px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>Ganancia Est.</div>
                {isTreeLoading ? (
                  <div className="skeleton" style={{ height: '20px', width: '80%', marginTop: '4px' }}></div>
                ) : (
                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: stats.totalProfit > 0 ? '#10b981' : '#ef4444' }}>USD {stats.totalProfit.toLocaleString()}</div>
                )}
              </div>
            </div>
            
            <div className="card glass" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ background: 'rgba(170, 59, 255, 0.1)', padding: '8px', borderRadius: '10px', display: 'flex', flexShrink: 0 }}>
                <Package color="var(--primary)" size={18} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '12px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>Vehículos Árbol</div>
                {isTreeLoading ? (
                  <div className="skeleton" style={{ height: '24px', width: '80%', marginTop: '4px' }}></div>
                ) : (
                  <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{stats.tradeInCount} uni</div>
                )}
              </div>
            </div>

            <div className="card glass" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '10px', borderRadius: '12px', display: 'flex', flexShrink: 0 }}>
                <Package color="#3b82f6" size={20} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '12px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>Stock Actual</div>
                {isTreeLoading ? (
                  <div className="skeleton" style={{ height: '24px', width: '80%', marginTop: '4px' }}></div>
                ) : (
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#3b82f6' }}>{stockVehicles.length} uni</div>
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
                onDeleteOperation={userProfile?.can_delete ? handleDeleteOperation : null}
                onEditOperation={userProfile?.can_edit ? handleEditOperation : null}
              />
            </div>
          )}
          {activeTab === 'stock' && (
            <div className="card glass">
              <StockTable 
                stock={stockVehicles} 
                onSellVehicle={userProfile?.can_edit ? handleOpenBranchModal : null} 
              />
            </div>
          )}
          {activeTab === 'tree' && (
            <div className="card glass" style={{ padding: '0' }}>
               <div style={{ padding: '24px', borderBottom: '1px solid var(--border)' }}>
                 <h3 style={{ color: 'white' }}>Trazabilidad Comercial</h3>
                 <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                   {selectedTraceability ? 'Diagrama de Flujo Comercial' : 'Buscá un vehículo para ver su historial'}
                 </p>
               </div>
               
               {!selectedTraceability && searchQuery && filteredOperations.length > 0 ? (
                 <div style={{ padding: '24px' }}>
                   <div style={{ marginBottom: '16px', color: 'var(--primary)', fontWeight: 'bold' }}>
                     Hacé click en un registro para ver el árbol genealógico:
                   </div>
                   <OperationsTable 
                    operations={filteredOperations} 
                    onSelectOperation={handleSelectOperation} 
                    onDeleteOperation={handleDeleteOperation}
                    onEditOperation={handleEditOperation}
                  />
                 </div>
               ) : (
                 <TreeView 
                   data={selectedTraceability} 
                   onAddBranch={userProfile?.can_edit ? handleOpenBranchModal : null} 
                   onEditOperation={userProfile?.can_edit ? handleEditOperation : null}
                   onDeleteOperation={userProfile?.can_delete ? handleDeleteOperation : null}
                   highlightedId={highlightedId}
                   isLoading={isTreeLoading}
                 />
               )}
            </div>
          )}
          {activeTab === 'stats' && (
            <StatsDashboard 
              metrics={financials.getGlobalMetrics(operations, filteredOperations)} 
              stock={stockVehicles}
            />
          )}

          {activeTab === 'users' && userProfile?.is_admin && (
            <UserManagement />
          )}
        </section>
      </main>

      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(8px)', padding: '16px' }}>
          <div className="glass card animate-in" style={{ width: '100%', maxWidth: '600px', padding: '32px', maxHeight: '90vh', overflowY: 'auto' }}>
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
                 <div><label>Entrega Contado</label><input name="delivery_amount" type="text" onChange={(e) => e.target.value = formatMoney(e.target.value)} defaultValue={formatMoney(preFilledData?.delivery_amount || 0)} placeholder="0" /></div>
                 <div><label>Cuotas</label><input name="installments" type="number" defaultValue={preFilledData?.installments || 0} placeholder="0" /></div>
                 <div><label>Monto Crédito</label><input name="credit_amount" type="text" onChange={(e) => e.target.value = formatMoney(e.target.value)} defaultValue={formatMoney(preFilledData?.credit_amount || 0)} placeholder="0" /></div>
              </div>

              <label style={{ marginTop: '16px' }}>Monto Total (Total Operación)</label>
              <input name="amount" type="text" onChange={(e) => e.target.value = formatMoney(e.target.value)} defaultValue={formatMoney(preFilledData?.amount || 0)} placeholder="0.00" />
              
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
                    <input type="text" value={v.valuation} onChange={(e) => handleTradeInChange(index, 'valuation', e.target.value)} placeholder="0.00" />
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
