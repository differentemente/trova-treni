// netlify/functions/cerca-stazione.js
// Autocomplete stazioni via API LeFrecce (backend del sito Trenitalia).
// GET /api/cerca-stazione?q=verona
// Restituisce: { stations: [{ id, name, multistation }] }

const BASE = 'https://www.lefrecce.it/Channels.Website.BFF.WEB/website'

export async function handler(event) {
  const q = (event.queryStringParameters?.q || '').trim()
  if (q.length < 2) {
    return json(200, { stations: [] })
  }

  const url = `${BASE}/locations/search?name=${encodeURIComponent(q)}&limit=20`

  try {
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': UA,
      },
    })
    if (!res.ok) return json(res.status, { error: 'upstream error' })

    const data = await res.json()
    const stations = (data || [])
      .filter((s) => isFerroviaria(s))
      .map((s) => ({
        id: s.id,                    // es. 830002430 — da usare in cerca-viaggio
        name: s.displayName,         // es. "Verona Porta Nuova"
        multistation: !!s.multistation, // true per "Milano (Tutte le stazioni)" ecc.
      }))

    return json(200, { stations })
  } catch (e) {
    return json(500, { error: e.message })
  }
}

// Tiene solo le vere stazioni ferroviarie, scartando bus/navette/aeroporti.
// LeFrecce nell'autocomplete include punti di interscambio non ferroviari
// (es. "Verona Aeroporto", "Verona Autostazione", fermate bus sostitutivi).
function isFerroviaria(s) {
  const nome = String(s?.displayName || '')
  if (!nome) return false

  // 1) se l'API espone un tipo esplicito, scarto i non-treno
  const tipo = String(s.type || s.category || s.locationType || '').toUpperCase()
  if (tipo) {
    if (/BUS|COACH|AIRPORT|AEROPORT|CITY|PUBLIC|TRANSPORT/.test(tipo)) return false
  }

  // 2) rete di sicurezza sul nome: parole tipiche dei punti non ferroviari
  const NON_FERROVIARIO = [
    /\bbus\b/i,
    /autobus/i,
    /autostazione/i,
    /pullman/i,
    /\bcoach\b/i,
    /aeroport/i,
    /airport/i,
    /\bvia\b.*\baeroport/i,
    /city\s*terminal/i,
    /terminal\s*bus/i,
    /navetta/i,
    /metro\b/i,
    /metropolitana/i,
  ]
  if (NON_FERROVIARIO.some((re) => re.test(nome))) return false

  return true
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}
