import { useEffect, useState } from 'react'
import TrattaTreno from './TrattaTreno'
import { IconaCuore, IconaSveglia } from './Icone'
import { leggiPreferiti, rimuoviPreferito, aggiornaRitardoPreferito } from '../lib/preferiti'
import { corsaFutura } from '../lib/tempo'
import {
  MINUTI_PRIMA,
  puoUsareSveglia,
  svegliaAttiva,
  attivaSveglia,
  disattivaSveglia,
  dimenticaSveglia,
} from '../lib/sveglia'

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
  return g === oggiISO()
}

function oggiISO() {
  const o = new Date()
  return `${o.getFullYear()}-${String(o.getMonth() + 1).padStart(2, '0')}-${String(o.getDate()).padStart(2, '0')}`
}

const SPIEGAZIONI = {
  home: 'Per ricevere la sveglia aggiungi Trova Treni alla schermata Home: in Safari tocca Condividi, poi «Aggiungi alla schermata Home», e apri l’app da lì.',
  negato: 'Le notifiche di Trova Treni sono disattivate. Riattivale in Impostazioni › Notifiche › Trova Treni.',
  'non-supportato': 'Questo browser non supporta le notifiche, quindi la sveglia non è disponibile.',
  server: 'Non sono riuscito ad attivare la sveglia. Riprova tra qualche istante.',
}

// Stato del pulsante sveglia: "ti avviso 5 minuti prima dell'arrivo"
function useSveglia(pref) {
  const [attiva, setAttiva] = useState(() => !!svegliaAttiva(pref))
  const [lavoro, setLavoro] = useState(false)
  const [avviso, setAvviso] = useState('')

  async function tocca() {
    setAvviso('')
    if (attiva) {
      setLavoro(true)
      await disattivaSveglia(pref)
      setAttiva(false)
      setLavoro(false)
      return
    }
    const verifica = puoUsareSveglia()
    if (!verifica.ok) {
      setAvviso(SPIEGAZIONI[verifica.motivo])
      return
    }
    setLavoro(true)
    try {
      await attivaSveglia(pref)
      setAttiva(true)
    } catch (e) {
      setAvviso(SPIEGAZIONI[e.message === 'negato' ? 'negato' : 'server'])
    } finally {
      setLavoro(false)
    }
  }

  return { attiva, lavoro, avviso, tocca, chiudiAvviso: () => setAvviso('') }
}

function CardPreferito({ pref, onRimuovi, attiva }) {
  // solo orari programmati se la corsa è di un giorno successivo (vedi
  // corsaFutura); per i preferiti salvati senza data completa uso il giorno
  const futura = Date.parse(pref.partenza)
    ? corsaFutura(pref.partenza)
    : !isOggi(pref.giorno) && pref.giorno > oggiISO()

  const sveglia = useSveglia(pref)

  // Ogni aggiornamento dello stato: se il treno è arrivato alla destinazione
  // dell'utente il preferito sparisce subito; altrimenti memorizzo il ritardo.
  function suStato(s) {
    if (!s?.disponibile) return
    if (s.stato === 'arrivato') {
      dimenticaSveglia(pref)
      onRimuovi(pref)
    } else aggiornaRitardoPreferito(pref, s.ritardoMin)
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm border border-araldico-100">
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
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={sveglia.tocca}
            disabled={sveglia.lavoro}
            aria-pressed={sveglia.attiva}
            aria-label={sveglia.attiva ? 'Disattiva la sveglia' : `Avvisami ${MINUTI_PRIMA} minuti prima dell'arrivo`}
            className={`flex h-9 w-9 items-center justify-center rounded-full transition active:scale-95 disabled:opacity-60 ${
              sveglia.attiva ? 'bg-araldico-700 text-white' : 'bg-araldico-50 text-araldico-700 hover:bg-araldico-100'
            }`}
          >
            <IconaSveglia attiva={sveglia.attiva} className={`h-5 w-5 ${sveglia.lavoro ? 'animate-pulse' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => {
              if (sveglia.attiva) disattivaSveglia(pref)
              onRimuovi(pref)
            }}
            aria-label="Togli da Il mio treno"
            className="flex h-9 w-9 items-center justify-center rounded-full
                       bg-red-50 text-red-600 hover:bg-red-100 active:scale-95"
          >
            <IconaCuore attiva className="h-5 w-5" />
          </button>
        </div>
      </div>

      {sveglia.attiva && (
        <div className="mx-4 mt-2 flex items-center gap-2 rounded-lg bg-araldico-50 px-3 py-1.5 text-xs text-araldico-800">
          <IconaSveglia attiva className="h-4 w-4 shrink-0 text-araldico-700" />
          <span className="min-w-0 flex-1">
            Ti avviso {MINUTI_PRIMA} minuti prima dell&rsquo;arrivo a {pref.a}
          </span>
          <button type="button" onClick={sveglia.tocca} className="font-semibold text-araldico-700 underline-offset-2 hover:underline">
            Annulla
          </button>
        </div>
      )}
      {sveglia.avviso && (
        <div className="mx-4 mt-2 flex items-start gap-2 rounded-lg border border-araldico-200 bg-araldico-50 px-3 py-2 text-xs leading-snug text-araldico-800">
          <span className="min-w-0 flex-1">{sveglia.avviso}</span>
          <button type="button" onClick={sveglia.chiudiAvviso} aria-label="Chiudi" className="font-bold text-araldico-500">
            ×
          </button>
        </div>
      )}

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
        onStato={suStato}
        compatta
        conCountdown
        inPausa={!attiva}
      />
    </div>
  )
}

export default function VistaPreferiti({ onCambio, attiva = true }) {
  const [preferiti, setPreferiti] = useState([])

  // rileggo la lista ogni volta che la scheda torna visibile: nel frattempo
  // potrebbero essere stati aggiunti treni dalla ricerca
  useEffect(() => {
    if (attiva) setPreferiti(leggiPreferiti())
  }, [attiva])

  function rimuovi(pref) {
    const lista = rimuoviPreferito(pref)
    setPreferiti(lista)
    if (onCambio) onCambio(lista.length)
  }

  return (
    <div className="mt-2 space-y-3">
      <h2 className="px-1 text-2xl font-bold text-araldico-800">Il mio treno</h2>

      {preferiti.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-3 px-6 text-center">
          <IconaCuore className="h-12 w-12 text-araldico-200" />
          <p className="text-araldico-700">Non hai ancora salvato nessun treno.</p>
          <p className="max-w-xs text-sm text-araldico-500">
            Cerca la tua tratta e tocca il cuore accanto all&rsquo;orario del treno che prendi: qui
            vedrai binario, ritardo e fermate sempre aggiornati.
          </p>
        </div>
      ) : (
        <>
          <p className="px-1 text-sm text-araldico-600">
            {preferiti.length === 1 ? 'Il treno sparisce' : 'I treni spariscono'} da soli quando arrivi a
            destinazione. Tocca la sveglia per un avviso {MINUTI_PRIMA} minuti prima di scendere.
          </p>
          {preferiti.map((p) => (
            <CardPreferito
              key={`${p.numero}-${p.giorno}-${p.da}-${p.a}`}
              pref={p}
              onRimuovi={rimuovi}
              attiva={attiva}
            />
          ))}
        </>
      )}
    </div>
  )
}
