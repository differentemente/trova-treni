// Logica condivisa delle sveglie "avvisami prima dell'arrivo".
// Le sveglie e le chiavi VAPID stanno in Netlify Blobs (archivio incluso
// gratuitamente in ogni sito Netlify, nessuna configurazione richiesta).

import crypto from 'node:crypto'
import { generaChiaviVapid, inviaNotifica } from './_webpush.js'
import { handler as statoTreno } from './stato-treno.js'
import { getStore } from '@netlify/blobs'

export const ARCHIVIO_SVEGLIE = 'trova-treni-sveglie'
const ARCHIVIO_CONFIG = 'trova-treni-config'
// identificativo del server per i servizi push (Apple lo richiede)
export const SOGGETTO_VAPID = process.env.VAPID_SUBJECT || 'https://trova-treni.it'

export async function archivio(nome, opzioni = {}) {
  return getStore({ name: nome, ...opzioni })
}

// Chiavi VAPID: generate al primo utilizzo e poi sempre le stesse
export async function chiaviVapid() {
  const conf = await archivio(ARCHIVIO_CONFIG, { consistency: 'strong' })
  const esistenti = await conf.get('vapid', { type: 'json' })
  if (esistenti?.pubblica && esistenti?.jwk) return esistenti
  const nuove = generaChiaviVapid()
  await conf.setJSON('vapid', nuove)
  // rileggo: se due richieste le hanno create insieme, vince quella salvata
  return (await conf.get('vapid', { type: 'json' })) || nuove
}

// prefisso delle sveglie di un dispositivo (hash dell'endpoint push)
export function idDispositivo(endpoint) {
  return crypto.createHash('sha256').update(String(endpoint)).digest('hex').slice(0, 20)
}

function ora(ts) {
  return new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' })
}

// Stima dell'arrivo alla destinazione dell'utente, in tempo reale quando
// ViaggiaTreno traccia il treno, altrimenti dall'orario programmato.
export async function stimaArrivo(s) {
  const programmato = Date.parse(s.treno.orarioArrivo)
  try {
    const r = await statoTreno({
      queryStringParameters: {
        numero: String(s.treno.numero),
        origine: s.treno.da,
        destinazione: s.treno.a,
        partenza: s.treno.partenza,
      },
    })
    const st = JSON.parse(r.body)
    const fN = st?.disponibile && st.fermate?.length ? st.fermate[st.fermate.length - 1] : null
    if (fN) {
      if (fN.effettivoArrivo != null) return { arrivato: true, ts: Number(fN.effettivoArrivo), nome: fN.nome }
      const ts = Number(fN.proiezioneArrivo ?? fN.teoricoArrivo) || programmato
      return { arrivato: false, ts, nome: fN.nome, tempoReale: true }
    }
  } catch {
    // uso l'orario programmato
  }
  return { arrivato: false, ts: programmato, nome: s.treno.a, tempoReale: false }
}

export function testoNotifica(s, stima, adesso) {
  const dest = s.treno.a || stima.nome
  if (stima.arrivato) {
    return {
      titolo: `Sei arrivato a ${dest}`,
      testo: `Il ${s.treno.categoria || 'treno'} ${s.treno.numero} è arrivato alle ${ora(stima.ts)}.`,
    }
  }
  const min = Math.max(1, Math.round((stima.ts - adesso) / 60000))
  return {
    titolo: `Tra ${min} min arrivi a ${dest}`,
    testo: `Arrivo previsto alle ${ora(stima.ts)}. Preparati a scendere!`,
  }
}

// Controlla una sveglia: invia la notifica quando mancano `minutiPrima`
// minuti all'arrivo stimato, poi la elimina. Restituisce cosa è successo.
export async function gestisciSveglia(store, chiave, vapid, adesso = Date.now()) {
  const s = await store.get(chiave, { type: 'json' })
  if (!s?.treno || !s?.iscrizione) {
    await store.delete(chiave)
    return 'non valida'
  }
  const programmato = Date.parse(s.treno.orarioArrivo)
  // pulizia di sicurezza: sveglie vecchie o treni arrivati da ore
  if (adesso - (s.creata || 0) > 30 * 3600e3 || (!isNaN(programmato) && adesso > programmato + 4 * 3600e3)) {
    await store.delete(chiave)
    return 'scaduta'
  }
  // finché l'arrivo programmato è lontano non interrogo ViaggiaTreno: un
  // treno può essere in ritardo, ma non arriva 20 minuti prima dell'orario
  if (!isNaN(programmato) && programmato - adesso > (s.minutiPrima + 20) * 60000) return 'in attesa'

  const stima = await stimaArrivo(s)
  if (!stima.ts || isNaN(stima.ts)) return 'in attesa'
  if (!stima.arrivato && adesso < stima.ts - s.minutiPrima * 60000) return 'in attesa'

  const { titolo, testo } = testoNotifica(s, stima, adesso)
  const esito = await inviaNotifica(
    s.iscrizione,
    { titolo, testo, tag: `sveglia-${s.treno.numero}`, url: '/' },
    vapid,
    SOGGETTO_VAPID
  )
  await store.delete(chiave)
  return esito.stato >= 200 && esito.stato < 300 ? 'inviata' : `errore ${esito.stato}`
}
