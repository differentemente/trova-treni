// netlify/functions/stato-treno.js
// Stato treno in tempo reale via ViaggiaTreno (andamentoTreno).
//
// GET /api/stato-treno?numero=140&origine=VERONA PORTA NUOVA
//     [&destinazione=MILANO CENTRALE] [&partenza=2026-06-11T17:32:00+02:00]
//
// "origine"/"destinazione" sono i NOMI stazione della soluzione LeFrecce;
// "partenza" è l'orario ISO di partenza del treno (per disambiguare i numeri
// treno duplicati: lo stesso numero può identificare treni diversi in Italia).
//
// Flusso:
//  1) cercaNumeroTrenoTrenoAutocomplete/{numero} -> N candidati (codiceS + ts mezzanotte)
//  2) per ogni candidato scarico andamentoTreno e SCELGO quello la cui
//     origine/destinazione/ora di partenza combaciano con la soluzione.
//     Niente più fallback cieco sul primo candidato.

const VT = 'http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

export async function handler(event) {
  const p = event.queryStringParameters || {}
  const numero = (p.numero || '').trim()
  const origine = (p.origine || '').trim()
  const destinazione = (p.destinazione || '').trim()
  const partenzaISO = (p.partenza || '').trim()
  // se la data è futura, mostro la tratta teorica (presa dal treno odierno)
  const futura = (p.futura || '') === '1'

  if (!numero) return json(400, { disponibile: false, errore: 'numero treno mancante' })

  try {
    // --- Step 1: lista candidati per quel numero ---
    const autoUrl = `${VT}/cercaNumeroTrenoTrenoAutocomplete/${encodeURIComponent(numero)}`
    const autoRes = await fetch(autoUrl, { headers: { 'User-Agent': UA } })
    const autoText = await autoRes.text()

    const candidati = parseAutocomplete(autoText) // [{ nome, codice, ts }]
    if (candidati.length === 0) {
      return json(200, {
        disponibile: false,
        motivo: futura
          ? 'gli orari in tempo reale per questa data non sono ancora disponibili'
          : 'percorso momentaneamente non disponibile',
      })
    }

    // minuti dopo mezzanotte attesi per la partenza (per confronto orario)
    const minutiAttesi = minutiDaISO(partenzaISO)

    // --- Step 2: scarico l'andamento dei candidati e scelgo il migliore ---
    // NB: anche per le date future uso il treno ODIERNO (timestamp di oggi dato
    // dall'autocomplete). Il percorso teorico è lo stesso ogni giorno; in modalità
    // "futura" poi azzero tutta la parte realtime (ritardi, effettivi, stato).
    const ordinati = ordinaPerOrigine(candidati, origine)

    let migliore = null
    let migliorPunteggio = -1
    let almenoUnoConDati = false

    for (const c of ordinati.slice(0, 8)) {
      const d = await scaricaAndamento(c.codice, numero, c.ts)
      if (!d) continue // 204/vuoto: questo candidato non ha dati
      almenoUnoConDati = true

      const punteggio = valuta(d, origine, destinazione, minutiAttesi)
      if (punteggio > migliorPunteggio) {
        migliorPunteggio = punteggio
        migliore = d
      }
      // match perfetto (origine + destinazione + orario): mi fermo subito
      if (punteggio >= 3) break
    }

    // Nessun candidato con dati = ViaggiaTreno non espone il tempo reale per
    // questo treno adesso (tipico di alcuni AV, o di date future non ancora
    // in linea, o di treni la cui corsa odierna è già conclusa).
    if (!almenoUnoConDati || !migliore) {
      return json(200, {
        disponibile: false,
        motivo: futura
          ? 'gli orari in tempo reale per questa data non sono ancora disponibili'
          : 'percorso momentaneamente non disponibile',
      })
    }

    // A questo punto un treno l'ho identificato. Non rifiuto più:
    // se era l'unico candidato non c'è ambiguità, se erano molti ho preso il
    // migliore per origine/destinazione/orario. Mostro comunque la tratta.
    return componiRisposta(migliore, origine, destinazione, futura)
  } catch (e) {
    return json(200, { disponibile: false, motivo: 'errore di rete', errore: e.message })
  }
}

async function scaricaAndamento(codice, numero, ts) {
  try {
    const url = `${VT}/andamentoTreno/${codice}/${encodeURIComponent(numero)}/${ts}`
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    // 204 = ViaggiaTreno non ha dati per questo treno (tipico AV)
    if (res.status === 204) return null
    const text = await res.text()
    if (!text || text.trim() === '') return null
    return JSON.parse(text)
  } catch {
    return null
  }
}

// Punteggio di corrispondenza tra l'andamento e la soluzione cercata.
// +1 origine, +1 destinazione, +1 orario di partenza vicino (<= 4 min)
function valuta(d, origine, destinazione, minutiAttesi) {
  let s = 0
  if (origine && simili(d.origine, origine)) s++
  if (destinazione && simili(d.destinazione, destinazione)) s++
  if (minutiAttesi != null) {
    const partTeo = orarioPartenzaTeoricoMinuti(d)
    if (partTeo != null && Math.abs(partTeo - minutiAttesi) <= 4) s++
  }
  return s
}

function componiRisposta(d, origine, destinazione, futura = false) {
  if (!d || !Array.isArray(d.fermate) || d.fermate.length === 0) {
    const soppresso = d?.tipoTreno === 'ST' || d?.provvedimento === 1
    return json(200, {
      disponibile: false,
      soppresso,
      motivo: soppresso ? 'treno soppresso' : 'nessun dato disponibile',
    })
  }

  // Treno soppresso interamente
  if (d.tipoTreno === 'ST' || d.provvedimento === 1) {
    return json(200, { disponibile: false, soppresso: true, motivo: 'treno soppresso' })
  }

  // "Non partito" NON può basarsi solo su oraUltimoRilevamento /
  // stazioneUltimoRilevamento: ViaggiaTreno a volte lascia quei campi vuoti
  // anche per treni chiaramente in viaggio (con orari effettivi nelle fermate).
  // Verità di base: il treno è PARTITO se una qualsiasi fermata ha un orario
  // reale registrato (arrivo o partenza effettivi).
  const haRilevamentiFermate = Array.isArray(d.fermate)
    ? d.fermate.some((f) => f.partenzaReale != null || f.arrivoReale != null)
    : false
  const rilevamentoGlobaleAssente =
    d.oraUltimoRilevamento == null || d.stazioneUltimoRilevamento === '--'
  // non partito solo se NON c'è nessun rilevamento, né globale né per fermata
  const nonPartito = rilevamentoGlobaleAssente && !haRilevamentiFermate

  // Ritardo dichiarato da ViaggiaTreno (globale sul treno)
  let ritardoMin = futura ? 0 : typeof d.ritardo === 'number' ? d.ritardo : 0

  // Se il treno NON è ancora partito ma l'orario teorico di partenza è già
  // passato, il treno è di fatto in ritardo anche se ViaggiaTreno non lo dichiara
  // ancora. Stimo il ritardo minimo come (adesso - partenza teorica).
  // Es: teorica 13:00, ora 13:10, non partito => ritardo >= 10 min.
  let ritardoStimatoNonPartito = 0
  if (!futura && nonPartito) {
    const partTeoTs = d.fermate?.[0]?.partenza_teorica
    if (partTeoTs != null) {
      const diffMin = Math.floor((Date.now() - Number(partTeoTs)) / 60000)
      if (diffMin > 0) ritardoStimatoNonPartito = diffMin
    }
  }
  // il ritardo effettivo del treno non partito è il maggiore tra quello
  // dichiarato e quello stimato dallo scorrere del tempo
  if (!futura && nonPartito && ritardoStimatoNonPartito > ritardoMin) {
    ritardoMin = ritardoStimatoNonPartito
  }

  let stato
  if (futura) stato = 'programmato'
  else if (nonPartito && ritardoMin > 0) stato = 'non_partito_ritardo'
  else if (nonPartito) stato = 'non_partito'
  else if (ritardoMin <= 0) stato = 'in_orario'
  else stato = 'ritardo'

  let fermateComplete = d.fermate.map((f) => {
    // in data futura ignoro qualsiasi dato reale: solo teorici
    const transitata = futura ? false : f.partenzaReale != null || f.arrivoReale != null
    const binEff = futura
      ? null
      : pick(f.binarioEffettivoArrivoDescrizione) || pick(f.binarioEffettivoPartenzaDescrizione)
    const binProg =
      pick(f.binarioProgrammatoArrivoDescrizione) ||
      pick(f.binarioProgrammatoPartenzaDescrizione)
    return {
      nome: f.stazione,
      teoricoArrivo: f.arrivo_teorico ?? null,
      effettivoArrivo: futura ? null : f.arrivoReale ?? null,
      teoricoPartenza: f.partenza_teorica ?? null,
      effettivoPartenza: futura ? null : f.partenzaReale ?? null,
      ritardo: futura ? null : typeof f.ritardo === 'number' ? f.ritardo : null,
      binario: binEff || binProg || null,
      binarioConfermato: !!binEff,
      soppressa: f.actualFermataType === 3,
      transitata,
      tipo: f.tipoFermata,
    }
  })

  let fermate = fermateComplete

  // --- Proiezione del ritardo sulle fermate non ancora raggiunte ---
  // (saltata per le date future: non c'è ritardo da proiettare)
  //
  // Logica robusta: il ritardo da proiettare è quello REALE dell'ultima fermata
  // transitata, calcolato come (orario effettivo - orario teorico). Non mi affido
  // solo a f.ritardo perché ViaggiaTreno spesso non lo popola per fermata. Così
  // se il treno recupera (o accumula) ritardo lungo la corsa, le proiezioni delle
  // fermate successive si aggiornano di conseguenza invece di restare "congelate".
  if (!futura) {
    // ritardo di partenza: se non partito uso il ritardo stimato/dichiarato
    let ritardoCorrente = nonPartito ? ritardoMin : 0

    for (const f of fermateComplete) {
      if (f.transitata) {
        // ritardo reale osservato in questa fermata:
        // preferisco il delta effettivo-teorico (in partenza, poi in arrivo),
        // e in mancanza ricado su f.ritardo dichiarato.
        const dPart = deltaMin(f.effettivoPartenza, f.teoricoPartenza)
        const dArr = deltaMin(f.effettivoArrivo, f.teoricoArrivo)
        if (dPart != null) ritardoCorrente = dPart
        else if (dArr != null) ritardoCorrente = dArr
        else if (typeof f.ritardo === 'number') ritardoCorrente = f.ritardo
        f.proiezioneArrivo = null
        f.proiezionePartenza = null
      } else {
        // fermata futura: proietto il ritardo corrente sul teorico.
        // Il ritardo non può scendere sotto 0 nella proiezione (un treno in
        // orario non "arriva prima" del teorico per definizione di proiezione).
        const r = ritardoCorrente > 0 ? ritardoCorrente : 0
        f.proiezioneArrivo = r > 0 ? sommaMinuti(f.teoricoArrivo, r) : null
        f.proiezionePartenza = r > 0 ? sommaMinuti(f.teoricoPartenza, r) : null
      }
    }
  }

  // --- Taglio al segmento richiesto: da "origine" a "destinazione" ---
  const iOrig = origine ? fermate.findIndex((f) => simili(f.nome, origine)) : 0
  const iDest = destinazione
    ? fermate.findIndex((f, idx) => idx >= (iOrig >= 0 ? iOrig : 0) && simili(f.nome, destinazione))
    : fermate.length - 1

  let tagliata = false
  if (iOrig >= 0 && iDest >= 0 && iDest >= iOrig) {
    fermate = fermate.slice(iOrig, iDest + 1)
    tagliata = true
  }

  // Cancellazione DENTRO il segmento che interessa all'utente
  const cancellataSulSegmento = fermate.some((f) => f.soppressa)

  // Ultima fermata effettivamente transitata NEL SEGMENTO (ha un orario reale).
  // È la fonte di verità su "dov'è il treno", più affidabile dei campi globali
  // di ViaggiaTreno che a volte restano vuoti.
  let ultimaTransitata = null
  for (const f of fermate) {
    if (f.effettivoPartenza != null || f.effettivoArrivo != null) ultimaTransitata = f
  }

  // Il segmento è "non partito" solo se la sua prima fermata non ha orari reali
  const partenzaSegmento = fermate[0]
  const segmentoNonPartito =
    !partenzaSegmento ||
    (partenzaSegmento.effettivoPartenza == null && partenzaSegmento.effettivoArrivo == null)

  // --- Il treno è ARRIVATO a destinazione (dell'utente)? ---
  // La destinazione è l'ultima fermata del segmento richiesto. Se ha già
  // l'arrivo effettivo, per l'utente la corsa è conclusa: mostro "arrivato"
  // con il ritardo REALE su quella fermata, non quello globale del treno
  // (che continua fino al capolinea vero).
  const fermataArrivo = fermate[fermate.length - 1]
  const arrivato =
    !!fermataArrivo && fermataArrivo.effettivoArrivo != null && fermate.length > 0
  // ritardo all'arrivo del segmento = effettivo - teorico sull'ultima fermata
  let ritardoArrivo = null
  if (arrivato) {
    const d1 = deltaMin(fermataArrivo.effettivoArrivo, fermataArrivo.teoricoArrivo)
    ritardoArrivo = d1 != null ? d1 : (typeof fermataArrivo.ritardo === 'number' ? fermataArrivo.ritardo : 0)
    if (ritardoArrivo < 0) ritardoArrivo = 0
  }

  // Stato del segmento, coerente con i dati reali delle fermate:
  // arrivato > cancellato > partito(in orario/ritardo) > non partito
  let statoSegmento
  if (futura) {
    statoSegmento = 'programmato'
  } else if (cancellataSulSegmento) {
    statoSegmento = 'cancellato'
  } else if (arrivato) {
    statoSegmento = 'arrivato'
  } else if (!segmentoNonPartito || ultimaTransitata) {
    // treno partito e ancora in viaggio: in orario o in ritardo
    statoSegmento = ritardoMin > 0 ? 'ritardo' : 'in_orario'
  } else if (ritardoMin > 0) {
    statoSegmento = 'non_partito_ritardo'
  } else {
    statoSegmento = 'non_partito'
  }

  // Nome dell'ultimo rilevamento: preferisco quello globale di ViaggiaTreno,
  // ma se manca lo ricavo dall'ultima fermata transitata del segmento.
  const nomeUltimoRilevamento =
    (!rilevamentoGlobaleAssente ? d.stazioneUltimoRilevamento : null) ||
    ultimaTransitata?.nome ||
    null

  return json(200, {
    disponibile: true,
    futura,
    soppresso: false,
    cancellatoSulSegmento: futura ? false : cancellataSulSegmento,
    stato: statoSegmento,
    ritardoMin,
    // info arrivo a destinazione (segmento dell'utente)
    arrivato,
    ritardoArrivo,
    oraArrivoEffettivo: arrivato ? fermataArrivo.effettivoArrivo : null,
    nomeArrivo: fermataArrivo?.nome ?? null,
    ultimoRilevamento: futura ? null : nomeUltimoRilevamento,
    oraUltimoRilevamento: futura
      ? null
      : d.oraUltimoRilevamento ??
        ultimaTransitata?.effettivoPartenza ??
        ultimaTransitata?.effettivoArrivo ??
        null,
    partenza: fermate[0]?.nome ?? d.origine,
    arrivo: fermate[fermate.length - 1]?.nome ?? d.destinazione,
    fermate,
    // tratta intera (per il pop-up "percorso completo")
    fermateComplete,
    origineTreno: d.origine,
    destinazioneTreno: d.destinazione,
  })
}

// ---- parsing & utility ----

// Righe: "140 - VERONA P. N.|140-S02430-1749592800000"
function parseAutocomplete(text) {
  const out = []
  for (const line of String(text).split('\n')) {
    const t = line.trim()
    if (!t) continue
    const [label, payload] = t.split('|')
    if (!payload) continue
    const parts = payload.split('-')
    if (parts.length < 3) continue
    const codice = parts[1]
    const ts = parts[2]
    const nome = (label.split(' - ')[1] || '').trim()
    out.push({ nome, codice, ts })
  }
  return out
}

function ordinaPerOrigine(candidati, origine) {
  if (!origine) return candidati
  return [...candidati].sort(
    (a, b) => puntoNome(b.nome, origine) - puntoNome(a.nome, origine)
  )
}

function puntoNome(nome, target) {
  if (simili(nome, target)) return 2
  const a = norm(nome)
  const b = norm(target)
  if (a && b && (a.includes(b) || b.includes(a))) return 1
  return 0
}

// Confronto nomi stazione tollerante alle abbreviazioni ViaggiaTreno
// es. "VERONA PORTA NUOVA" ~ "VERONA P. N." ; "MILANO CENTRALE" ~ "MILANO C.LE"
function simili(a, b) {
  if (!a || !b) return false
  const na = norm(a)
  const nb = norm(b)
  if (na === nb) return true
  // confronto per iniziali parole: VERONAPN vs VERONAPORTANUOVA
  const ia = iniziali(a)
  const ib = iniziali(b)
  if (ia && ib && (ia === ib)) return true
  // una contenuta nell'altra dopo aver tolto puntini/spazi
  return na.includes(nb) || nb.includes(na)
}

function norm(s) {
  return String(s).toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// "VERONA PORTA NUOVA" -> "VPN" ; usa la prima lettera di ogni parola >1 char
function iniziali(s) {
  return String(s)
    .toUpperCase()
    .split(/[\s.\-]+/)
    .filter((w) => w.length > 0)
    .map((w) => w[0])
    .join('')
}

function minutiDaISO(iso) {
  const m = String(iso).match(/T(\d{2}):(\d{2})/)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

// minuti dopo mezzanotte dell'orario di partenza teorico dalla prima fermata
function orarioPartenzaTeoricoMinuti(d) {
  const ts = d?.fermate?.[0]?.partenza_teorica ?? d?.orarioPartenza
  if (ts == null) return null
  const date = new Date(Number(ts))
  if (isNaN(date)) return null
  return date.getHours() * 60 + date.getMinutes()
}

// Somma N minuti a un timestamp (ms) e restituisce un nuovo timestamp ms.
function sommaMinuti(ts, minuti) {
  if (ts == null) return null
  const n = Number(ts)
  if (isNaN(n)) return null
  return n + minuti * 60000
}

// Differenza in minuti tra due timestamp (effettivo - teorico).
// Restituisce null se manca uno dei due. Positivo = ritardo, negativo = anticipo.
function deltaMin(effettivo, teorico) {
  if (effettivo == null || teorico == null) return null
  const e = Number(effettivo)
  const t = Number(teorico)
  if (isNaN(e) || isNaN(t)) return null
  return Math.round((e - t) / 60000)
}

function pick(v) {
  if (v == null) return null
  const s = String(v).trim()
  if (s === '' || s === '0' || s === '-' || s === '--') return null
  return s
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}
