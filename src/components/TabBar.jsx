// Barra fissa in basso, sempre visibile (anche durante lo scroll), colore
// dell'app (verde araldico). Al centro un cuore bianco che apre/chiude la
// vista preferiti. Si adatta a tutti i dispositivi e rispetta la safe-area
// degli iPhone (notch/barra home) via env(safe-area-inset-bottom).

function IconaCuore({ pieno }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-7 w-7"
      fill={pieno ? '#ffffff' : 'none'}
      stroke="#ffffff"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
    </svg>
  )
}

export default function TabBar({ vista, onApriPreferiti, onChiudi, numPreferiti }) {
  const attivo = vista === 'preferiti'

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 bg-araldico-700 shadow-[0_-2px_12px_rgba(0,0,0,0.15)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="mx-auto flex h-16 max-w-xl items-center justify-center">
        <button
          type="button"
          onClick={attivo ? onChiudi : onApriPreferiti}
          aria-label={attivo ? 'Torna alla ricerca' : 'Vai ai preferiti'}
          className="relative flex flex-col items-center justify-center gap-0.5
                     px-8 py-2 transition active:scale-95"
        >
          <span className="relative">
            <IconaCuore pieno={attivo} />
            {/* pallino contatore preferiti */}
            {numPreferiti > 0 && (
              <span
                className="absolute -right-2 -top-1 flex h-4 min-w-[1rem] items-center
                           justify-center rounded-full bg-white px-1 text-[10px]
                           font-bold text-araldico-700"
              >
                {numPreferiti}
              </span>
            )}
          </span>
          <span className="text-[11px] font-medium text-crema">
            {attivo ? 'Chiudi' : 'Preferiti'}
          </span>
        </button>
      </div>
    </nav>
  )
}
