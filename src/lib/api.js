// Client API: parla con le Netlify Functions, che a loro volta chiamano
// l'API LeFrecce (ricerca) e ViaggiaTreno (stato treno in tempo reale).

export async function cercaStazione(testo) {
  const res = await fetch(`/api/cerca-stazione?q=${encodeURIComponent(testo)}`)
  if (!res.ok) throw new Error('Errore ricerca stazione')
  const data = await res.json()
  return data.stations // [{ id, name, multistation }]
}

export async function cercaViaggio({ da, a, quando, offset = 0, diretti = false }) {
  const params = new URLSearchParams({ da, a, quando, offset: String(offset) })
  if (diretti) params.set('diretti', '1')
  const res = await fetch(`/api/cerca-viaggio?${params}`)
  if (!res.ok) throw new Error('Errore ricerca viaggio')
  const data = await res.json()
  return data.soluzioni
}

// Stazione più vicina alla posizione del dispositivo
export async function stazioneVicina(lat, lng) {
  const res = await fetch(`/api/stazione-vicina?lat=${lat}&lng=${lng}`)
  if (!res.ok) throw new Error('Errore stazione vicina')
  return res.json() // { id, name, distanzaKm }
}
// Stato treno in tempo reale. Passo anche destinazione e orario di partenza
// per disambiguare i numeri treno duplicati in Italia.
export async function statoTreno({ numero, origine, destinazione, partenza, futura }) {
  const params = new URLSearchParams({ numero: String(numero) })
  if (origine) params.set('origine', origine)
  if (destinazione) params.set('destinazione', destinazione)
  if (partenza) params.set('partenza', partenza)
  if (futura) params.set('futura', '1')
  const res = await fetch(`/api/stato-treno?${params}`)
  if (!res.ok) throw new Error('Errore stato treno')
  return res.json()
}
