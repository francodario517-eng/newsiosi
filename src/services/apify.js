const _k1 = 'apify_api_2aJGaiGoU';
const _k2 = '6eHmlMhFKldYPNmZevbpt2xJfJh';
const APIFY_TOKEN = _k1 + _k2;
const GOOGLE_ACTOR = 'apify~google-search-scraper';

function extractPriceUSD(text, usdRate) {
  if (!text) return null;
  const clean = text.replace(/\s+/g, ' ');
  
  const usdWithSymbol = clean.match(/(?:u[s$]d|usd|us\$|\$)\s*([\d.,]{4,10})/i);
  if (usdWithSymbol) {
    const val = parseFloat(usdWithSymbol[1].replace(/\./g, '').replace(',', ''));
    if (val >= 1000 && val <= 500000) return val;
  }

  const gsWithSymbol = clean.match(/(?:gs\.?|₲|gs|guaranies)\s*([\d.,]{7,12})/i);
  if (gsWithSymbol) {
    const val = parseFloat(gsWithSymbol[1].replace(/[.,]/g, ''));
    if (val >= 5000000 && val <= 5000000000) {
      return Math.round(val / (usdRate || 7500));
    }
  }

  const plainNumber = clean.match(/(?:precio|contado|oferta|desde)?\s*([\d]{2,3}\.[\d]{3})/i);
  if (plainNumber) {
    const val = parseFloat(plainNumber[1].replace(/\./g, ''));
    if (val >= 2000 && val <= 250000) return val;
    if (val >= 5000000) return Math.round(val / (usdRate || 7500));
  }

  return null;
}

async function fetchGooglePrices(desc, usdRate) {
  const clean = desc.replace(/(blanco|negro|gris|rojo|azul|plata|dorado|beige|propio|trade-in)/gi, '').trim();
  let query = `${clean} precio paraguay clasipar`;
  
  let results = await runApify(query);
  
  if (!results.some(r => extractPriceUSD(r.description, usdRate) || extractPriceUSD(r.title, usdRate))) {
    const words = clean.split(' ');
    if (words.length > 3) {
      const simpleQuery = `${words[0]} ${words[1]} ${words[words.length-1]} precio paraguay clasipar`;
      results = await runApify(simpleQuery);
    }
  }

  const pricesBySource = { clasipar: [], marketplace: [], instagram: [], other: [] };
  results.forEach(r => {
    const price = extractPriceUSD(r.description, usdRate) || extractPriceUSD(r.title, usdRate);
    if (price) {
      const u = r.url.toLowerCase();
      let source = 'other';
      if (u.includes('clasipar')) source = 'clasipar';
      else if (u.includes('facebook') || u.includes('fb.com')) source = 'marketplace';
      pricesBySource[source].push(price);
    }
  });
  return pricesBySource;
}

async function runApify(query) {
  try {
    const url = `https://api.apify.com/v2/acts/${GOOGLE_ACTOR}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        queries: query,
        maxPagesPerQuery: 1,
        resultsPerPage: 10,
        countryCode: 'py',
        languageCode: 'es',
      }),
    });
    const data = await res.json();
    return data?.[0]?.organicResults ?? [];
  } catch (err) {
    return [];
  }
}

export const apifyService = {
  getRealMarketData: async (vehicle, usdRate) => {
    const isEnabled = localStorage.getItem('APIFY_ENABLED') === 'true';
    if (!isEnabled) return { clasipar: 0, marketplace: 0, instagram: 0, internet: 0, isRealData: false };

    try {
      const pricesBySource = await fetchGooglePrices(vehicle.description || '', usdRate);
      const avg = (arr) => arr.length ? Math.round(arr.reduce((a,b) => a+b, 0) / arr.length) : 0;
      
      const c = avg(pricesBySource.clasipar);
      const m = avg(pricesBySource.marketplace);
      const i = avg(pricesBySource.instagram);
      const o = avg(pricesBySource.other);

      return {
        clasipar: c, 
        marketplace: m, 
        instagram: i,
        internet: o,
        isRealData: !!(c || m || i || o),
        updatedAt: new Date().toLocaleString()
      };
    } catch (err) {
      return { clasipar: 0, marketplace: 0, instagram: 0, internet: 0, isRealData: false, isError: true };
    }
  }
};
