import { useState } from 'react'
import SearchForm from './components/SearchForm'
import ResultsList from './components/ResultsList'
import { cercaViaggio } from './lib/api'

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
      setCercato(true)
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

  return (
    <div className="mx-auto max-w-xl px-4 pb-12 pt-6">
      <header className="mb-5 flex flex-col items-center gap-2 text-center">
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

      <SearchForm onCerca={cerca} caricamento={caricamento} />

      {errore && <p className="mt-4 text-center text-sm text-red-700">{errore}</p>}

      <ResultsList
        soluzioni={soluzioni}
        cercato={cercato}
        onAltre={altre}
        onPrecedenti={precedenti}
        caricamentoAltre={caricamentoAltre}
        caricamentoPrec={caricamentoPrec}
      />
    </div>
  )
}
