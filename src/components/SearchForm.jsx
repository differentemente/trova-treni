import { useEffect, useRef, useState } from 'react'
import { cercaStazione, stazioneVicina } from '../lib/api'

// Campo stazione con autocomplete (debounce 300ms sugli id LeFrecce)
function CampoStazione({ label, value, onSelect }) {
  const [testo, setTesto] = useState(value?.name || '')
  const [opzioni, setOpzioni] = useState([])
  const [aperto, setAperto] = useState(false)
  const timer = useRef(null)

  useEffect(() => {
    setTesto(value?.name || '')
  }, [value])

  function onChange(e) {
    const t = e.target.value
    setTesto(t)
    onSelect(null)
    clearTimeout(timer.current)
    if (t.trim().length < 2) {
      setOpzioni([])
      setAperto(false)
      return
    }
    timer.current = setTimeout(async () => {
      try {
        const stazioni = await cercaStazione(t.trim())
        stazioni.sort((x, y) => Number(y.multistation) - Number(x.multistation))
        setOpzioni(stazioni.slice(0, 8))
        setAperto(true)
      } catch {
        setOpzioni([])
      }
    }, 300)
  }

  function scegli(stazione) {
    onSelect(stazione)
    setTesto(stazione.name)
    setAperto(false)
  }

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-araldico-700 mb-1">{label}</label>
      <input
        type="text"
        value={testo}
        onChange={onChange}
        onFocus={() => opzioni.length > 0 && setAperto(true)}
        onBlur={() => setTimeout(() => setAperto(false), 150)}
        placeholder="Cerca stazione…"
        className="w-full rounded-lg border border-araldico-100 bg-white px-3 py-2.5
                   focus:outline-none focus:ring-2 focus:ring-araldico-500"
      />
      {aperto && opzioni.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded-lg border border-araldico-100 bg-white shadow-lg overflow-hidden">
          {opzioni.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onMouseDown={() => scegli(s)}
                className="w-full px-3 py-2 text-left hover:bg-araldico-50"
              >
                {s.name}
                {s.multistation && (
                  <span className="ml-2 text-xs text-araldico-500">tutte le stazioni</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function SearchForm({ onCerca, caricamento }) {
  const [da, setDa] = useState(null)
  const [a, setA] = useState(null)
  const [quando, setQuando] = useState(() => {
    const d = new Date()
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    return d.toISOString().slice(0, 16)
  })
  const [errore, setErrore] = useState('')
  const [gps, setGps] = useState('idle') // idle | cercando | ok | errore
  const [soloDiretti, setSoloDiretti] = useState(false)

  // All'avvio provo a precompilare "Da" con la stazione più vicina al dispositivo.
  // Il campo resta comunque modificabile.
  useEffect(() => {
    if (!('geolocation' in navigator)) return
    setGps('cercando')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords
          const s = await stazioneVicina(latitude, longitude)
          if (s?.id) {
            // imposto solo se l'utente non ha già scelto una partenza
            setDa((corrente) => corrente || { id: s.id, name: s.name })
            setGps('ok')
          } else {
            setGps('errore')
          }
        } catch {
          setGps('errore')
        }
      },
      () => setGps('errore'),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function scambia() {
    const tmp = da
    setDa(a)
    setA(tmp)
  }

  function invia() {
    if (!da || !a) {
      setErrore('Seleziona stazione di partenza e di arrivo dai suggerimenti.')
      return
    }
    setErrore('')
    // capisco se la data scelta è in un giorno futuro rispetto a oggi
    const oggi = new Date()
    const scelta = new Date(quando)
    const dataFutura =
      scelta.getFullYear() > oggi.getFullYear() ||
      (scelta.getFullYear() === oggi.getFullYear() &&
        (scelta.getMonth() > oggi.getMonth() ||
          (scelta.getMonth() === oggi.getMonth() && scelta.getDate() > oggi.getDate())))
    onCerca({ da: da.id, a: a.id, daNome: da.name, aNome: a.name, quando, diretti: soloDiretti, dataFutura })
  }

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm border border-araldico-100 space-y-3">
      <CampoStazione
        label={
          gps === 'cercando'
            ? 'Da · rilevo posizione…'
            : gps === 'ok'
            ? 'Da · stazione vicina'
            : 'Da'
        }
        value={da}
        onSelect={setDa}
      />

      <div className="relative flex justify-center">
        <div className="absolute inset-x-0 top-1/2 h-px bg-araldico-100" />
        <button
          type="button"
          onClick={scambia}
          aria-label="Inverti partenza e arrivo"
          className="relative z-10 flex h-11 w-11 items-center justify-center rounded-full
                     bg-araldico-700 text-crema shadow-md transition hover:bg-araldico-600
                     active:scale-95"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor"
               strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 4v13M7 4L4 7M7 4l3 3" />
            <path d="M17 20V7M17 20l3-3M17 20l-3-3" />
          </svg>
        </button>
      </div>

      <CampoStazione label="A" value={a} onSelect={setA} />

      {/* Toggle solo treni diretti, sotto la destinazione */}
      <button
        type="button"
        onClick={() => setSoloDiretti((v) => !v)}
        className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition ${
          soloDiretti
            ? 'border-araldico-500 bg-araldico-50 text-araldico-800'
            : 'border-araldico-100 bg-white text-araldico-700'
        }`}
      >
        <span className="font-medium">Solo treni diretti</span>
        <span
          className={`relative h-5 w-9 rounded-full transition ${
            soloDiretti ? 'bg-araldico-700' : 'bg-gray-300'
          }`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
              soloDiretti ? 'left-[1.125rem]' : 'left-0.5'
            }`}
          />
        </span>
      </button>

      <div>
        <label className="block text-sm font-medium text-araldico-700 mb-1">Quando</label>
        <input
          type="datetime-local"
          value={quando}
          onChange={(e) => setQuando(e.target.value)}
          className="w-full rounded-lg border border-araldico-100 bg-white px-3 py-2.5
                     focus:outline-none focus:ring-2 focus:ring-araldico-500"
        />
      </div>

      {errore && <p className="text-sm text-red-700">{errore}</p>}

      <button
        type="button"
        onClick={invia}
        disabled={caricamento}
        className="w-full rounded-lg bg-araldico-700 px-4 py-3 font-semibold text-crema
                   hover:bg-araldico-600 disabled:opacity-60"
      >
        {caricamento ? 'Ricerca in corso…' : 'Cerca soluzioni'}
      </button>
    </div>
  )
}
