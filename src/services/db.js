import { createClient } from '@supabase/supabase-js';
import { vehKey, opType, opTime, resolveLineageCached, lineageRoots } from './lineage.js';
import { assertValidOperation, parseOpDate } from './validation.js';

// Configuration from environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('ERROR: Supabase URL/Key no configurados. Verifica tu archivo .env');
}

export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder');

// Quita TODOS los espacios (no solo los de los extremos) de chasis/chapa.
// Un espacio de más/menos hacía que el mismo vehículo no matchee al comparar
// chasis/chapa entre operaciones, generando duplicados y árboles incorrectos.
const stripSpaces = (str) => (str || '').replace(/\s+/g, '');

const listeners = new Set();

// ─────────────────────────────────────────────────────────────────────────────
// Realtime: antes, durante 3 s después de cada guardado propio se ignoraban
// TODOS los cambios (también los de otros usuarios). Ahora no se ignora nada:
// los avisos se agrupan (notify con debounce) para no recargar varias veces
// por una misma mutación, y App descarta respuestas viejas de getOperations.
// ─────────────────────────────────────────────────────────────────────────────
let _notifyTimer = null;
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
      db.notify();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, () => {
      db.notify();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
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

// Ejecuta una mutación y avisa a la pantalla para que recargue.
const withMutation = async (fn) => {
  const result = await fn();
  db.notify();
  return result;
};

const vehicleRow = (v) => ({
  chapa: stripSpaces(v.chapa),
  chasis: stripSpaces(v.chasis),
  description: v.description,
  role: v.role,
  valuation: v.valuation || 0,
});

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
    clearTimeout(_notifyTimer);
    _notifyTimer = setTimeout(() => listeners.forEach(cb => cb()), 250);
  },

  // Forzar reconexión del canal (útil para heartbeat desde App.jsx)
  ensureRealtimeConnected: () => {
    if (_realtimeStatus !== 'CONNECTED' && _realtimeStatus !== 'CONNECTING') {
      console.log('[Realtime] ensureRealtimeConnected → reconectando...');
      buildRealtimeChannel();
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Lee TODAS las operaciones en lotes. Supabase corta cada respuesta en
  // "Max rows" (1.000 por defecto) sin avisar, y antes la app hacía una sola
  // lectura: pasando las 1.000 operaciones, las más viejas desaparecían de la
  // pantalla, del árbol y de los cálculos.
  //
  // - Se avanza por id (id > último leído), no por posición: si alguien carga o
  //   borra una operación mientras se lee, no se saltea ni se repite ninguna.
  // - Se sigue hasta que un lote vuelve VACÍO, no "hasta que vuelva corto": si
  //   Max rows se configura por debajo de PAGE, igual se lee todo.
  // - Si un lote falla, se lanza el error en vez de devolver una lista parcial
  //   o vacía; la pantalla conserva lo que ya mostraba.
  // ─────────────────────────────────────────────────────────────────────────
  OPERATIONS_PAGE: 1000,

  getOperations: async () => {
    const all = [];
    const seen = new Set();
    let lastId = null;
    for (let guard = 0; guard < 10000; guard++) {
      let q = supabase
        .from('operations')
        .select('*, vehicles(*)')
        .order('id', { ascending: true })
        .limit(db.OPERATIONS_PAGE);
      if (lastId !== null) q = q.gt('id', lastId);

      const { data, error } = await q;
      if (error) {
        console.error('Error leyendo operaciones:', error);
        throw error;
      }
      if (!data || data.length === 0) break;
      data.forEach(op => {
        if (seen.has(op.id)) return;
        seen.add(op.id);
        all.push(op);
      });
      lastId = data[data.length - 1].id;
    }

    // Orden de pantalla: fecha más reciente primero; a igual fecha, la última cargada.
    all.sort((a, b) =>
      String(b.date || '').localeCompare(String(a.date || '')) ||
      String(b.created_at || '').localeCompare(String(a.created_at || ''))
    );

    // Map snake_case to camelCase for the UI
    return all.map(op => ({
      ...op,
      parentId: op.parent_id,
      vehicles: op.vehicles || []
    }));
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Compra de un auto que ya está en stock = probable duplicado.
  // Se mira el estado del auto a la fecha de la nueva compra: entradas
  // (compra/rescisión, parte de pago recibida) contra salidas (venta/remate,
  // parte de pago entregada en una compra). Antes sólo contaba como salida una
  // venta, así que recomprar un auto que se había entregado como parte de pago
  // quedaba bloqueado. Sólo trae las operaciones de ese auto, no toda la base.
  // ─────────────────────────────────────────────────────────────────────────
  _checkDuplicateCompra: async (op, excludeOpId = null) => {
    if (opType(op) !== 'compra') return null;

    const principal = (op.vehicles || []).find(v => v && v.role === 'principal');
    const key = vehKey(principal);
    const ids = [stripSpaces(principal?.chasis), stripSpaces(principal?.chapa)]
      .map(x => (x || '').toUpperCase().replace(/[^A-Z0-9-]/g, ''))
      .filter(Boolean);
    if (!key || ids.length === 0) return null;
    const idSet = new Set(ids);
    const norm = (x) => stripSpaces(x).toUpperCase();
    const sameCar = (v) => v && (idSet.has(norm(v.chasis)) || idSet.has(norm(v.chapa)));

    const filter = [...new Set(ids)].flatMap(x => [`chasis.ilike.${x}`, `chapa.ilike.${x}`]).join(',');
    const { data: vehs, error } = await supabase.from('vehicles').select('operation_id').or(filter);
    if (error) {
      console.error('Error validando compras duplicadas:', error);
      return null; // no bloquear el guardado por un fallo de validación
    }
    const opIds = [...new Set((vehs || []).map(v => v.operation_id))].filter(id => id && id !== excludeOpId);
    if (opIds.length === 0) return null;
    const { data: related, error: opErr } = await supabase
      .from('operations').select('id, date, created_at, operation_type, vehicles(*)').in('id', opIds);
    if (opErr) {
      console.error('Error validando compras duplicadas:', opErr);
      return null;
    }

    const parsed = parseOpDate(op.date);
    const refTime = parsed?.date ? parsed.date.getTime() : Date.now();
    let entries = 0, exits = 0, lastEntry = null;
    (related || []).filter(o => opTime(o) <= refTime).forEach(o => {
      const t = opType(o);
      const sale = t === 'venta' || t === 'remate';
      (o.vehicles || []).filter(sameCar).forEach(v => {
        const isEntry = sale ? v.role === 'parte_pago' : v.role === 'principal';
        if (isEntry) {
          entries++;
          if (!lastEntry || opTime(o) > opTime(lastEntry)) lastEntry = o;
        } else {
          exits++;
        }
      });
    });
    if (!lastEntry) return null;
    return { operation: lastEntry, alreadySold: entries <= exits };
  },

  addOperation: async (op) => {
    assertValidOperation(op);
    const dup = await db._checkDuplicateCompra(op);
    if (dup && !dup.alreadySold) {
      const err = new Error(
        `Este chasis/chapa ya está en stock: entró el ${dup.operation.date} y todavía no salió. ` +
        `Verificá que no sea una compra duplicada antes de guardar.`
      );
      err.isDuplicateError = true;
      throw err;
    }
    if (dup && dup.alreadySold) {
      const proceed = window.confirm(
        `Este chasis/chapa ya pasó por la empresa (última entrada el ${dup.operation.date}) y ya salió. ` +
        `¿Confirmás que es una recompra y querés continuar?`
      );
      if (!proceed) {
        const err = new Error('Guardado cancelado.');
        err.isDuplicateError = true;
        err.cancelled = true;
        throw err;
      }
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
          seller_name: op.seller_name || null,
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
          ...vehicleRow(v),
          operation_id: opData.id,
          color: v.color || '',
        }));

        const { error: vehError } = await supabase
          .from('vehicles')
          .insert(vehiclesToInsert);

        if (vehError) {
          // Sin esto quedaba una operación sin vehículos.
          await supabase.from('operations').delete().eq('id', opData.id);
          throw vehError;
        }
      }

      return { ...opData, parentId: opData.parent_id };
    });
  },

  updateOperation: async (id, op) => {
    assertValidOperation(op);
    const dup = await db._checkDuplicateCompra(op, id);
    if (dup && !dup.alreadySold) {
      const err = new Error(
        `Este chasis/chapa ya está en stock por OTRA operación (entró el ${dup.operation.date}) ` +
        `y todavía no salió. Verificá que no sea una compra duplicada antes de guardar.`
      );
      err.isDuplicateError = true;
      throw err;
    }
    if (dup && dup.alreadySold) {
      const proceed = window.confirm(
        `Este chasis/chapa ya pasó por la empresa en OTRA operación (última entrada el ${dup.operation.date}) ` +
        `y ya salió. ¿Confirmás que es una recompra y querés continuar?`
      );
      if (!proceed) {
        const err = new Error('Guardado cancelado.');
        err.isDuplicateError = true;
        err.cancelled = true;
        throw err;
      }
    }

    return withMutation(async () => {
      const { data: existing, error: exError } = await supabase
        .from('vehicles')
        .select('*')
        .eq('operation_id', id);
      if (exError) throw exError;

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
          seller_name: op.seller_name || null,
          delivery_amount: op.delivery_amount || 0,
          installments: op.installments || 0,
          credit_amount: op.credit_amount || 0,
          parent_id: op.parentId || null
        })
        .eq('id', id)
        .select()
        .single();

      if (opError) throw opError;

      // 2. Vehículos sin borrar todo: antes se borraban todos y se volvían a
      // insertar (si fallaba a mitad, la operación quedaba sin autos, y en cada
      // edición se perdían el color, los datos de mercado y los ids). Ahora se
      // actualiza cada fila existente, se agregan las nuevas y recién al final
      // se borran las que el usuario sacó.
      const prevById = new Map((existing || []).map(v => [v.id, v]));
      const kept = new Set();
      const toInsert = [];
      for (const v of op.vehicles || []) {
        const row = vehicleRow(v);
        const prev = v.id ? prevById.get(v.id) : null;
        if (prev && !kept.has(prev.id)) {
          kept.add(prev.id);
          const patch = { ...row, color: v.color ?? prev.color ?? '' };
          // Si cambió el auto, los precios de mercado guardados ya no son de este.
          if (vehKey(prev) !== vehKey(row)) patch.market_data = null;
          const { error: upError } = await supabase.from('vehicles').update(patch).eq('id', prev.id);
          if (upError) throw upError;
        } else {
          toInsert.push({ ...row, operation_id: id, color: v.color || '' });
        }
      }
      if (toInsert.length > 0) {
        const { error: insError } = await supabase.from('vehicles').insert(toInsert);
        if (insError) throw insError;
      }
      const toDelete = (existing || []).filter(v => !kept.has(v.id)).map(v => v.id);
      if (toDelete.length > 0) {
        const { error: delError } = await supabase.from('vehicles').delete().in('id', toDelete);
        if (delError) throw delError;
      }

      return { ...opData, parentId: opData.parent_id };
    });
  },

  // Carga rápida: actualiza solo algunos campos de una operación
  // (fecha, tipo, entrega contado, cuotas, monto crédito). No toca los
  // vehículos ni corre la validación de compra duplicada, así que es mucho
  // más liviano/rápido que updateOperation. Pensado para completar/corregir
  // datos en lote. Solo se envían a la base los campos efectivamente pasados.
  updateOperationQuick: async (id, fields) => {
    const payload = {};
    if ('delivery_amount' in fields) payload.delivery_amount = fields.delivery_amount || 0;
    if ('installments' in fields) payload.installments = fields.installments || 0;
    if ('credit_amount' in fields) payload.credit_amount = fields.credit_amount || 0;
    if ('payment_type' in fields && fields.payment_type) payload.payment_type = fields.payment_type;
    // La fecha llega como dd/mm/yyyy (igual que en el resto de la app) y se
    // guarda como yyyy-mm-dd, tal cual hace updateOperation/addOperation.
    if ('date' in fields && fields.date) payload.date = fields.date.split('/').reverse().join('-');
    if (payload.date) {
      const pd = parseOpDate(payload.date);
      const maxYear = new Date().getFullYear() + 1;
      if (!pd || pd.invalid || pd.y < 2000 || pd.y > maxYear) throw new Error('La fecha no es válida.');
    }
    if (['delivery_amount', 'installments', 'credit_amount'].some(k => k in payload && payload[k] < 0)) {
      throw new Error('Hay montos negativos.');
    }

    return withMutation(async () => {
      const { data, error } = await supabase
        .from('operations')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return { ...data, parentId: data.parent_id };
    });
  },

  // Árbol (cadena) de un vehículo. seedOpId, si viene, es la operación desde la
  // que se pidió el árbol: un mismo auto puede estar en más de una cadena (se
  // compró, se vendió y años después volvió como parte de pago de otro trato), y
  // hay que mostrar la cadena de ESA operación, no la de cualquiera que tenga el
  // auto.
  getVehicleTraceability: async (vehicleId, allOps = null, seedOpId = null) => {
    if (!allOps) allOps = await db.getOperations();
    if (!allOps || allOps.length === 0) return { nodes: [], edges: [] };

    const getVehId = (v) => vehKey(v);
    const searchId = stripSpaces(vehicleId).toUpperCase();

    // 1. Linaje de todas las operaciones (de qué operación viene cada una).
    //    Nunca cuelga una operación de otra posterior: ver services/lineage.js.
    const lineage = resolveLineageCached(allOps);
    const roots = lineageRoots(allOps, lineage);

    // 2. Operación de partida y su cadena.
    const searchedOp =
      (seedOpId && allOps.find(op => op.id === seedOpId)) ||
      allOps.find(op => (op.vehicles || []).some(v => getVehId(v) === searchId));
    if (!searchedOp) return { nodes: [], edges: [] };
    const targetRoot = roots.get(searchedOp.id);
    const relevantOps = allOps.filter(op => roots.get(op.id) === targetRoot);

    const opMap = new Map();
    relevantOps.forEach(op => {
      opMap.set(op.id, { ...op, children: [], depth: 0 });
    });
    relevantOps.forEach(op => {
      const link = lineage.get(op.id);
      if (link && opMap.has(link.parentId)) {
        opMap.get(link.parentId).children.push(op.id);
        opMap.get(op.id).effectiveParentId = link.parentId;
        opMap.get(op.id).viaVehicle = link.viaVehicle;
      }
    });

    const visited = new Set();
    const setDepth = (id, depth) => {
      if (visited.has(id)) return;
      visited.add(id);
      const entry = opMap.get(id);
      entry.depth = Math.max(entry.depth, depth);
      entry.children.forEach(childId => setDepth(childId, depth + 1));
    };
    if (opMap.has(targetRoot)) setDepth(targetRoot, 0);

    // Vehículos que ya salieron de cada operación hacia otra de la cadena
    // (clave "<operación>-<vehículo>"): el auto con el que se armó el vínculo.
    const soldInChain = new Set();
    relevantOps.forEach(op => {
      const entry = opMap.get(op.id);
      if (entry.effectiveParentId && entry.viaVehicle) {
        soldInChain.add(`${entry.effectiveParentId}-${entry.viaVehicle}`);
      }
    });

    const nodes = [];
    const edges = [];
    const depthCounts = {}; // depth -> vIdx

    relevantOps.map(op => opMap.get(op.id)).sort((a, b) => a.depth - b.depth).forEach((op) => {
      const depth = op.depth;
      const vIdx = depthCounts[depth] || 0;
      depthCounts[depth] = vIdx + 1;
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
          seller_name: op.seller_name || '',
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
        position: { x: depth * 750, y: vIdx * 800 + 50 }
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
