// Cronologia delle ultime ricerche (coppie Da → A), persistita in localStorage.
// Tiene al massimo MAX voci, le più recenti in cima, senza duplicati.

const CHIAVE = 'trovatreni_cronologia_v1'
const MAX = 3

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
    // storage non disponibile: fallisco in silenzio
  }
}

// chiave di identità di una ricerca (per evitare duplicati): id da + id a
function idRicerca(r) {
  return `${r.da?.id || r.da?.name}|${r.a?.id || r.a?.name}`
}

export function leggiCronologia() {
  return leggiRaw()
}

// Aggiunge una ricerca in cima. Se già presente la sposta in cima (dedup).
// Ogni voce salva { da: {id, name}, a: {id, name} }.
export function aggiungiRicerca(da, a) {
  if (!da || !a || !da.name || !a.name) return leggiRaw()
  const nuova = {
    da: { id: da.id, name: da.name },
    a: { id: a.id, name: a.name },
  }
  const id = idRicerca(nuova)
  const senzaDup = leggiRaw().filter((r) => idRicerca(r) !== id)
  const lista = [nuova, ...senzaDup].slice(0, MAX)
  scrivi(lista)
  return lista
}

export function svuotaCronologia() {
  scrivi([])
  return []
}
