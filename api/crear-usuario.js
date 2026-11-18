// Función de servidor (Vercel): crea un usuario de la app.
//
// Antes la pantalla de Usuarios creaba las cuentas con el registro público de
// Supabase (auth.signUp), así que el registro tenía que estar abierto y
// cualquiera con la clave pública (que va dentro de la página) podía crearse
// una cuenta. Ahora el registro público se cierra y las cuentas se crean acá,
// con la clave de servicio, sólo si quien lo pide es administrador.
//
// Variables de entorno en Vercel:
//   SUPABASE_SERVICE_ROLE_KEY  (secreta; Supabase → Project Settings → API Keys)
//   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (ya existen)

/* global process */

const FLAGS = ['is_admin', 'can_view', 'can_edit', 'can_delete'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    return res.status(503).json({ error: 'La creación de usuarios no está configurada (falta SUPABASE_SERVICE_ROLE_KEY en Vercel).' });
  }

  // 1. Quién lo pide: sesión válida y administrador.
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Sesión requerida' });
  const who = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: auth } });
  if (!who.ok) return res.status(401).json({ error: 'Sesión inválida' });
  const caller = await who.json();
  const adminHeaders = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' };
  const prof = await fetch(`${url}/rest/v1/profiles?id=eq.${encodeURIComponent(caller.id)}&select=is_admin`, { headers: adminHeaders });
  const rows = prof.ok ? await prof.json() : [];
  if (!rows[0]?.is_admin) return res.status(403).json({ error: 'Sólo un administrador puede crear usuarios.' });

  // 2. Datos del usuario nuevo.
  const body = req.body || {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'El correo no es válido.' });
  if (password.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
  const flags = Object.fromEntries(FLAGS.map(k => [k, body[k] === true]));

  // 3. Crear la cuenta (ya confirmada: la crea un administrador).
  const created = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const user = await created.json().catch(() => ({}));
  if (!created.ok) {
    const msg = user?.msg || user?.message || user?.error_description || `Supabase respondió ${created.status}`;
    return res.status(created.status === 422 ? 409 : 502).json({ error: /already|registered|exists/i.test(msg) ? 'Ya existe un usuario con ese correo.' : msg });
  }

  // 4. Permisos. El trigger handle_new_user ya creó el perfil sin permisos;
  //    se completa (o se crea, si el trigger no corrió).
  const up = await fetch(`${url}/rest/v1/profiles?on_conflict=id`, {
    method: 'POST',
    headers: { ...adminHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: user.id, email, ...flags }),
  });
  if (!up.ok) {
    return res.status(502).json({ error: 'La cuenta se creó pero no se pudieron guardar los permisos. Asignalos desde la lista de usuarios.', id: user.id });
  }
  return res.status(200).json({ id: user.id, email });
}
