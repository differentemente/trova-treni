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

    // Timestamp (ms) della mezzanotte del giorno RICHIESTO dall'utente. Per le
    // corse future provo a interrogare ViaggiaTreno su QUESTA data invece che
    // su oggi: l'autocomplete dà il ts di oggi, ma andamentoTreno accetta il ts
    // di mezzanotte del giorno di partenza, quindi posso puntare al giorno giusto.
    const tsGiornoRichiesto = mezzanotteMsDaISO(partenzaISO)

    // --- Step 2: scarico l'andamento dei candidati e scelgo il migliore ---
    const ordinati = ordinaPerOrigine(candidati, origine)

    let migliore = null
    let migliorPunteggio = -1
    let almenoUnoConDati = false

    for (const c of ordinati.slice(0, 8)) {
      // provo prima con la data richiesta (per le future), poi con quella di oggi
      const tentativi = []
      if (tsGiornoRichiesto != null && tsGiornoRichiesto !== Number(c.ts)) {
        tentativi.push(tsGiornoRichiesto)
      }
      tentativi.push(c.ts)

      let d = null
      for (const ts of tentativi) {
        d = await scaricaAndamento(c.codice, numero, ts)
        if (d) break
      }
      if (!d) continue // nessun tentativo ha dati per questo candidato
      almenoUnoConDati = true

      const punteggio = valuta(d, origine, destinazione, minutiAttesi)
      if (punteggio > migliorPunteggio) {
        migliorPunteggio = punteggio
        migliore = d
      }
      // match forte (passa da entrambe le stazioni + orario coerente):
      // inutile continuare a interrogare gli altri candidati
      if (punteggio >= 4) break
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

    // A questo punto un treno l'ho identificato tra i candidati con dati.
    //
    // Validazione: devo assicurarmi di non mostrare il percorso di un treno
    // OMONIMO ma diverso (stesso numero, altra linea). Il controllo corretto è
    // che il treno PASSI dalla stazione da cui parte l'utente — NON che ci
    // abbia il capolinea: nella stragrande maggioranza dei casi si sale in una
    // fermata intermedia (es. REG 16198 Treviso→Vicenza preso a Castelfranco).
    const passaDaOrigine =
      !origine ||
      (Array.isArray(migliore?.fermate) &&
        migliore.fermate.some((f) => simili(f.stazione, origine)))

    if (!passaDaOrigine) {
      return json(200, {
        disponibile: false,
        motivo: futura
          ? 'gli orari in tempo reale per questa data non sono ancora disponibili'
          : 'percorso momentaneamente non disponibile',
      })
    }

    // Il treno passa dalla stazione richiesta: mostro la tratta.
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
  const fermate = Array.isArray(d?.fermate) ? d.fermate : []
  const iOrig = origine ? fermate.findIndex((f) => simili(f.stazione, origine)) : -1
  const iDest = destinazione ? fermate.findIndex((f) => simili(f.stazione, destinazione)) : -1

  // Il treno passa dalla stazione di partenza dell'utente (anche intermedia)
  if (origine && iOrig >= 0) s++
  // ...e da quella di arrivo, DOPO la partenza (giusto verso di marcia)
  if (destinazione && iDest >= 0 && (iOrig < 0 || iDest > iOrig)) s++
  // bonus se coincidono anche i capolinea: match ancora più forte
  if (origine && simili(d.origine, origine)) s++
  if (destinazione && simili(d.destinazione, destinazione)) s++

  if (minutiAttesi != null) {
    // confronto l'orario atteso con la partenza dalla stazione dell'utente
    // (non con quella del capolinea, che può essere molto diversa)
    const partTeo =
      iOrig >= 0 ? minutiDaTs(fermate[iOrig]?.partenza_teorica) : orarioPartenzaTeoricoMinuti(d)
    if (partTeo != null && Math.abs(partTeo - minutiAttesi) <= 4) s += 2
  }
  return s
}

// minuti dopo mezzanotte da un timestamp ms
function minutiDaTs(ts) {
  if (ts == null) return null
  const d = new Date(Number(ts))
  if (isNaN(d)) return null
  return d.getHours() * 60 + d.getMinutes()
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

  // --- Fermate dell'intera corsa ---
  const fermateComplete = d.fermate.map((f) => {
    // in data futura ignoro qualsiasi dato reale: solo teorici
    const transitata = futura ? false : f.partenzaReale != null || f.arrivoReale != null
    const binEff = futura
      ? null
      : pick(f.binarioEffettivoPartenzaDescrizione) || pick(f.binarioEffettivoArrivoDescrizione)
    const binProg =
      pick(f.binarioProgrammatoPartenzaDescrizione) ||
      pick(f.binarioProgrammatoArrivoDescrizione)
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
      proiezioneArrivo: null,
      proiezionePartenza: null,
    }
  })

  // --- ULTIMO RILEVAMENTO REALE del treno, su tutta la corsa ---
  // Due fonti possibili, tengo la più recente:
  //  A) i campi globali di ViaggiaTreno (stazione/ora ultimo rilevamento +
  //     ritardo): possono riferirsi anche a un punto di solo transito, quindi
  //     sono il dato più aggiornato quando ci sono;
  //  B) l'ultima fermata con un orario reale (arrivo o partenza effettivi),
  //     con il ritardo calcolato su quella fermata (effettivo - programmato).
  // Il ritardo mostrato all'utente è SEMPRE quello misurato in questo punto.
  let rilevamento = null
  if (!futura) {
    let iUltima = -1
    fermateComplete.forEach((f, i) => {
      if (f.transitata) iUltima = i
    })

    let daFermate = null
    if (iUltima >= 0) {
      const f = fermateComplete[iUltima]
      const r =
        deltaMin(f.effettivoPartenza, f.teoricoPartenza) ??
        deltaMin(f.effettivoArrivo, f.teoricoArrivo) ??
        (typeof f.ritardo === 'number' ? f.ritardo : 0)
      daFermate = {
        nome: f.nome,
        ora: Number(f.effettivoPartenza ?? f.effettivoArrivo),
        ritardo: r,
        indice: iUltima,
      }
    }

    let daGlobale = null
    if (d.oraUltimoRilevamento != null && pick(d.stazioneUltimoRilevamento)) {
      const iG = fermateComplete.findIndex((f) => simili(f.nome, d.stazioneUltimoRilevamento))
      daGlobale = {
        nome: d.stazioneUltimoRilevamento,
        ora: Number(d.oraUltimoRilevamento),
        ritardo: typeof d.ritardo === 'number' ? d.ritardo : daFermate?.ritardo ?? 0,
        indice: Math.max(iG, daFermate?.indice ?? -1),
      }
    }

    if (daGlobale && daFermate) rilevamento = daGlobale.ora >= daFermate.ora ? daGlobale : daFermate
    else rilevamento = daGlobale || daFermate
  }
  const inViaggio = !!rilevamento

  // --- Treno mai rilevato: è ancora fermo al suo capolinea ---
  // Qui NON uso il ritardo dichiarato a priori: se la partenza programmata dal
  // capolinea è ancora nel futuro il treno non è in ritardo, punto. Solo se
  // quell'orario è già passato e il treno non risulta partito, il ritardo è
  // (adesso - partenza programmata), o quello dichiarato se maggiore.
  const partenzaCapolinea = fermateComplete[0]?.teoricoPartenza ?? null
  let ritardoNonPartito = 0
  if (!futura && !inViaggio && partenzaCapolinea != null) {
    const trascorsi = Math.floor((Date.now() - Number(partenzaCapolinea)) / 60000)
    if (trascorsi > 0) {
      const dichiarato = typeof d.ritardo === 'number' ? d.ritardo : 0
      ritardoNonPartito = Math.max(trascorsi, dichiarato)
    }
  }

  // --- Proiezione sulle fermate non ancora raggiunte ---
  // Proietto il ritardo misurato all'ultimo rilevamento solo sulle fermate
  // SUCCESSIVE a quel punto. Nessuna proiezione se il treno è in orario o se
  // non è mai stato rilevato e la sua partenza è ancora futura.
  if (!futura) {
    const iUlt = inViaggio ? rilevamento.indice : -1
    const rProj = inViaggio ? Math.max(0, rilevamento.ritardo) : ritardoNonPartito
    if (rProj > 0) {
      fermateComplete.forEach((f, i) => {
        if (i < iUlt) return
        if (i === iUlt) {
          // fermata attuale: arrivato ma non ancora ripartito
          if (f.effettivoArrivo != null && f.effettivoPartenza == null) {
            f.proiezionePartenza = sommaMinuti(f.teoricoPartenza, rProj)
          }
          return
        }
        if (f.transitata) return
        f.proiezioneArrivo = sommaMinuti(f.teoricoArrivo, rProj)
        f.proiezionePartenza = sommaMinuti(f.teoricoPartenza, rProj)
      })
    }
  }

  // --- Taglio al segmento richiesto: da "origine" a "destinazione" ---
  let fermate = fermateComplete
  const iOrig = origine ? fermate.findIndex((f) => simili(f.nome, origine)) : 0
  const iDest = destinazione
    ? fermate.findIndex((f, idx) => idx >= (iOrig >= 0 ? iOrig : 0) && simili(f.nome, destinazione))
    : fermate.length - 1

  let inizioSegmento = 0
  if (iOrig >= 0 && iDest >= 0 && iDest >= iOrig) {
    fermate = fermate.slice(iOrig, iDest + 1)
    inizioSegmento = iOrig
  }

  const cancellataSulSegmento = fermate.some((f) => f.soppressa)

  // --- Arrivato alla destinazione dell'utente? ---
  // Conta il ritardo misurato su QUELLA fermata, non quello che il treno si
  // porta fino al suo capolinea.
  const fermataArrivo = fermate[fermate.length - 1]
  const arrivato = !futura && !!fermataArrivo && fermataArrivo.effettivoArrivo != null
  let ritardoArrivo = null
  if (arrivato) {
    const d1 = deltaMin(fermataArrivo.effettivoArrivo, fermataArrivo.teoricoArrivo)
    ritardoArrivo = d1 != null ? d1 : typeof fermataArrivo.ritardo === 'number' ? fermataArrivo.ritardo : 0
    if (ritardoArrivo < 0) ritardoArrivo = 0
  }

  // Il treno ha già raggiunto (o superato) la stazione dove sale l'utente?
  const raggiuntaOrigineUtente =
    !!fermate[0]?.transitata || (inViaggio && rilevamento.indice >= inizioSegmento)

  // --- Stato mostrato all'utente ---
  // programmato  : data futura
  // cancellato   : fermate soppresse nella tratta dell'utente
  // arrivato     : arrivato alla destinazione dell'utente
  // ritardo / in_orario : in viaggio sulla tratta dell'utente
  // in_arrivo    : in viaggio, ma non ancora arrivato alla stazione dell'utente
  // non_partito_ritardo : mai rilevato e partenza programmata già passata
  // non_partito  : mai rilevato, partenza ancora da venire (NESSUN ritardo)
  let stato
  let ritardoMin = 0
  if (futura) {
    stato = 'programmato'
  } else if (cancellataSulSegmento) {
    stato = 'cancellato'
  } else if (arrivato) {
    stato = 'arrivato'
    ritardoMin = ritardoArrivo
  } else if (raggiuntaOrigineUtente) {
    ritardoMin = Math.max(0, rilevamento?.ritardo ?? 0)
    stato = ritardoMin > 0 ? 'ritardo' : 'in_orario'
  } else if (inViaggio) {
    stato = 'in_arrivo'
    ritardoMin = Math.max(0, rilevamento.ritardo)
  } else if (ritardoNonPartito > 0) {
    stato = 'non_partito_ritardo'
    ritardoMin = ritardoNonPartito
  } else {
    stato = 'non_partito'
  }

  return json(200, {
    disponibile: true,
    futura,
    soppresso: false,
    cancellatoSulSegmento: futura ? false : cancellataSulSegmento,
    stato,
    ritardoMin,
    // ritardo grezzo all'ultimo rilevamento (negativo = anticipo)
    ritardoRilevamento: rilevamento ? rilevamento.ritardo : null,
    arrivato,
    ritardoArrivo,
    oraArrivoEffettivo: arrivato ? fermataArrivo.effettivoArrivo : null,
    nomeArrivo: fermataArrivo?.nome ?? null,
    ultimoRilevamento: rilevamento ? rilevamento.nome : null,
    oraUltimoRilevamento: rilevamento ? rilevamento.ora : null,
    // stazione dove sale l'utente e relativa partenza programmata
    stazioneUtente: fermate[0]?.nome ?? null,
    partenzaProgrammataUtente: fermate[0]?.teoricoPartenza ?? null,
    partenzaProgrammataCapolinea: partenzaCapolinea,
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

// Timestamp (ms) della mezzanotte locale del giorno indicato da un ISO
// "2026-07-20T06:43:00+02:00" -> ms della mezzanotte del 20/07. ViaggiaTreno
// usa questo valore come identificativo di giornata nelle chiamate andamentoTreno.
function mezzanotteMsDaISO(iso) {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const y = Number(m[1]), mo = Number(m[2]), g = Number(m[3])
  if (!y || !mo || !g) return null
  // mezzanotte in ora locale italiana (la stessa convenzione usata da ViaggiaTreno)
  const d = new Date(y, mo - 1, g, 0, 0, 0, 0)
  return isNaN(d) ? null : d.getTime()
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
