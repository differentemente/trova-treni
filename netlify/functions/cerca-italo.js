// netlify/functions/cerca-italo.js
// Ricerca collegamenti DIRETTI Italo tra due stazioni, via API pubblica
// "Italo in viaggio" (tracciamento), senza login.
//
// GET /api/cerca-italo?da=Verona Porta Nuova&a=Roma Termini&quando=2026-06-12T08:30
//
// Flusso:
//  1) traduco le stazioni nei codici Italo (mappatura fissa); se una non e'
//     servita da Italo, restituisco lista vuota.
//  2) RicercaStazioneService sul tabellone PARTENZE dell'origine.
//  3) per i treni in partenza nella finestra di 3h dall'orario richiesto,
//     RicercaTrenoService verifica se fermano alla destinazione dopo.
//  4) restituisco le soluzioni dirette nel formato dell'app, categoria "Italo".

import { codiceItalo, ITALO_NOMI } from './_italo_stazioni.js'

const BASE = 'https://italoinviaggio.italotreno.it/api'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

const FINESTRA_MIN = 180 // 3 ore
const MAX_TRENI_VERIFICA = 12 // tetto di sicurezza sulle chiamate

export async function handler(event) {
  const p = event.queryStringParameters || {}
  const daNome = (p.da || '').trim()
  const aNome = (p.a || '').trim()
  const quando = (p.quando || '').trim()

  const codDa = codiceItalo(daNome)
  const codA = codiceItalo(aNome)

  // se una delle due non e' servita da Italo, niente Italo (lista vuota)
  if (!codDa || !codA) return json(200, { soluzioni: [] })

  const minutiRichiesti = minutiDaISO(quando)

  try {
    // --- Tabellone partenze dell'origine ---
    const nomeStazione = ITALO_NOMI[codDa] || daNome
    const tabUrl =
      `${BASE}/RicercaStazioneService?` +
      `CodiceStazione=${encodeURIComponent(codDa)}` +
      `&NomeStazione=${encodeURIComponent(nomeStazione)}`

    const tabRes = await fetch(tabUrl, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
    if (!tabRes.ok) return json(200, { soluzioni: [] })
    const tab = await tabRes.json()

    const partenze = tab?.ListaTreniPartenza || tab?.listaTreniPartenza || []
    if (!Array.isArray(partenze) || partenze.length === 0) {
      return json(200, { soluzioni: [] })
    }

    // --- Filtro finestra oraria (3h dopo l'orario richiesto) ---
    const candidati = []
    for (const t of partenze) {
      const numero = String(t.Numero ?? t.numero ?? '').trim()
      if (!numero) continue
      // orario di partenza previsto dal tabellone (puo' essere stringa "HH:MM" o ts)
      const minPart = minutiDaOrario(t.OrarioPartenza ?? t.orarioPartenza ?? t.Orario)
      if (minutiRichiesti != null && minPart != null) {
        let diff = minPart - minutiRichiesti
        if (diff < -5) diff += 1440 // gestione mezzanotte
        if (diff < -5 || diff > FINESTRA_MIN) continue
      }
      candidati.push({ numero, ordine: minPart ?? 0 })
    }

    candidati.sort((x, y) => x.ordine - y.ordine)
    const daVerificare = candidati.slice(0, MAX_TRENI_VERIFICA)

    // --- Verifica fermata destinazione su ogni treno candidato ---
    const soluzioni = []
    for (const c of daVerificare) {
      const sol = await verificaTreno(c.numero, codDa, codA)
      if (sol) soluzioni.push(sol)
    }

    soluzioni.sort((a, b) => (a.orarioPartenza || '').localeCompare(b.orarioPartenza || ''))
    return json(200, { soluzioni })
  } catch (e) {
    return json(200, { soluzioni: [], errore: e.message })
  }
}

async function verificaTreno(numero, codDa, codA) {
  try {
    const url = `${BASE}/RicercaTrenoService?TrainNumber=${encodeURIComponent(numero)}`
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
    if (!res.ok) return null
    const d = await res.json()
    if (d?.IsEmpty) return null

    const sched = d?.TrainSchedule
    if (!sched) return null

    // elenco completo fermate del treno
    const tutte = [
      sched.StazionePartenza,
      ...(sched.StazioniFerme || []),
    ].filter(Boolean)

    // indice origine e destinazione
    const iDa = tutte.findIndex((s) => codStazione(s) === codDa)
    const iA = tutte.findIndex((s) => codStazione(s) === codA)
    // la destinazione deve esistere e venire DOPO l'origine
    if (iDa < 0 || iA < 0 || iA <= iDa) return null

    const sDa = tutte[iDa]
    const sA = tutte[iA]

    const partenza = orarioTeorico(sDa, 'dep')
    const arrivo = orarioTeorico(sA, 'arr')

    return {
      categoria: 'Italo',
      numero,
      da: sched.DepartureStationDescription || ITALO_NOMI[codDa] || '',
      a: sched.ArrivalStationDescription || ITALO_NOMI[codA] || '',
      orarioPartenza: partenza, // "HH:MM"
      orarioArrivo: arrivo,
      cambi: 0, // sempre diretti per costruzione
      operatore: 'italo',
    }
  } catch {
    return null
  }
}

function codStazione(s) {
  return String(s?.LocationCode ?? s?.locationCode ?? '').trim()
}

// orario teorico di una fermata: dep = partenza, arr = arrivo
function orarioTeorico(s, tipo) {
  if (!s) return null
  if (tipo === 'dep') return s.EstimatedDepartureTime || s.ScheduledDepartureTime || s.DepartureTime || null
  return s.EstimatedArrivalTime || s.ScheduledArrivalTime || s.ArrivalTime || null
}

// "HH:MM" -> minuti dopo mezzanotte
function minutiDaOrario(v) {
  if (v == null) return null
  const m = String(v).match(/(\d{1,2}):(\d{2})/)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

// ISO "yyyy-MM-ddTHH:mm" -> minuti dopo mezzanotte
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
