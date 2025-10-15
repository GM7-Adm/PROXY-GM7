// api/clima.js
const axios = require('axios');

const WEATHER_KEY = process.env.WEATHER_KEY; // WeatherAPI.com key
const TTL_MS = 2 * 60 * 1000;                // 2 minutos de cache por cidade

// cache: { [cidadeLower]: { ts: epochMs, data: weatherJson } }
const weatherCache = Object.create(null);

function setCorsAndCache(res, hitCache) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  // CDN cache: se vem do cache em memória, deixa um respiro maior
  const header = hitCache ? 's-maxage=120, stale-while-revalidate=300'
                          : 's-maxage=60, stale-while-revalidate=120';
  res.setHeader('Cache-Control', header);
}

async function fetchClima(cidade) {
  if (!WEATHER_KEY) {
    throw new Error('WEATHER_KEY não configurada nas variáveis de ambiente');
  }
  const url = `https://api.weatherapi.com/v1/current.json?key=${WEATHER_KEY}&q=${encodeURIComponent(cidade)}`;
  const { data } = await axios.get(url, { timeout: 10000 });
  if (!data || !data.current) {
    throw new Error('Resposta inválida da WeatherAPI');
  }
  return data;
}

module.exports = async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      setCorsAndCache(res, false);
      return res.status(200).end();
    }

    const q = (req.query && (req.query.q || req.query.Q)) || 'Campinas';
    const cidade = String(q).trim();
    const key = cidade.toLowerCase();

    const cached = weatherCache[key];
    const now = Date.now();
    if (cached && (now - cached.ts) < TTL_MS) {
      setCorsAndCache(res, true);
      return res.json(cached.data);
    }

    const data = await fetchClima(cidade);
    weatherCache[key] = { ts: now, data };

    setCorsAndCache(res, false);
    res.json(data);
  } catch (err) {
    setCorsAndCache(res, false);
    const msg = (err && err.message) || 'Erro ao buscar clima';
    res.status(500).json({ erro: 'Falha em /clima', details: msg });
  }
};
