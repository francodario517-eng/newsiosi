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
  Edit2,
  Menu,
  Zap
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
import { QuickLoad } from './components/QuickLoad'
import { apifyService } from './services/apify'
import { opTime, opType, marketKey, resolveLineageCached, lineageRoots } from './services/lineage'
import { formatMoney, parseMoney } from './services/money'
import { validateOperation } from './services/validation'
import { latestLoaded, creation } from './services/audit'

// Email autorizado a usar la Carga Rápida de datos financieros.
const QUICKLOAD_EMAIL = 'francodario517@gmail.com'

// Vehículo desde el que se arma el árbol de una operación: el principal, o el
// primero si la operación no tiene principal. getVehicleTraceability no da el
// mismo resultado según desde qué vehículo se lo llame, así que la pantalla del
// árbol y el Excel de inventario tienen que arrancar siempre del mismo lugar.
const getTreeSeedId = (op) => {
  const principal = (op?.vehicles || []).find(v => v && v.role === 'principal') || op?.vehicles?.[0];
  return principal?.chasis?.trim() || principal?.chapa?.trim() || '';
}

function App() {
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('activeTab') || 'operations')
  const [selectedTraceability, setSelectedTraceability] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [stats, setStats] = useState({ totalProfit: 0, tradeInCount: 0, totalInvestment: 0, totalRevenue: 0, unsoldTradeInValue: 0, unsoldTradeInCount: 0, totalCommission: 0 })
  const [searchQuery, setSearchQuery] = useState(() => localStorage.getItem('searchQuery') || '')
  const [period, setPeriod] = useState(() => localStorage.getItem('period') || 'all') 
  const [customRange, setCustomRange] = useState({ start: '', end: '' })
  const [operations, setOperations] = useState([])
  const [preFilledData, setPreFilledData] = useState(null)
  const [highlightedId, setHighlightedId] = useState(() => localStorage.getItem('highlightedId') || null)
  const [isTreeLoading, setIsTreeLoading] = useState(false)
  const [session, setSession] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  // Puede ver los datos: la base lo exige (db/2026-11-18-permisos-en-la-base.sql).
  // can_view todavía sin definir = perfil anterior a esa migración, que veía todo.
  const hasViewAccess = !!userProfile && (userProfile.is_admin || userProfile.can_edit || userProfile.can_delete || userProfile.can_view !== false)
  const [editingOperation, setEditingOperation] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const savingRef = React.useRef(false)
  const loadSeqRef = React.useRef(0)
  // Al editar, el formulario se precarga con el vehículo PRINCIPAL. Antes se
  // tomaba el primero de la lista, que puede ser un parte de pago: al guardar,
  // el parte de pago quedaba también como auto vendido y el real se perdía.
  const editingPrincipal = (editingOperation?.vehicles || []).find(v => v && v.role === 'principal') || null
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [realtimeStatus, setRealtimeStatus] = useState('CONNECTING') // 'CONNECTED' | 'ERROR' | 'DISCONNECTED' | 'CONNECTING'
  // IMPORTANTE: stockMarketData NO se inicializa desde localStorage.
  // Los datos de mercado viven en Supabase (campo market_data de vehicles).
  // Usar localStorage causaba que distintos dispositivos vieran datos diferentes.
  const [stockMarketData, setStockMarketData] = useState({});

  const [isUpdatingMarket, setIsUpdatingMarket] = useState(false);
  const [marketUpdateProgress, setMarketUpdateProgress] = useState({ current: 0, total: 0 });

  const stockVehicles = useMemo(() => {
    const entryMap = new Map(); // identifier -> entry data[]
    const exitCounts = new Map(); // identifier -> count

    operations.forEach(op => {
      const type = (op.operation_type || '').toLowerCase();
      // Remate es una venta (el auto sale), no una entrada.
      const isVenta = type === 'venta' || type === 'remate';
      const isCompra = !isVenta;
      // Cualquier otra operación (compra, rescisión, importación, recuperado de secuestro, etc.) es entrada.
      const isEntry = !isVenta;

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

      // Record Entries: any non-venta operation adds the principal vehicle to stock
      op.vehicles?.forEach(v => {
        if (!v) return;
        const isPrincipalEntry = isEntry && v.role === 'principal';
        const isTradeInEntry = isVenta && v.role === 'parte_pago';
        
        if (isPrincipalEntry || isTradeInEntry) {
          const id = (v.chasis || v.chapa || '').trim().toUpperCase();
          if (id) {
            if (!entryMap.has(id)) entryMap.set(id, []);
            entryMap.get(id).push({
              id: v.id,
              description: v.description,
              chapa: v.chapa,
              chasis: v.chasis,
              valuation: v.role === 'principal' ? (op.total_amount || 0) : (v.valuation || 0),
              entry_date: op.date,
              source_type: isPrincipalEntry ? type.toUpperCase() : 'PARTE PAGO RECIBIDO',
              operation_id: op.id,
              _t: opTime(op),
              _created: op.created_at || ''
            });
          }
        }
      });
    });

    const activeStock = [];
    entryMap.forEach((entries, id) => {
      const exits = exitCounts.get(id) || 0;
      // Si hay más entradas que salidas, las que quedan en stock son las MÁS
      // RECIENTES. Se ordena por fecha explícitamente: las operaciones llegan
      // de la más nueva a la más vieja, y tomar el final de la lista mostraba
      // la entrada más vieja (costo, fecha y origen de una compra anterior).
      if (entries.length > exits) {
        const countInStock = entries.length - exits;
        const newestFirst = [...entries].sort((a, b) =>
          (b._t - a._t) || String(b._created).localeCompare(String(a._created)));
        newestFirst.slice(0, countInStock).forEach((entry) => {
          const { _t, _created, ...rest } = entry;
          activeStock.push(rest);
        });
      }
    });

    return activeStock;
  }, [operations]);

  // ── Market Update Persistence & Cache ──────────────────────────────────────
  const handleUpdateMarket = async (options = {}) => {
    if (isUpdatingMarket) return;
    
    const { forceRate = null, resumeIds = null } = options;
    
    let usdRate = forceRate;
    if (!usdRate) {
      const lastRate = localStorage.getItem('last_usd_rate') || '7500';
      const rateInput = window.prompt("Ingrese el tipo de cambio del dólar (Gs. por 1 USD):", lastRate);
      
      if (!rateInput || isNaN(parseFloat(rateInput))) {
        if (!resumeIds) alert("Operación cancelada: Se requiere un tipo de cambio válido.");
        return;
      }
      usdRate = parseFloat(rateInput);
      localStorage.setItem('last_usd_rate', usdRate.toString());
    }

    const vehiclesToProcess = resumeIds 
      ? stockVehicles.filter(v => resumeIds.includes(v.id || (v.chapa || v.chasis || v.description || '').trim().toUpperCase()))
      : stockVehicles;

    if (vehiclesToProcess.length === 0) {
      setIsUpdatingMarket(false);
      localStorage.removeItem('market_update_job');
      return;
    }

    setIsUpdatingMarket(true);
    setMarketUpdateProgress({ current: 0, total: vehiclesToProcess.length });
    
    // Guardar estado del job para persistencia ante F5
    localStorage.setItem('market_update_job', JSON.stringify({
      pendingIds: vehiclesToProcess.map(v => v.id || (v.chapa || v.chasis || v.description || '').trim().toUpperCase()),
      usdRate,
      timestamp: Date.now()
    }));

    const batchSize = 3;
    for (let i = 0; i < vehiclesToProcess.length; i += batchSize) {
      const batch = vehiclesToProcess.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (v) => {
        const vId = marketKey(v);
        
        // AHORRO DE CRÉDITOS: Verificar si ya tiene datos frescos (< 24h)
        const existing = stockMarketData[vId];
        if (existing && existing.updatedAtISO && !resumeIds) {
          const lastUpdate = new Date(existing.updatedAtISO);
          if (Date.now() - lastUpdate.getTime() < 24 * 60 * 60 * 1000) {
            console.log(`Saltando ${vId} por datos recientes.`);
            return;
          }
        }

        try {
          // Marcar como cargando en UI
          setStockMarketData(prev => ({ ...prev, [vId]: { ...prev[vId], isLoading: true } }));

          const data = await apifyService.getRealMarketData(v, usdRate);
          const sources = [data.clasipar, data.marketplace, data.instagram, data.internet].filter(val => val > 0);
          const realPromedio = sources.length > 0 
            ? Math.round(sources.reduce((a, b) => a + b, 0) / sources.length) 
            : 0;

          const diffDollar = realPromedio - (v.valuation || 0);
          const diffPercent = (v.valuation || 0) > 0 ? (diffDollar / v.valuation) * 100 : 0;
          
          const now = new Date();
          const fullData = {
            ...data,
            promedio: realPromedio,
            diffDollar: Math.round(diffDollar),
            diffPercent: diffPercent.toFixed(1),
            usdRate: usdRate,
            updatedAtISO: now.toISOString(),
            updatedAt: now.toLocaleString('es-PY', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
          };

          setStockMarketData(prev => ({
            ...prev,
            [vId]: { ...fullData, isLoading: false }
          }));

          if (v.id) {
            await db.updateVehicleMarketData(v.id, fullData);
          } else {
            await supabase.from('vehicles').update({ market_data: fullData }).or(`chasis.eq.${vId},chapa.eq.${vId}`);
          }

          // Actualizar job en localStorage
          const currentJob = JSON.parse(localStorage.getItem('market_update_job') || '{}');
          if (currentJob.pendingIds) {
            currentJob.pendingIds = currentJob.pendingIds.filter(id => id !== (v.id || vId));
            localStorage.setItem('market_update_job', JSON.stringify(currentJob));
          }
        } catch (error) {
          console.error(`Error actualizando ${vId}:`, error);
          setStockMarketData(prev => ({ ...prev, [vId]: { ...prev[vId], isLoading: false } }));
        }
      }));
      
      setMarketUpdateProgress(prev => ({ ...prev, current: Math.min(i + batchSize, vehiclesToProcess.length) }));
      await new Promise(r => setTimeout(r, 500));
    }

    setIsUpdatingMarket(false);
    localStorage.removeItem('market_update_job');
    if (!resumeIds) alert("¡Actualización de mercado completada!");
  };

  // Auto-resume market update after F5
  useEffect(() => {
    const savedJob = localStorage.getItem('market_update_job');
    if (savedJob && stockVehicles.length > 0) {
      const job = JSON.parse(savedJob);
      // Solo resumir si el job es reciente (< 1 hora)
      if (Date.now() - job.timestamp < 3600000 && job.pendingIds?.length > 0) {
        console.log("Resumiendo actualización de mercado interrumpida...");
        handleUpdateMarket({ forceRate: job.usdRate, resumeIds: job.pendingIds });
      } else {
        localStorage.removeItem('market_update_job');
      }
    }
  }, [stockVehicles.length > 0]);

  // Market data persisted in localStorage — survives page refreshes
  // Auto-load market data desde Supabase (campo market_data en vehicles).
  // La DB es la fuente de verdad — sus datos siempre ganan sobre cualquier
  // cache local para garantizar consistencia entre dispositivos.
  useEffect(() => {
    const newMarketData = {};
    operations.forEach(op => {
      op.vehicles?.forEach(v => {
        if (v.market_data) {
          const vId = marketKey(v);
          if (vId && (!newMarketData[vId] || (v.market_data.updatedAtISO > (newMarketData[vId].updatedAtISO || '')))) {
            newMarketData[vId] = v.market_data;
          }
        }
      });
    });
    // DB gana sobre cache local: comparamos timestamps y nos quedamos con el más reciente
    setStockMarketData(prev => {
      const merged = { ...prev };
      Object.entries(newMarketData).forEach(([key, dbData]) => {
        const localData = prev[key];
        // Usar datos de DB si: no hay datos locales, o si los de DB son más recientes
        if (!localData || !localData.updatedAtISO || (dbData.updatedAtISO && dbData.updatedAtISO >= localData.updatedAtISO)) {
          merged[key] = dbData;
        }
      });
      return merged;
    });
  }, [operations]);


  
  // Montos: formatMoney / parseMoney de services/money.js (admiten decimales con coma).

  // Solo este usuario ve la Carga Rápida de datos financieros.
  const canQuickLoad = (session?.user?.email || '').toLowerCase() === QUICKLOAD_EMAIL;

  // Guardado liviano de campos sueltos (para la Carga Rápida): fecha, tipo,
  // entrega, cuotas y crédito. La lista se refresca sola vía Realtime.
  const handleQuickSave = async (id, values) => {
    // Misma validación que el formulario, sobre la operación como quedaría.
    const current = operations.find(o => o.id === id);
    if (current) {
      const merged = { ...current, ...values, date: values.date || current.date };
      // Sólo lo que toca la Carga Rápida (fecha y montos): un problema de otro
      // campo (ej. chasis) no impide completar el desglose.
      const relevant = validateOperation(merged).issues.filter(i => i.cat === 'fecha' || i.cat === 'montos');
      const errors = relevant.filter(i => i.level === 'error').map(i => i.msg);
      const warnings = relevant.filter(i => i.level === 'warning').map(i => i.msg);
      if (errors.length) throw new Error('No se puede guardar:\n• ' + errors.join('\n• '));
      if (warnings.length && !window.confirm('Atención:\n• ' + warnings.join('\n• ') + '\n\n¿Guardar igual?')) {
        throw new Error('Guardado cancelado.');
      }
    }
    await db.updateOperationQuick(id, values);
  };


  const [tradeInVehicles, setTradeInVehicles] = useState([])


  useEffect(() => {
    // Borrado de caché por versión: al cambiar CACHE_VERSION, todos los navegadores
    // limpian su localStorage en la próxima visita, eliminando datos de versiones anteriores.
    const CACHE_VERSION = '2';
    if (localStorage.getItem('mh_cache_v') !== CACHE_VERSION) {
      localStorage.clear();
      localStorage.setItem('mh_cache_v', CACHE_VERSION);
    }
    // Limpieza explícita de claves del modo mock local (eliminado).
    localStorage.removeItem('USE_LOCAL_MOCK');
    localStorage.removeItem('mock_operations');

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

    // Suscribirse al estado del canal Realtime para indicador visual
    const unsubStatus = db.subscribeStatus(setRealtimeStatus);

    // Heartbeat: cada 30 segundos verificar que el canal sigue activo.
    // Si se cayó, reconecta automáticamente.
    const heartbeatInterval = setInterval(() => {
      db.ensureRealtimeConnected();
    }, 30000);

    return () => {
      subscription.unsubscribe();
      unsubStatus();
      clearInterval(heartbeatInterval);
    };
  }, []);

  useEffect(() => {
    const loadAll = async () => {
      // Si llegan dos recargas seguidas, la respuesta vieja no pisa a la nueva.
      const seq = ++loadSeqRef.current;
      try {
        // Load operations
        const data = await db.getOperations();
        if (seq !== loadSeqRef.current) return;
        setOperations(data);
        
        // Reload profile if we have a session (to handle permission changes)
        if (session?.user) {
          const profile = await db.getProfile(session.user.id);
          setUserProfile(profile);
        }
      } catch (error) {
        // Si la lectura falla, se conserva lo que ya estaba en pantalla (antes
        // un error dejaba la lista vacía) y la próxima recarga lo reintenta.
        console.error('Error in loadAll:', error);
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

  // Restore/Refresh traceability if there was a highlighted vehicle or operations change.
  // "operations" cambia de referencia en cada sincronización Realtime, aunque
  // sea por una operación totalmente ajena al árbol que se está mirando. Si
  // mostráramos el loader (isTreeLoading) en cada una de esas pasadas, el
  // <TreeView> desmonta y remonta el canvas de ReactFlow por completo,
  // perdiendo el zoom/paneo que el usuario acaba de hacer. Por eso solo se
  // muestra el loader cuando el usuario realmente cambia de vehículo
  // (highlightedId distinto al último árbol cargado); las actualizaciones de
  // fondo para el mismo árbol se recalculan en silencio, sin remontar nada.
  const lastLoadedTreeIdRef = React.useRef(null);
  useEffect(() => {
    let cancelled = false;
    const refreshTree = async () => {
      if (activeTab === 'tree' && highlightedId && operations.length > 0) {
        // Find a vehicle from any operation that matches the highlightedId
        const op = operations.find(o => o.id === highlightedId || o.vehicles.some(v => v.chasis === highlightedId || v.chapa === highlightedId));
        if (op) {
          const vehicleId = getTreeSeedId(op);
          if (vehicleId) {
            const isFreshSelection = lastLoadedTreeIdRef.current !== highlightedId;
            if (isFreshSelection) setIsTreeLoading(true);
            try {
              const trace = await db.getVehicleTraceability(vehicleId, operations, op.id);
              if (!cancelled) {
                setSelectedTraceability(trace);
                setStats(financials.getTreeStats(trace));
                lastLoadedTreeIdRef.current = highlightedId;
              }
            } catch (err) {
              console.error("Error refrescando árbol de trazabilidad:", err);
            } finally {
              if (!cancelled && isFreshSelection) setIsTreeLoading(false);
            }
          }
        }
      }
    };
    refreshTree();
    return () => { cancelled = true; };
  }, [operations, activeTab, highlightedId]);

  // opsList: la lista con la que se arma el árbol. Después de guardar se pasa la
  // recién leída: el estado `operations` todavía no tiene la operación nueva.
  const handleSelectOperation = async (op, opsList) => {
    const list = Array.isArray(opsList) ? opsList : operations;
    const vehicleId = getTreeSeedId(op);

    setHighlightedId(op.id);
    setActiveTab('tree');
    // Ya nos encargamos de cargar y mostrar el loader acá abajo; marcamos el
    // árbol como "ya cargado" para que el useEffect de refreshTree (que
    // también se dispara al cambiar highlightedId) no repita el mismo
    // trabajo ni vuelva a parpadear el loader.
    lastLoadedTreeIdRef.current = op.id;

    if (!vehicleId) {
      setSelectedTraceability({ nodes: [], edges: [] });
      setStats({ totalProfit: 0, tradeInCount: 0, totalInvestment: 0, totalRevenue: 0, unsoldTradeInValue: 0, unsoldTradeInCount: 0, totalCommission: 0 });
      return;
    }

    setIsTreeLoading(true);
    try {
      const trace = await db.getVehicleTraceability(vehicleId, list, op.id);
      setSelectedTraceability(trace);
      setStats(financials.getTreeStats(trace));
    } catch (err) {
      console.error("Error loading tree:", err);
    } finally {
      setIsTreeLoading(false);
    }
  }

  // Ver el árbol de trazabilidad de un vehículo directamente desde Inventario
  const handleViewTreeFromStock = (item) => {
    const op = operations.find(o => o.id === item.operation_id);
    if (op) handleSelectOperation(op);
  }

  // Ver el árbol desde la tabla de rendimiento por árbol (Analítica)
  const handleSelectTree = (tree) => {
    const op = operations.find(o => o.id === tree.id);
    if (op) handleSelectOperation(op);
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

  // Tomar un vehículo que ya está en stock y entregarlo como parte de pago
  // dentro de una NUEVA Compra. El vehículo nuevo (el que se está adquiriendo)
  // se completa manualmente como principal; este vehículo queda precargado
  // como parte de pago.
  const handleUseAsTradeIn = (vehicleInfo) => {
    setPreFilledData({ type: 'Compra' });
    setEditingOperation(null);
    setTradeInVehicles([{
      description: vehicleInfo.description || '',
      chapa: vehicleInfo.chapa || '',
      chasis: vehicleInfo.chasis || '',
      valuation: ''
    }]);
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
    // Un doble clic en "Guardar" cargaba la misma operación dos veces (hay
    // pares idénticos creados en el mismo segundo). El ref corta el segundo
    // envío aunque el estado todavía no se haya actualizado.
    if (savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    try {
      await saveOperation(e);
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }

  const saveOperation = async (e) => {
    const formData = new FormData(e.target);
    
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
      seller_name: formData.get('seller_name'),
      delivery_amount: parseMoney(formData.get('delivery_amount')),
      installments: Number(formData.get('installments')) || 0,
      credit_amount: parseMoney(formData.get('credit_amount')),
      parentId: preFilledData?.operation_id || editingOperation?.parentId || null,
      vehicles: [
        {
          // Al editar se conserva la fila del vehículo (id, color, datos de mercado).
          ...(editingOperation && editingPrincipal ? { id: editingPrincipal.id, color: editingPrincipal.color } : {}),
          chapa: formData.get('chapa'),
          chasis: formData.get('chasis'),
          description: formData.get('description'),
          role: 'principal'
        },
        ...tradeInVehicles.map(v => ({
          ...(editingOperation ? v : { ...v, id: undefined }),
          role: 'parte_pago',
          valuation: parseMoney(v.valuation)
        }))
      ]
    };

    // Validación: los errores no dejan guardar; las advertencias piden confirmación.
    const { errors, warnings } = validateOperation(opData);
    if (errors.length) {
      alert('No se puede guardar:\n\n• ' + errors.join('\n• '));
      return;
    }
    if (warnings.length && !window.confirm('Atención:\n\n• ' + warnings.join('\n• ') + '\n\n¿Guardar igual?')) {
      return;
    }

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
      
      // Mostrar el árbol de la operación recién guardada. Antes se armaba con la
      // lista vieja (sin la operación nueva) y el árbol caía en otra operación
      // con el mismo chasis: se veía la cadena vieja y la rama siguiente ("+")
      // se colgaba de ella. Se relee la lista y el árbol se arma con esa.
      const savedId = savedOp?.id || editingOperation?.id;
      let fresh = null;
      try {
        fresh = await db.getOperations();
        loadSeqRef.current++; // una recarga anterior todavía en curso no pisa esta lista
        setOperations(fresh);
      } catch (loadErr) {
        console.error('No se pudo releer la lista después de guardar:', loadErr);
      }
      const savedFull = fresh?.find(o => o.id === savedId) || { ...opData, id: savedId };
      handleSelectOperation(savedFull, fresh || undefined);
    } catch (err) {
      console.error("Error al guardar operación:", err);
      if (err.cancelled) return; // el usuario ya canceló desde el confirm, no repetir el aviso
      alert("Error al guardar: " + (err.message || "Error desconocido"));
    }
  }

  const handleDeleteOperation = async (op) => {
    // Las operaciones vinculadas a mano a esta quedan sueltas al borrarla (la
    // base les pone el vínculo en vacío): avisar antes.
    const linked = operations.filter(o => o.parentId === op.id);
    const linkedMsg = linked.length
      ? `\n\nOJO: ${linked.length} operación(es) están vinculadas a esta y van a quedar sin ese vínculo:\n` +
        linked.slice(0, 5).map(o => `• ${o.date} ${o.operation_type} ${o.buyer || ''}`).join('\n') +
        (linked.length > 5 ? `\n• y ${linked.length - 5} más` : '')
      : '';
    if (window.confirm(`¿Estás seguro de eliminar esta operación del ${op.date}? Se borrarán también los vehículos asociados.${linkedMsg}`)) {
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
      const { default: ExcelJS } = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Motor Haus';
      const sheet = workbook.addWorksheet('Reporte Filtrado');

      sheet.columns = [
        { header: 'ID Cadena',          key: 'chain_id',     width: 14 },
        { header: 'Fecha',               key: 'date',         width: 12 },
        { header: 'Operación',           key: 'operation',    width: 18 },
        { header: 'Comprador/Vendedor',  key: 'buyer',        width: 30 },
        { header: 'Vehículo',            key: 'vehicle',      width: 38 },
        { header: 'Chapa',               key: 'chapa',        width: 12 },
        { header: 'Chasis',              key: 'chasis',       width: 22 },
        { header: 'Monto USD',           key: 'amount',       width: 14 },
        { header: 'Tipo Monto',          key: 'amount_type',  width: 22 },
        { header: 'Estado Stock',        key: 'stock_status', width: 14 },
        { header: 'Costo Inversión',     key: 'invest_cost',  width: 16 },
        { header: 'Ganancia Est. USD',   key: 'profit_est',   width: 18 },
        { header: 'Clasipar USD',        key: 'clasipar',     width: 13 },
        { header: 'Marketplace USD',     key: 'marketplace',  width: 15 },
        { header: 'Instagram USD',       key: 'instagram',    width: 13 },
        { header: 'Prom. Mercado USD',   key: 'market_avg',   width: 16 },
        { header: 'Comp. $ USD',         key: 'diff_dollar',  width: 13 },
        { header: 'Comp. %',             key: 'diff_pct',     width: 10 },
        { header: 'Datos Reales',        key: 'real_data',    width: 12 },
      ];

      const headerRow = sheet.getRow(1);
      headerRow.height = 28;
      headerRow.eachCell({ includeEmpty: true }, cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0a0b10' } };
        cell.font = { bold: true, color: { argb: 'FFffffff' }, size: 10 };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = { bottom: { style: 'medium', color: { argb: 'FFaa3bff' } } };
      });

      // Stock: el mismo cálculo que la pantalla de Inventario.
      const stockKey = (v) => (v && (v.chasis || v.chapa || '').trim().toUpperCase()) || '';
      const stockSet = new Set(stockVehicles.map(stockKey).filter(Boolean));

      const fillRow = (row, argb) => {
        row.eachCell({ includeEmpty: true }, cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
          cell.alignment = { vertical: 'middle' };
        });
      };

      // Cadenas con el mismo linaje que el árbol en pantalla (services/lineage.js)
      // y la misma ganancia (financials.chainStats). Antes el Excel armaba las
      // cadenas con una lógica propia, perdía filas que no colgaban de una raíz y
      // su "Ganancia Est." era ventas − compras, sin partes de pago ni comisión.
      const lineage = resolveLineageCached(operations);
      const rootOf = lineageRoots(operations, lineage);
      const childrenOf = new Map();
      operations.forEach(o => {
        const link = lineage.get(o.id);
        if (!link) return;
        if (!childrenOf.has(link.parentId)) childrenOf.set(link.parentId, []);
        childrenOf.get(link.parentId).push(o);
      });
      const chainOpsOf = new Map();
      operations.forEach(o => {
        const r = rootOf.get(o.id);
        if (!chainOpsOf.has(r)) chainOpsOf.set(r, []);
        chainOpsOf.get(r).push(o);
      });
      const byDate = (a, b) => (opTime(a) - opTime(b)) || String(a.created_at || '').localeCompare(String(b.created_at || ''));

      // Una cadena por cada operación del filtro, en el orden de la lista.
      const chainRoots = [];
      const seenRoots = new Set();
      filteredOperations.forEach(o => {
        const r = rootOf.get(o.id);
        if (r && !seenRoots.has(r)) { seenRoots.add(r); chainRoots.push(r); }
      });

      chainRoots.forEach(rootId => {
        const chainOps = chainOpsOf.get(rootId) || [];
        const stats = financials.chainStats(chainOps);
        const chainId = rootId.substring(0, 13);
        const printed = new Set();

        const pushToSheet = (node, depth) => {
          if (printed.has(node.id)) return;
          printed.add(node.id);

          const nodeType = opType(node);
          const isSale = nodeType === 'venta' || nodeType === 'remate';
          const principal = node.vehicles?.find(v => v.role === 'principal');
          const pId = stockKey(principal);
          const tradeIns = node.vehicles?.filter(v => v.role === 'parte_pago') || [];
          const indent = depth > 0 ? '   '.repeat(depth) + '↳ ' : '';
          const md = principal ? (stockMarketData[marketKey(principal)] || null) : null;
          const mainInStock = pId ? stockSet.has(pId) : false;

          const mainRow = sheet.addRow({
            chain_id: chainId,
            date: node.date,
            operation: (node.operation_type || '').toUpperCase(),
            buyer: node.buyer || '',
            vehicle: indent + (principal?.description || 'N/A'),
            chapa: principal?.chapa || 'N/A',
            chasis: principal?.chasis || 'N/A',
            amount: Number(node.total_amount) || 0,
            amount_type: 'TOTAL OPERACIÓN',
            stock_status: pId ? (mainInStock ? '✔ EN STOCK' : '✘ SALIÓ') : '',
            invest_cost: stats.totalInvestment,
            profit_est: stats.totalProfit,
            clasipar:    md ? (md.clasipar    || '') : '',
            marketplace: md ? (md.marketplace || '') : '',
            instagram:   md ? (md.instagram   || '') : '',
            market_avg:  md ? (md.promedio    || '') : '',
            diff_dollar: md ? (md.diffDollar  || '') : '',
            diff_pct:    md ? `${md.diffPercent}%`  : '',
            real_data:   md ? (md.isRealData ? 'REAL' : 'ESTIMADO') : 'PENDIENTE',
          });
          mainRow.height = 20;
          if (stats.missingCostCount > 0) {
            mainRow.getCell('profit_est').note = `Falta el costo de ${stats.missingCostCount} operación(es) de esta cadena (compra en cero o venta sin su compra): la ganancia sale inflada.`;
          }

          if (!isSale && nodeType !== 'rescision') {
            fillRow(mainRow, 'FFdff2eb');
            mainRow.getCell('operation').font = { bold: true, color: { argb: 'FF1a6b45' }, size: 10 };
          } else if (isSale) {
            fillRow(mainRow, 'FFfde8e8');
            mainRow.getCell('operation').font = { bold: true, color: { argb: 'FF9b2020' }, size: 10 };
          } else {
            fillRow(mainRow, 'FFf0eeff');
            mainRow.getCell('operation').font = { bold: true, color: { argb: 'FF5a3fa0' }, size: 10 };
          }
          if (pId) {
            mainRow.getCell('stock_status').font = {
              bold: true,
              color: { argb: mainInStock ? 'FF1a6b45' : 'FF9b2020' },
              size: 10
            };
          }

          // Una fila por cada parte de pago: en una venta es un auto que ENTRA,
          // en una compra es un auto nuestro que SALE.
          tradeIns.forEach(t => {
            const tId = stockKey(t);
            const inStock = tId ? stockSet.has(tId) : false;
            const statusColor = inStock ? 'FF1a6b45' : 'FF9b2020';
            const bgColor = inStock ? 'FFedf7f2' : 'FFfceeee';

            const trRow = sheet.addRow({
              chain_id:     '',
              date:         '',
              operation:    'PARTE DE PAGO',
              buyer:        '',
              vehicle:      '   └─ ' + (t.description || 'N/A'),
              chapa:        t.chapa  || 'N/A',
              chasis:       t.chasis || 'N/A',
              amount:       Number(t.valuation) || 0,
              amount_type:  isSale ? 'VALOR RECIBIDO' : 'VALOR ENTREGADO',
              stock_status: tId ? (inStock ? '✔ EN STOCK' : '✘ SALIÓ') : '',
              invest_cost:  '',
              profit_est:   '',
              clasipar: '', marketplace: '', instagram: '',
              market_avg: '', diff_dollar: '', diff_pct: '', real_data: '',
            });
            trRow.height = 18;
            fillRow(trRow, bgColor);
            trRow.getCell('operation').font   = { italic: true, color: { argb: 'FF6b7280' }, size: 9 };
            trRow.getCell('vehicle').font     = { color: { argb: statusColor }, size: 10 };
            trRow.getCell('amount').font      = { bold: true, color: { argb: statusColor }, size: 10 };
            trRow.getCell('stock_status').font = { bold: true, color: { argb: statusColor }, size: 10 };
          });

          [...(childrenOf.get(node.id) || [])].sort(byDate).forEach(c => pushToSheet(c, depth + 1));
        };

        const root = chainOps.find(o => o.id === rootId);
        if (root) pushToSheet(root, 0);
        // Red de seguridad: ninguna operación de la cadena queda afuera.
        [...chainOps].sort(byDate).forEach(o => pushToSheet(o, 1));

        const sepRow = sheet.addRow({});
        fillRow(sepRow, 'FF050507');
        sepRow.height = 6;
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = searchQuery ? `Reporte_${searchQuery}_${period}.xlsx` : `Reporte_Filtrado_${period}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error al exportar Excel:", error);
      alert("Hubo un error al generar el archivo Excel. Por favor, revisa la consola para más detalles.");
    }
  }

  // ── Export Stock + Market Prices to Excel ──────────────────────────────────
  async function exportStockToExcel() {
    try {
      const formatNum = (v) => v ? Number(v) : 0;

      // Cache de árboles ya calculados (evita recalcular si varias filas salen del mismo árbol)
      const profitCache = new Map();
      const getEstimatedProfit = async (item) => {
        // El árbol se arma igual que en el botón "Ver árbol" de esta fila: desde
        // el vehículo principal de la operación donde entró el auto. Antes se
        // armaba desde el chasis del propio auto en stock, y en una parte de pago
        // eso es otro vehículo: el Excel mostraba una ganancia distinta a la del
        // árbol en pantalla. Si la operación no aparece, queda el criterio viejo.
        const sourceOp = operations.find(o => o.id === item.operation_id);
        const lookupId = getTreeSeedId(sourceOp) || (item.chasis || '').trim() || (item.chapa || '').trim();
        if (!lookupId) return '';
        // Un mismo auto puede estar en más de una cadena: la clave es la operación.
        const cacheKey = sourceOp?.id || lookupId;
        if (profitCache.has(cacheKey)) return profitCache.get(cacheKey);
        try {
          const trace = await db.getVehicleTraceability(lookupId, operations, sourceOp?.id);
          const stats = financials.getTreeStats(trace);
          profitCache.set(cacheKey, stats.totalProfit);
          return stats.totalProfit;
        } catch (e) {
          return '';
        }
      };

      const exportData = await Promise.all(filteredStockVehicles.map(async (item) => {
        const vId = marketKey(item);
        const md = stockMarketData[vId];
        const estimatedProfit = await getEstimatedProfit(item);
        return {
          'Vehículo':             item.description || '',
          'Chapa':                item.chapa || '',
          'Chasis':               item.chasis || '',
          'Ingreso':              item.entry_date || '',
          'Origen':               item.source_type === 'COMPRA' ? 'PROPIO' : 'TRADE-IN',
          'Costo USD':            formatNum(item.valuation),
          'Ganancia Est. USD':    estimatedProfit === '' ? '' : formatNum(estimatedProfit),
          'Clasipar USD':         md && !md.isLoading ? formatNum(md.clasipar)    : '',
          'Marketplace USD':      md && !md.isLoading ? formatNum(md.marketplace) : '',
          'Instagram USD':        md && !md.isLoading ? formatNum(md.instagram)   : '',
          'Internet USD':         md && !md.isLoading ? formatNum(md.internet)    : '',
          'Prom. Mercado USD':    md && !md.isLoading ? formatNum(md.promedio)    : '',
          'Comp. $ (USD)':        md && !md.isLoading ? formatNum(md.diffDollar)  : '',
          'Comp. %':              md && !md.isLoading ? `${md.diffPercent}%`       : '',
          'Datos Reales':         md && !md.isLoading ? (
            md.isRealData
              ? `SÍ (${[md.realSources?.clasipar ? 'Clasipar' : '', md.realSources?.marketplace ? 'FB' : '', md.realSources?.instagram ? 'IG' : ''].filter(Boolean).join(', ')})`
              : 'ESTIMADO (No se hallaron coincidencias)'
          ) : 'PENDIENTE',
          'Última Actualización':   md && !md.isLoading && md.updatedAt ? md.updatedAt : '',
        };
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook  = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Stock y Mercado');
      worksheet['!cols'] = [
        {wch:30},{wch:12},{wch:18},{wch:14},{wch:12},
        {wch:13},{wch:15},{wch:15},{wch:16},{wch:14},{wch:14},{wch:17},{wch:13},{wch:10},{wch:13},{wch:22}
      ];
      const fecha = new Date().toISOString().slice(0,10);
      XLSX.writeFile(workbook, `Stock_Mercado_${fecha}.xlsx`);
    } catch (err) {
      console.error('Error exportando stock:', err);
      alert('Error al generar el archivo Excel.');
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
          // Desde el domingo a las 00:00 (antes arrancaba a la hora actual).
          const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
          return date >= start && date <= now;
        }
        case 'month': return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        case 'lastMonth': {
          // Día 1 del mes anterior (setMonth fallaba los días 29 a 31: 31/03 → "03/03").
          const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
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
          // Fechas locales y el día final completo (new Date("aaaa-mm-dd") es UTC
          // y dejaba afuera el último día).
          const s = parseLocal(customRange.start);
          const e = parseLocal(customRange.end); e.setHours(23, 59, 59, 999);
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

  const filteredStockVehicles = stockVehicles.filter(item => {
    if (!isDateInRange(item.entry_date)) return false;
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      (item.chapa || '').toLowerCase().includes(query) ||
      (item.chasis || '').toLowerCase().includes(query) ||
      (item.description || '').toLowerCase().includes(query)
    );
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
          {canQuickLoad && (
            <button className={`btn ${activeTab === 'quickload' ? 'btn-primary' : ''}`} onClick={() => { setActiveTab('quickload'); setIsMenuOpen(false); }}>
              <Zap size={20} /> Carga Rápida
            </button>
          )}
          {userProfile?.is_admin && (
            <button className={`btn ${activeTab === 'users' ? 'btn-primary' : ''}`} onClick={() => { setActiveTab('users'); setIsMenuOpen(false); }}>
              <Users size={20} /> Usuarios
            </button>
          )}
        </nav>

        <div className="sidebar-footer">
          {/* Indicador de estado Realtime */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '8px 12px', borderRadius: '10px', marginBottom: '10px',
            background: realtimeStatus === 'CONNECTED'
              ? 'rgba(16, 185, 129, 0.08)'
              : realtimeStatus === 'CONNECTING'
              ? 'rgba(251, 191, 36, 0.08)'
              : 'rgba(239, 68, 68, 0.08)',
            border: `1px solid ${
              realtimeStatus === 'CONNECTED' ? 'rgba(16,185,129,0.25)'
              : realtimeStatus === 'CONNECTING' ? 'rgba(251,191,36,0.25)'
              : 'rgba(239,68,68,0.25)'
            }`
          }}>
            <span style={{
              width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
              background: realtimeStatus === 'CONNECTED' ? '#10b981'
                : realtimeStatus === 'CONNECTING' ? '#fbbf24'
                : '#ef4444',
              boxShadow: realtimeStatus === 'CONNECTED'
                ? '0 0 6px #10b981'
                : realtimeStatus === 'CONNECTING'
                ? '0 0 6px #fbbf24'
                : '0 0 6px #ef4444',
              animation: realtimeStatus === 'CONNECTING' ? 'pulse 1.5s infinite' : 'none'
            }} />
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>
              {realtimeStatus === 'CONNECTED' ? 'SYNC EN TIEMPO REAL'
                : realtimeStatus === 'CONNECTING' ? 'CONECTANDO...'
                : 'SIN CONEXIÓN — REINTENTANDO'}
            </span>
          </div>

          <div className="glass" style={{ padding: '16px', borderRadius: '14px', marginBottom: '16px', background: 'rgba(255,255,255,0.02)', border: !userProfile ? '1px solid #ef4444' : '1px solid transparent' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
              <span>Sesión activa</span>
              <span style={{ color: userProfile?.can_edit ? '#10b981' : '#ef4444' }}>{userProfile ? (userProfile.can_edit ? 'MODO EDITOR' : hasViewAccess ? 'MODO LECTURA' : 'SIN ACCESO') : 'PERFIL NO ENCONTRADO'}</span>
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
            <h1 className="h1-responsive">{activeTab === 'operations' ? 'Operaciones' : activeTab === 'stock' ? 'Inventario' : activeTab === 'tree' ? 'Trazabilidad' : activeTab === 'quickload' ? 'Carga Rápida' : 'Analítica'}</h1>
            <h2 style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>{activeTab === 'operations' ? 'Gestión de transacciones' : activeTab === 'stock' ? 'Vehículos en stock' : activeTab === 'tree' ? 'Cadena de valor' : activeTab === 'quickload' ? 'Completar entrega, cuotas y crédito' : 'KPIs Financieros'}</h2>
            {userProfile && !hasViewAccess && (
              <div style={{ marginTop: '12px', padding: '12px 16px', borderRadius: '12px', border: '1px solid #ef4444', background: 'rgba(239,68,68,0.08)', color: 'white', fontSize: '14px' }}>
                Tu usuario todavía no tiene acceso a los datos. Pedile a un administrador que te habilite en «Usuarios».
              </div>
            )}
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
            <button 
              className="btn btn-outline" 
              onClick={activeTab === 'stock' ? exportStockToExcel : exportToExcel} 
              style={{ height: '40px', padding: '0 12px' }}
              title={activeTab === 'stock' ? 'Descargar Stock con precios de mercado' : 'Descargar reporte de operaciones'}
            >
              <Download size={16} />
            </button>
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
                <div style={{ color: 'var(--text-muted)', fontSize: '11px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>Inversión</div>
                {isTreeLoading ? (
                  <div className="skeleton" style={{ height: '20px', width: '80%', marginTop: '4px' }}></div>
                ) : (
                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#3b82f6' }}>USD {(stats.totalInvestment ?? 0).toLocaleString()}</div>
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
                  <>
                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: (stats.totalProfit ?? 0) > 0 ? '#10b981' : '#ef4444' }}>USD {Math.round(stats.totalProfit ?? 0).toLocaleString()}</div>
                    {stats.missingCostCount > 0 && (
                      <div style={{ fontSize: '10px', color: '#fbbf24' }} title="Hay compras con total en cero o ventas sin su compra cargada: la ganancia de esta cadena sale inflada.">⚠ falta el costo de {stats.missingCostCount} operación(es)</div>
                    )}
                  </>
                )}
              </div>
            </div>
            
            <div className="card glass" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ background: 'rgba(251, 191, 36, 0.1)', padding: '8px', borderRadius: '10px', display: 'flex', flexShrink: 0 }}>
                <Package color="#fbbf24" size={18} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '11px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>Partes de Pago sin Vender</div>
                {isTreeLoading ? (
                  <div className="skeleton" style={{ height: '20px', width: '80%', marginTop: '4px' }}></div>
                ) : (
                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#fbbf24' }}>USD {(stats.unsoldTradeInValue ?? 0).toLocaleString()} <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'normal' }}>({stats.unsoldTradeInCount ?? 0} uni)</span></div>
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

            <div className="card glass" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '8px', borderRadius: '10px', display: 'flex', flexShrink: 0 }}>
                <TrendingUp color="#ef4444" size={18} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '11px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>Comisión de Ventas</div>
                {isTreeLoading ? (
                  <div className="skeleton" style={{ height: '20px', width: '80%', marginTop: '4px' }}></div>
                ) : (
                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#ef4444' }}>USD {(stats.totalCommission ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                )}
              </div>
            </div>

          </div>
        )}

        <section className="animate-in">
          {activeTab === 'operations' && (() => {
            // La última operación cargada en toda la base (no la del filtro).
            const ultima = latestLoaded(operations);
            const alta = creation(ultima);
            if (!ultima || !alta) return null;
            return (
              <div className="glass" style={{ padding: '10px 16px', borderRadius: '12px', marginBottom: '16px', fontSize: '13px', color: 'var(--text-muted)', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                <span>Última operación cargada:</span>
                <b style={{ color: 'white' }}>{ultima.buyer || 'sin cliente'}</b>
                <span>({ultima.operation_type}{ultima.date ? `, ${ultima.date}` : ''})</span>
                <span>· {alta.cuando}{alta.quien ? <> por <b style={{ color: 'white' }}>{alta.quien}</b></> : null}</span>
              </div>
            );
          })()}
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
            <div className="card glass card-table">
              <StockTable
                stock={filteredStockVehicles}
                onSellVehicle={userProfile?.can_edit ? handleOpenBranchModal : null}
                onViewTree={handleViewTreeFromStock}
                marketData={stockMarketData}
                setMarketData={setStockMarketData}
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
                   onUseAsTradeIn={userProfile?.can_edit ? handleUseAsTradeIn : null}
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
              trees={financials.getTreesOverview(operations)}
              stock={stockVehicles}
              onSelectTree={handleSelectTree}
            />
          )}

          {activeTab === 'quickload' && canQuickLoad && (
            <QuickLoad
              operations={operations}
              formatMoney={formatMoney}
              parseMoney={parseMoney}
              onSave={handleQuickSave}
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

            <form key={editingOperation?.id || preFilledData?.operation_id || 'new'} onSubmit={handleSaveOperation}>
              <div className="form-grid-2" style={{ marginBottom: '16px' }}>
                <div>
                  <label>Tipo</label>
                  <select 
                    name="type" 
                    required 
                    defaultValue={editingOperation?.operation_type?.toLowerCase() || preFilledData?.type?.toLowerCase() || 'venta'}
                  >
                    <option value="">Seleccionar...</option>
                    <option value="venta">Venta</option>
                    <option value="compra">Compra</option>
                    <option value="rescisión">Rescisión</option>
                    <option value="remate">Remate</option>
                  </select>
                </div>
                <div>
                  <label>Pago</label>
                  <select 
                    name="payment" 
                    required 
                    defaultValue={editingOperation?.payment_type?.toLowerCase() || preFilledData?.payment?.toLowerCase() || 'contado'}
                  >
                    <option value="">Seleccionar...</option>
                    <option value="crédito">Crédito</option>
                    <option value="contado">Contado</option>
                  </select>
                </div>
              </div>
              
              <div className="form-grid-2" style={{ marginBottom: '16px' }}>
                <div>
                  <label>Fecha</label>
                  <input
                    name="date"
                    type="date"
                    required
                    defaultValue={
                      editingOperation ? (editingOperation.date.includes('/') ? editingOperation.date.split('/').reverse().join('-') : editingOperation.date) :
                      (preFilledData?.date || new Date().toLocaleDateString('en-CA')) /* hoy en hora local (aaaa-mm-dd); toISOString daba el día siguiente desde las 21:00 */
                    }
                  />
                </div>
                <div className="form-grid-2-nested">
                  <div><label>Chapa</label><input name="chapa" defaultValue={(editingOperation ? editingPrincipal?.chapa : preFilledData?.chapa) || ''} /></div>
                  <div><label>Chasis</label><input name="chasis" defaultValue={(editingOperation ? editingPrincipal?.chasis : preFilledData?.chasis) || ''} /></div>
                </div>
              </div>

              <label>Descripción del Vehículo</label>
              <input name="description" defaultValue={(editingOperation ? editingPrincipal?.description : preFilledData?.description) || ''} />
              
              <label>Comprador / Vendedor</label>
              <input name="buyer" defaultValue={editingOperation?.buyer || preFilledData?.buyer || ''} placeholder="Nombre completo" />

              <label>Asesor de Ventas</label>
              <input name="seller_name" defaultValue={editingOperation?.seller_name || preFilledData?.seller_name || ''} placeholder="Nombre de quien vendió el vehículo" />

              <div className="form-grid-3" style={{ marginTop: '16px' }}>
                 <div><label>Entrega Contado</label><input name="delivery_amount" type="text" onChange={(e) => e.target.value = formatMoney(e.target.value)} defaultValue={formatMoney(editingOperation?.delivery_amount || preFilledData?.delivery_amount || 0)} placeholder="0" /></div>
                 <div><label>Cuotas</label><input name="installments" type="number" defaultValue={editingOperation?.installments || preFilledData?.installments || 0} placeholder="0" /></div>
                 <div><label>Monto Crédito</label><input name="credit_amount" type="text" onChange={(e) => e.target.value = formatMoney(e.target.value)} defaultValue={formatMoney(editingOperation?.credit_amount || preFilledData?.credit_amount || 0)} placeholder="0" /></div>
              </div>

              <label style={{ marginTop: '16px' }}>Monto Total (Total Operación)</label>
              <input name="amount" type="text" onChange={(e) => e.target.value = formatMoney(e.target.value)} defaultValue={formatMoney(editingOperation?.total_amount || preFilledData?.amount || 0)} placeholder="0.00" />
              
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
                <button type="submit" className="btn btn-primary" disabled={isSaving} style={{ width: '100%', height: '50px', opacity: isSaving ? 0.6 : 1 }}>
                  {isSaving ? 'Guardando…' : (editingOperation ? 'Guardar Cambios' : 'Finalizar y Vincular')}
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
