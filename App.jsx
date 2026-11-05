import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import SearchForm from './components/SearchForm'
import ResultsList from './components/ResultsList'
import TabBar, { SCHEDE } from './components/TabBar'
import VistaPreferiti from './components/VistaPreferiti'
import VistaNumeroTreno from './components/VistaNumeroTreno'
import VistaTabellone from './components/VistaTabellone'
import VistaSuggerimenti from './components/VistaSuggerimenti'
import BottoneCaffe from './components/BottoneCaffe'
import { IconaCuore } from './components/Icone'
import { cercaViaggio, cercaItalo } from './lib/api'
import { leggiPreferiti } from './lib/preferiti'

// minuti dopo mezzanotte da un orario che può essere ISO o "HH:MM"
const CHIAVE_BANNER = 'trovatreni_banner_cuore_v1'
function bannerGiaVisto() {
  try {
    return localStorage.getItem(CHIAVE_BANNER) === '1'
  } catch {
    return true
  }
}
function segnaBannerVisto() {
  try {
    localStorage.setItem(CHIAVE_BANNER, '1')
  } catch {
    // storage non disponibile: il banner semplicemente non si ripresenta
  }
}

function minutiOrario(v) {
  if (!v) return 0
  const iso = String(v).match(/T(\d{2}):(\d{2})/)
  if (iso) return Number(iso[1]) * 60 + Number(iso[2])
  const hm = String(v).match(/(\d{1,2}):(\d{2})/)
  if (hm) return Number(hm[1]) * 60 + Number(hm[2])
  return 0
}

// arretra un orario ISO "yyyy-MM-ddTHH:mm" di N minuti
function arretra(quando, minuti) {
  const d = new Date(quando)
  if (isNaN(d)) return quando
  d.setMinutes(d.getMinutes() - minuti)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export default function App() {
  const [soluzioni, setSoluzioni] = useState([])
  const [cercato, setCercato] = useState(false)
  const [caricamento, setCaricamento] = useState(false)
  const [caricamentoAltre, setCaricamentoAltre] = useState(false)
  const [caricamentoPrec, setCaricamentoPrec] = useState(false)
  const [errore, setErrore] = useState('')
  const [ultimaRicerca, setUltimaRicerca] = useState(null)
  const [offset, setOffset] = useState(0)
  // orario della soluzione più "vecchia" mostrata, per i treni precedenti
  const [orarioPiuVecchio, setOrarioPiuVecchio] = useState(null)
  const [dataFutura, setDataFutura] = useState(false)
  // scheda corrente: 'numero' | 'tabellone' | 'ricerca' | 'mio' | 'suggerimenti'
  const [vista, setVista] = useState('ricerca')
  const [numPreferiti, setNumPreferiti] = useState(0)
  // banner "tocca il cuore": solo alla prima ricerca in assoluto
  const [banner, setBanner] = useState(false)

  // conteggio preferiti all'avvio (fa anche la pulizia dei treni arrivati)
  useEffect(() => {
    setNumPreferiti(leggiPreferiti().length)
  }, [])

  async function cerca(parametri) {
    setCaricamento(true)
    setErrore('')
    setCercato(false)
    try {
      const risultati = await cercaViaggio({ ...parametri, offset: 0 })
      setSoluzioni(risultati)
      setUltimaRicerca(parametri)
      setOffset(0)
      setOrarioPiuVecchio(parametri.quando)
      setDataFutura(!!parametri.dataFutura)
      setCercato(true)
      if (risultati.length > 0 && !bannerGiaVisto()) {
        segnaBannerVisto()
        setBanner(true)
      }

      // Italo TEMPORANEAMENTE DISATTIVATO: l'API biglietti richiede un token
      // anti-bot non ottenibile da server, e la chiamata consumava invocazioni
      // a vuoto. Per riattivare quando avremo una soluzione, metti ITALO_ON = true.
      const ITALO_ON = false
      if (ITALO_ON && !parametri.dataFutura && parametri.daNome && parametri.aNome) {
        cercaItalo({ da: parametri.daNome, a: parametri.aNome, quando: parametri.quando })
          .then((italo) => {
            if (!italo || italo.length === 0) return
            setSoluzioni((prev) => {
              const merged = [...prev, ...italo]
              merged.sort((x, y) => minutiOrario(x.orarioPartenza) - minutiOrario(y.orarioPartenza))
              return merged
            })
          })
          .catch(() => {})
      }
    } catch (e) {
      setErrore('Errore durante la ricerca. Riprova tra qualche secondo.')
    } finally {
      setCaricamento(false)
    }
  }

  // Soluzioni successive: avanza l'offset LeFrecce
  async function altre() {
    if (!ultimaRicerca) return
    setCaricamentoAltre(true)
    try {
      const nuovoOffset = offset + 10
      const risultati = await cercaViaggio({ ...ultimaRicerca, offset: nuovoOffset })
      setSoluzioni((prev) => [...prev, ...risultati])
      setOffset(nuovoOffset)
    } catch {
      setErrore('Errore nel caricare altre soluzioni.')
    } finally {
      setCaricamentoAltre(false)
    }
  }

  // Soluzioni precedenti (storicizzazione stesso giorno): cerco a partire da
  // un orario arretrato e antepongo i treni che partono prima del primo mostrato.
  async function precedenti() {
    if (!ultimaRicerca || !orarioPiuVecchio) return
    setCaricamentoPrec(true)
    try {
      const quandoPrec = arretra(orarioPiuVecchio, 120) // 2 ore indietro
      const risultati = await cercaViaggio({ ...ultimaRicerca, quando: quandoPrec, offset: 0 })

      // tengo solo quelle che partono PRIMA della più vecchia già in lista
      const limite = new Date(orarioPiuVecchio).getTime()
      const nuove = risultati.filter((s) => {
        const t = new Date(s.orarioPartenza).getTime()
        return !isNaN(t) && t < limite
      })

      if (nuove.length === 0) {
        setErrore('Nessuna corsa precedente trovata per oggi.')
      } else {
        setSoluzioni((prev) => [...nuove, ...prev])
        setOrarioPiuVecchio(quandoPrec)
      }
    } catch {
      setErrore('Errore nel caricare le corse precedenti.')
    } finally {
      setCaricamentoPrec(false)
    }
  }

  // --- navigazione tra le schede -------------------------------------------
  // Le schermate restano montate dopo la prima apertura (come le tab di iOS):
  // cambiando scheda non si perdono i campi compilati né la posizione di
  // scorrimento. La schermata che entra arriva da destra o da sinistra a
  // seconda della posizione del pulsante nella barra.
  const [aperte, setAperte] = useState(() => new Set(['ricerca']))
  const [uscente, setUscente] = useState(null) // { id, dir, top }
  const [direzione, setDirezione] = useState('avanti')
  const scroll = useRef({})
  const timerUscita = useRef(null)
  const [barraVisibile, setBarraVisibile] = useBarraAScomparsa()
  // treno aperto dal tabellone: lo passo alla ricerca per numero
  const [richiestaTreno, setRichiestaTreno] = useState(null)

  function vai(nuova) {
    setBarraVisibile(true)
    if (nuova === vista) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    const ordine = SCHEDE.map((s) => s.id)
    const dir = ordine.indexOf(nuova) > ordine.indexOf(vista) ? 'avanti' : 'indietro'
    const yVecchio = window.scrollY
    scroll.current[vista] = yVecchio
    const yNuovo = scroll.current[nuova] || 0
    setAperte((s) => new Set(s).add(nuova))
    setDirezione(dir)
    setUscente({ id: vista, dir, top: yNuovo - yVecchio })
    setVista(nuova)
    if (nuova === 'mio') setNumPreferiti(leggiPreferiti().length) // aggiorna e pulisce
    clearTimeout(timerUscita.current)
    timerUscita.current = setTimeout(() => setUscente(null), senzaAnimazioni() ? 0 : 450)
  }

  // dopo il cambio di scheda ripristino lo scroll della schermata che entra
  useLayoutEffect(() => {
    window.scrollTo(0, scroll.current[vista] || 0)
  }, [vista])

  function apriTrenoDaTabellone(t) {
    setRichiestaTreno({ ...t, quando: Date.now() })
    vai('numero')
  }

  function renderVista(id) {
    const attiva = id === vista
    if (id === 'ricerca')
      return (
        <>
          <SearchForm onCerca={cerca} caricamento={caricamento} cercato={cercato} />
          {errore && <p className="mt-4 text-center text-sm text-red-700">{errore}</p>}
          {banner && cercato && soluzioni.length > 0 && (
            <BannerCuore onChiudi={() => setBanner(false)} />
          )}
          <ResultsList
            soluzioni={soluzioni}
            cercato={cercato}
            dataFutura={dataFutura}
            onAltre={altre}
            onPrecedenti={precedenti}
            caricamentoAltre={caricamentoAltre}
            caricamentoPrec={caricamentoPrec}
            onCambioPreferiti={(n) => {
              setNumPreferiti(n)
              setBanner(false)
            }}
          />
        </>
      )
    if (id === 'mio') return <VistaPreferiti onCambio={setNumPreferiti} attiva={attiva} />
    if (id === 'numero') return <VistaNumeroTreno richiesta={richiestaTreno} attiva={attiva} />
    if (id === 'tabellone') return <VistaTabellone attiva={attiva} onApriTreno={apriTrenoDaTabellone} />
    if (id === 'suggerimenti') return <VistaSuggerimenti />
    return null
  }

  return (
    // padding-top con safe-area per non finire sotto la notch/Dynamic Island;
    // il padding in basso lascia spazio alla barra delle schede
    <div
      className="mx-auto max-w-xl px-4"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.5rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 6rem)',
      }}
    >
      <header className="relative mb-5 flex flex-col items-center gap-2 text-center">
        {/* pulsante donazione in alto a sinistra, non sposta il logo centrato */}
        <div className="absolute left-0 top-0">
          <BottoneCaffe />
        </div>
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-araldico-700 shadow-sm">
          <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" stroke="#faf7f0" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="3" width="14" height="13" rx="3" />
            <path d="M5 10h14" />
            <circle cx="9" cy="7" r="0.8" fill="#faf7f0" stroke="none" />
            <circle cx="15" cy="7" r="0.8" fill="#faf7f0" stroke="none" />
            <path d="M8 16l-2 4M16 16l2 4" />
            <circle cx="8.5" cy="13" r="0.6" fill="#faf7f0" stroke="none" />
            <circle cx="15.5" cy="13" r="0.6" fill="#faf7f0" stroke="none" />
          </svg>
        </div>
        <div>
          <h1 className="font-display text-3xl font-bold text-araldico-800">Trova Treni</h1>
          <p className="text-sm text-araldico-700">Un&rsquo;app di Nicola Perozeni</p>
        </div>
      </header>

      {/* schermate: una sola visibile, le altre restano montate ma nascoste */}
      <div className="contenitore-viste">
        {SCHEDE.map(({ id }) => {
          if (!aperte.has(id)) return null
          const corrente = id === vista
          const esce = uscente?.id === id
          let classe = 'vista'
          if (corrente && uscente) classe += ` vista-entra-${direzione}`
          else if (esce) classe += ` vista-esce-${uscente.dir}`
          else if (!corrente) classe += ' vista-nascosta'
          return (
            <section
              key={id}
              className={classe}
              style={esce ? { top: uscente.top } : undefined}
              aria-hidden={!corrente}
              // tolgo la schermata uscente appena finisce la sua animazione
              onAnimationEnd={esce ? (e) => e.target === e.currentTarget && setUscente(null) : undefined}
            >
              {renderVista(id)}
            </section>
          )
        })}
      </div>

      <TabBar vista={vista} onCambia={vai} numPreferiti={numPreferiti} visibile={barraVisibile} />
    </div>
  )
}

function senzaAnimazioni() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

// La barra scivola via quando scorri verso il basso e torna quando scorri
// verso l'alto (o sei in cima alla pagina).
function useBarraAScomparsa() {
  const [visibile, setVisibile] = useState(true)
  useEffect(() => {
    let ultimo = window.scrollY
    let inAttesa = false
    function suScroll() {
      if (inAttesa) return
      inAttesa = true
      requestAnimationFrame(() => {
        const y = window.scrollY
        const delta = y - ultimo
        if (y < 40) setVisibile(true)
        else if (delta > 6) setVisibile(false)
        else if (delta < -6) setVisibile(true)
        ultimo = y
        inAttesa = false
      })
    }
    window.addEventListener('scroll', suScroll, { passive: true })
    return () => window.removeEventListener('scroll', suScroll)
  }, [])
  return [visibile, setVisibile]
}

// Banner mostrato una sola volta, alla prima ricerca con risultati
function BannerCuore({ onChiudi }) {
  return (
    <div className="banner-cuore mt-6 flex items-start gap-3 rounded-2xl bg-araldico-700 p-4 text-white shadow-sm">
      <IconaCuore attiva className="mt-0.5 h-6 w-6 shrink-0 text-white" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug">Salva il treno che prendi</p>
        <p className="mt-0.5 text-sm leading-snug text-white/80">
          Tocca il cuore accanto all&rsquo;orario: lo ritrovi in &laquo;Il mio treno&raquo;, con
          binario, ritardo e fermate sempre aggiornati.
        </p>
      </div>
      <button
        type="button"
        onClick={onChiudi}
        className="shrink-0 rounded-full bg-white/15 px-3 py-1 text-sm font-semibold hover:bg-white/25"
      >
        Ok
      </button>
    </div>
  )
}
