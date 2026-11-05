import { useEffect, useRef, useState } from 'react'
import { CampoStazione } from './SearchForm'
import { partenzeStazione, stazioneVicina } from '../lib/api'

// Tabellone partenze della stazione, nello stile dei monitor a LED di
// stazione: righe alternate verde/bianco, carattere a punti, orologio.
// All'apertura propone la stazione più vicina (GPS); toccando il campo se ne
// sceglie un'altra. Toccando un treno se ne apre il percorso completo.

function hhmm(ts) {
  if (!ts) return '--:--'
  return new Date(Number(ts)).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

function useOrologio() {
  const [t, setT] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setT(Date.now()), 15000)
    return () => clearInterval(id)
  }, [])
  return t
}

function RigaTreno({ treno, pari, onApri }) {
  const ritardo = treno.ritardo > 0 ? treno.ritardo : 0
  return (
    <button
      type="button"
      onClick={() => onApri(treno)}
      className={`tabellone-riga tabellone-griglia ${pari ? 'tabellone-riga-verde' : 'tabellone-riga-bianca'} ${
        treno.cancellato ? 'tabellone-cancellato' : ''
      }`}
      aria-label={`${treno.categoria} ${treno.numero} per ${treno.destinazione}, ore ${hhmm(treno.orario)}${
        ritardo ? `, ritardo ${ritardo} minuti` : ''
      }${treno.binario ? `, binario ${treno.binario}` : ''}`}
    >
      <span>
        <span className="tabellone-ora block">{hhmm(treno.orario)}</span>
        {treno.cancellato ? (
          <span className="tabellone-ritardo tabellone-lampeggia block">CANC.</span>
        ) : (
          ritardo > 0 && <span className="tabellone-ritardo block">+{ritardo}&prime;</span>
        )}
      </span>
      <span className="min-w-0">
        <span className="tabellone-sigla block">{treno.categoria || 'TRENO'}</span>
        <span className="tabellone-numero block">{treno.numero}</span>
      </span>
      <span className="tabellone-destinazione">{treno.destinazione}</span>
      <span className={`tabellone-binario ${treno.binario && !treno.binarioConfermato ? 'opacity-70' : ''}`}>
        {treno.binario || '–'}
      </span>
    </button>
  )
}

export default function VistaTabellone({ attiva = true, onApriTreno }) {
  const [stazione, setStazione] = useState(null) // { id, name }
  const [gps, setGps] = useState('idle') // idle | cercando | ok | errore
  const [dati, setDati] = useState(null)
  const [caricamento, setCaricamento] = useState(false)
  const [errore, setErrore] = useState('')
  const sceltaUtente = useRef(false)
  const adesso = useOrologio()

  // stazione più vicina al primo utilizzo (se l'utente non ne ha già scelta una)
  useEffect(() => {
    if (!attiva || gps !== 'idle' || !('geolocation' in navigator)) return
    setGps('cercando')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const s = await stazioneVicina(pos.coords.latitude, pos.coords.longitude)
          if (s?.id && !sceltaUtente.current) setStazione({ id: s.id, name: s.name })
          setGps(s?.id ? 'ok' : 'errore')
        } catch {
          setGps('errore')
        }
      },
      () => setGps('errore'),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    )
  }, [attiva, gps])

  // carico il tabellone e lo aggiorno ogni minuto, solo quando è visibile
  useEffect(() => {
    if (!stazione?.id || !attiva) return
    let vivo = true
    async function carica(primo) {
      if (primo) setCaricamento(true)
      try {
        const r = await partenzeStazione({ id: stazione.id })
        if (!vivo) return
        setDati(r)
        setErrore(r.errore ? 'ViaggiaTreno al momento non risponde. Riprovo tra poco.' : '')
      } catch {
        if (vivo && primo) setErrore('Non riesco a caricare il tabellone. Riprova tra qualche secondo.')
      } finally {
        if (vivo && primo) setCaricamento(false)
      }
    }
    carica(true)
    const t = setInterval(() => carica(false), 60000)
    return () => {
      vivo = false
      clearInterval(t)
    }
  }, [stazione?.id, attiva])

  function scegli(s) {
    sceltaUtente.current = true
    setDati(null)
    setStazione(s)
  }

  const treni = dati?.treni || []

  return (
    <div className="mt-2 space-y-3">
      <h2 className="px-1 text-2xl font-bold text-araldico-800">Tabellone partenze</h2>

      <div className="rounded-2xl border border-araldico-100 bg-white p-4 shadow-sm">
        <CampoStazione
          label={gps === 'cercando' ? 'Stazione · rilevo la posizione…' : gps === 'ok' && !sceltaUtente.current ? 'Stazione · la più vicina a te' : 'Stazione'}
          value={stazione}
          onSelect={(s) => s && scegli(s)}
          soloStazioni
        />
      </div>

      {!stazione && gps !== 'cercando' && (
        <p className="px-6 pt-2 text-center text-sm text-araldico-500">
          Scegli una stazione per vedere i treni in partenza.
        </p>
      )}

      {stazione && (
        <div className="tabellone">
          <div className="tabellone-griglia" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', paddingTop: '0.7rem', paddingBottom: '0.6rem' }}>
            <span className="min-w-0">
              <span className="block text-[10px] tracking-widest text-[#cfe8d9]">PARTENZE</span>
              <span className="block truncate text-base font-bold uppercase leading-tight text-white">{stazione.name}</span>
            </span>
            <span className="text-lg font-bold text-white">{hhmm(adesso)}</span>
          </div>
          <div className="tabellone-griglia tabellone-testata">
            <span>Ora</span>
            <span>Treno</span>
            <span>Destinazione</span>
            <span className="text-center">Bin.</span>
          </div>

          {caricamento && !dati && (
            <div className="tabellone-riga-bianca px-4 py-6 text-center text-sm">Carico le partenze…</div>
          )}
          {!caricamento && dati && treni.length === 0 && !errore && (
            <div className="tabellone-riga-bianca px-4 py-6 text-center text-sm">Nessuna partenza nei prossimi minuti.</div>
          )}
          {treni.map((t, i) => (
            <RigaTreno
              key={`${t.numero}-${t.orario}`}
              treno={t}
              pari={i % 2 === 0}
              onApri={(tr) => onApriTreno?.({ numero: tr.numero, codice: tr.codOrigine, origine: tr.origine })}
            />
          ))}
        </div>
      )}

      {errore && <p className="px-1 text-center text-sm text-red-700">{errore}</p>}

      {stazione && dati && (
        <p className="px-1 text-center text-xs text-araldico-500">
          Aggiornato alle {hhmm(dati.aggiornato)} · tocca un treno per il percorso completo.
          <br />
          Dati ViaggiaTreno: i treni Italo non sono inclusi.
        </p>
      )}
    </div>
  )
}
