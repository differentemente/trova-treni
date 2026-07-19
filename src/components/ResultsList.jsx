import { useState } from 'react'
import TrattaTreno from './TrattaTreno'
import { isPreferito, togglePreferito } from '../lib/preferiti'

function ora(iso) {
  if (!iso) return '—'
  const m = String(iso).match(/T(\d{2}:\d{2})/)
  if (m) return m[1]
  const hm = String(iso).match(/^(\d{1,2}:\d{2})/)
  if (hm) return hm[1]
  return iso
}

function minOf(v) {
  if (!v) return null
  const iso = String(v).match(/T(\d{2}):(\d{2})/)
  if (iso) return Number(iso[1]) * 60 + Number(iso[2])
  const hm = String(v).match(/(\d{1,2}):(\d{2})/)
  if (hm) return Number(hm[1]) * 60 + Number(hm[2])
  return null
}

function durata(sol) {
  if (sol.durata) return sol.durata
  const p = minOf(sol.orarioPartenza)
  const a = minOf(sol.orarioArrivo)
  if (p == null || a == null) return ''
  let min = a - p
  if (min < 0) min += 1440
  const h = Math.floor(min / 60)
  return h > 0 ? `${h}h ${String(min % 60).padStart(2, '0')}m` : `${min}m`
}

// Cuore per salvare/rimuovere un treno dai preferiti.
// Opera sul primo treno della soluzione (per i diretti è l'unico).
function CuorePreferito({ treno, onCambio }) {
  const datiPref = {
    numero: treno.numero,
    categoria: treno.categoria,
    da: treno.da,
    a: treno.a,
    partenza: treno.partenza,
    orarioArrivo: treno.arrivo,
  }
  const [attivo, setAttivo] = useState(() => isPreferito(datiPref))

  function click(e) {
    e.stopPropagation()
    const { attivo: nuovo, lista } = togglePreferito(datiPref)
    setAttivo(nuovo)
    if (onCambio) onCambio(lista.length)
  }

  return (
    <button
      type="button"
      onClick={click}
      aria-label={attivo ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full
                 transition hover:bg-araldico-50 active:scale-90"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-6 w-6 transition-colors"
        fill={attivo ? '#dc2626' : 'none'}
        stroke={attivo ? '#dc2626' : '#9ca3af'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
      </svg>
    </button>
  )
}

// Badge di stato compatto per un singolo treno (in lista)
function BadgeStato({ stato }) {
  if (!stato) return <span className="text-xs text-araldico-400">…</span>
  if (stato.soppresso || stato.stato === 'cancellato')
    return <span className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-800">cancellato</span>
  if (!stato.disponibile)
    return <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">n.d.</span>
  if (stato.stato === 'non_partito_ritardo')
    return <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">non partito · +{stato.ritardoMin}&prime;</span>
  if (stato.stato === 'non_partito')
    return <span className="rounded bg-araldico-50 px-1.5 py-0.5 text-[11px] text-araldico-800">non partito</span>
  if (stato.stato === 'in_orario')
    return <span className="rounded bg-green-100 px-1.5 py-0.5 text-[11px] font-medium text-green-800">in orario</span>
  return <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">+{stato.ritardoMin}&prime;</span>
}

// Tab di un singolo treno della soluzione.
// Il badge di stato NON viene caricato automaticamente (risparmio chiamate):
// lo stato arriva da TrattaTreno (via onStato) solo quando apri il tab.
function TabTreno({ treno, dataFutura }) {
  const [aperto, setAperto] = useState(false)
  const [stato, setStato] = useState(null)

  const etichetta = [treno.categoria, treno.numero].filter(Boolean).join(' ') || 'Treno'
  const cancellato = stato?.soppresso || stato?.stato === 'cancellato'
  const apribile = !cancellato || !stato // prima di aprire non so se è cancellato: lascio apribile

  return (
    <div className={`overflow-hidden rounded-xl border ${cancellato ? 'border-red-200' : 'border-araldico-100'}`}>
      <button
        type="button"
        onClick={() => setAperto((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-araldico-50"
      >
        <span className="rounded bg-araldico-50 px-2 py-0.5 text-sm font-medium text-araldico-800 whitespace-nowrap">
          {etichetta}
        </span>
        <span className={`flex-1 truncate text-sm ${cancellato ? 'text-red-700 line-through' : 'text-araldico-700'}`}>
          {treno.da} ({ora(treno.partenza)}) &rarr; {treno.a} ({ora(treno.arrivo)})
        </span>
        {!dataFutura && stato && <BadgeStato stato={stato} />}
        <span className="text-araldico-300">{aperto ? '\u25B2' : '\u25BC'}</span>
      </button>

      {aperto && (
        <TrattaTreno
          numero={treno.numero}
          origine={treno.da}
          destinazione={treno.a}
          partenza={treno.partenza}
          futura={dataFutura}
          onStato={setStato}
        />
      )}
    </div>
  )
}

// Soluzione Italo: riga dedicata con etichetta, non espandibile (fonte separata)
function SoluzioneItalo({ sol }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm border border-araldico-100">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-xl font-semibold">
          {ora(sol.orarioPartenza)} <span className="text-araldico-300">&rarr;</span>{' '}
          {ora(sol.orarioArrivo)}
        </div>
        <div className="text-sm text-araldico-700">{durata(sol)} · Diretto</div>
      </div>
      <div className="mt-3">
        <div className="flex items-center gap-2 rounded-xl border border-[#c8102e]/30 bg-[#c8102e]/5 px-3 py-2">
          <span className="rounded bg-[#c8102e] px-2 py-0.5 text-sm font-bold text-white whitespace-nowrap">
            Italo {sol.numero}
          </span>
          <span className="flex-1 truncate text-sm text-araldico-700">
            {sol.da} ({ora(sol.orarioPartenza)}) &rarr; {sol.a} ({ora(sol.orarioArrivo)})
          </span>
        </div>
      </div>
    </div>
  )
}

function Soluzione({ sol, dataFutura, onCambioPreferiti }) {
  if (sol.operatore === 'italo') return <SoluzioneItalo sol={sol} />
  // il treno "principale" della soluzione, su cui agisce il cuore
  const trenoPrincipale = sol.treni?.[0]
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm border border-araldico-100">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-1">
          <div className="text-xl font-semibold">
            {ora(sol.orarioPartenza)} <span className="text-araldico-300">&rarr;</span>{' '}
            {ora(sol.orarioArrivo)}
          </div>
          {trenoPrincipale && (
            <CuorePreferito treno={trenoPrincipale} onCambio={onCambioPreferiti} />
          )}
        </div>
        <div className="text-sm text-araldico-700">
          {durata(sol)} ·{' '}
          {sol.cambi === 0 ? 'Diretto' : `${sol.cambi} cambi${sol.cambi === 1 ? 'o' : ''}`}
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {sol.treni.map((t, i) => (
          <TabTreno key={i} treno={t} dataFutura={dataFutura} />
        ))}
      </div>
    </div>
  )
}

export default function ResultsList({
  soluzioni,
  cercato,
  dataFutura,
  onAltre,
  onPrecedenti,
  caricamentoAltre,
  caricamentoPrec,
  onCambioPreferiti,
}) {
  if (!cercato) return null

  if (!soluzioni || soluzioni.length === 0) {
    return (
      <p className="mt-6 text-center text-araldico-700">
        Nessuna soluzione trovata per questa ricerca.
      </p>
    )
  }

  return (
    <div className="mt-6 space-y-3">
      <button
        type="button"
        onClick={onPrecedenti}
        disabled={caricamentoPrec}
        className="w-full rounded-lg border border-araldico-300 px-4 py-2.5 font-medium
                   text-araldico-700 hover:bg-araldico-50 disabled:opacity-60"
      >
        {caricamentoPrec ? 'Carico…' : 'Soluzioni precedenti'}
      </button>

      {soluzioni.map((sol, i) => (
        <Soluzione key={i} sol={sol} dataFutura={dataFutura} onCambioPreferiti={onCambioPreferiti} />
      ))}

      <button
        type="button"
        onClick={onAltre}
        disabled={caricamentoAltre}
        className="w-full rounded-lg border border-araldico-300 px-4 py-2.5 font-medium
                   text-araldico-700 hover:bg-araldico-50 disabled:opacity-60"
      >
        {caricamentoAltre ? 'Carico…' : 'Soluzioni successive'}
      </button>
    </div>
  )
}
