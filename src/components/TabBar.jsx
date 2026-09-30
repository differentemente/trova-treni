// Pulsanti circolari flottanti in basso a destra, sempre visibili anche durante
// lo scroll: la lente (ricerca per numero treno) sopra, il cuore (preferiti)
// sotto. Il pulsante della sezione aperta diventa una X per tornare alla
// ricerca. Rispettano la safe-area degli iPhone.

function IconaCuore() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="#ffffff" stroke="#ffffff" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
    </svg>
  )
}

function IconaLente() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5L20.5 20.5" />
    </svg>
  )
}

function IconaX() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

function Tondo({ onClick, label, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="relative flex h-14 w-14 items-center justify-center rounded-full bg-araldico-700
                 shadow-lg transition hover:bg-araldico-600 active:scale-90"
    >
      {children}
    </button>
  )
}

export default function TabBar({ vista, onApriPreferiti, onApriNumero, onChiudi, numPreferiti }) {
  const preferitiAperti = vista === 'preferiti'
  const numeroAperto = vista === 'numero'

  return (
    <div
      className="fixed z-40 flex flex-col items-center gap-3"
      style={{
        right: 'calc(env(safe-area-inset-right, 0px) + 1.25rem)',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.25rem)',
      }}
    >
      <Tondo
        onClick={numeroAperto ? onChiudi : onApriNumero}
        label={numeroAperto ? 'Chiudi ricerca per numero' : 'Cerca un treno per numero'}
      >
        {numeroAperto ? <IconaX /> : <IconaLente />}
      </Tondo>

      <Tondo
        onClick={preferitiAperti ? onChiudi : onApriPreferiti}
        label={preferitiAperti ? 'Chiudi preferiti' : 'Apri preferiti'}
      >
        {preferitiAperti ? <IconaX /> : <IconaCuore />}
        {/* pallino contatore preferiti, solo quando il cuore è visibile */}
        {!preferitiAperti && numPreferiti > 0 && (
          <span
            className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center
                       rounded-full bg-white px-1 text-[11px] font-bold text-araldico-700 shadow"
          >
            {numPreferiti}
          </span>
        )}
      </Tondo>
    </div>
  )
}
