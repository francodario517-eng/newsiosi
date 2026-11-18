// Validación de una operación antes de guardarla.
//
// errors   → no se puede guardar (datos imposibles o que rompen el stock/árbol).
// warnings → se puede guardar, pero la pantalla pide confirmación.
//
// La usan el formulario (para avisar) y db.addOperation / db.updateOperation
// (para que nada inválido llegue a la base aunque se llame desde otro lado).

import { vehKey, opType } from './lineage.js';

// Ningún vehículo vale esto en dólares: es un monto cargado en guaraníes.
export const MAX_USD = 5000000;
// Por encima de esto se pide confirmación.
export const WARN_USD = 1500000;
const FUTURE_TOLERANCE_DAYS = 7;
const VALID_TYPES = ['compra', 'venta', 'rescision', 'remate'];

const num = (x) => Number(x) || 0;
const fmt = (x) => num(x).toLocaleString('es-PY', { maximumFractionDigits: 2 });

// Acepta 'dd/mm/yyyy' (formulario) o 'yyyy-mm-dd' (base).
export const parseOpDate = (value) => {
  const s = String(value || '').trim();
  let y, m, d;
  let mt = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d+)$/);
  if (mt) { d = +mt[1]; m = +mt[2]; y = +mt[3]; }
  else if ((mt = s.match(/^(\d+)-(\d{1,2})-(\d{1,2})/))) { y = +mt[1]; m = +mt[2]; d = +mt[3]; }
  else return null;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return { invalid: true, y };
  return { date, y };
};

export function validateOperation(op, { today = new Date() } = {}) {
  const issues = []; // { level: 'error'|'warning', cat: 'tipo'|'fecha'|'montos'|'vehiculos', msg }
  let cat = 'tipo';
  const errors = { push: (msg) => issues.push({ level: 'error', cat, msg }) };
  const warnings = { push: (msg) => issues.push({ level: 'warning', cat, msg }) };
  const type = opType(op);

  if (!VALID_TYPES.includes(type)) errors.push(`Tipo de operación inválido: "${op?.operation_type || ''}".`);

  // Fecha
  cat = 'fecha';
  const pd = parseOpDate(op?.date);
  const maxYear = today.getFullYear() + 1;
  if (!pd || pd.invalid) {
    errors.push('La fecha no es válida.');
  } else if (pd.y < 2000 || pd.y > maxYear) {
    errors.push(`El año ${pd.y} está fuera de rango (2000 a ${maxYear}): revisá la fecha.`);
  } else {
    const limit = new Date(today.getFullYear(), today.getMonth(), today.getDate() + FUTURE_TOLERANCE_DAYS);
    if (pd.date > limit) warnings.push(`La fecha (${pd.date.toLocaleDateString('es-PY')}) es futura.`);
  }

  // Montos
  cat = 'montos';
  const total = num(op?.total_amount);
  const delivery = num(op?.delivery_amount);
  const credit = num(op?.credit_amount);
  const installments = num(op?.installments);
  const vehicles = (op?.vehicles || []).filter(Boolean);
  const principals = vehicles.filter(v => v.role === 'principal');
  const tradeIns = vehicles.filter(v => v.role === 'parte_pago');
  const tradeInTotal = tradeIns.reduce((s, v) => s + num(v.valuation), 0);

  if ([total, delivery, credit, installments, ...tradeIns.map(v => num(v.valuation))].some(x => x < 0)) {
    errors.push('Hay montos negativos.');
  }
  if (total <= 0) errors.push('El monto total no puede ser cero.');
  if (total > MAX_USD) errors.push(`El total (${fmt(total)}) es imposible en dólares: parece cargado en guaraníes. Convertilo a USD.`);
  else if (total > WARN_USD) warnings.push(`El total (USD ${fmt(total)}) es muy alto: ¿está en dólares?`);

  const hasBreakdown = delivery > 0 || credit > 0 || tradeInTotal > 0;
  if (total > 0 && hasBreakdown && Math.abs(delivery + credit + tradeInTotal - total) > 1) {
    errors.push(`El total (${fmt(total)}) no cierra con el desglose: contado ${fmt(delivery)} + crédito ${fmt(credit)} + partes de pago ${fmt(tradeInTotal)} = ${fmt(delivery + credit + tradeInTotal)}.`);
  }
  if (credit > 0 && installments <= 0) errors.push('Hay monto de crédito pero la cantidad de cuotas está en cero.');
  if (installments > 0 && credit <= 0) errors.push(`Hay ${installments} cuotas pero el monto de crédito está en cero.`);

  const payment = String(op?.payment_type || '').toLowerCase();
  if (payment.includes('contado') && credit > 0) warnings.push('La forma de pago es "contado" pero hay monto de crédito.');
  if ((payment.includes('crédito') || payment.includes('credito')) && credit <= 0) warnings.push('La forma de pago es "crédito" pero el monto de crédito está en cero.');

  // Vehículos
  cat = 'vehiculos';
  if (principals.length === 0) errors.push('Falta el vehículo principal.');
  if (principals.length > 1) errors.push('Hay más de un vehículo principal.');
  principals.forEach(p => {
    if (!vehKey(p)) errors.push('El vehículo principal necesita chasis o chapa.');
    if (!String(p.description || '').trim()) errors.push('Falta la descripción del vehículo principal.');
  });
  tradeIns.forEach((t, i) => {
    const name = String(t.description || '').trim() || `Parte de pago ${i + 1}`;
    if (!String(t.description || '').trim()) errors.push(`Falta la descripción de la parte de pago ${i + 1}.`);
    if (!vehKey(t)) warnings.push(`"${name}" no tiene chasis ni chapa: no se va a poder seguir en stock.`);
    if (num(t.valuation) <= 0) errors.push(`"${name}" no tiene valor.`);
    else if (total > 0 && num(t.valuation) > total) warnings.push(`"${name}" vale más (${fmt(t.valuation)}) que el total de la operación.`);
  });
  const seen = new Map();
  vehicles.forEach(v => {
    const k = vehKey(v);
    if (!k) return;
    if (seen.has(k)) errors.push(`El vehículo ${k} figura dos veces en la operación (${seen.get(k)} y ${v.role}).`);
    else seen.set(k, v.role);
  });

  return {
    errors: issues.filter(i => i.level === 'error').map(i => i.msg),
    warnings: issues.filter(i => i.level === 'warning').map(i => i.msg),
    issues,
  };
}

// Para la base: corta el guardado si hay errores.
export function assertValidOperation(op) {
  const { errors } = validateOperation(op);
  if (errors.length) {
    const err = new Error('No se puede guardar:\n• ' + errors.join('\n• '));
    err.validationErrors = errors;
    throw err;
  }
}
