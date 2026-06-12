// netlify/functions/cerca-italo.js
// Collegamenti DIRETTI Italo tra due stazioni, dal tabellone partenze pubblico
// "Italo in viaggio" (una sola chiamata, nessun login).
//
// GET /api/cerca-italo?da=Verona Porta Nuova&a=Roma Termini&quando=2026-06-12T08:30
//
// Flusso:
//  1) traduco le stazioni nei codici Italo (mappatura fissa); se una non e'
//     servita da Italo -> lista vuota.
//  2) RicercaStazioneService sul tabellone PARTENZE dell'origine (1 chiamata).
//  3) per ogni treno leggo InfoRoute (percorso con orari): se contiene la
//     destinazione dopo la partenza e nella finestra di 3h -> soluzione.

import { codiceItalo, ITALO_NOMI } from './_italo_stazioni.js'

const BASE = 'https://italoinviaggio.italotreno.it/api'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

const FINESTRA_MIN = 180 // 3 ore

export async function handler(event) {
  const p = event.queryStringParameters || {}
  const daNome = (p.da || '').trim()
  const aNome = (p.a || '').trim()
  const quando = (p.quando || '').trim()

  const codDa = codiceItalo(daNome)
  const codA = codiceItalo(aNome)
  if (!codDa || !codA) return json(200, { soluzioni: [] })

  const minutiRichiesti = minutiDaISO(quando)
  // nomi per cercare la destinazione in InfoRoute: esatti (priorità) + alias
  const nomiEsatti = nomiDestEsatti(codA, aNome)
  const nomiAlias = nomiDestAlias(codA)

  try {
    const nomeStazione = ITALO_NOMI[codDa] || daNome
    const url =
      `${BASE}/RicercaStazioneService?` +
      `CodiceStazione=${encodeURIComponent(codDa)}` +
      `&NomeStazione=${encodeURIComponent(nomeStazione)}`

    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
    if (!res.ok) return json(200, { soluzioni: [] })
    const tab = await res.json()

    const partenze = tab?.ListaTreniPartenza || []
    if (!Array.isArray(partenze) || partenze.length === 0) {
      return json(200, { soluzioni: [] })
    }

    const soluzioni = []
    for (const t of partenze) {
      const numero = String(t.Numero || '').trim()
      if (!numero) continue

      // orario di partenza da questa stazione (NuovoOrario tiene conto del ritardo,
      // ma per il teorico uso OraPassaggio)
      const partenza = (t.OraPassaggio || t.NuovoOrario || '').trim()
      const minPart = minutiDaOrario(partenza)

      // filtro finestra 3h
      if (minutiRichiesti != null && minPart != null) {
        let diff = minPart - minutiRichiesti
        if (diff < -5) diff += 1440
        if (diff < -5 || diff > FINESTRA_MIN) continue
      }

      // cerco la destinazione nel percorso (InfoRoute)
      const arrivo = trovaArrivoInRoute(t.InfoRoute || t.Descrizione || '', nomiEsatti, nomiAlias)
      if (!arrivo) continue

      soluzioni.push({
        categoria: 'Italo',
        numero,
        da: ITALO_NOMI[codDa] || daNome,
        a: arrivo.nome,
        orarioPartenza: normalizzaOra(partenza),
        orarioArrivo: normalizzaOra(arrivo.ora),
        ritardo: typeof t.Ritardo === 'number' ? t.Ritardo : null,
        cambi: 0,
        operatore: 'italo',
      })
    }

    soluzioni.sort((a, b) => (a.orarioPartenza || '').localeCompare(b.orarioPartenza || ''))
    return json(200, { soluzioni })
  } catch (e) {
    return json(200, { soluzioni: [], errore: e.message })
  }
}

// Cerca la stazione di destinazione dentro la stringa InfoRoute.
// Formato: "Milano Rogoredo (11.23) - Roma Termini (14.30) - ..."
// Due passate: prima cerco il nome ESATTO (es. "Roma Termini"), poi gli alias,
// così non confondo Roma Termini con Roma Tiburtina.
function trovaArrivoInRoute(route, nomiEsatti, nomiAlias) {
  if (!route) return null
  const tappe = []
  for (const tappa of route.split(' - ')) {
    const m = tappa.match(/^(.*?)\s*\((\d{1,2})[.:](\d{2})\)/)
    if (!m) continue
    tappe.push({ nome: m[1].trim(), ora: `${m[2].padStart(2, '0')}:${m[3]}` })
  }
  // passata 1: match esatto sul nome completo
  for (const t of tappe) {
    if (nomiEsatti.some((nd) => norm(t.nome) === norm(nd))) return t
  }
  // passata 2: match per inclusione sugli alias
  for (const t of tappe) {
    if (nomiAlias.some((nd) => matchNome(t.nome, nd))) return t
  }
  return null
}

// nomi ESATTI della destinazione (per il match prioritario, senza ambiguità)
function nomiDestEsatti(codA, aNome) {
  const set = new Set()
  if (ITALO_NOMI[codA]) set.add(ITALO_NOMI[codA])
  if (aNome) set.add(aNome)
  // varianti di scrittura usate da Italo in InfoRoute
  const varianti = {
    BC_: ['Bologna centrale'],
    AAV: ['Mediopadana R.Emilia'],
    OUE: ['Torino Porta di Susa'],
    VSL: ['Venezia Santa Lucia'],
    SMN: ['Firenze Santa Maria Novella'],
  }
  if (varianti[codA]) varianti[codA].forEach((x) => set.add(x))
  return [...set]
}

// alias generici (usati solo se il match esatto fallisce)
function nomiDestAlias(codA) {
  const extra = {
    RMT: ['Roma Termini'],
    RTB: ['Roma Tiburtina'],
    NAC: ['Napoli'],
    VPN: ['Verona Porta Nuova'],
    DSG: ['Desenzano'],
    BSC: ['Brescia'],
    PD_: ['Padova'],
    VEM: ['Venezia Mestre'],
    TOP: ['Torino Porta Nuova'],
  }
  return extra[codA] || []
}

function matchNome(a, b) {
  const na = norm(a)
  const nb = norm(b)
  if (!na || !nb) return false
  return na === nb || na.includes(nb) || nb.includes(na)
}

function norm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

// "10.40" o "10:40" -> "10:40"
function normalizzaOra(v) {
  const m = String(v).match(/(\d{1,2})[.:](\d{2})/)
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : v
}

function minutiDaOrario(v) {
  const m = String(v).match(/(\d{1,2})[.:](\d{2})/)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

function minutiDaISO(iso) {
  const m = String(iso).match(/T(\d{2}):(\d{2})/)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}
