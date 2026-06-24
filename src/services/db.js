import { createClient } from '@supabase/supabase-js';

// Configuration from environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('ERROR: Supabase URL/Key no configurados. Verifica tu archivo .env');
}

export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder');

const listeners = new Set();

// ─────────────────────────────────────────────────────────────────────────────
// Flag para suprimir el notify de Realtime cuando la mutación fue local.
// Evita el double-fetch: mutación local → notify() + Realtime → notify() x2.
// ─────────────────────────────────────────────────────────────────────────────
let _isMutating = false;
let _realtimeChannel = null;
let _realtimeStatus = 'CONNECTING'; // 'CONNECTED' | 'ERROR' | 'DISCONNECTED' | 'CONNECTING'
const _statusListeners = new Set();

const setRealtimeStatus = (status) => {
  _realtimeStatus = status;
  _statusListeners.forEach(cb => cb(status));
};

// ─────────────────────────────────────────────────────────────────────────────
// Construye y suscribe el canal Realtime.
// Se llama al inicio y también cuando se detecta una desconexión.
// ─────────────────────────────────────────────────────────────────────────────
const buildRealtimeChannel = () => {
  // Limpiar canal anterior si existe
  if (_realtimeChannel) {
    try {
      supabase.removeChannel(_realtimeChannel);
    } catch (e) {
      // ignorar errores al limpiar
    }
    _realtimeChannel = null;
  }

  setRealtimeStatus('CONNECTING');

  _realtimeChannel = supabase
    .channel('realtime_changes_v2')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'operations' }, () => {
      if (_isMutating) {
        console.log('[Realtime] Skipping notify — local mutation in progress.');
        return;
      }
      console.log('[Realtime] Change detected in operations → notifying listeners');
      db.notify();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, () => {
      if (_isMutating) {
        console.log('[Realtime] Skipping notify — local mutation in progress.');
        return;
      }
      console.log('[Realtime] Change detected in vehicles → notifying listeners');
      db.notify();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
      if (_isMutating) return;
      console.log('[Realtime] Change detected in profiles → notifying listeners');
      db.notify();
    })
    .subscribe((status, err) => {
      console.log(`[Realtime] Channel status: ${status}`, err || '');

      if (status === 'SUBSCRIBED') {
        setRealtimeStatus('CONNECTED');
        console.log('[Realtime] ✅ Canal conectado correctamente.');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setRealtimeStatus('ERROR');
        console.warn(`[Realtime] ⚠️ Error de canal (${status}). Reconectando en 5s...`);
        setTimeout(() => {
          console.log('[Realtime] 🔄 Intentando reconexión...');
          buildRealtimeChannel();
        }, 5000);
      } else if (status === 'CLOSED') {
        setRealtimeStatus('DISCONNECTED');
        console.warn('[Realtime] 🔌 Canal cerrado.');
      }
    });

  return _realtimeChannel;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: ejecuta una mutación marcando _isMutating para suprimir el
// notify redundante de Realtime. Luego notifica manualmente UNA sola vez.
// ─────────────────────────────────────────────────────────────────────────────
const withMutation = async (fn) => {
  _isMutating = true;
  try {
    const result = await fn();
    // Notificar manualmente (el notify de Realtime llegará suprimido)
    db.notify();
    return result;
  } finally {
    // Liberar el flag después de 3s para no bloquear notificaciones ajenas
    setTimeout(() => { _isMutating = false; }, 3000);
  }
};

export const db = {
  subscribe: (callback) => {
    listeners.add(callback);
    return () => listeners.delete(callback);
  },

  subscribeStatus: (callback) => {
    _statusListeners.add(callback);
    callback(_realtimeStatus); // emitir estado actual inmediatamente
    return () => _statusListeners.delete(callback);
  },

  getRealtimeStatus: () => _realtimeStatus,

  notify: () => {
    listeners.forEach(cb => cb());
  },

  // Forzar reconexión del canal (útil para heartbeat desde App.jsx)
  ensureRealtimeConnected: () => {
    if (_realtimeStatus !== 'CONNECTED' && _realtimeStatus !== 'CONNECTING') {
      console.log('[Realtime] ensureRealtimeConnected → reconectando...');
      buildRealtimeChannel();
    }
  },

  getOperations: async () => {
    const { data, error } = await supabase
      .from('operations')
      .select('*, vehicles(*)')
      .order('date', { ascending: false });

    if (error) {
      console.error('Error fetching operations:', error);
      return [];
    }

    // Map snake_case to camelCase for the UI
    return data.map(op => ({
      ...op,
      parentId: op.parent_id,
      vehicles: op.vehicles || []
    }));
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Evita registrar dos veces el mismo vehículo (por chasis o chapa) como
  // principal en operaciones de tipo "compra". Esto pasaba por errores de
  // tipeo (ej. cargar el chasis en el campo chapa) y generaba árboles de
  // trazabilidad con el mismo vehículo conectado dos veces.
  // ─────────────────────────────────────────────────────────────────────────
  _checkDuplicateCompra: async (op, excludeOpId = null) => {
    if ((op.operation_type || '').toLowerCase() !== 'compra') return null;

    const principal = (op.vehicles || []).find(v => v && v.role === 'principal');
    const chasis = principal?.chasis?.trim().toUpperCase();
    const chapa = principal?.chapa?.trim().toUpperCase();
    if (!chasis && !chapa) return null;

    let query = supabase
      .from('operations')
      .select('id, date, vehicles(*)')
      .eq('operation_type', 'compra');
    if (excludeOpId) query = query.neq('id', excludeOpId);

    const { data, error } = await query;
    if (error) {
      console.error('Error validando compras duplicadas:', error);
      return null; // no bloquear el guardado por un fallo de validación
    }

    return (data || []).find(existingOp =>
      (existingOp.vehicles || []).some(v => {
        if (!v || v.role !== 'principal') return false;
        const vChasis = v.chasis?.trim().toUpperCase();
        const vChapa = v.chapa?.trim().toUpperCase();
        return (chasis && vChasis === chasis) || (chapa && vChapa === chapa);
      })
    ) || null;
  },

  addOperation: async (op) => {
    const duplicate = await db._checkDuplicateCompra(op);
    if (duplicate) {
      const err = new Error(
        `Ya existe una COMPRA registrada con este chasis/chapa (operación del ${duplicate.date}). ` +
        `Verificá los datos para evitar un registro duplicado.`
      );
      err.isDuplicateError = true;
      throw err;
    }

    return withMutation(async () => {
      // 1. Insert Operation
      const { data: opData, error: opError } = await supabase
        .from('operations')
        .insert([{
          user_id: op.user_id,
          operation_type: op.operation_type,
          payment_type: op.payment_type,
          date: op.date.split('/').reverse().join('-'),
          currency: op.currency,
          total_amount: op.total_amount,
          buyer: op.buyer,
          delivery_amount: op.delivery_amount || 0,
          installments: op.installments || 0,
          credit_amount: op.credit_amount || 0,
          parent_id: op.parentId || null
        }])
        .select()
        .single();

      if (opError) throw opError;

      // 2. Insert Vehicles
      if (op.vehicles && op.vehicles.length > 0) {
        const vehiclesToInsert = op.vehicles.map(v => ({
          operation_id: opData.id,
          chapa: v.chapa,
          chasis: v.chasis,
          description: v.description,
          color: v.color,
          role: v.role,
          valuation: v.valuation || 0
        }));

        const { error: vehError } = await supabase
          .from('vehicles')
          .insert(vehiclesToInsert);

        if (vehError) throw vehError;
      }

      return { ...opData, parentId: opData.parent_id };
    });
  },

  updateOperation: async (id, op) => {
    const duplicate = await db._checkDuplicateCompra(op, id);
    if (duplicate) {
      const err = new Error(
        `Ya existe OTRA COMPRA registrada con este chasis/chapa (operación del ${duplicate.date}). ` +
        `Verificá los datos para evitar un registro duplicado.`
      );
      err.isDuplicateError = true;
      throw err;
    }

    return withMutation(async () => {
      // 1. Update Operation
      const { data: opData, error: opError } = await supabase
        .from('operations')
        .update({
          operation_type: op.operation_type,
          payment_type: op.payment_type,
          date: op.date.split('/').reverse().join('-'),
          currency: op.currency,
          total_amount: op.total_amount,
          buyer: op.buyer,
          delivery_amount: op.delivery_amount || 0,
          installments: op.installments || 0,
          credit_amount: op.credit_amount || 0,
          parent_id: op.parentId || null
        })
        .eq('id', id)
        .select()
        .single();

      if (opError) throw opError;

      // 2. Update Vehicles (Delete old and insert new)
      const { error: delError } = await supabase
        .from('vehicles')
        .delete()
        .eq('operation_id', id);

      if (delError) throw delError;

      if (op.vehicles && op.vehicles.length > 0) {
        const vehiclesToInsert = op.vehicles.map(v => ({
          operation_id: id,
          chapa: v.chapa,
          chasis: v.chasis,
          description: v.description,
          color: v.color || '',
          role: v.role,
          valuation: v.valuation || 0
        }));

        const { error: vehError } = await supabase
          .from('vehicles')
          .insert(vehiclesToInsert);

        if (vehError) throw vehError;
      }

      return { ...opData, parentId: opData.parent_id };
    });
  },

  getVehicleTraceability: async (vehicleId, allOps = null) => {
    if (!allOps) allOps = await db.getOperations();
    if (!allOps || allOps.length === 0) return { nodes: [], edges: [] };

    const getVehId = (v) => (v && (v.chasis || v.chapa || '').trim().toUpperCase()) || '';
    const searchId = vehicleId.trim().toUpperCase();

    // 1. Initial set: ops containing search vehicleId
    let treeOps = allOps.filter(op => (op.vehicles || []).some(v => getVehId(v) === searchId));
    
    // 2. Expand recursively in memory
    let changed = true;
    while (changed) {
      changed = false;
      const currentIds = new Set(treeOps.map(o => o.id));
      
      allOps.forEach(op => {
        if (currentIds.has(op.id)) {
          // A. Upward Expansion (Parents)
          if (op.parent_id && !currentIds.has(op.parent_id)) {
            const p = allOps.find(o => o.id === op.parent_id);
            if (p) { treeOps.push(p); changed = true; }
          }
          const principal = (op.vehicles || []).find(v => v && v.role === 'principal');
          if (principal) {
            const pId = getVehId(principal);
            const smartParent = allOps.find(o => !currentIds.has(o.id) && (
              (o.vehicles || []).some(v => v && v.role === 'parte_pago' && getVehId(v) === pId) ||
              ((o.operation_type?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === 'compra' || 
                o.operation_type?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === 'rescision') && 
               (o.vehicles || []).some(v => v && v.role === 'principal' && getVehId(v) === pId))
            ));
            if (smartParent) { treeOps.push(smartParent); changed = true; }
          }

          // B. Downward Expansion (Children)
          const children = allOps.filter(o => o.parent_id === op.id && !currentIds.has(o.id));
          if (children.length > 0) { treeOps.push(...children); changed = true; }
          
          const tradeIns = (op.vehicles || []).filter(v => v && v.role === 'parte_pago');
          tradeIns.forEach(t => {
            const tId = getVehId(t);
            if (!tId) return;
            const smartChild = allOps.find(o => !currentIds.has(o.id) && (o.vehicles || []).some(v => v && v.role === 'principal' && getVehId(v) === tId));
            if (smartChild) { treeOps.push(smartChild); changed = true; }
          });

          const opTypeClean = op.operation_type?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          if (opTypeClean === 'compra' || opTypeClean === 'rescision') {
             const vId = getVehId(principal);
             if (vId) {
               const smartChild = allOps.find(o => !currentIds.has(o.id) && o.operation_type?.toLowerCase() === 'venta' && (o.vehicles || []).some(v => v && v.role === 'principal' && getVehId(v) === vId));
               if (smartChild) { treeOps.push(smartChild); changed = true; }
             }
          }
        }
      });
      if (currentIds.size === treeOps.length) changed = false;
    }

    const ops = treeOps;
    const opMap = new Map();
    ops.forEach(op => {
      opMap.set(op.id, { ...op, children: [], depth: 0 });
    });

    ops.forEach(op => {
      const principal = (op.vehicles || []).find(v => v && v.role === 'principal');
      const pId = getVehId(principal);
      
      let parentId = op.parent_id;
      if (!parentId && pId) {
        let smartParent = ops.find(o => (o.vehicles || []).some(v => v && v.role === 'parte_pago' && getVehId(v) === pId));
        
        const opType = op.operation_type?.toLowerCase();
        if (!smartParent && (opType === 'venta' || opType === 'remate')) {
          smartParent = ops.find(o => {
            const pType = o.operation_type?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            return (pType === 'compra' || pType === 'rescision') && (o.vehicles || []).some(v => v && v.role === 'principal' && getVehId(v) === pId);
          });
        }

        if (smartParent) parentId = smartParent.id;
      }

      if (parentId && opMap.has(parentId)) {
        opMap.get(parentId).children.push(op.id);
        opMap.get(op.id).effectiveParentId = parentId;
      }
    });

    const roots = ops.filter(op => !opMap.get(op.id).effectiveParentId);

    const visited = new Set();
    const setDepth = (id, depth) => {
      if (visited.has(id)) return;
      visited.add(id);
      const entry = opMap.get(id);
      entry.depth = Math.max(entry.depth, depth);
      entry.children.forEach(childId => setDepth(childId, depth + 1));
    };
    roots.forEach(r => setDepth(r.id, 0));

    // Cada raíz desconectada es un árbol independiente (puede haber más de una
    // si la expansión recursiva trae cadenas de vehículos distintas). Se le
    // asigna un índice de árbol a cada nodo para reservarle una banda vertical
    // propia y que nunca comparta coordenadas Y con nodos de otro árbol.
    const treeIndexOf = new Map();
    roots.forEach((root, idx) => {
      const stack = [root.id];
      while (stack.length) {
        const id = stack.pop();
        if (treeIndexOf.has(id)) continue;
        treeIndexOf.set(id, idx);
        opMap.get(id).children.forEach(childId => stack.push(childId));
      }
    });

    const treeDepthCounts = {}; // `${treeIdx}-${depth}` -> cantidad de nodos
    Array.from(opMap.values()).forEach(op => {
      const treeIdx = treeIndexOf.get(op.id) ?? 0;
      const key = `${treeIdx}-${op.depth}`;
      treeDepthCounts[key] = (treeDepthCounts[key] || 0) + 1;
    });
    const treeWidth = {}; // treeIdx -> máx. nodos en una misma profundidad
    Object.entries(treeDepthCounts).forEach(([key, count]) => {
      const treeIdx = key.split('-')[0];
      treeWidth[treeIdx] = Math.max(treeWidth[treeIdx] || 0, count);
    });
    const TREE_GAP = 400; // separación visual entre árboles distintos
    const treeYOffset = {}; // treeIdx -> y inicial reservado para ese árbol
    let runningOffset = 0;
    roots.forEach((root, idx) => {
      treeYOffset[idx] = runningOffset;
      runningOffset += (treeWidth[idx] || 1) * 800 + TREE_GAP;
    });

    const soldInChain = new Set();
    ops.forEach(op => {
      const epId = opMap.get(op.id).effectiveParentId;
      if (epId) {
        const principal = (op.vehicles || []).find(v => v && v.role === 'principal');
        const vId = getVehId(principal);
        if (vId) soldInChain.add(`${epId}-${vId}`);
      }
    });

    const nodes = [];
    const edges = [];
    const depthCounts = {}; // `${treeIdx}-${depth}` -> vIdx local a ese árbol

    Array.from(opMap.values()).sort((a, b) => a.depth - b.depth).forEach((op) => {
      const depth = op.depth;
      const treeIdx = treeIndexOf.get(op.id) ?? 0;
      const depthKey = `${treeIdx}-${depth}`;
      const vIdx = depthCounts[depthKey] || 0;
      depthCounts[depthKey] = vIdx + 1;
      const nodeId = `node-${op.id}`;
      const principalV = (op.vehicles || []).find(v => v && v.role === 'principal');
      const pIdStr = getVehId(principalV);

      const tradeInsData = (op.vehicles || [])
        .filter(veh => veh && veh.role === 'parte_pago')
        .map(t => ({
          description: t.description,
          amount: t.valuation,
          chapa: t.chapa,
          chasis: t.chasis,
          isExit: op.operation_type === 'compra',
          isSold: getVehId(t) ? soldInChain.has(`${op.id}-${getVehId(t)}`) : false
        }));

      const tradeInTotal = tradeInsData.reduce((s, t) => s + (Number(t.amount) || 0), 0);
      // Si no se ingresó total_amount, calcularlo desde delivery + credit + partes de pago
      const effectiveTotal = Number(op.total_amount) ||
        ((Number(op.delivery_amount) || 0) + (Number(op.credit_amount) || 0) + tradeInTotal);

      nodes.push({
        id: nodeId,
        type: 'vehicle',
        data: {
          operation_id: op.id,
          operation_type: op.operation_type,
          payment_type: op.payment_type,
          date: new Date(op.date).toLocaleDateString('es-PY', { timeZone: 'UTC' }),
          client_name: op.buyer,
          vehicle_description: principalV?.description || 'Operación de Sistema',
          chapa: principalV?.chapa || '',
          chasis: principalV?.chasis || '',
          isPrincipalSold: pIdStr ? soldInChain.has(`${op.id}-${pIdStr}`) : false,
          currency: op.currency,
          total_amount: effectiveTotal,
          delivery_amount: op.delivery_amount,
          installments: op.installments,
          credit_amount: op.credit_amount,
          trade_ins: tradeInsData,
          raw_data: op
        },
        position: { x: depth * 750, y: treeYOffset[treeIdx] + vIdx * 800 + 50 }
      });

      const epId = opMap.get(op.id).effectiveParentId;
      if (epId) {
        let sourceHandle = 'main';
        const parentOp = opMap.get(epId);
        const childPrincipal = (op.vehicles || []).find(v => v && v.role === 'principal');
        if (childPrincipal && parentOp) {
          const childUid = getVehId(childPrincipal);
          const pPrincipal = (parentOp.vehicles || []).find(v => v && v.role === 'principal');
          const pPrincipalUid = getVehId(pPrincipal);
          if (childUid !== pPrincipalUid) {
            const tradeIns = (parentOp.vehicles || []).filter(v => v && v.role === 'parte_pago');
            const tIdx = tradeIns.findIndex(v => getVehId(v) === childUid);
            if (tIdx !== -1) sourceHandle = `tradein-${tIdx}`;
          }
        }
        edges.push({ 
          id: `e-${epId}-${op.id}`, 
          source: `node-${epId}`, 
          sourceHandle, 
          target: nodeId, 
          animated: true,
          style: { stroke: 'var(--primary)', strokeWidth: 2 } 
        });
      }
    });

    return { nodes, edges };
  },

  deleteOperation: async (id) => {
    return withMutation(async () => {
      const { error } = await supabase
        .from('operations')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return true;
    });
  },

  getProfile: async (userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (error) {
      console.error('Error fetching profile:', error);
      return null;
    }
    return data;
  },

  getAllProfiles: async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('email');
    
    if (error) {
      console.error('Error fetching profiles:', error);
      return [];
    }
    return data;
  },

  updateProfile: async (userId, updates) => {
    return withMutation(async () => {
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    });
  },

  updateVehicleMarketData: async (vId, marketData) => {
    const { error } = await supabase
      .from('vehicles')
      .update({ market_data: marketData })
      .eq('id', vId);
    
    if (error) {
      console.error('Error guardando market_data en DB:', error);
      return false;
    }
    return true;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Inicializar canal Realtime DESPUÉS de que `db` esté completamente definido
// (Fix Bug #1: antes se inicializaba antes de la definición de `db`)
// ─────────────────────────────────────────────────────────────────────────────
buildRealtimeChannel();
