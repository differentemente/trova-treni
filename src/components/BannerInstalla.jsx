import { useEffect, useState } from 'react'
import { LogoApp } from './Icone'

// Alla PRIMA apertura da browser (Safari, Chrome…) spiega come installare
// Trova Treni sulla schermata Home, con i passaggi per iPhone e per Android.
// Compare una sola volta: poi non si ripresenta più, anche se lo chiudi
// senza installare. Non compare se l'app è già aperta dalla schermata Home.

const CHIAVE = 'trovatreni_banner_installa_v1'

// Android/Chrome offre un'installazione con un tocco: catturo l'evento appena
// il modulo viene caricato, prima che React sia pronto.
let richiestaInstallazione = null
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    richiestaInstallazione = e
  })
}

function giaVisto() {
  try {
    return localStorage.getItem(CHIAVE) === '1'
  } catch {
    return true // senza storage non posso ricordarlo: meglio non mostrarlo
  }
}
function segnaVisto() {
  try {
    localStorage.setItem(CHIAVE, '1')
  } catch {
    // ignoro
  }
}

function isApp() {
  return window.navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches
}
function piattaforma() {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return null // computer: niente banner
}

// icone dei pulsanti da toccare, come appaiono sul telefono (in riga col testo)
const STILE_ICONA = { display: 'inline-block', width: 18, height: 18, verticalAlign: '-3px', margin: '0 1px' }
function IconaCondividi() {
  return (
    <svg viewBox="0 0 24 24" style={STILE_ICONA} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M7 10H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1" />
    </svg>
  )
}
function IconaAggiungi() {
  return (
    <svg viewBox="0 0 24 24" style={STILE_ICONA} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8.5v7M8.5 12h7" />
    </svg>
  )
}
function IconaMenu() {
  return (
    <svg viewBox="0 0 24 24" style={STILE_ICONA} fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  )
}

function Passo({ n, children }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-araldico-700 text-xs font-bold text-white">
        {n}
      </span>
      <span className="pt-0.5 text-[15px] leading-snug text-araldico-900">{children}</span>
    </li>
  )
}

function PassiIPhone() {
  return (
    <ol className="space-y-3">
      <Passo n={1}>
        In Safari tocca <b>Condividi</b> <IconaCondividi /> nella barra in basso. Se non lo vedi, tocca prima{' '}
        <b>•••</b> accanto all&rsquo;indirizzo.
      </Passo>
      <Passo n={2}>
        Scorri e tocca <IconaAggiungi /> <b>Aggiungi alla schermata Home</b>.
      </Passo>
      <Passo n={3}>
        Tocca <b>Aggiungi</b> in alto a destra. Trova Treni comparirà tra le tue app.
      </Passo>
    </ol>
  )
}

function PassiAndroid({ installa }) {
  return (
    <div className="space-y-3">
      {installa && (
        <button
          type="button"
          onClick={installa}
          className="w-full rounded-xl bg-araldico-700 px-4 py-3 font-semibold text-white hover:bg-araldico-600"
        >
          Installa ora
        </button>
      )}
      <ol className="space-y-3">
        <Passo n={1}>
          In Chrome tocca il menu <IconaMenu /> in alto a destra.
        </Passo>
        <Passo n={2}>
          Tocca <b>Aggiungi a schermata Home</b> oppure <b>Installa app</b>.
        </Passo>
        <Passo n={3}>
          Conferma con <b>Installa</b>. Trova Treni comparirà tra le tue app.
        </Passo>
      </ol>
    </div>
  )
}

export default function BannerInstalla() {
  const [aperto, setAperto] = useState(false)
  const [scheda, setScheda] = useState('ios')
  const [, aggiorna] = useState(0)

  useEffect(() => {
    if (giaVisto() || isApp()) return
    const p = piattaforma()
    if (!p) return
    setScheda(p)
    // lo mostro poco dopo l'apertura, e lo segno subito come visto:
    // comparirà questa volta sola
    const t = setTimeout(() => {
      segnaVisto()
      setAperto(true)
    }, 900)
    // se Chrome rende disponibile l'installazione dopo, mostro il pulsante
    const suPrompt = () => aggiorna((n) => n + 1)
    window.addEventListener('beforeinstallprompt', suPrompt)
    return () => {
      clearTimeout(t)
      window.removeEventListener('beforeinstallprompt', suPrompt)
    }
  }, [])

  if (!aperto) return null

  async function installa() {
    const r = richiestaInstallazione
    if (!r) return
    richiestaInstallazione = null
    r.prompt()
    try {
      await r.userChoice
    } finally {
      setAperto(false)
    }
  }

  return (
    <div className="installa-sfondo" onClick={() => setAperto(false)}>
      <div
        className="installa-foglio"
        role="dialog"
        aria-modal="true"
        aria-labelledby="installa-titolo"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-araldico-100" />
        <div className="flex items-center gap-3">
          <LogoApp className="h-12 w-12 shrink-0 rounded-[12px]" />
          <div className="min-w-0 flex-1">
            <h2 id="installa-titolo" className="text-lg font-bold leading-tight text-araldico-900">
              Installa Trova Treni
            </h2>
            <p className="text-sm leading-snug text-araldico-600">
              Si apre a tutto schermo come un&rsquo;app e puoi usare la sveglia prima dell&rsquo;arrivo.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAperto(false)}
            aria-label="Chiudi"
            className="flex h-8 w-8 shrink-0 items-center justify-center self-start rounded-full bg-araldico-50 text-araldico-700"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg bg-araldico-50 p-1">
          {[
            ['ios', 'iPhone'],
            ['android', 'Android'],
          ].map(([id, nome]) => (
            <button
              key={id}
              type="button"
              onClick={() => setScheda(id)}
              aria-pressed={scheda === id}
              className={`rounded-md py-1.5 text-sm font-medium transition ${
                scheda === id ? 'bg-white text-araldico-800 shadow-sm' : 'text-araldico-600'
              }`}
            >
              {nome}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {scheda === 'ios' ? <PassiIPhone /> : <PassiAndroid installa={richiestaInstallazione ? installa : null} />}
        </div>

        <button
          type="button"
          onClick={() => setAperto(false)}
          className="mt-5 w-full rounded-xl border border-araldico-100 px-4 py-3 font-semibold text-araldico-700 hover:bg-araldico-50"
        >
          Ho capito
        </button>
      </div>
    </div>
  )
}
