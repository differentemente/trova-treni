// Pulsante circolare flottante (FAB) in basso a destra, sempre visibile anche
// durante lo scroll. Colore dell'app (verde araldico), cuore bianco al centro.
// Cliccandolo apre la sezione preferiti; quando la sezione è aperta si
// trasforma in una X per chiudere. Rispetta la safe-area degli iPhone.

function IconaCuore() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-7 w-7"
      fill="#ffffff"
      stroke="#ffffff"
      strokeWidth="1.5"
      strokeLinejoin="round"
    >
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
    </svg>
  )
}

function IconaX() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-7 w-7"
      fill="none"
      stroke="#ffffff"
      strokeWidth="2.4"
      strokeLinecap="round"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

export default function TabBar({ vista, onApriPreferiti, onChiudi, numPreferiti }) {
  const attivo = vista === 'preferiti'

  return (
    <button
      type="button"
      onClick={attivo ? onChiudi : onApriPreferiti}
      aria-label={attivo ? 'Chiudi preferiti' : 'Apri preferiti'}
      className="fixed z-40 flex h-14 w-14 items-center justify-center rounded-full
                 bg-araldico-700 shadow-lg transition active:scale-90 hover:bg-araldico-600"
      style={{
        right: 'calc(env(safe-area-inset-right, 0px) + 1.25rem)',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.25rem)',
      }}
    >
      {attivo ? <IconaX /> : <IconaCuore />}
      {/* pallino contatore preferiti, solo quando il cuore è visibile */}
      {!attivo && numPreferiti > 0 && (
        <span
          className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center
                     justify-center rounded-full bg-white px-1 text-[11px] font-bold
                     text-araldico-700 shadow"
        >
          {numPreferiti}
        </span>
      )}
    </button>
  )
}
