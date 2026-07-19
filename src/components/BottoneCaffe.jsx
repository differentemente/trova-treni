import { useEffect, useState } from 'react'

// URL della pagina Ko-fi.
const KOFI_URL = 'https://ko-fi.com/nicolaperozeni'

function IconaCaffe({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h13v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8z" />
      <path d="M17 9h2.5a2.5 2.5 0 0 1 0 5H17" />
      <path d="M7 4c0 .8-.5 1.2-.5 2M10.5 4c0 .8-.5 1.2-.5 2M14 4c0 .8-.5 1.2-.5 2" />
    </svg>
  )
}

export default function BottoneCaffe() {
  const [aperto, setAperto] = useState(false)

  // chiudo con Esc
  useEffect(() => {
    if (!aperto) return
    const h = (e) => e.key === 'Escape' && setAperto(false)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [aperto])

  return (
    <>
      <button
        type="button"
        onClick={() => setAperto(true)}
        aria-label="Sostieni il progetto"
        className="flex h-10 w-10 items-center justify-center rounded-full
                   bg-araldico-50 text-araldico-700 transition
                   hover:bg-araldico-100 active:scale-90"
      >
        <IconaCaffe className="h-5 w-5" />
      </button>

      {aperto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setAperto(false)}
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}
        >
          <div
            className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setAperto(false)}
              aria-label="Chiudi"
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center
                         rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor"
                   strokeWidth="2.4" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>

            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-araldico-50 text-araldico-700">
              <IconaCaffe className="h-7 w-7" />
            </div>

            <h3 className="mb-2 text-lg font-bold text-araldico-800">Offrimi un caffè</h3>
            <p className="mb-4 text-sm leading-relaxed text-araldico-700">
              Trova Treni è un progetto personale e gratuito, senza pubblicità. Mantenerlo
              attivo ha piccoli costi di gestione e tanto tempo dedicato. Anche una donazione
              di pochi euro fa una grande differenza: aiuta a coprire le spese e a continuare
              a migliorare l&rsquo;app. Grazie di cuore per il supporto!
            </p>

            <a
              href={KOFI_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setAperto(false)}
              className="flex w-full items-center justify-center gap-2 rounded-xl
                         bg-araldico-700 px-4 py-3 font-semibold text-crema
                         hover:bg-araldico-600 active:scale-[0.99]"
            >
              <IconaCaffe className="h-5 w-5" />
              Sostieni su Ko-fi
            </a>
          </div>
        </div>
      )}
    </>
  )
}
