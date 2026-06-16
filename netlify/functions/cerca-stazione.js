// netlify/functions/cerca-stazione.js
// Autocomplete stazioni via API LeFrecce, filtrato sull'elenco ufficiale delle
// stazioni ferroviarie italiane. Il filtro NON guarda i nomi (che LeFrecce
// scrive in modo variabile: "S. Bonifacio" vs "San Bonifacio") ma il CODICE
// stazione, ricavato dall'id LeFrecce: l'id 830002440 contiene S02440.
// Match infallibile, indipendente da abbreviazioni e accenti.
//
// GET /api/cerca-stazione?q=verona
// Restituisce: { stations: [{ id, name, multistation }] }

import { CODICI_STAZIONI } from './_stazioni.js'

const BASE = 'https://www.lefrecce.it/Channels.Website.BFF.WEB/website'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

// Dall'id LeFrecce ricava il codice stazione "S0xxxx".
// Gli id stazione sono tipo 830002440 -> ultime 5 cifre 02440 -> S02440.
// Restituisce null se l'id non sembra una stazione (es. città/multistation).
function codiceDaId(id) {
  const s = String(id)
  // prendo le ultime 5 cifre
  if (s.length < 5) return null
  const ultime5 = s.slice(-5)
  if (!/^\d{5}$/.test(ultime5)) return null
  return 'S' + ultime5
}

export async function handler(event) {
  const q = (event.queryStringParameters?.q || '').trim()
  if (q.length < 2) {
    return json(200, { stations: [] })
  }

  const url = `${BASE}/locations/search?name=${encodeURIComponent(q)}&limit=40`

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': UA },
    })
    if (!res.ok) return json(res.status, { error: 'upstream error' })

    const data = await res.json()
    const stations = (data || [])
      .filter((s) => {
        // multistation (es. "Milano (Tutte le stazioni)") le tengo sempre
        if (s.multistation) return true
        // altrimenti: il codice ricavato dall'id deve essere una stazione vera
        const cod = codiceDaId(s.id)
        return cod !== null && CODICI_STAZIONI.has(cod)
      })
      .map((s) => ({
        id: s.id,
        name: s.displayName,
        multistation: !!s.multistation,
      }))

    return json(200, { stations })
  } catch (e) {
    return json(500, { error: e.message })
  }
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}
