import { useEffect, useState } from 'react'
import { statoTreno } from '../lib/api'

function oraTs(ts) {
  if (ts == null) return null
  const d = new Date(Number(ts))
  if (isNaN(d)) return null
  return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

function etichettaStato(s) {
  if (!s?.disponibile) return { testo: 'n.d.', sotto: '', classe: 'bg-gray-100 text-gray-500' }
  if (s.stato === 'programmato') return { testo: 'Orari', sotto: 'previsti', classe: 'bg-araldico-50 text-araldico-800' }
  if (s.stato === 'cancellato') return { testo: 'Canc.', sotto: '', classe: 'bg-red-100 text-red-800' }
  if (s.stato === 'non_partito_ritardo')
    return { testo: 'Non partito', sotto: `in ritardo di ${s.ritardoMin}′`, classe: 'bg-amber-100 text-amber-800' }
  if (s.stato === 'non_partito') return { testo: 'Non', sotto: 'partito', classe: 'bg-araldico-50 text-araldico-800' }
  if (s.stato === 'in_orario') return { testo: 'In', sotto: 'orario', classe: 'bg-green-100 text-green-800' }
  return { testo: `+${s.ritardoMin}`, sotto: 'Ritardo', classe: 'bg-amber-100 text-amber-800' }
}

// teorico (grigio sopra) / effettivo reale o proiezione ritardo (sotto)
function OrarioCoppia({ teorico, effettivo, proiezione, ritardo }) {
  // riga inferiore: prima l'effettivo reale; se manca, la proiezione stimata
  let sotto = effettivo
  let colSotto = 'text-gray-900'
  let stimato = false

  if (!effettivo && proiezione) {
    sotto = proiezione
    stimato = true
    colSotto = 'text-amber-600' // proiezione: ambra
  } else if (effettivo && ritardo != null && ritardo > 0) {
    colSotto = 'text-red-600' // effettivo in ritardo
  } else if (effettivo) {
    colSotto = 'text-green-700' // effettivo in orario/anticipo
  }

  return (
    <div className="text-right leading-snug tabular-nums">
      <div className="whitespace-nowrap text-[13px] text-gray-400">{teorico || '—:—'}</div>
      <div className={`relative whitespace-nowrap text-[13px] font-medium ${colSotto}`}>
        {sotto || '—:—'}
        {stimato && <span className="absolute -right-1.5 top-0 text-[8px]">~</span>}
      </div>
    </div>
  )
}

function Pill({ testo, confermato }) {
  if (!testo) return <span className="text-gray-300">—</span>
  const cls = confermato ? 'bg-araldico-700 text-crema' : 'bg-araldico-100 text-araldico-700'
  return (
    <span className={`inline-block min-w-[1.4rem] rounded-md px-1 py-0.5 text-center text-[13px] font-semibold ${cls}`}>
      {testo}
    </span>
  )
}

function Timeline({ primo, ultimo, raggiunta, attuale, prossimaRaggiunta }) {
  const scuro = 'bg-araldico-700'
  const chiaro = 'bg-araldico-100'
  const sopra = raggiunta ? scuro : chiaro
  const sotto = prossimaRaggiunta ? scuro : chiaro
  const cerchio = raggiunta ? 'bg-araldico-700 border-araldico-700' : 'bg-white border-araldico-300'
  return (
    <span className="flex w-6 flex-col items-center self-stretch">
      <span className={`w-1.5 flex-1 ${primo ? 'bg-transparent' : sopra}`} />
      <span className={`my-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${cerchio} ${attuale ? 'ring-4 ring-araldico-100' : ''}`} />
      <span className={`w-1.5 flex-1 ${ultimo ? 'bg-transparent' : sotto}`} />
    </span>
  )
}

// Tabella fermate riusabile (stesso stile per segmento e tratta completa)
function TabellaFermate({ fermate }) {
  const transitate = fermate.map((f) => f.transitata)
  const indiceAttuale = Math.max(transitate.lastIndexOf(true), 0)
  return (
    <>
      <div className="grid grid-cols-[1.25rem_minmax(0,1fr)_2rem_2.9rem_2.9rem] items-end gap-x-1.5 pb-2 text-xs text-gray-400">
        <span />
        <span>Stazione</span>
        <span className="text-center">Bin.</span>
        <span className="text-right">Arrivo</span>
        <span className="text-right">Part.</span>
      </div>
      {fermate.map((f, i) => {
        const primo = i === 0
        const ultimo = i === fermate.length - 1
        const raggiunta = i <= indiceAttuale
        return (
          <div key={i} className="grid min-h-[3.25rem] grid-cols-[1.25rem_minmax(0,1fr)_2rem_2.9rem_2.9rem] items-center gap-x-1.5">
            <Timeline
              primo={primo}
              ultimo={ultimo}
              raggiunta={raggiunta}
              attuale={i === indiceAttuale}
              prossimaRaggiunta={i + 1 <= indiceAttuale}
            />
            <span className={`min-w-0 break-words py-3 text-[13px] leading-tight ${ultimo ? 'font-bold text-araldico-700' : 'text-gray-900'} ${f.soppressa ? 'line-through opacity-50' : ''}`}>
              {f.nome}
            </span>
            <span className="justify-self-center">
              <Pill testo={f.binario} confermato={f.binarioConfermato} />
            </span>
            <span className="justify-self-end">
              <OrarioCoppia
                teorico={oraTs(f.teoricoArrivo)}
                effettivo={oraTs(f.effettivoArrivo)}
                proiezione={oraTs(f.proiezioneArrivo)}
                ritardo={f.ritardo}
              />
            </span>
            <span className="justify-self-end">
              <OrarioCoppia
                teorico={oraTs(f.teoricoPartenza)}
                effettivo={oraTs(f.effettivoPartenza)}
                proiezione={oraTs(f.proiezionePartenza)}
                ritardo={f.ritardo}
              />
            </span>
          </div>
        )
      })}
    </>
  )
}

// Pop-up tratta completa
function PopupTratta({ titolo, fermate, onChiudi }) {
  // chiudo con Esc
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onChiudi()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onChiudi])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-3 sm:p-6"
      onClick={onChiudi}
    >
      <div
        className="relative mt-6 max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onChiudi}
          aria-label="Chiudi"
          className="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-full
                     bg-gray-100 text-gray-600 hover:bg-gray-200"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <h3 className="mb-3 pl-10 text-base font-bold text-araldico-800">{titolo}</h3>
        <TabellaFermate fermate={fermate} />
      </div>
    </div>
  )
}

// Box di stato ben leggibile per la vista preferiti: dice a colpo d'occhio se
// il treno è in orario o in ritardo, di quanti minuti, e dov'è l'ultimo
// rilevamento. Colori pieni per non lasciare dubbi.
function BoxStato({ stato }) {
  let titolo, sottotitolo, classe, puntino

  if (stato.futura) {
    titolo = 'Orari previsti'
    sottotitolo = 'Treno non ancora in viaggio'
    classe = 'border-araldico-200 bg-araldico-50 text-araldico-800'
    puntino = 'bg-araldico-400'
  } else if (stato.stato === 'cancellato') {
    titolo = 'Treno cancellato'
    sottotitolo = 'Su questa tratta'
    classe = 'border-red-200 bg-red-50 text-red-800'
    puntino = 'bg-red-500'
  } else if (stato.stato === 'non_partito_ritardo') {
    titolo = `Non ancora partito · in ritardo di ${stato.ritardoMin} min`
    sottotitolo = 'La partenza teorica è già passata'
    classe = 'border-amber-300 bg-amber-50 text-amber-900'
    puntino = 'bg-amber-500'
  } else if (stato.stato === 'non_partito') {
    titolo = 'Non ancora partito'
    sottotitolo = 'In orario alla partenza'
    classe = 'border-araldico-200 bg-araldico-50 text-araldico-800'
    puntino = 'bg-araldico-400'
  } else if (stato.stato === 'in_orario') {
    titolo = 'In orario'
    sottotitolo = stato.ultimoRilevamento
      ? `Ultimo rilevamento: ${stato.ultimoRilevamento}${
          stato.oraUltimoRilevamento ? ` (${oraTs(stato.oraUltimoRilevamento)})` : ''
        }`
      : 'In viaggio'
    classe = 'border-green-300 bg-green-50 text-green-900'
    puntino = 'bg-green-500'
  } else {
    // ritardo
    titolo = `In ritardo di ${stato.ritardoMin} min`
    sottotitolo = stato.ultimoRilevamento
      ? `Ultimo rilevamento: ${stato.ultimoRilevamento}${
          stato.oraUltimoRilevamento ? ` (${oraTs(stato.oraUltimoRilevamento)})` : ''
        }`
      : 'In viaggio'
    classe = 'border-amber-300 bg-amber-50 text-amber-900'
    puntino = 'bg-amber-500'
  }

  return (
    <div className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 ${classe}`}>
      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${puntino}`} />
      <div className="min-w-0">
        <div className="text-sm font-bold leading-tight">{titolo}</div>
        <div className="text-xs opacity-80">{sottotitolo}</div>
      </div>
    </div>
  )
}

export default function TrattaTreno({ numero, origine, destinazione, partenza, futura, onStato, compatta = false }) {
  const [stato, setStato] = useState(null)
  const [caricamento, setCaricamento] = useState(true)
  const [popup, setPopup] = useState(false)

  useEffect(() => {
    let vivo = true
    setCaricamento(true)
    statoTreno({ numero, origine, destinazione, partenza, futura })
      .then((s) => {
        if (!vivo) return
        setStato(s)
        if (onStato) onStato(s) // comunico lo stato al TabTreno per il badge
      })
      .catch(() => {
        if (!vivo) return
        const errore = { disponibile: false, motivo: 'errore di rete' }
        setStato(errore)
        if (onStato) onStato(errore)
      })
      .finally(() => vivo && setCaricamento(false))
    return () => {
      vivo = false
    }
  }, [numero, origine, destinazione, partenza, futura])

  if (caricamento) {
    return <div className="px-4 py-4 text-sm text-araldico-500">Carico stato treno…</div>
  }

  if (!stato?.disponibile || !stato.fermate?.length) {
    return (
      <div className="px-4 py-4 text-sm text-araldico-500">
        {stato?.motivo
          ? `Percorso non disponibile: ${stato.motivo}.`
          : 'Percorso in tempo reale non disponibile per questo treno.'}
      </div>
    )
  }

  const et = etichettaStato(stato)
  const haTrattaCompleta = stato.fermateComplete && stato.fermateComplete.length > stato.fermate.length

  return (
    <div className={compatta ? 'bg-white px-3 pb-3 pt-1' : 'border-t border-araldico-100 bg-white px-3 pb-3 pt-3'}>
      {compatta ? (
        /* Versione compatta (preferiti): box di stato chiaro, poi divisorio,
           poi la tabella fermate, poi il pulsante per il percorso intero. */
        <>
          <BoxStato stato={stato} />
          {stato.cancellatoSulSegmento && (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              Alcune fermate di questa tratta sono cancellate.
            </p>
          )}
          {/* divisorio tra il box stato e l'intestazione della tabella */}
          <div className="my-3 h-px bg-araldico-100" />
          <TabellaFermate fermate={stato.fermate} />
          {/* pulsante per aprire il percorso completo del treno */}
          {haTrattaCompleta && (
            <button
              type="button"
              onClick={() => setPopup(true)}
              className="mt-3 w-full rounded-xl border border-araldico-300 px-4 py-2.5
                         text-sm font-semibold text-araldico-700 hover:bg-araldico-50
                         active:scale-[0.99]"
            >
              Visualizza intero percorso del treno
            </button>
          )}
        </>
      ) : (
        <>
          {/* Header cliccabile: apre il pop-up con la tratta completa */}
          <button
            type="button"
            onClick={() => haTrattaCompleta && setPopup(true)}
            className={`mb-3 flex w-full items-stretch gap-2 rounded-2xl border border-gray-200 p-3 text-left ${
              haTrattaCompleta ? 'hover:border-araldico-300 hover:bg-araldico-50' : 'cursor-default'
            }`}
          >
            <div className="flex-1">
              <div className="text-lg font-bold leading-tight text-gray-900">
                {stato.futura ? `${stato.partenza} → ${stato.arrivo}` : stato.ultimoRilevamento || stato.partenza}
              </div>
              {stato.futura ? (
                <div className="text-sm text-gray-400">Orari previsti (treno non ancora in viaggio)</div>
              ) : stato.oraUltimoRilevamento ? (
                <div className="text-sm text-gray-400">Ultimo rilevamento: {oraTs(stato.oraUltimoRilevamento)}</div>
              ) : (
                <div className="text-sm text-gray-400">In attesa di rilevamento</div>
              )}
              {haTrattaCompleta && (
                <div className="mt-1 text-xs font-medium text-araldico-600">
                  Tocca per il percorso completo ({stato.origineTreno} → {stato.destinazioneTreno})
                </div>
              )}
            </div>
            <div className={`flex flex-col items-center justify-center rounded-xl px-4 ${et.classe}`}>
              <span className="text-xl font-bold leading-none">{et.testo}</span>
              {et.sotto && <span className="text-xs">{et.sotto}</span>}
            </div>
          </button>

          {stato.cancellatoSulSegmento && (
            <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              Alcune fermate di questa tratta sono cancellate.
            </p>
          )}

          <TabellaFermate fermate={stato.fermate} />
        </>
      )}

      {popup && (
        <PopupTratta
          titolo={`${stato.origineTreno} → ${stato.destinazioneTreno}`}
          fermate={stato.fermateComplete}
          onChiudi={() => setPopup(false)}
        />
      )}
    </div>
  )
}
