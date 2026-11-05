// netlify/functions/controlla-sveglie.mjs
// Funzione pianificata: gira ogni minuto, controlla le sveglie attive e invia
// la notifica quando mancano i minuti scelti all'arrivo stimato del treno.
// Se non ci sono sveglie termina subito (costo trascurabile).

import { ARCHIVIO_SVEGLIE, archivio, chiaviVapid, gestisciSveglia } from './_sveglie.js'

export const config = { schedule: '* * * * *' }

export default async () => {
  const store = await archivio(ARCHIVIO_SVEGLIE)
  const { blobs } = await store.list()
  if (!blobs.length) return new Response('nessuna sveglia')

  const vapid = await chiaviVapid()
  const esiti = []
  for (const { key } of blobs) {
    try {
      esiti.push(`${key}: ${await gestisciSveglia(store, key, vapid)}`)
    } catch (e) {
      esiti.push(`${key}: errore ${e.message}`)
    }
  }
  console.log(esiti.join('\n'))
  return new Response('ok')
}
