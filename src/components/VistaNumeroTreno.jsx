import { useState } from 'react'
import TrattaTreno from './TrattaTreno'
import { elencoTreniPerNumero } from '../lib/api'

// Ricerca di un treno per numero (es. 9718): mostra dov'è adesso, il ritardo
// misurato all'ultimo rilevamento e l'intero percorso con tutte le fermate.
// In Italia lo stesso numero può indicare treni diversi: in quel caso chiedo
// all'utente quale, in base alla stazione di partenza.
export default function VistaNumeroTreno() {
  const [numero, setNumero] = useState('')
  const [cercando, setCercando] = useState(false)
  const [errore, setErrore] = useState('')
  const [candidati, setCandidati] = useState(null) // null = nessuna ricerca fatta
  const [scelto, setScelto] = useState(null) // { numero, codice, nome }
  const [info, setInfo] = useState(null) // stato del treno, per l'intestazione

  async function cerca(e) {
    if (e) e.preventDefault()
    const n = numero.replace(/\D/g, '')
    if (!n) {
      setErrore('Inserisci il numero del treno.')
      return
    }
    setErrore('')
    setCercando(true)
    setCandidati(null)
    setScelto(null)
    setInfo(null)
    try {
      const lista = await elencoTreniPerNumero(n)
      setCandidati(lista)
      if (lista.length === 0) setErrore(`Nessun treno con numero ${n} in circolazione oggi.`)
      else if (lista.length === 1) setScelto({ numero: n, codice: lista[0].codice, nome: lista[0].nome })
    } catch {
      setErrore('Errore nella ricerca. Riprova tra qualche secondo.')
    } finally {
      setCercando(false)
    }
  }

  function scegli(c) {
    setInfo(null)
    setScelto({ numero: numero.replace(/\D/g, ''), codice: c.codice, nome: c.nome })
  }

  const piuTreni = candidati && candidati.length > 1

  return (
    <div className="mt-2 space-y-3">
      <form
        onSubmit={cerca}
        className="rounded-2xl border border-araldico-100 bg-white p-4 shadow-sm"
      >
        <label htmlFor="numero-treno" className="mb-1 block text-sm font-medium text-araldico-700">
          Numero del treno
        </label>
        <div className="flex gap-2">
          <input
            id="numero-treno"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            enterKeyHint="search"
            autoComplete="off"
            value={numero}
            onChange={(e) => {
              setNumero(e.target.value.replace(/\D/g, '').slice(0, 6))
              setErrore('')
            }}
            placeholder="es. 9718"
            className="min-w-0 flex-1 rounded-lg border border-araldico-100 bg-white px-3 py-2.5
                       text-lg tabular-nums text-araldico-900 outline-none focus:border-araldico-500"
          />
          <button
            type="submit"
            disabled={cercando}
            className="rounded-lg bg-araldico-700 px-4 py-2.5 font-semibold text-crema
                       hover:bg-araldico-600 disabled:opacity-60"
          >
            {cercando ? 'Cerco…' : 'Cerca'}
          </button>
        </div>
        <p className="mt-2 text-xs text-araldico-500">
          Trovi il numero sul biglietto o sui monitor di stazione.
        </p>
      </form>

      {errore && <p className="px-1 text-center text-sm text-red-700">{errore}</p>}

      {/* più treni con lo stesso numero: scelgo dalla stazione di partenza */}
      {piuTreni && (
        <div className="rounded-2xl border border-araldico-100 bg-white p-4 shadow-sm">
          <p className="mb-2 text-sm text-araldico-700">
            Oggi ci sono {candidati.length} treni con il numero {numero}. Quale cerchi?
          </p>
          <div className="space-y-1.5">
            {candidati.map((c) => {
              const attivo = scelto?.codice === c.codice
              return (
                <button
                  key={`${c.codice}-${c.ts}`}
                  type="button"
                  onClick={() => scegli(c)}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${
                    attivo
                      ? 'border-araldico-700 bg-araldico-700 text-crema'
                      : 'border-araldico-100 bg-araldico-50/50 text-araldico-800 hover:bg-araldico-50'
                  }`}
                >
                  <span>Parte da {c.nome || 'stazione non indicata'}</span>
                  <span className="opacity-70">&rsaquo;</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {scelto && (
        <div className="overflow-hidden rounded-2xl border border-araldico-100 bg-white shadow-sm">
          <div className="px-4 pt-3">
            <span className="rounded bg-araldico-50 px-2 py-0.5 text-sm font-semibold text-araldico-800">
              {info?.nomeTreno || `Treno ${scelto.numero}`}
            </span>
            <div className="mt-1 text-sm text-araldico-700">
              {info?.disponibile
                ? `${info.origineTreno} → ${info.destinazioneTreno}`
                : `Parte da ${scelto.nome}`}
            </div>
          </div>
          <div className="mx-4 mt-3 h-px bg-araldico-100" />
          <TrattaTreno
            key={`${scelto.numero}-${scelto.codice}`}
            numero={scelto.numero}
            codice={scelto.codice}
            onStato={setInfo}
            compatta
          />
        </div>
      )}

      {candidati === null && !cercando && !errore && (
        <p className="px-6 pt-4 text-center text-sm text-araldico-500">
          Inserisci il numero per vedere dove si trova il treno, il ritardo e tutte le
          fermate del percorso.
        </p>
      )}
    </div>
  )
}
