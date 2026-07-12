import React, { useState, useMemo } from 'react';
import { Check, Loader, Zap, Search, CheckCircle2 } from 'lucide-react';

// Carga Rápida — completar Entrega Contado / Cuotas / Monto Crédito
// para las operaciones que todavía no tienen esos datos cargados (todo en 0).
// Cada fila es un mini-formulario: escribís los 3 valores y guardás (o Enter).
// Al guardar, la operación deja de tener valores en 0 y desaparece de la lista.
// El tipo de pago se deriva automáticamente de las cuotas:
// con cuotas (> 0) => crédito; sin cuotas => contado.
const pagoFromCuotas = (installments) => ((Number(installments) || 0) > 0 ? 'crédito' : 'contado');

// Normaliza cualquier fecha (dd/mm/yyyy legacy o yyyy-mm-dd) al formato
// yyyy-mm-dd que necesita <input type="date">, con ceros a la izquierda.
const toDateInput = (d) => {
  if (!d) return '';
  const s = String(d);
  let y, m, day;
  if (s.includes('/')) { [day, m, y] = s.split('/'); }
  else { [y, m, day] = s.split('-'); }
  if (!y || !m || !day) return '';
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

export function QuickLoad({ operations, formatMoney, parseMoney, onSave }) {
  const [edits, setEdits] = useState({});       // id -> { date, type, delivery, installments, credit }
  const [savingId, setSavingId] = useState(null);
  const [savedCount, setSavedCount] = useState(0);
  const [query, setQuery] = useState('');

  // Solo operaciones SIN datos financieros válidos (los 3 campos en 0/vacío).
  const pending = useMemo(() => {
    const q = query.trim().toLowerCase();
    return operations.filter(op => {
      const sinDatos =
        (Number(op.delivery_amount) || 0) === 0 &&
        (Number(op.installments) || 0) === 0 &&
        (Number(op.credit_amount) || 0) === 0;
      if (!sinDatos) return false;
      if (!q) return true;
      const hay = [
        op.buyer, op.seller_name, op.date, op.operation_type,
        ...(op.vehicles || []).flatMap(v => [v?.chapa, v?.chasis, v?.description])
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [operations, query]);

  // Valor a mostrar por campo: si el usuario lo editó, ese; si no, el valor
  // actual de la operación (fecha/tipo) o vacío (montos, que arrancan en blanco).
  const fieldVal = (op, field) => {
    const e = edits[op.id];
    if (e && field in e) return e[field];
    if (field === 'date') return toDateInput(op.date);
    return '';
  };

  const setField = (id, field, value) => {
    setEdits(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: value } }));
  };

  const handleSave = async (op) => {
    if (savingId) return;
    const dateInput = fieldVal(op, 'date'); // yyyy-mm-dd
    const [yy, mm, dd] = dateInput.split('-');
    const installments = Number(fieldVal(op, 'installments')) || 0;
    setSavingId(op.id);
    try {
      await onSave(op.id, {
        date: dateInput ? `${dd}/${mm}/${yy}` : undefined, // db lo guarda como yyyy-mm-dd
        payment_type: pagoFromCuotas(installments), // auto: con cuotas => crédito, sin cuotas => contado
        delivery_amount: parseMoney(fieldVal(op, 'delivery')),
        installments,
        credit_amount: parseMoney(fieldVal(op, 'credit'))
      });
      setSavedCount(c => c + 1);
      // Limpiar el borrador local; la fila desaparece con el refresh de Realtime
      setEdits(prev => {
        const next = { ...prev };
        delete next[op.id];
        return next;
      });
    } catch (err) {
      alert('Error al guardar: ' + (err.message || 'error desconocido'));
    } finally {
      setSavingId(null);
    }
  };

  const inputStyle = { marginBottom: 0, height: '40px', fontSize: '14px' };
  const labelStyle = { fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px', display: 'block' };

  return (
    <div className="card glass" style={{ padding: '0' }}>
      {/* Encabezado */}
      <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h3 style={{ color: 'white', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <Zap size={18} color="var(--primary)" /> Carga Rápida
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: '4px 0 0' }}>
            Completá Entrega Contado, Cuotas y Monto Crédito de las operaciones que aún no los tienen.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {savedCount > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981', fontSize: '13px', fontWeight: 600 }}>
              <CheckCircle2 size={16} /> {savedCount} guardada{savedCount === 1 ? '' : 's'}
            </span>
          )}
          <span style={{ background: 'rgba(170, 59, 255, 0.1)', color: 'var(--primary)', border: '1px solid rgba(170, 59, 255, 0.2)', padding: '6px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: 700 }}>
            {pending.length} pendiente{pending.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {/* Buscador */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
        <div className="glass" style={{ display: 'flex', alignItems: 'center', padding: '0 12px', gap: '8px', height: '40px', maxWidth: '340px' }}>
          <Search size={16} color="var(--text-muted)" />
          <input
            type="text"
            placeholder="Buscar por cliente, chapa, chasis..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ background: 'none', border: 'none', marginBottom: 0, paddingLeft: 0, width: '100%', fontSize: '14px' }}
          />
        </div>
      </div>

      {/* Lista */}
      <div style={{ padding: '16px 24px 24px' }}>
        {pending.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
            <CheckCircle2 size={40} color="#10b981" style={{ marginBottom: '12px' }} />
            <div style={{ fontSize: '15px' }}>
              {query ? 'No hay resultados para la búsqueda.' : '¡Todo al día! No hay operaciones sin datos de cuotas/entrega/crédito.'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {pending.map((op) => {
              const principal = (op.vehicles || []).find(v => v?.role === 'principal') || op.vehicles?.[0];
              const vehLabel = principal ? (principal.description || principal.chapa || principal.chasis || '—') : '—';
              const chapaChasis = principal ? [principal.chapa, principal.chasis].filter(Boolean).join(' · ') : '';
              const isSaving = savingId === op.id;
              return (
                <form
                  key={op.id}
                  onSubmit={(ev) => { ev.preventDefault(); handleSave(op); }}
                  className="quickload-row"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px', display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'flex-end' }}
                >
                  {/* Datos de la operación */}
                  <div style={{ flex: '2 1 200px', minWidth: '180px' }}>
                    <span style={{
                      display: 'inline-block', marginBottom: '4px',
                      padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                      background: op.operation_type === 'compra' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(170, 59, 255, 0.1)',
                      color: op.operation_type === 'compra' ? '#10b981' : '#aa3bff',
                      border: `1px solid ${op.operation_type === 'compra' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(170, 59, 255, 0.2)'}`
                    }}>{op.operation_type || 'venta'}</span>
                    <div style={{ color: 'white', fontWeight: 600, fontSize: '14px' }}>{op.buyer || 'Sin cliente'}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                      {vehLabel}{chapaChasis ? <span style={{ fontFamily: 'monospace' }}> — {chapaChasis}</span> : null}
                    </div>
                  </div>

                  {/* Campos editables */}
                  <div style={{ flex: '0 1 150px', minWidth: '140px' }}>
                    <label style={labelStyle}>Fecha</label>
                    <input
                      type="date"
                      value={fieldVal(op, 'date')}
                      onChange={(ev) => setField(op.id, 'date', ev.target.value)}
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ flex: '0 1 120px', minWidth: '110px' }}>
                    <label style={labelStyle}>Pago (auto)</label>
                    {(() => {
                      const pago = pagoFromCuotas(fieldVal(op, 'installments'));
                      const esCredito = pago === 'crédito';
                      return (
                        <div
                          title="Se define solo según las cuotas"
                          style={{
                            ...inputStyle, display: 'flex', alignItems: 'center', textTransform: 'capitalize',
                            border: '1px dashed var(--border)', cursor: 'default',
                            color: esCredito ? '#aa3bff' : 'var(--text-muted)',
                            background: esCredito ? 'rgba(170, 59, 255, 0.08)' : 'rgba(255,255,255,0.02)'
                          }}
                        >
                          {pago}
                        </div>
                      );
                    })()}
                  </div>
                  <div style={{ flex: '0 1 130px', minWidth: '110px' }}>
                    <label style={labelStyle}>Entrega Contado</label>
                    <input
                      type="text" inputMode="numeric" placeholder="0"
                      value={fieldVal(op, 'delivery')}
                      onChange={(ev) => setField(op.id, 'delivery', formatMoney(ev.target.value))}
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ flex: '0 1 90px', minWidth: '80px' }}>
                    <label style={labelStyle}>Cuotas</label>
                    <input
                      type="number" min="0" placeholder="0"
                      value={fieldVal(op, 'installments')}
                      onChange={(ev) => setField(op.id, 'installments', ev.target.value)}
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ flex: '0 1 130px', minWidth: '110px' }}>
                    <label style={labelStyle}>Monto Crédito</label>
                    <input
                      type="text" inputMode="numeric" placeholder="0"
                      value={fieldVal(op, 'credit')}
                      onChange={(ev) => setField(op.id, 'credit', formatMoney(ev.target.value))}
                      style={inputStyle}
                    />
                  </div>

                  {/* Guardar */}
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={isSaving}
                    style={{ height: '40px', minWidth: '110px', justifyContent: 'center' }}
                    title="Guardar (Enter)"
                  >
                    {isSaving ? <Loader className="animate-spin" size={16} /> : <><Check size={16} /> Guardar</>}
                  </button>
                </form>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
