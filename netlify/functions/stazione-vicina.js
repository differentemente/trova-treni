// netlify/functions/stazione-vicina.js
// Data una posizione (lat/lng), trova la stazione ferroviaria piu vicina tra
// TUTTE le stazioni italiane (elenco ufficiale RFI/ViaggiaTreno) e ne restituisce
// l'id LeFrecce, pronto per la ricerca soluzioni.
// GET /api/stazione-vicina?lat=45.43&lng=10.99
// Risposta: { id, name, distanzaKm }

import { STAZIONI_COORD } from './_stazioni.js'

const BASE = 'https://www.lefrecce.it/Channels.Website.BFF.WEB/website'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

export async function handler(event) {
  const p = event.queryStringParameters || {}
  const lat = parseFloat(p.lat)
  const lng = parseFloat(p.lng)

  if (isNaN(lat) || isNaN(lng)) {
    return json(400, { errore: 'coordinate mancanti o non valide' })
  }

  // stazione piu vicina nel dataset ufficiale
  let vicina = null
  let minKm = Infinity
  for (const [nome, slat, slng] of STAZIONI_COORD) {
    const km = haversine(lat, lng, slat, slng)
    if (km < minKm) {
      minKm = km
      vicina = nome
    }
  }
  if (!vicina) return json(404, { errore: 'nessuna stazione trovata' })

  // recupero l'id LeFrecce della stazione (serve per la ricerca)
  try {
    const url = `${BASE}/locations/search?name=${encodeURIComponent(vicina)}&limit=10`
    const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA } })
    if (res.ok) {
      const data = await res.json()
      const norm = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '')
      const target = norm(vicina)
      const esatta =
        (data || []).find((s) => !s.multistation && norm(s.displayName) === target) ||
        (data || []).find((s) => !s.multistation) ||
        (data || [])[0]
      if (esatta) {
        return json(200, {
          id: esatta.id,
          name: esatta.displayName,
          distanzaKm: Math.round(minKm * 10) / 10,
        })
      }
    }
  } catch {
    // fallback sotto
  }

  return json(200, { id: null, name: vicina, distanzaKm: Math.round(minKm * 10) / 10 })
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = rad(lat2 - lat1)
  const dLon = rad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function rad(d) {
  return (d * Math.PI) / 180
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}
