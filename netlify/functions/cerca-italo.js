// netlify/functions/cerca-italo.js
// Ricerca soluzioni Italo (orario completo) via API ufficiale del sito biglietti,
// SENZA login. Flusso a due passi con polling:
//  1) POST /api/v1/booking { departureStation, arrivalStation, departureDate, ... }
//     -> { operationId, pollAfter, isCompleted }
//  2) GET /api/v1/booking/status/{operationId} (ripetuto finché pronto)
//     -> trips[].travelSolutions[].journeys[].segments[] con orari e numero treno
//
// GET /api/cerca-italo?da=Trento&a=Verona Porta Nuova&quando=2026-06-12T15:00

import { codiceItalo, ITALO_NOMI } from './_italo_stazioni.js'

const API = 'https://api-biglietti.italotreno.com/api/v1'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
const HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  Origin: 'https://biglietti.italotreno.com',
  Referer: 'https://biglietti.italotreno.com/',
  'User-Agent': UA,
}

const MAX_POLL = 6 // tentativi di polling
const POLL_MS = 1200 // attesa tra un polling e l'altro

export async function handler(event) {
  const p = event.queryStringParameters || {}
  const daNome = (p.da || '').trim()
  const aNome = (p.a || '').trim()
  const quando = (p.quando || '').trim()

  const codDa = codiceItalo(daNome)
  const codA = codiceItalo(aNome)
  if (!codDa || !codA) return json(200, { soluzioni: [] })

  const data = estraiData(quando) // yyyy-MM-dd
  if (!data) return json(200, { soluzioni: [] })
  const minutiRichiesti = minutiDaISO(quando)

  try {
    // --- 1) avvio ricerca ---
    const body = {
      isRoundTrip: false,
      departureStation: codDa,
      arrivalStation: codA,
      departureDate: data,
      culture: 'it-IT',
      showPrivateOffers: false,
      showBestPrices: true,
      adultPassengers: 1,
      youngPassengers: 0,
      childPassengers: 0,
      seniorPassengers: 0,
      hasPet: false,
      promoCode: '',
      employeeOffer: null,
      passengersAges: null,
      portalType: 'B2C',
    }
    const startRes = await fetch(`${API}/booking`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(body),
    })
    if (!startRes.ok) return json(200, { soluzioni: [] })
    const start = await startRes.json()
    const opId = start.operationId
    if (!opId) return json(200, { soluzioni: [] })

    // --- 2) polling status finché ho le soluzioni ---
    let statusData = null
    for (let i = 0; i < MAX_POLL; i++) {
      await sleep(i === 0 ? (start.pollAfter || POLL_MS) : POLL_MS)
      const sRes = await fetch(`${API}/booking/status/${opId}`, { headers: HEADERS })
      if (!sRes.ok) continue
      const s = await sRes.json()
      const trips = s?.trips || []
      const haSoluzioni = trips.some((t) => (t.travelSolutions || []).length > 0)
      if (haSoluzioni || s.isCompleted) {
        statusData = s
        if (haSoluzioni) break
      }
    }
    if (!statusData) return json(200, { soluzioni: [] })

    // --- 3) estraggo le soluzioni ---
    const soluzioni = []
    for (const trip of statusData.trips || []) {
      if (trip.direction && trip.direction !== 'forward') continue
      for (const ts of trip.travelSolutions || []) {
        const journeys = ts.journeys || []
        if (journeys.length === 0) continue

        // orari complessivi: partenza del primo segmento, arrivo dell'ultimo
        const primoSeg = journeys[0].segments?.[0]
        const ultimoJ = journeys[journeys.length - 1]
        const ultimoSeg = ultimoJ.segments?.[ultimoJ.segments.length - 1]
        if (!primoSeg || !ultimoSeg) continue

        const partenza = primoSeg.std // ISO
        const arrivo = ultimoSeg.sta
        const minPart = minutiDaISO(partenza)

        // filtro: solo soluzioni a partire dall'orario richiesto (tutta la giornata dopo)
        if (minutiRichiesti != null && minPart != null && minPart < minutiRichiesti - 5) continue

        // numeri treno dei segmenti
        const numeri = journeys
          .flatMap((j) => (j.segments || []).map((sg) => sg.trainNumber))
          .filter(Boolean)

        soluzioni.push({
          categoria: 'Italo',
          numero: numeri.join('+') || '',
          da: ITALO_NOMI[codDa] || daNome,
          a: ITALO_NOMI[codA] || aNome,
          orarioPartenza: partenza, // ISO, il frontend formatta
          orarioArrivo: arrivo,
          cambi: ts.numberOfChanges || Math.max(journeys.length - 1, 0),
          operatore: 'italo',
        })
      }
    }

    soluzioni.sort((a, b) => (a.orarioPartenza || '').localeCompare(b.orarioPartenza || ''))
    return json(200, { soluzioni })
  } catch (e) {
    return json(200, { soluzioni: [], errore: e.message })
  }
}

function estraiData(iso) {
  const m = String(iso).match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

function minutiDaISO(iso) {
  const m = String(iso).match(/T(\d{2}):(\d{2})/)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}
