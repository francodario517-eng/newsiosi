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
  
  return (
    <div className={`glass card ${data.isHighlighted ? 'highlighted-node' : ''}`} style={{ 
      padding: '24px', 
      width: '380px', 
      textAlign: 'left',
      fontSize: '13px',
      fontFamily: "'Courier New', Courier, monospace",
      lineHeight: '1.4',
      border: data.isHighlighted ? '2px solid var(--primary)' : '1px solid var(--border)',
      background: '#1a1b23',
      color: '#d1d5db',
      boxShadow: data.isHighlighted ? '0 0 30px rgba(170, 59, 255, 0.4)' : 'var(--shadow-lg)',
      position: 'relative',
      transition: 'all 0.3s ease'
    }}>
      <Handle type="target" position={Position.Left} style={{ background: '#555' }} />
      
      <div style={{ marginBottom: '16px' }}>
        <div>Tipo de Operacion {data.operation_type?.toUpperCase()}</div>
        <div>Forma {data.payment_type}</div>
        <div>Fecha {data.date}</div>
      </div>

      <div style={{ marginBottom: '16px', color: '#f3f4f6', fontWeight: 'bold' }}>
        {data.client_name?.toUpperCase()}
      </div>

      <div style={{ marginBottom: '16px' }}>
        <a href="#" style={{ color: '#60a5fa', textDecoration: 'underline', marginBottom: '2px', display: 'block' }}>
          {data.vehicle_description}
        </a>
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

      {data.trade_in && (
        <div style={{ marginTop: '16px' }}>
          <div>A- Vehiculo Entregado como Parte de pago</div>
          <div style={{ margin: '4px 0' }}>A- Vehiculo</div>
          <a href="#" style={{ color: '#60a5fa', textDecoration: 'underline', display: 'block' }}>
            {data.trade_in.description}
          </a>
          <div style={{ color: '#60a5fa', textDecoration: 'underline' }}>CHAPA: {data.trade_in.chapa || 'N/A'}</div>
          <div style={{ color: '#60a5fa', textDecoration: 'underline' }}>CHASIS: {data.trade_in.chasis || 'N/A'}</div>
          <div style={{ marginTop: '4px' }}>A- MONTO VEHICULO {data.trade_in.amount?.toLocaleString()}</div>
        </div>
      )}

      <div style={{ marginTop: '16px', borderTop: '1px solid #333', paddingTop: '12px', color: '#f3f4f6', fontWeight: 'bold' }}>
        Monto Total {data.currency} {data.total_amount?.toLocaleString()}
      </div>

      {/* Action Handle with Plus Button */}
      <div style={{ position: 'absolute', right: '-12px', top: '50%', transform: 'translateY(-50%)', zIndex: 10 }}>
        <Handle type="source" position={Position.Right} style={{ background: 'var(--primary)', border: 'none', width: '12px', height: '12px' }} />
        <button 
          onClick={(e) => {
            e.stopPropagation();
            if (data.onAddBranch) data.onAddBranch(data);
          }}
          className="btn-add-branch"
          style={{ 
            position: 'absolute', left: '16px', top: '-10px', background: 'var(--primary)', 
            border: 'none', borderRadius: '50%', width: '24px', height: '24px', 
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            padding: 0, color: 'white', boxShadow: '0 0 10px var(--primary)'
          }}
        >
          <PlusCircle size={16} />
        </button>
      </div>
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
        >
          <Background color="#111" gap={20} variant="dots" />
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
