// netlify/functions/sveglia.mjs
// Gestione delle sveglie "avvisami prima dell'arrivo".
//
// GET    /api/sveglia?chiave=1   -> { chiave } chiave pubblica VAPID per il browser
// POST   /api/sveglia            -> crea la sveglia { iscrizione, treno, minutiPrima }
//                                    e invia subito una notifica di conferma
// DELETE /api/sveglia?id=...     -> annulla (body { endpoint } per provare che è tua)

import { inviaNotifica, endpointValido } from './_webpush.js'
import { ARCHIVIO_SVEGLIE, SOGGETTO_VAPID, archivio, chiaviVapid, idDispositivo } from './_sveglie.js'

const MAX_PER_DISPOSITIVO = 6

function risposta(stato, corpo) {
  return new Response(JSON.stringify(corpo), {
    status: stato,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

const testo = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export default async (req) => {
  const url = new URL(req.url)

  if (req.method === 'GET') {
    if (url.searchParams.get('chiave')) {
      const vapid = await chiaviVapid()
      return risposta(200, { chiave: vapid.pubblica })
    }
    return risposta(404, { errore: 'non trovato' })
  }

  if (req.method === 'POST') {
    let dati
    try {
      dati = await req.json()
    } catch {
      return risposta(400, { errore: 'richiesta non valida' })
    }
    const isc = dati?.iscrizione
    const t = dati?.treno || {}
    if (!isc?.endpoint || !endpointValido(isc.endpoint) || !isc.keys?.p256dh || !isc.keys?.auth) {
      return risposta(400, { errore: 'iscrizione alle notifiche non valida' })
    }
    const numero = String(t.numero || '').replace(/\D/g, '').slice(0, 6)
    if (!numero || isNaN(Date.parse(t.orarioArrivo))) return risposta(400, { errore: 'treno non valido' })

    const treno = {
      numero,
      categoria: testo(t.categoria, 30),
      da: testo(t.da, 80),
      a: testo(t.a, 80),
      partenza: testo(t.partenza, 40),
      orarioArrivo: testo(t.orarioArrivo, 40),
      giorno: testo(t.giorno, 10),
    }
    const minutiPrima = Math.min(30, Math.max(1, Number(dati.minutiPrima) || 5))

    const store = await archivio(ARCHIVIO_SVEGLIE)
    const disp = idDispositivo(isc.endpoint)
    const { blobs } = await store.list({ prefix: `${disp}/` })
    const id = `${disp}/${numero}-${treno.giorno || 'oggi'}`
    if (blobs.length >= MAX_PER_DISPOSITIVO && !blobs.some((b) => b.key === id)) {
      return risposta(429, { errore: 'troppe sveglie attive su questo dispositivo' })
    }

    const iscrizione = { endpoint: isc.endpoint, keys: { p256dh: isc.keys.p256dh, auth: isc.keys.auth } }
    await store.setJSON(id, { id, iscrizione, treno, minutiPrima, creata: Date.now() })

    // notifica di conferma: verifica subito che le notifiche arrivino
    const vapid = await chiaviVapid()
    const esito = await inviaNotifica(
      iscrizione,
      {
        titolo: 'Sveglia attivata',
        testo: `Ti avviso ${minutiPrima} minuti prima dell'arrivo a ${treno.a || 'destinazione'}.`,
        tag: `sveglia-${numero}`,
        url: '/',
      },
      vapid,
      SOGGETTO_VAPID
    ).catch(() => ({ stato: 0 }))
    if (esito.scaduta) {
      await store.delete(id)
      return risposta(410, { errore: 'iscrizione alle notifiche scaduta' })
    }
    return risposta(200, { id })
  }

  if (req.method === 'DELETE') {
    const id = url.searchParams.get('id') || ''
    let endpoint = ''
    try {
      endpoint = (await req.json())?.endpoint || ''
    } catch {
      // nessun corpo
    }
    // si può cancellare solo una sveglia del proprio dispositivo
    if (!id || !endpoint || !id.startsWith(`${idDispositivo(endpoint)}/`)) {
      return risposta(403, { errore: 'non autorizzato' })
    }
    const store = await archivio(ARCHIVIO_SVEGLIE)
    await store.delete(id)
    return risposta(200, { ok: true })
  }

  return risposta(405, { errore: 'metodo non consentito' })
}
