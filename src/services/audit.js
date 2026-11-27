// Quién cargó y quién modificó cada operación.
//
// Las columnas las escribe la base (trigger de db/2026-11-27-ultima-modificacion.sql),
// no la página: created_by_email, updated_at, updated_by y updated_by_email. Hasta
// que el script se corra no existen y todo esto devuelve vacío sin romper nada.

// Del correo se muestra sólo lo de antes de la @ ("dario.franco"). Desde los
// permisos del 18-11 cada usuario ve sólo su propio perfil: no hace falta repartir
// los correos completos para saber quién fue.
export const auditUser = (email) => {
  const s = String(email || '').trim();
  if (!s) return '';
  const at = s.indexOf('@');
  return at > 0 ? s.slice(0, at) : s;
};

const FMT = new Intl.DateTimeFormat('es-PY', {
  timeZone: 'America/Asuncion',
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

// "26/11/2026 14:05" en hora de Asunción. Vacío si no hay fecha o no se entiende.
export const auditWhen = (ts) => {
  if (!ts) return '';
  const d = ts instanceof Date ? ts : new Date(ts);
  return isNaN(d) ? '' : FMT.format(d).replace(',', '');
};

// Al cargar una operación la página guarda primero la operación y después sus
// vehículos, y eso último la marca como modificada segundos después. Una
// "modificación" del mismo usuario dentro de este margen es parte del alta.
export const ALTA_MARGEN_MS = 2 * 60 * 1000;

// { quien, cuando } de la última modificación real, o null si nadie la tocó
// después de cargarla.
export const lastModification = (op) => {
  if (!op || !op.updated_at) return null;
  const quien = auditUser(op.updated_by_email);
  const upd = new Date(op.updated_at).getTime();
  const cre = op.created_at ? new Date(op.created_at).getTime() : NaN;
  const mismo = op.updated_by && op.user_id && String(op.updated_by) === String(op.user_id);
  if (mismo && Number.isFinite(cre) && upd - cre < ALTA_MARGEN_MS) return null;
  return { quien: quien || 'usuario sin perfil', cuando: auditWhen(op.updated_at) };
};

// { quien, cuando } de la carga. quien queda vacío si la base no lo sabe.
export const creation = (op) => {
  if (!op || !op.created_at) return null;
  return { quien: auditUser(op.created_by_email), cuando: auditWhen(op.created_at) };
};

// La última operación cargada (por created_at), de toda la base.
export const latestLoaded = (ops) => {
  let best = null, bestT = -Infinity;
  for (const op of ops || []) {
    const t = op && op.created_at ? new Date(op.created_at).getTime() : NaN;
    if (Number.isFinite(t) && t > bestT) { best = op; bestT = t; }
  }
  return best;
};
