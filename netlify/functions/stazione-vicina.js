// netlify/functions/stazione-vicina.js
// Data una posizione (lat/lng), trova la stazione ferroviaria più vicina e
// restituisce il suo id LeFrecce (pronto per la ricerca soluzioni).
//
// GET /api/stazione-vicina?lat=45.43&lng=10.99
// Risposta: { id, name, distanzaKm }  oppure { errore }
//
// Strategia: dataset locale delle principali stazioni italiane con coordinate,
// si calcola la più vicina (haversine), poi si recupera l'id LeFrecce via
// autocomplete sul nome (l'id serve per /api/cerca-viaggio).

const BASE = 'https://www.lefrecce.it/Channels.Website.BFF.WEB/website'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

// Stazioni principali (nome LeFrecce, lat, lng). Copertura nazionale + Veneto/Trentino fitto.
const STAZIONI = [
  ['Verona Porta Nuova', 45.4289, 10.9826],
  ['Verona Porta Vescovo', 45.4406, 11.0186],
  ['Peschiera del Garda', 45.4361, 10.6889],
  ['Desenzano del Garda-Sirmione', 45.4719, 10.5306],
  ['Brescia', 45.5331, 10.2122],
  ['Trento', 46.0719, 11.1192],
  ['Rovereto', 45.8906, 11.0356],
  ['Bolzano', 46.4978, 11.3556],
  ['Vicenza', 45.5469, 11.5364],
  ['Padova', 45.4178, 11.8775],
  ['Venezia Mestre', 45.4822, 12.2317],
  ['Venezia Santa Lucia', 45.4411, 12.3211],
  ['Mantova', 45.1556, 10.7886],
  ['Milano Centrale', 45.4869, 9.2049],
  ['Milano Porta Garibaldi', 45.4847, 9.1875],
  ['Bergamo', 45.6906, 9.6722],
  ['Bologna Centrale', 44.5058, 11.3431],
  ['Modena', 44.6314, 10.9281],
  ['Parma', 44.8019, 10.3289],
  ['Reggio Emilia', 44.7011, 10.6442],
  ['Piacenza', 45.0511, 9.7019],
  ['Firenze Santa Maria Novella', 43.7764, 11.2481],
  ['Roma Termini', 41.9011, 12.5019],
  ['Roma Tiburtina', 41.9106, 12.5294],
  ['Napoli Centrale', 40.8528, 14.2722],
  ['Torino Porta Nuova', 45.0617, 7.6781],
  ['Torino Porta Susa', 45.0719, 7.6647],
  ['Genova Piazza Principe', 44.4169, 8.9214],
  ['Genova Brignole', 44.4078, 8.9419],
  ['Trieste Centrale', 45.6569, 13.7681],
  ['Udine', 46.0586, 13.2419],
  ['Pordenone', 45.9633, 12.6553],
  ['Treviso Centrale', 45.6594, 12.2444],
  ['Bari Centrale', 41.1186, 16.8689],
  ['Lecce', 40.3556, 18.1789],
  ['Pescara Centrale', 42.4631, 14.2061],
  ['Ancona', 43.5994, 13.5119],
  ['Pisa Centrale', 43.7086, 10.3994],
  ['Livorno Centrale', 43.5469, 10.3164],
  ['Perugia', 43.1078, 12.3897],
  ['Cagliari', 39.2161, 9.1108],
  ['Palermo Centrale', 38.1100, 13.3669],
  ['Catania Centrale', 37.5025, 15.0931],
  ['Reggio Calabria Centrale', 38.1031, 15.6431],
  ['Lamezia Terme Centrale', 38.9069, 16.2456],
  ['Salerno', 40.6803, 14.7681],
  ['La Spezia Centrale', 44.1072, 9.8136],
  ['Como San Giovanni', 45.8089, 9.0758],
  ['Novara', 45.4467, 8.6097],
  ['Alessandria', 44.9089, 8.6178],
  ['Ferrara', 44.8419, 11.6011],
  ['Rimini', 44.0703, 12.5994],
  ['Cremona', 45.1378, 10.0294],
]

export async function handler(event) {
  const p = event.queryStringParameters || {}
  const lat = parseFloat(p.lat)
  const lng = parseFloat(p.lng)

  if (isNaN(lat) || isNaN(lng)) {
    return json(400, { errore: 'coordinate mancanti o non valide' })
  }

  // 1) stazione più vicina nel dataset
  let vicina = null
  let minKm = Infinity
  for (const [nome, slat, slng] of STAZIONI) {
    const km = haversine(lat, lng, slat, slng)
    if (km < minKm) {
      minKm = km
      vicina = nome
    }
  }

  if (!vicina) return json(404, { errore: 'nessuna stazione trovata' })

  // 2) recupero l'id LeFrecce della stazione (serve per la ricerca)
  try {
    const url = `${BASE}/locations/search?name=${encodeURIComponent(vicina)}&limit=10`
    const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA } })
    if (res.ok) {
      const data = await res.json()
      // preferisco match esatto sul nome, evito le multistation
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
    // ignoro: fallback sotto
  }

  // fallback: restituisco almeno il nome, il frontend rifarà l'autocomplete
  return json(200, { id: null, name: vicina, distanzaKm: Math.round(minKm * 10) / 10 })
}

// distanza in km tra due coordinate (formula dell'emisenoverso)
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
