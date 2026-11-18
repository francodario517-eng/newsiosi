// Función de servidor (Vercel): busca precios de mercado en Google con Apify.
//
// El token de Apify vive sólo acá, en la variable de entorno APIFY_TOKEN del
// proyecto de Vercel. Antes estaba en el código del navegador, dentro de un
// repositorio público.
//
// Sólo atiende a usuarios con sesión iniciada en la app: verifica el token de
// Supabase que manda el navegador antes de gastar crédito de Apify.

/* global process */

const GOOGLE_ACTOR = 'apify~google-search-scraper';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const apifyToken = process.env.APIFY_TOKEN;
  if (!apifyToken) {
    return res.status(503).json({ error: 'La búsqueda de precios no está configurada (falta APIFY_TOKEN).' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const auth = req.headers.authorization || '';
  if (!supabaseUrl || !supabaseAnon || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Sesión requerida' });
  }
  const who = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: supabaseAnon, Authorization: auth },
  });
  if (!who.ok) return res.status(401).json({ error: 'Sesión inválida' });

  const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
  if (!query || query.length > 200) {
    return res.status(400).json({ error: 'Búsqueda vacía o demasiado larga' });
  }

  try {
    const r = await fetch(`https://api.apify.com/v2/acts/${GOOGLE_ACTOR}/run-sync-get-dataset-items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apifyToken}` },
      body: JSON.stringify({
        queries: query,
        maxPagesPerQuery: 1,
        resultsPerPage: 10,
        countryCode: 'py',
        languageCode: 'es',
      }),
    });
    if (!r.ok) return res.status(502).json({ error: `Apify respondió ${r.status}` });
    const data = await r.json();
    return res.status(200).json(data?.[0]?.organicResults ?? []);
  } catch {
    return res.status(502).json({ error: 'No se pudo consultar Apify' });
  }
}
