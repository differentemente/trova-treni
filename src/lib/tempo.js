// Utility di data/ora condivise.

// true se la partenza cade in un giorno successivo a oggi (ora locale) e
// mancano più di 3 ore: è una corsa di domani, non ancora in circolazione,
// quindi si mostrano solo gli orari programmati.
// Le corse a cavallo della mezzanotte (partenza domani entro 3 ore) e quelle
// di ieri ancora in viaggio dopo mezzanotte restano in tempo reale.
export function corsaFutura(iso) {
  if (!iso) return false
  const p = new Date(iso)
  if (isNaN(p)) return false
  const oggi = new Date()
  const giornoP = new Date(p.getFullYear(), p.getMonth(), p.getDate()).getTime()
  const giornoOggi = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate()).getTime()
  const mancanoOre = (p.getTime() - oggi.getTime()) / 3600000
  return giornoP > giornoOggi && mancanoOre > 3
}
