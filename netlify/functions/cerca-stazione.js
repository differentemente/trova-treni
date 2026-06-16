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

// Espande le abbreviazioni puntate come nel generatore del dataset, così
// "Torino Porta Nuova" (LeFrecce) combacia con "Torino P.Nuova" (CSV).
// IMPORTANTE: l'abbreviazione richiede il punto (p./s./c.le), così non si
// trasformano per errore lettere dentro le parole (es. "principe").
function espandi(s) {
  let t = String(s || '').toLowerCase()
  const repl = [
    [/\bp\.\s*nuova\b/g, 'porta nuova'],
    [/\bp\.\s*garibaldi\b/g, 'porta garibaldi'],
    [/\bp\.\s*genova\b/g, 'porta genova'],
    [/\bp\.\s*vescovo\b/g, 'porta vescovo'],
    [/\bp\.\s*susa\b/g, 'porta susa'],
    [/\bp\.\s*principe\b/g, 'piazza principe'],
    [/\bc\.\s*le\b/g, 'centrale'],
    [/\bscr\.\b/g, 'scrivia'],
    [/\bsott\.\b/g, 'sotterranea'],
    [/\bgar\.\b/g, 'garibaldi'],
  ]
  for (const [pat, rep] of repl) t = t.replace(pat, rep)
  return t
}

// Parole che indicano un punto NON ferroviario: se presenti, mai una stazione.
const VIETATE = /aeroport|airport|\bbus\b|autobus|autostazione|pullman|navetta|\bmetro\b|metropolitana|fermata\s+bus|city\s*terminal|terminal\s*bus/i

// È una vera stazione ferroviaria?
// 1) se contiene una parola vietata (aeroporto, bus...) -> NO subito.
// 2) match esatto sulle forme normalizzate (originale + abbreviazioni espanse).
// 3) contenimento controllato: il nome LeFrecce inizia con un nome ufficiale
//    (es. "Desenzano del Garda-Sirmione" inizia con "Desenzano"), purché non
//    contenga parole vietate. Niente match inverso, per non far passare gli
//    aeroporti che "contengono" il nome città.
function isStazione(displayName) {
  if (VIETATE.test(displayName)) return false

  const forme = new Set([norm(displayName), norm(espandi(displayName))])
  for (const f of forme) {
    if (f && NOMI_STAZIONI.has(f)) return true
  }

  // contenimento controllato: solo nomi-base lunghi, e solo se il display
  // INIZIA col nome ufficiale (la stazione "Desenzano" copre "Desenzano del...")
  const n = norm(espandi(displayName))
  if (n.length >= 6) {
    for (const u of NOMI_LISTA) {
      if (u.length >= 6 && n.startsWith(u)) return true
    }
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
