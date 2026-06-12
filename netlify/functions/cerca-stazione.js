// netlify/functions/cerca-stazione.js
// Autocomplete stazioni via API LeFrecce, filtrato sull'elenco ufficiale delle
// stazioni ferroviarie italiane (RFI/ViaggiaTreno): vengono mostrate SOLO le
// vere stazioni, escludendo fermate bus, aeroporti, ospedali, fiere, ecc.
// GET /api/cerca-stazione?q=verona
// Restituisce: { stations: [{ id, name, multistation }] }

import { NOMI_STAZIONI, NOMI_LISTA } from './_stazioni.js'

const BASE = 'https://www.lefrecce.it/Channels.Website.BFF.WEB/website'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

function norm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

// È una vera stazione ferroviaria?
// 1) match esatto sul nome normalizzato (caso più comune e veloce)
// 2) tolleranza: il nome LeFrecce contiene o è contenuto in un nome ufficiale
//    (gestisce varianti tipo "Desenzano del Garda" vs "Desenzano",
//     "Verona Porta Nuova" vs "Verona P. Nuova")
function isStazione(displayName) {
  const n = norm(displayName)
  if (!n) return false
  if (NOMI_STAZIONI.has(n)) return true
  // tolleranza solo per nomi abbastanza lunghi, per evitare falsi positivi
  if (n.length < 5) return false
  for (const u of NOMI_LISTA) {
    if (u.length < 5) continue
    if (n === u) return true
    if (n.startsWith(u) || u.startsWith(n)) return true
  }
  return false
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
        // le "multistation" (es. Milano - Tutte le stazioni) le tengo sempre
        if (s.multistation) return true
        // altrimenti deve corrispondere a una vera stazione ferroviaria
        return isStazione(s.displayName)
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
