// Sveglia "avvisami prima dell'arrivo" con notifiche push.
//
// Su iPhone le notifiche delle web app funzionano solo se l'app è stata
// aggiunta alla schermata Home (iOS 16.4 o successivo). La notifica suona e
// vibra secondo le impostazioni del telefono, anche a schermo bloccato.
// Il controllo dell'orario lo fa il server (funzione pianificata ogni minuto),
// quindi l'avviso arriva anche se l'app è chiusa.

import { idPreferito } from './preferiti'

const CHIAVE = 'trovatreni_sveglie_v1' // { [idPreferito]: idSveglia }
export const MINUTI_PRIMA = 5

function leggi() {
  try {
    return JSON.parse(localStorage.getItem(CHIAVE) || '{}') || {}
  } catch {
    return {}
  }
}
function scrivi(m) {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(m))
  } catch {
    // storage non disponibile
  }
}

function isIOS() {
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}
function isAppSullaHome() {
  return window.navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches
}

// { ok: true } oppure { ok: false, motivo: 'home' | 'negato' | 'non-supportato' }
export function puoUsareSveglia() {
  const supportato = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (!supportato) return { ok: false, motivo: isIOS() && !isAppSullaHome() ? 'home' : 'non-supportato' }
  if (isIOS() && !isAppSullaHome()) return { ok: false, motivo: 'home' }
  if (Notification.permission === 'denied') return { ok: false, motivo: 'negato' }
  return { ok: true }
}

export function svegliaAttiva(pref) {
  return leggi()[idPreferito(pref)] || null
}

function daBase64Url(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const b = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}

// Preferiti salvati con vecchie versioni: arrivo solo "HH:MM" -> data completa
function arrivoCompleto(pref) {
  const a = String(pref.orarioArrivo || '')
  if (!isNaN(Date.parse(a)) && /\d{4}-\d{2}-\d{2}T/.test(a)) return a
  const m = a.match(/^(\d{1,2}):(\d{2})/)
  const [yy, mm, gg] = String(pref.giorno || '').split('-').map(Number)
  if (!m || !yy) return a
  const d = new Date(yy, mm - 1, gg, Number(m[1]), Number(m[2]))
  const p = Date.parse(pref.partenza)
  if (!isNaN(p) && d.getTime() < p) d.setDate(d.getDate() + 1) // arrivo dopo mezzanotte
  return d.toISOString()
}

// Va chiamata direttamente dal tocco dell'utente (iOS chiede il permesso
// solo in risposta a un gesto).
export async function attivaSveglia(pref) {
  const permesso = await Notification.requestPermission()
  if (permesso !== 'granted') throw new Error('negato')

  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready

  const r = await fetch('/api/sveglia?chiave=1')
  if (!r.ok) throw new Error('server')
  const { chiave } = await r.json()

  let iscrizione = await reg.pushManager.getSubscription()
  if (!iscrizione) {
    iscrizione = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: daBase64Url(chiave),
    })
  }

  const res = await fetch('/api/sveglia', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      iscrizione: iscrizione.toJSON(),
      minutiPrima: MINUTI_PRIMA,
      treno: {
        numero: pref.numero,
        categoria: pref.categoria,
        da: pref.da,
        a: pref.a,
        partenza: pref.partenza,
        orarioArrivo: arrivoCompleto(pref),
        giorno: pref.giorno,
      },
    }),
  })
  if (!res.ok) throw new Error('server')
  const { id } = await res.json()
  const m = leggi()
  m[idPreferito(pref)] = id
  scrivi(m)
  return id
}

export async function disattivaSveglia(pref) {
  const m = leggi()
  const id = m[idPreferito(pref)]
  delete m[idPreferito(pref)]
  scrivi(m)
  if (!id) return
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const iscrizione = await reg?.pushManager.getSubscription()
    if (!iscrizione) return
    await fetch(`/api/sveglia?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: iscrizione.endpoint }),
    })
  } catch {
    // se non riesco a cancellarla sul server, scade comunque da sola
  }
}

// La sveglia è già scattata o il treno è arrivato: dimentico il riferimento
export function dimenticaSveglia(pref) {
  const m = leggi()
  if (m[idPreferito(pref)]) {
    delete m[idPreferito(pref)]
    scrivi(m)
  }
}
