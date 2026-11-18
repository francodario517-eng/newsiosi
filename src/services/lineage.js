// Linaje de las operaciones: de qué operación "viene" cada una.
//
// Lo usan el árbol de trazabilidad (db.getVehicleTraceability), el Excel de
// inventario (a través del árbol) y el rendimiento por árbol
// (financials.getTreesOverview), para que las tres pantallas armen las mismas
// cadenas.
//
// Regla de fondo: una operación sólo puede colgar de otra con fecha anterior o
// igual (con una tolerancia corta por fechas cargadas con unos días de
// diferencia). Antes, si no había ningún candidato anterior, se tomaba uno
// posterior: un auto comprado en 2025 que volvía como parte de pago en 2026
// dejaba la compra de 2025 colgada de la venta de 2026 y mezclaba dos árboles
// distintos (inversión inicial, partes de pago sin vender y ganancia mal).

// Margen para aceptar como padre una operación de fecha apenas posterior
// (operaciones del mismo trato cargadas con unos días de diferencia).
export const PARENT_DATE_TOLERANCE_DAYS = 7;
const TOLERANCE_MS = PARENT_DATE_TOLERANCE_DAYS * 24 * 60 * 60 * 1000;

// Un vehículo es su chasis (o su chapa si no tiene chasis), sin espacios.
export const vehKey = (v) => ((v && (v.chasis || v.chapa)) || '').replace(/\s+/g, '').toUpperCase();

export const opType = (op) =>
  (op?.operation_type || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const isPurchaseType = (t) => t === 'compra' || t === 'rescision';
const isSaleType = (t) => t === 'venta' || t === 'remate';

export const opTime = (op) => {
  const t = new Date(op?.date).getTime();
  return isNaN(t) ? 0 : t;
};

// De los candidatos, el último con fecha <= refTime (+ tolerancia).
// Nunca uno posterior: si no hay ninguno, la operación no tiene padre.
const closestEntry = (candidates, refTime) => {
  let best = null;
  candidates.forEach((o) => {
    const t = opTime(o);
    if (t > refTime + TOLERANCE_MS) return;
    if (!best || t > opTime(best)) best = o;
  });
  return best;
};

/**
 * Devuelve Map(op.id -> { parentId, viaVehicle }) para las operaciones que
 * tienen padre. viaVehicle es el vehículo que une la operación con su padre
 * (el que salió de la operación padre hacia esta).
 *
 * 1. parent_id cargado a mano: manda siempre.
 * 2. El auto principal entró como parte de pago en una venta/remate anterior:
 *    cuelga de esa venta.
 * 3. Venta/remate: cuelga de la compra/rescisión anterior de su auto principal.
 * 4. Compra que se pagó entregando un auto nuestro: cuelga de la última
 *    entrada (compra o parte de pago recibido) de ese auto.
 */
export function resolveLineage(ops) {
  const list = Array.isArray(ops) ? ops : [];
  const byId = new Map(list.map((o) => [o.id, o]));

  // Índices por vehículo para no recorrer todas las operaciones por cada una.
  const receivedAsTradeIn = new Map(); // vehículo -> ventas/remates donde lo recibimos
  const purchasedAsPrincipal = new Map(); // vehículo -> compras/rescisiones de ese auto
  const push = (map, k, op) => {
    if (!k) return;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(op);
  };
  list.forEach((op) => {
    const t = opType(op);
    (op.vehicles || []).forEach((v) => {
      if (!v) return;
      // En una COMPRA el parte de pago es un auto que entregamos (sale de
      // stock), no uno que entra: no puede ser origen de nada.
      if (v.role === 'parte_pago' && t !== 'compra') push(receivedAsTradeIn, vehKey(v), op);
      if (v.role === 'principal' && isPurchaseType(t)) push(purchasedAsPrincipal, vehKey(v), op);
    });
  });

  const result = new Map();
  list.forEach((op) => {
    const t = opType(op);
    const refTime = opTime(op);
    const principal = (op.vehicles || []).find((v) => v && v.role === 'principal');
    const pKey = vehKey(principal);
    const others = (arr) => (arr || []).filter((o) => o.id !== op.id);

    if (op.parent_id && byId.has(op.parent_id) && op.parent_id !== op.id) {
      result.set(op.id, { parentId: op.parent_id, viaVehicle: pKey });
      return;
    }

    let parent = null;
    let via = pKey;
    if (pKey) {
      parent = closestEntry(others(receivedAsTradeIn.get(pKey)), refTime);
      if (!parent && isSaleType(t)) {
        parent = closestEntry(others(purchasedAsPrincipal.get(pKey)), refTime);
      }
    }

    if (!parent && t === 'compra') {
      (op.vehicles || [])
        .filter((v) => v && v.role === 'parte_pago')
        .forEach((given) => {
          const gKey = vehKey(given);
          if (!gKey) return;
          const entries = others([
            ...(receivedAsTradeIn.get(gKey) || []),
            ...(purchasedAsPrincipal.get(gKey) || []),
          ]);
          const candidate = closestEntry(entries, refTime);
          if (candidate && (!parent || opTime(candidate) > opTime(parent))) {
            parent = candidate;
            via = gKey;
          }
        });
    }

    if (parent) result.set(op.id, { parentId: parent.id, viaVehicle: via });
  });

  // Cortar ciclos (datos cargados con fechas cruzadas dentro de la tolerancia
  // o parent_id circulares): sin esto la cadena no tiene raíz y no se dibuja.
  list.forEach((op) => {
    const seen = new Set();
    let cur = op.id;
    while (result.has(cur)) {
      if (seen.has(cur)) {
        result.delete(cur);
        break;
      }
      seen.add(cur);
      cur = result.get(cur).parentId;
    }
  });

  return result;
}

// resolveLineage sobre la lista completa, recordado por referencia: el Excel de
// inventario arma un árbol por fila y no tiene sentido recalcularlo cada vez.
const cache = new WeakMap();
export function resolveLineageCached(ops) {
  if (!ops || typeof ops !== 'object') return resolveLineage(ops);
  if (!cache.has(ops)) cache.set(ops, resolveLineage(ops));
  return cache.get(ops);
}

// Agrupa las operaciones en cadenas: Map(op.id -> id de la raíz de su cadena).
export function lineageRoots(ops, lineage = resolveLineageCached(ops)) {
  const roots = new Map();
  (ops || []).forEach((op) => {
    let cur = op.id;
    const seen = new Set();
    while (lineage.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      cur = lineage.get(cur).parentId;
    }
    roots.set(op.id, cur);
  });
  return roots;
}
