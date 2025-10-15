// api/cotacao.js
const axios = require('axios');

// Cache em memória (persiste enquanto a Lambda estiver "quente")
let lastFetchTs = 0;                     // epoch ms da última busca
let historico = [];                      // últimos snapshots
const MAX_SNAPSHOTS = 3;
const MAX_AGE_MS = 55 * 60 * 1000;       // 55 minutos

const CURRENCY_KEY = process.env.CURRENCY_KEY; // OpenExchangeRates (plano que permite base=BRL)

function setCorsAndCache(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
}

async function fetchCotacaoBRL() {
  if (!CURRENCY_KEY) {
    throw new Error('CURRENCY_KEY não configurada nas variáveis de ambiente');
  }
  // Plano pago → base=BRL permitida
  const url = `https://openexchangerates.org/api/latest.json?app_id=${CURRENCY_KEY}&base=BRL`;
  const { data } = await axios.get(url, { timeout: 10000 });
  const { rates, timestamp, base } = data || {};
  if (!rates || !timestamp) throw new Error('Resposta inválida do OpenExchangeRates');
  return { timestamp, rates, base };
}

module.exports = async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      setCorsAndCache(res);
      return res.status(200).end();
    }

    const now = Date.now();
    const precisaAtualizar = !lastFetchTs || (now - lastFetchTs) > MAX_AGE_MS;

    if (precisaAtualizar) {
      const snap = await fetchCotacaoBRL();
      historico.push(snap);
      if (historico.length > MAX_SNAPSHOTS) historico.shift();
      lastFetchTs = now;
    }

    setCorsAndCache(res);
    if (historico.length === 0) {
      return res.json({ erro: 'Aguardando histórico suficiente.' });
    }

    res.json({
      historico,
      atual: historico[historico.length - 1]
    });
  } catch (err) {
    setCorsAndCache(res);
    const msg = (err && err.message) || 'Erro ao buscar cotações';
    res.status(500).json({ erro: 'Falha em /cotacao', details: msg });
  }
};
