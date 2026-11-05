import { useState } from 'react'

// Suggerimenti e segnalazioni: i messaggi arrivano tramite Netlify Forms
// (modulo "suggerimenti" dichiarato in index.html). Si leggono nel pannello
// Netlify e arrivano per email se attivata la notifica del modulo.

const TIPI = [
  { id: 'suggerimento', etichetta: 'Suggerimento' },
  { id: 'problema', etichetta: 'Problema / bug' },
]

function codifica(dati) {
  return new URLSearchParams(dati).toString()
}

export default function VistaSuggerimenti() {
  const [tipo, setTipo] = useState('suggerimento')
  const [messaggio, setMessaggio] = useState('')
  const [email, setEmail] = useState('')
  const [stato, setStato] = useState('idle') // idle | invio | inviato | errore
  const [errore, setErrore] = useState('')

  async function invia(e) {
    e.preventDefault()
    if (messaggio.trim().length < 5) {
      setErrore('Scrivi almeno qualche parola.')
      return
    }
    setErrore('')
    setStato('invio')
    try {
      const res = await fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: codifica({
          'form-name': 'suggerimenti',
          tipo,
          messaggio: messaggio.trim().slice(0, 4000),
          email: email.trim().slice(0, 200),
          // aiuta a riprodurre i bug: tipo di telefono/browser, niente di personale
          dispositivo: navigator.userAgent.slice(0, 300),
          'bot-field': '',
        }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setStato('inviato')
      setMessaggio('')
    } catch {
      setStato('errore')
      setErrore('Invio non riuscito. Controlla la connessione e riprova.')
    }
  }

  if (stato === 'inviato') {
    return (
      <div className="mt-2 space-y-3">
        <h2 className="px-1 text-2xl font-bold text-araldico-800">Suggerimenti</h2>
        <div className="rounded-2xl border border-araldico-100 bg-white p-6 text-center shadow-sm">
          <p className="text-lg font-semibold text-araldico-800">Grazie!</p>
          <p className="mt-1 text-sm text-araldico-600">
            Il tuo messaggio è arrivato. Ogni segnalazione aiuta a migliorare Trova Treni.
          </p>
          <button
            type="button"
            onClick={() => setStato('idle')}
            className="mt-4 rounded-lg border border-araldico-300 px-4 py-2 text-sm font-semibold text-araldico-700 hover:bg-araldico-50"
          >
            Scrivi un altro messaggio
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-2 space-y-3">
      <h2 className="px-1 text-2xl font-bold text-araldico-800">Suggerimenti</h2>
      <p className="px-1 text-sm text-araldico-600">
        Hai un&rsquo;idea per migliorare l&rsquo;app o hai trovato qualcosa che non funziona? Scrivimi qui.
      </p>

      <form onSubmit={invia} className="space-y-3 rounded-2xl border border-araldico-100 bg-white p-4 shadow-sm">
        {/* controllo segmentato in stile iOS */}
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-araldico-50 p-1">
          {TIPI.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTipo(t.id)}
              aria-pressed={tipo === t.id}
              className={`rounded-md py-1.5 text-sm font-medium transition ${
                tipo === t.id ? 'bg-white text-araldico-800 shadow-sm' : 'text-araldico-600'
              }`}
            >
              {t.etichetta}
            </button>
          ))}
        </div>

        <div>
          <label htmlFor="sugg-messaggio" className="mb-1 block text-sm font-medium text-araldico-700">
            {tipo === 'problema' ? 'Cosa è successo?' : 'Il tuo suggerimento'}
          </label>
          <textarea
            id="sugg-messaggio"
            value={messaggio}
            onChange={(e) => setMessaggio(e.target.value)}
            rows={6}
            maxLength={4000}
            placeholder={
              tipo === 'problema'
                ? 'Descrivi il problema: quale treno o tratta, cosa ti aspettavi e cosa hai visto.'
                : 'Scrivi pure la tua idea.'
            }
            className="w-full resize-y rounded-lg border border-araldico-100 bg-white px-3 py-2.5 text-araldico-900
                       focus:outline-none focus:ring-2 focus:ring-araldico-500"
          />
        </div>

        <div>
          <label htmlFor="sugg-email" className="mb-1 block text-sm font-medium text-araldico-700">
            La tua email <span className="font-normal text-araldico-500">(facoltativa, se vuoi una risposta)</span>
          </label>
          <input
            id="sugg-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-araldico-100 bg-white px-3 py-2.5 text-araldico-900
                       focus:outline-none focus:ring-2 focus:ring-araldico-500"
          />
        </div>

        {errore && <p className="text-sm text-red-700">{errore}</p>}

        <button
          type="submit"
          disabled={stato === 'invio'}
          className="w-full rounded-lg bg-araldico-700 px-4 py-3 font-semibold text-crema hover:bg-araldico-600 disabled:opacity-60"
        >
          {stato === 'invio' ? 'Invio in corso…' : 'Invia'}
        </button>
      </form>
    </div>
  )
}
