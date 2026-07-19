// Gestione dei treni preferiti, persistiti in localStorage.
//
// Un preferito rappresenta un singolo treno (una tratta A→B in una certa data)
// che l'utente vuole tenere d'occhio. Sopravvive alla chiusura dell'app.
//
// Auto-pulizia: un preferito viene rimosso automaticamente quando il treno di
// quel giorno è ormai arrivato a destinazione (orario di arrivo + margine
// passato). Così la lista non si riempie di corse vecchie.

const CHIAVE = 'trovatreni_preferiti_v1'

// Margine dopo l'orario di arrivo teorico oltre il quale considero il treno
// "concluso" e rimuovo il preferito (in minuti). Tiene conto di ritardi residui.
const MARGINE_ARRIVO_MIN = 90

// Legge tutti i preferiti grezzi dal localStorage
function leggiRaw() {
  try {
    const s = localStorage.getItem(CHIAVE)
    if (!s) return []
    const arr = JSON.parse(s)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function scrivi(lista) {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(lista))
  } catch {
    // storage pieno o non disponibile: fallisco in silenzio
  }
}

// Costruisce un id univoco per un treno preferito: numero + data + tratta.
// Così lo stesso treno nello stesso giorno non viene salvato due volte, ma
// lo stesso numero in giorni diversi sì (sono corse diverse).
export function idPreferito(p) {
  return `${p.numero}|${p.giorno}|${p.da}|${p.a}`
}

// "giorno" in formato YYYY-MM-DD ricavato da un orario ISO o da adesso
function giornoDa(iso) {
  const d = iso ? new Date(iso) : new Date()
  if (isNaN(d)) return new Date().toISOString().slice(0, 10)
  // uso l'ora locale, non UTC, per non sbagliare a cavallo di mezzanotte
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const g = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${g}`
}

// Verifica se un preferito è "scaduto" (treno del giorno ormai arrivato).
function scaduto(p) {
  // se non ho l'orario di arrivo non posso decidere: lo tengo
  if (!p.orarioArrivo) return false

  // ricostruisco il datetime di arrivo combinando il giorno salvato con
  // l'orario di arrivo (che può essere ISO completo o solo "HH:MM")
  const arrivoMin = minutiOrario(p.orarioArrivo)
  if (arrivoMin == null) return false

  const [yy, mm, gg] = (p.giorno || '').split('-').map(Number)
  if (!yy || !mm || !gg) return false

  const arrivo = new Date(yy, mm - 1, gg, 0, 0, 0)
  arrivo.setMinutes(arrivo.getMinutes() + arrivoMin + MARGINE_ARRIVO_MIN)

  return Date.now() > arrivo.getTime()
}

function minutiOrario(v) {
  if (!v) return null
  const iso = String(v).match(/T(\d{2}):(\d{2})/)
  if (iso) return Number(iso[1]) * 60 + Number(iso[2])
  const hm = String(v).match(/(\d{1,2}):(\d{2})/)
  if (hm) return Number(hm[1]) * 60 + Number(hm[2])
  return null
}

// API pubblica -------------------------------------------------------------

// Restituisce i preferiti validi (non scaduti). Effettua la pulizia
// automatica: se trova preferiti scaduti li rimuove e riscrive la lista.
export function leggiPreferiti() {
  const tutti = leggiRaw()
  const validi = tutti.filter((p) => !scaduto(p))
  if (validi.length !== tutti.length) scrivi(validi) // pulizia
  return validi
}

// true se un treno è già tra i preferiti
export function isPreferito(p) {
  const id = idPreferito(normalizza(p))
  return leggiRaw().some((x) => idPreferito(x) === id)
}

// Aggiunge un preferito (se non già presente). Restituisce la lista aggiornata.
export function aggiungiPreferito(grezzo) {
  const p = normalizza(grezzo)
  const lista = leggiRaw().filter((x) => !scaduto(x))
  const id = idPreferito(p)
  if (!lista.some((x) => idPreferito(x) === id)) {
    lista.push(p)
    scrivi(lista)
  }
  return lista
}

// Rimuove un preferito per id. Restituisce la lista aggiornata.
export function rimuoviPreferito(grezzo) {
  const id = idPreferito(normalizza(grezzo))
  const lista = leggiRaw().filter((x) => idPreferito(x) !== id)
  scrivi(lista)
  return lista
}

// Alterna: se c'è lo toglie, se non c'è lo aggiunge. Restituisce { attivo, lista }
export function togglePreferito(grezzo) {
  if (isPreferito(grezzo)) {
    return { attivo: false, lista: rimuoviPreferito(grezzo) }
  }
  return { attivo: true, lista: aggiungiPreferito(grezzo) }
}

// Normalizza un oggetto treno nel formato preferito che salvo.
// Accetto sia il "treno" della soluzione sia campi extra.
function normalizza(g) {
  const giorno = g.giorno || giornoDa(g.partenza || g.orarioPartenza)
  return {
    numero: g.numero ?? '',
    categoria: g.categoria ?? '',
    da: g.da ?? '',
    a: g.a ?? '',
    partenza: g.partenza ?? g.orarioPartenza ?? '',
    orarioArrivo: g.orarioArrivo ?? g.arrivo ?? '',
    giorno,
    // salvo anche l'orario partenza "comodo" per l'ordinamento in vista
    orarioPartenza: g.orarioPartenza ?? g.partenza ?? '',
  }
}
