import { useEffect, useState } from 'react'
import TrattaTreno from './TrattaTreno'
import { leggiPreferiti, rimuoviPreferito } from '../lib/preferiti'

function ora(v) {
  if (!v) return '—'
  const m = String(v).match(/T(\d{2}:\d{2})/)
  if (m) return m[1]
  const hm = String(v).match(/^(\d{1,2}:\d{2})/)
  if (hm) return hm[1]
  return v
}

// formatta il giorno YYYY-MM-DD in "gio 12 giu"
function giornoLeggibile(g) {
  if (!g) return ''
  const [y, m, d] = g.split('-').map(Number)
  if (!y) return g
  const data = new Date(y, m - 1, d)
  return data.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })
}

// È oggi il giorno del preferito? (solo per i treni di oggi ha senso il realtime)
function isOggi(g) {
  const oggi = new Date()
  const gg = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, '0')}-${String(
    oggi.getDate()
  ).padStart(2, '0')}`
  return g === gg
}

function CardPreferito({ pref, onRimuovi }) {
  // il treno è in una data futura se il giorno salvato non è oggi
  const futura = !isOggi(pref.giorno)

  return (
    <div className="rounded-2xl bg-white shadow-sm border border-araldico-100">
      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded bg-araldico-50 px-2 py-0.5 text-sm font-semibold text-araldico-800 whitespace-nowrap">
              {[pref.categoria, pref.numero].filter(Boolean).join(' ') || 'Treno'}
            </span>
            <span className="text-xs text-araldico-500">{giornoLeggibile(pref.giorno)}</span>
          </div>
          <div className="mt-1 truncate text-sm text-araldico-700">
            {pref.da} ({ora(pref.partenza)}) &rarr; {pref.a} ({ora(pref.orarioArrivo)})
          </div>
        </div>
        <button
          type="button"
          onClick={() => onRimuovi(pref)}
          aria-label="Rimuovi dai preferiti"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full
                     bg-red-50 text-red-600 hover:bg-red-100 active:scale-95"
        >
          {/* cuore pieno rosso: click per rimuovere */}
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
            <path d="M12 21s-6.7-4.35-9.33-8.36C1.1 10.1 1.64 6.9 4.1 5.5a5 5 0 0 1 6 .9l1.9 1.9 1.9-1.9a5 5 0 0 1 6-.9c2.46 1.4 3 4.6 1.43 7.14C18.7 16.65 12 21 12 21z" />
          </svg>
        </button>
      </div>

      {/* divisorio tra intestazione della card e la traccia treno */}
      <div className="mx-4 mt-3 h-px bg-araldico-100" />

      {/* Traccia treno GIÀ aperta: niente da espandere */}
      <TrattaTreno
        numero={pref.numero}
        origine={pref.da}
        destinazione={pref.a}
        partenza={pref.partenza}
        arrivo={pref.orarioArrivo}
        futura={futura}
        compatta
      />
    </div>
  )
}

export default function VistaPreferiti({ onCambio }) {
  const [preferiti, setPreferiti] = useState([])

  useEffect(() => {
    setPreferiti(leggiPreferiti())
  }, [])

  function rimuovi(pref) {
    const lista = rimuoviPreferito(pref)
    setPreferiti(lista)
    if (onCambio) onCambio(lista.length)
  }

  if (preferiti.length === 0) {
    return (
      <div className="mt-10 flex flex-col items-center gap-3 px-6 text-center">
        <svg viewBox="0 0 24 24" className="h-12 w-12 text-araldico-200" fill="currentColor">
          <path d="M12 21s-6.7-4.35-9.33-8.36C1.1 10.1 1.64 6.9 4.1 5.5a5 5 0 0 1 6 .9l1.9 1.9 1.9-1.9a5 5 0 0 1 6-.9c2.46 1.4 3 4.6 1.43 7.14C18.7 16.65 12 21 12 21z" />
        </svg>
        <p className="text-araldico-700">Nessun treno preferito.</p>
        <p className="max-w-xs text-sm text-araldico-500">
          Tocca il cuore accanto a un treno nei risultati di ricerca per salvarlo qui e
          seguirne lo stato senza cercarlo ogni volta.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-2 space-y-3">
      <p className="px-1 text-sm text-araldico-600">
        {preferiti.length} {preferiti.length > 1 ? 'treni seguiti' : 'treno seguito'}. I
        preferiti si rimuovono automaticamente all&rsquo;arrivo del treno.
      </p>
      {preferiti.map((p) => (
        <CardPreferito key={`${p.numero}-${p.giorno}-${p.da}-${p.a}`} pref={p} onRimuovi={rimuovi} />
      ))}
    </div>
  )
}
