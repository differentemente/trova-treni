import { useEffect, useState } from 'react'
import { statoTreno } from '../lib/api'

function oraTs(ts) {
  if (ts == null) return null
  const d = new Date(Number(ts))
  if (isNaN(d)) return null
  return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

// prima lettera maiuscola (per i messaggi di stato)
function maiuscola(s) {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// "HH:MM" da un orario ISO string (es. "2026-07-20T06:43:00+02:00")
function oraStr(v) {
  if (!v) return '—'
  const m = String(v).match(/T(\d{2}:\d{2})/)
  if (m) return m[1]
  const hm = String(v).match(/^(\d{1,2}:\d{2})/)
  if (hm) return hm[1]
  return v
}

function etichettaStato(s) {
  if (!s?.disponibile) return { testo: 'n.d.', sotto: '', classe: 'bg-gray-100 text-gray-500' }
  if (s.stato === 'programmato') return { testo: 'Orari', sotto: 'previsti', classe: 'bg-araldico-50 text-araldico-800' }
  if (s.stato === 'cancellato') return { testo: 'Canc.', sotto: '', classe: 'bg-red-100 text-red-800' }
  if (s.stato === 'arrivato')
    return s.ritardoArrivo > 0
      ? { testo: `+${s.ritardoArrivo}`, sotto: 'arrivato', classe: 'bg-amber-100 text-amber-800' }
      : { testo: 'Arr.', sotto: 'in orario', classe: 'bg-green-100 text-green-800' }
  if (s.stato === 'in_arrivo')
    return s.ritardoMin > 0
      ? { testo: `+${s.ritardoMin}`, sotto: 'in arrivo', classe: 'bg-amber-100 text-amber-800' }
      : { testo: 'In', sotto: 'arrivo', classe: 'bg-green-100 text-green-800' }
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
  // -1 = il treno non ha ancora raggiunto nessuna di queste fermate
  const indiceAttuale = transitate.lastIndexOf(true)
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
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}
    >
      <div
        className="relative w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: 'calc(100vh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 2.5rem)' }}
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

// Box di stato: dice a colpo d'occhio dov'è il treno (ultimo rilevamento
// reale, stazione e ora) e se, IN QUEL PUNTO, è in orario o in ritardo.
function rigaRilevamento(stato) {
  if (!stato.ultimoRilevamento) return null
  const o = oraTs(stato.oraUltimoRilevamento)
  return `Ultimo rilevamento: ${stato.ultimoRilevamento}${o ? ` alle ${o}` : ''}`
}

const STILE = {
  verde: { classe: 'border-green-300 bg-green-50 text-green-900', puntino: 'bg-green-500' },
  ambra: { classe: 'border-amber-300 bg-amber-50 text-amber-900', puntino: 'bg-amber-500' },
  rosso: { classe: 'border-red-200 bg-red-50 text-red-800', puntino: 'bg-red-500' },
  neutro: { classe: 'border-araldico-200 bg-araldico-50 text-araldico-800', puntino: 'bg-araldico-300' },
}

function BoxStato({ stato }) {
  let titolo
  let sottotitolo
  let stile
  const r = stato.ritardoMin || 0
  const anticipo = stato.ritardoRilevamento != null && stato.ritardoRilevamento < 0 ? -stato.ritardoRilevamento : 0

  if (stato.futura) {
    titolo = 'Orari previsti'
    sottotitolo = 'Treno non ancora in viaggio'
    stile = STILE.neutro
  } else if (stato.stato === 'cancellato') {
    titolo = 'Treno cancellato'
    sottotitolo = 'Su questa tratta'
    stile = STILE.rosso
  } else if (stato.stato === 'arrivato') {
    const oraArr = oraTs(stato.oraArrivoEffettivo)
    titolo = stato.ritardoArrivo > 0
      ? `Arrivato a destinazione con ${stato.ritardoArrivo} min di ritardo`
      : 'Arrivato a destinazione in orario'
    sottotitolo = oraArr ? `Arrivo a ${stato.nomeArrivo} alle ${oraArr}` : `Arrivo a ${stato.nomeArrivo}`
    stile = stato.ritardoArrivo > 0 ? STILE.ambra : STILE.verde
  } else if (stato.stato === 'in_arrivo') {
    // in viaggio, ma non ancora arrivato alla stazione dell'utente
    titolo = `In arrivo a ${stato.stazioneUtente} · ${r > 0 ? `in ritardo di ${r} min` : 'in orario'}`
    sottotitolo = rigaRilevamento(stato)
    stile = r > 0 ? STILE.ambra : STILE.verde
  } else if (stato.stato === 'non_partito_ritardo') {
    const oraProg = oraTs(stato.partenzaProgrammataCapolinea)
    titolo = `Non ancora partito · in ritardo di ${r} min`
    sottotitolo = `Partenza da ${stato.origineTreno} programmata alle ${oraProg}, non ancora avvenuta`
    stile = STILE.ambra
  } else if (stato.stato === 'non_partito') {
    const oraProg = oraTs(stato.partenzaProgrammataUtente)
    titolo = 'In attesa di partenza'
    sottotitolo = oraProg
      ? `Partenza da ${stato.stazioneUtente} programmata alle ${oraProg}`
      : 'Il treno non è ancora stato rilevato'
    stile = STILE.neutro
  } else if (stato.stato === 'in_orario') {
    titolo = anticipo > 0 ? `In anticipo di ${anticipo} min` : 'In orario'
    sottotitolo = rigaRilevamento(stato) || 'In viaggio'
    stile = STILE.verde
  } else {
    titolo = `In ritardo di ${r} min`
    sottotitolo = rigaRilevamento(stato) || 'In viaggio'
    stile = STILE.ambra
  }

  return (
    <div className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 ${stile.classe}`}>
      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${stile.puntino}`} />
      <div className="min-w-0">
        <div className="text-sm font-bold leading-tight">{titolo}</div>
        {sottotitolo && <div className="text-xs opacity-80">{sottotitolo}</div>}
      </div>
    </div>
  )
}

export default function TrattaTreno({ numero, origine, destinazione, partenza, arrivo, futura, onStato, compatta = false }) {
  const [stato, setStato] = useState(null)
  const [caricamento, setCaricamento] = useState(true)
  const [popup, setPopup] = useState(false)

  // nei preferiti ricarico lo stato ogni 60 secondi, così il riquadro segue
  // il treno in tempo reale e l'arrivo viene rilevato senza riaprire l'app
  const [giro, setGiro] = useState(0)
  useEffect(() => {
    if (!compatta || futura) return
    const t = setInterval(() => setGiro((g) => g + 1), 60000)
    return () => clearInterval(t)
  }, [compatta, futura])

  useEffect(() => {
    let vivo = true
    if (giro === 0) setCaricamento(true) // solo al primo caricamento
    statoTreno({ numero, origine, destinazione, partenza, futura })
      .then((s) => {
        if (!vivo) return
        setStato(s)
        if (onStato) onStato(s) // comunico lo stato (badge / preferiti)
      })
      .catch(() => {
        if (!vivo || giro > 0) return // un aggiornamento fallito non cancella l'ultimo stato buono
        const errore = { disponibile: false, motivo: 'errore di rete' }
        setStato(errore)
        if (onStato) onStato(errore)
      })
      .finally(() => vivo && setCaricamento(false))
    return () => {
      vivo = false
    }
  }, [numero, origine, destinazione, partenza, futura, giro])

  if (caricamento) {
    return <div className="px-4 py-4 text-sm text-araldico-500">Carico stato treno…</div>
  }

  if (!stato?.disponibile || !stato.fermate?.length) {
    // Percorso completo non disponibile (treno non in circolazione: corsa
    // conclusa o data futura). Invece di un messaggio vuoto, mostro gli estremi
    // della tratta con gli orari teorici che abbiamo dalla ricerca. Le fermate
    // intermedie non sono ottenibili in questo caso (limite delle fonti).
    return (
      <div className={compatta ? 'bg-white px-3 pb-3 pt-1' : 'border-t border-araldico-100 bg-white px-3 pb-3 pt-3'}>
        <div className="rounded-xl border border-araldico-100 bg-araldico-50/40 px-3 py-3">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-araldico-500">
            Orari previsti
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-araldico-800">{origine}</div>
              <div className="truncate text-xs text-araldico-500">{destinazione}</div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold tabular-nums text-araldico-800">
                {oraStr(partenza)} <span className="text-araldico-300">&rarr;</span> {oraStr(arrivo)}
              </div>
            </div>
          </div>
          <p className="mt-2 text-xs text-araldico-500">
            Il percorso dettagliato con le fermate sarà disponibile quando il treno entra in
            circolazione.
          </p>
        </div>
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
