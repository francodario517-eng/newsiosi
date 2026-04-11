import { createClient } from '@supabase/supabase-js';

// Configuration from environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('ERROR: Supabase URL/Key no configurados. Verifica tu archivo .env');
}

export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder');

const listeners = new Set();

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

  getVehicleTraceability: async (vehicleId) => {
    // 1. Find all operations where this vehicle is present
    const { data: vehMatches } = await supabase
      .from('vehicles')
      .select('operation_id')
      .or(`chapa.eq."${vehicleId}",chasis.eq."${vehicleId}"`);

    if (!vehMatches || vehMatches.length === 0) return { nodes: [], edges: [] };

    // 2. We need to find the ABSOLUTE ROOT of these operations to show the full history
    const allOpsInChainSet = new Set();
    
    // Fetch all potentially involved operations to trace roots locally (more efficient than 20 queries)
    const { data: allOps } = await supabase.from('operations').select('*');
    
    const findRootId = (opId) => {
      const op = allOps.find(o => o.id === opId);
      if (!op || !op.parent_id) return opId;
      return findRootId(op.parent_id);
    };

    const rootIds = [...new Set(vehMatches.map(m => findRootId(m.operation_id)))];

    // 3. Get all descendants of these roots to build the complete genealogy
    const getDescendants = (parentId) => {
      const children = allOps.filter(o => o.parent_id === parentId);
      let results = [...children];
      children.forEach(child => {
          results = [...results, ...getDescendants(child.id)];
      });
      return results;
    };

    const fullGenealogyIds = new Set();
    rootIds.forEach(rid => {
      fullGenealogyIds.add(rid);
      getDescendants(rid).forEach(d => fullGenealogyIds.add(d.id));
    });

    // 4. Fetch full details for the entire genealogy
    const { data: ops } = await supabase
      .from('operations')
      .select('*, vehicles(*)')
      .in('id', Array.from(fullGenealogyIds))
      .order('date', { ascending: true });

    const nodes = [];
    const edges = [];
    
    ops.forEach((op, index) => {
      const nodeId = `node-${op.id}`;
      // For this node, show the vehicle they searched for OR the principal vehicle
      const searchedV = op.vehicles.find(veh => veh.chasis === vehicleId || veh.chapa === vehicleId);
      const principalV = op.vehicles.find(veh => veh.role === 'principal');
      const displayV = searchedV || principalV;
      
      const tradeIn = op.vehicles.find(veh => veh.role === 'parte_pago');

      nodes.push({
        id: nodeId,
        type: 'vehicle',
        data: {
          operation_id: op.id,
          operation_type: op.operation_type,
          payment_type: op.payment_type,
          date: new Date(op.date).toLocaleDateString('es-PY', { timeZone: 'UTC' }),
          client_name: op.buyer,
          vehicle_description: displayV?.description || 'Operación de Sistema',
          chapa: displayV?.chapa || '',
          chasis: displayV?.chasis || '',
          currency: op.currency,
          total_amount: op.total_amount,
          delivery_amount: op.delivery_amount,
          installments: op.installments,
          credit_amount: op.credit_amount,
          trade_in: tradeIn ? {
            description: tradeIn.description,
            amount: tradeIn.valuation,
            chapa: tradeIn.chapa,
            chasis: tradeIn.chasis
          } : null
        },
        position: { x: index * 450, y: 150 + (index % 2 === 0 ? 0 : 50) }
      });

      if (op.parent_id) {
        edges.push({ 
          id: `e-node-${op.parent_id}-${nodeId}`, 
          source: `node-${op.parent_id}`, 
          target: nodeId, 
          animated: true 
        });
      }
    });

    return { nodes, edges };
  }
};
