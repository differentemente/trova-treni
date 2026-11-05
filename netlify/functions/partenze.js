// netlify/functions/partenze.js
// Tabellone partenze di una stazione, in tempo reale, da ViaggiaTreno.
//
// GET /api/partenze?id=830002430        (id LeFrecce, come nella ricerca)
// GET /api/partenze?codice=S02430       (codice stazione ViaggiaTreno)
// Risposta: { codice, aggiornato, treni: [{ numero, categoria, destinazione,
//            orario, ritardo, binario, binarioConfermato, cancellato,
//            codOrigine, origine }] }
//
// Nota: ViaggiaTreno copre Trenitalia e gli altri operatori che viaggiano
// sulla rete RFI con i suoi sistemi (Trenord, TPER, ...), ma non Italo.
// La funzione è scritta in modo da poter aggiungere in seguito il monitor RFI
// (iechub.rfi.it) come seconda fonte.

const VT = 'http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

export async function handler(event) {
  const p = event.queryStringParameters || {}
  let codice = String(p.codice || '').trim().toUpperCase()
  if (!codice && p.id) codice = codiceDaId(p.id)
  if (!/^S\d{5}$/.test(codice)) return json(400, { errore: 'stazione non valida' })

  try {
    const url = `${VT}/partenze/${codice}/${encodeURIComponent(dataViaggiaTreno(new Date()))}`
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (res.status === 204) return json(200, { codice, aggiornato: Date.now(), treni: [] })
    if (!res.ok) return json(502, { errore: 'ViaggiaTreno non risponde' })
    const testo = await res.text()
    let dati
    try {
      dati = JSON.parse(testo)
    } catch {
      return json(502, { errore: 'risposta non valida' })
    }
    const treni = (Array.isArray(dati) ? dati : [])
      .map(mappaTreno)
      .filter(Boolean)
      .sort((a, b) => a.orario - b.orario)
    return json(200, { codice, aggiornato: Date.now(), treni })
  } catch (e) {
    return json(200, { codice, aggiornato: Date.now(), treni: [], errore: 'errore di rete' })
  }
}

export function mappaTreno(t) {
  if (!t) return null
  const comp = pick(t.compNumeroTreno) // es. "REG 3470", "FR 9718"
  const parti = comp ? comp.split(/\s+/) : []
  const numero = String(t.numeroTreno ?? parti[parti.length - 1] ?? '').trim()
  const orario = Number(t.orarioPartenza) || null
  if (!numero || !orario) return null
  let sigla = String(parti.length > 1 ? parti[0] : t.categoria || '').toUpperCase()
  if (sigla === 'REG') sigla = 'R'
  const binEff = pick(t.binarioEffettivoPartenzaDescrizione)
  const binProg = pick(t.binarioProgrammatoPartenzaDescrizione)
  return {
    numero,
    categoria: sigla,
    destinazione: pulisciNome(t.destinazione) || '',
    orario,
    ritardo: typeof t.ritardo === 'number' ? t.ritardo : 0,
    binario: binEff || binProg || null,
    binarioConfermato: !!binEff,
    cancellato: t.provvedimento === 1 || /soppress|cancellat/i.test(String(t.subTitle || '')),
    codOrigine: pick(t.codOrigine) || null,
    origine: pulisciNome(t.origine) || null,
  }
}

// ViaggiaTreno vuole data e ora italiane nel formato di Date.toString(), es.
// "Thu Nov 05 2026 22:30:00 GMT+0100". Il server Netlify gira in UTC, quindi
// la costruisco esplicitamente sul fuso Europe/Rome (ora solare e legale).
export function dataViaggiaTreno(d) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Rome',
    weekday: 'short',
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const v = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]))
  const locale = Date.UTC(+v.year, mese(v.month), +v.day, +v.hour, +v.minute, +v.second)
  const offsetMin = Math.round((locale - Math.floor(d.getTime() / 1000) * 1000) / 60000)
  const segno = offsetMin >= 0 ? '+' : '-'
  const hh = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, '0')
  const mm = String(Math.abs(offsetMin) % 60).padStart(2, '0')
  return `${v.weekday} ${v.month} ${v.day} ${v.year} ${v.hour}:${v.minute}:${v.second} GMT${segno}${hh}${mm}`
}
function mese(m) {
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(m)
}

// id LeFrecce 830002430 -> codice S02430 (ultime 5 cifre)
function codiceDaId(id) {
  const s = String(id)
  if (s.length < 5) return ''
  const ultime5 = s.slice(-5)
  return /^\d{5}$/.test(ultime5) ? 'S' + ultime5 : ''
}

const ACCENTI = { A: 'À', E: 'È', I: 'Ì', O: 'Ò', U: 'Ù', a: 'à', e: 'è', i: 'ì', o: 'ò', u: 'ù' }
function pulisciNome(s) {
  if (s == null) return s
  return String(s)
    .replace(/([AEIOUaeiou])`/g, (_, v) => ACCENTI[v])
    .replace(/`/g, "'")
    .trim()
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
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  }
}
