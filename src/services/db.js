import { createClient } from '@supabase/supabase-js';

// Configuration from environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('ERROR: Supabase URL/Key no configurados. Verifica tu archivo .env');
}

export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder');

const listeners = new Set();

// Supabase Realtime Subscription
// Note: Ensure Realtime is enabled for these tables in the Supabase Dashboard
supabase
  .channel('realtime_changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'operations' }, (payload) => {
    console.log('Realtime change in operations:', payload);
    db.notify();
  })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, (payload) => {
    console.log('Realtime change in vehicles:', payload);
    db.notify();
  })
  .subscribe();

export const db = {
  subscribe: (callback) => {
    listeners.add(callback);
    return () => listeners.delete(callback);
  },

  notify: () => {
    listeners.forEach(cb => cb());
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

  addOperation: async (op) => {
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

    db.notify();
    return { ...opData, parentId: opData.parent_id };
  },

  updateOperation: async (id, op) => {
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

    db.notify();
    return { ...opData, parentId: opData.parent_id };
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
          // Explicit parent
          if (op.parent_id && !currentIds.has(op.parent_id)) {
            const p = allOps.find(o => o.id === op.parent_id);
            if (p) { treeOps.push(p); changed = true; }
          }
          // Smart parent: Either current principal was a trade-in in parent, 
          // OR it was the principal vehicle in a prior Purchase/Rescision.
          const principal = (op.vehicles || []).find(v => v && v.role === 'principal');
          if (principal) {
            const pId = getVehId(principal);
            const smartParent = allOps.find(o => !currentIds.has(o.id) && (
              // Case 1: Was a trade-in
              (o.vehicles || []).some(v => v && v.role === 'parte_pago' && getVehId(v) === pId) ||
              // Case 2: Was principal in a COMPRA or RESCISION
              ((o.operation_type?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === 'compra' || 
                o.operation_type?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === 'rescision') && 
               (o.vehicles || []).some(v => v && v.role === 'principal' && getVehId(v) === pId))
            ));
            if (smartParent) { treeOps.push(smartParent); changed = true; }
          }

          // B. Downward Expansion (Children)
          // Explicit children
          const children = allOps.filter(o => o.parent_id === op.id && !currentIds.has(o.id));
          if (children.length > 0) { treeOps.push(...children); changed = true; }
          
          // Smart children:
          // Either current trade-in is principal in child,
          // OR current principal is principal in a future Venta.
          const tradeIns = (op.vehicles || []).filter(v => v && v.role === 'parte_pago');
          tradeIns.forEach(t => {
            const tId = getVehId(t);
            if (!tId) return;
            const smartChild = allOps.find(o => !currentIds.has(o.id) && (o.vehicles || []).some(v => v && v.role === 'principal' && getVehId(v) === tId));
            if (smartChild) { treeOps.push(smartChild); changed = true; }
          });

          // Principal to future sale check
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

    // Link parents to children for depth calculation (using both explicit and smart links)
    ops.forEach(op => {
      const principal = (op.vehicles || []).find(v => v && v.role === 'principal');
      const pId = getVehId(principal);
      
      // Find parent
      let parentId = op.parent_id;
      if (!parentId && pId) {
        // 1. Check if it was a trade-in in some op
        let smartParent = ops.find(o => (o.vehicles || []).some(v => v && v.role === 'parte_pago' && getVehId(v) === pId));
        
        // 2. Check if it was principal in a purchase
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

    // Find roots
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

    // Consolidate sold indicators
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
    const depthCounts = {};

    Array.from(opMap.values()).sort((a, b) => a.depth - b.depth).forEach((op) => {
      const depth = op.depth;
      const vIdx = depthCounts[depth] || 0;
      depthCounts[depth] = vIdx + 1;
      const nodeId = `node-${op.id}`;
      const principalV = (op.vehicles || []).find(v => v && v.role === 'principal');
      const pIdStr = getVehId(principalV);

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
          total_amount: op.total_amount,
          delivery_amount: op.delivery_amount,
          installments: op.installments,
          credit_amount: op.credit_amount,
          trade_ins: (op.vehicles || [])
            .filter(veh => veh && veh.role === 'parte_pago')
            .map(t => ({
              description: t.description,
              amount: t.valuation,
              chapa: t.chapa,
              chasis: t.chasis,
              isExit: op.operation_type === 'compra',
              isSold: getVehId(t) ? soldInChain.has(`${op.id}-${getVehId(t)}`) : false
            })),
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
    const { error } = await supabase
      .from('operations')
      .delete()
      .eq('id', id);

    if (error) throw error;
    db.notify();
    return true;
  }
};
