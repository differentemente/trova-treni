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
    const stations = (data || []).map((s) => ({
      id: s.id,                    // es. 830002430 — da usare in cerca-viaggio
      name: s.displayName,         // es. "Verona Porta Nuova"
      multistation: !!s.multistation, // true per "Milano (Tutte le stazioni)" ecc.
    }))

    return json(200, { stations })
  } catch (e) {
    return json(500, { error: e.message })
  }
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
