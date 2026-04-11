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

  getVehicleTraceability: async (vehicleId) => {
    const { data: ops, error } = await supabase.rpc('get_operation_genealogy', { 
      vehicle_id_search: vehicleId 
    });

    if (error) {
      console.error('Error fetching genealogy:', error);
      return { nodes: [], edges: [] };
    }

    if (!ops || ops.length === 0) return { nodes: [], edges: [] };

    const nodes = [];
    const edges = [];
    
    // Reverse to show from oldest (source) to newest (destination)
    const reversedOps = [...ops].reverse();

    reversedOps.forEach((op, index) => {
      const nodeId = `node-${op.id}`;
      // Find the vehicle relevant to the search or the principal one
      const searchedV = op.vehicles.find(veh => veh.chasis === vehicleId || veh.chapa === vehicleId);
      const principalV = op.vehicles.find(veh => veh.role === 'principal');
      const displayV = searchedV || principalV;

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
          trade_ins: op.vehicles
            .filter(veh => veh.role === 'parte_pago')
            .map(t => ({
              description: t.description,
              amount: t.valuation,
              chapa: t.chapa,
              chasis: t.chasis
            }))
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
