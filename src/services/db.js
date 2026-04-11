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
    const { data: vehMatches } = await supabase
      .from('vehicles')
      .select('operation_id')
      .or(`chapa.eq."${vehicleId}",chasis.eq."${vehicleId}"`);

    if (!vehMatches || vehMatches.length === 0) return { nodes: [], edges: [] };

    const opIds = vehMatches.map(m => m.operation_id);
    const { data: ops } = await supabase
      .from('operations')
      .select('*, vehicles(*)')
      .in('id', opIds)
      .order('date', { ascending: true });

    const nodes = [];
    const edges = [];
    let lastNodeId = null;

    ops.forEach((op, index) => {
      const nodeId = `node-${op.id}`;
      const v = op.vehicles.find(veh => veh.chasis === vehicleId || veh.chapa === vehicleId);
      const tradeIn = op.vehicles.find(veh => veh.role === 'parte_pago');

      nodes.push({
        id: nodeId,
        type: 'vehicle',
        data: {
          operation_id: op.id,
          operation_type: op.operation_type,
          payment_type: op.payment_type,
          date: new Date(op.date).toLocaleDateString('es-PY'),
          client_name: op.buyer,
          vehicle_description: v?.description || vehicleId,
          chapa: v?.chapa || '',
          chasis: v?.chasis || '',
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

      if (lastNodeId) {
        edges.push({ id: `e-${lastNodeId}-${nodeId}`, source: lastNodeId, target: nodeId, animated: true });
      }
      lastNodeId = nodeId;
    });

    return { nodes, edges };
  }
};
