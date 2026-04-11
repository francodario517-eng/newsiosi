import React, { useMemo } from 'react';
import ReactFlow, { 
  Background, 
  Controls, 
  MiniMap,
  Handle,
  Position
} from 'reactflow';
import 'reactflow/dist/style.css';
import { PlusCircle } from 'lucide-react';

// Custom Node for a 1:1 match with the user's detailed example
const VehicleNode = ({ data }) => {
  const isVenta = data.operation_type === 'venta';
  const isHighlighted = data.isHighlighted;
  const hasTradeIn = data.trade_ins && data.trade_ins.length > 0;
  
  // Dynamic color logic based on user request
  let statusColor = 'rgba(255,255,255,0.05)'; // Default
  let auraColor = 'transparent';
  
  if (isVenta) {
    if (hasTradeIn) {
      statusColor = '#10b981'; // Green for sales with trade-ins
      auraColor = 'rgba(16, 185, 129, 0.3)';
    } else {
      statusColor = '#ef4444'; // Red for sales without trade-ins
      auraColor = 'rgba(239, 68, 68, 0.3)';
    }
  } else if (isHighlighted) {
    statusColor = 'var(--primary)';
    auraColor = 'rgba(170, 59, 255, 0.3)';
  }

  return (
    <div className={`card glass vehicle-node ${isHighlighted ? 'highlighted-node' : ''}`} style={{ 
      padding: '24px', 
      width: '380px', 
      textAlign: 'left',
      fontSize: '13px',
      fontFamily: "'Courier New', Courier, monospace",
      lineHeight: '1.4',
      border: '2px solid',
      borderColor: statusColor,
      background: 'rgba(26, 27, 35, 0.95)',
      color: '#d1d5db',
      boxShadow: `0 0 20px ${auraColor}`,
      position: 'relative',
      transition: 'all 0.3s ease'
    }}>
      {/* Input Handle (Left) */}
      <Handle type="target" position={Position.Left} style={{ background: 'var(--primary)', border: 'none', width: '10px', height: '10px' }} />
      
      <div style={{ marginBottom: '16px' }}>
        <div>Tipo de Operacion {data.operation_type?.toUpperCase()}</div>
        <div>Forma {data.payment_type}</div>
        <div>Fecha {data.date}</div>
      </div>

      <div style={{ marginBottom: '16px', color: '#f3f4f6', fontWeight: 'bold' }}>
        {data.client_name?.toUpperCase()}
      </div>

      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <a href="#" style={{ color: '#60a5fa', textDecoration: 'underline', marginBottom: '2px', display: 'block' }}>
            {data.vehicle_description}
          </a>
          {!data.isPrincipalSold && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                if (data.onAddBranch) data.onAddBranch({
                  description: data.vehicle_description,
                  chapa: data.chapa,
                  chasis: data.chasis,
                  operation_id: data.operation_id
                });
              }}
              title="Crear rama desde este vehículo"
              style={{ 
                background: 'var(--primary)', border: 'none', borderRadius: '50%', width: '18px', height: '18px', 
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                padding: 0, color: 'white', flexShrink: 0
              }}
            >
              <PlusCircle size={12} />
            </button>
          )}
        </div>
        <div style={{ color: '#60a5fa', textDecoration: 'underline' }}>
          CHAPA: {data.chapa || 'N/A'}
        </div>
        <div style={{ color: '#60a5fa', textDecoration: 'underline' }}>
          CHASIS: {data.chasis || 'N/A'}
        </div>
      </div>

      <div>
        <div>T. Moneda {data.currency}</div>
        <div>Monto Entrega Contado {data.delivery_amount?.toLocaleString()}</div>
        <div>Cuotas {data.installments}</div>
        <div>Monto Credito {data.credit_amount?.toLocaleString()}</div>
      </div>

      {data.trade_ins && data.trade_ins.length > 0 && data.trade_ins.map((t, idx) => (
        <div key={idx} style={{ marginTop: '16px', borderTop: idx > 0 ? '1px dashed #333' : 'none', paddingTop: idx > 0 ? '12px' : '0' }}>
          <div>A- Vehiculo Entregado como Parte de pago {data.trade_ins.length > 1 ? `#${idx + 1}` : ''}</div>
          <div style={{ margin: '4px 0' }}>A- Vehiculo</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <a href="#" style={{ color: '#60a5fa', textDecoration: 'underline', display: 'block' }}>
              {t.description}
            </a>
            {!t.isSold && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  if (data.onAddBranch) data.onAddBranch({
                    description: t.description,
                    chapa: t.chapa,
                    chasis: t.chasis,
                    operation_id: data.operation_id
                  });
                }}
                title="Crear rama desde este vehículo"
                style={{ 
                  background: 'var(--primary)', border: 'none', borderRadius: '50%', width: '18px', height: '18px', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  padding: 0, color: 'white', flexShrink: 0
                }}
              >
                <PlusCircle size={12} />
              </button>
            )}
          </div>
          <div style={{ color: '#60a5fa', textDecoration: 'underline' }}>CHAPA: {t.chapa || 'N/A'}</div>
          <div style={{ color: '#60a5fa', textDecoration: 'underline' }}>CHASIS: {t.chasis || 'N/A'}</div>
          <div style={{ marginTop: '4px' }}>A- MONTO VEHICULO {t.amount?.toLocaleString()}</div>
        </div>
      ))}

      <div style={{ marginTop: '16px', borderTop: '1px solid #333', paddingTop: '12px', color: '#f3f4f6', fontWeight: 'bold' }}>
        Monto Total {data.currency} {data.total_amount?.toLocaleString()}
      </div>

      {/* Output Handle (Right) */}
      <Handle type="source" position={Position.Right} style={{ background: 'var(--primary)', border: 'none', width: '10px', height: '10px' }} />
    </div>
  );
};

const nodeTypes = {
  vehicle: VehicleNode,
};



export function TreeView({ data, onAddBranch, highlightedId, isLoading }) {
  const { nodes, edges } = data || { nodes: [], edges: [] };

  const styledNodes = useMemo(() => nodes.map(node => ({
    ...node,
    type: 'vehicle',
    data: { 
      ...node.data,
      onAddBranch,
      isHighlighted: node.data.operation_id === highlightedId
    }
  })), [nodes, onAddBranch, highlightedId]);

  return (
    <div style={{ width: '100%', height: '800px', background: '#0a0b10', borderRadius: '12px', overflow: 'hidden', position: 'relative' }}>
      {isLoading ? (
        <div className="loader-container">
          <div className="pulse-loader"></div>
          <div style={{ fontSize: '18px', fontWeight: '500', letterSpacing: '0.05em' }}>PROCESANDO TRAZABILIDAD...</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Conectando con Supabase Engine</div>
        </div>
      ) : (
        <ReactFlow
          nodes={styledNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          style={{ background: 'transparent' }}
        >
          <Background color="#333" gap={20} variant="dots" />
          <Controls />
          <MiniMap 
            nodeColor={(n) => n.data.operation_type === 'venta' ? '#ef4444' : '#10b981'}
            maskColor="rgba(0,0,0,0.5)"
          />
        </ReactFlow>
      )}
    </div>
  );
}
