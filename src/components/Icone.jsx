// Icone della barra in basso, disegnate apposta nello stile delle tab bar di
// iOS: tratto sottile e arrotondato quando non selezionate, versione piena
// quando la scheda è attiva. (I simboli ufficiali Apple non si possono usare
// sui siti web, quindi sono originali.)

const tratto = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

// Trenino visto di fronte
export function IconaTreno({ attiva, className = 'h-7 w-7' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="5.5" y="2.75" width="13" height="14.5" rx="3.5" {...tratto} fill={attiva ? 'currentColor' : 'none'} />
      <path d="M8 6.5h8v4H8z" {...tratto} fill={attiva ? 'white' : 'none'} stroke={attiva ? 'white' : 'currentColor'} />
      <circle cx="8.75" cy="14" r="1" fill={attiva ? 'white' : 'currentColor'} />
      <circle cx="15.25" cy="14" r="1" fill={attiva ? 'white' : 'currentColor'} />
      <path d="M8.5 17.25 6.5 21.25M15.5 17.25l2 4M7.5 19.5h9" {...tratto} />
    </svg>
  )
}

// Tabellone di stazione appeso
export function IconaTabellone({ attiva, className = 'h-7 w-7' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M8 2.75v3.5M16 2.75v3.5" {...tratto} />
      <rect x="2.75" y="6.25" width="18.5" height="12" rx="2.5" {...tratto} fill={attiva ? 'currentColor' : 'none'} />
      <path
        d="M6 10h2.5M10.5 10H18M6 12.75h2.5M10.5 12.75H16M6 15.5h2.5M10.5 15.5H17"
        {...tratto}
        stroke={attiva ? 'white' : 'currentColor'}
        strokeWidth="1.5"
      />
    </svg>
  )
}

// Lente
export function IconaCerca({ attiva, className = 'h-7 w-7' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="10.75" cy="10.75" r="6.5" {...tratto} strokeWidth={attiva ? 2.6 : 1.9} />
      <path d="m15.75 15.75 4.75 4.75" {...tratto} strokeWidth={attiva ? 2.6 : 1.9} />
    </svg>
  )
}

// Cuore
export function IconaCuore({ attiva, className = 'h-7 w-7' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 20.25s-7.75-4.6-7.75-10.4A4.35 4.35 0 0 1 8.6 5.5c1.45 0 2.65.7 3.4 1.85.75-1.15 1.95-1.85 3.4-1.85a4.35 4.35 0 0 1 4.35 4.35c0 5.8-7.75 10.4-7.75 10.4z"
        {...tratto}
        fill={attiva ? 'currentColor' : 'none'}
      />
    </svg>
  )
}

// Fumetto (suggerimenti)
export function IconaSuggerimenti({ attiva, className = 'h-7 w-7' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M4.25 6.75a3 3 0 0 1 3-3h9.5a3 3 0 0 1 3 3v6.5a3 3 0 0 1-3 3H10l-4.25 3.5v-3.5h-.5a1 1 0 0 1-1-1z"
        {...tratto}
        fill={attiva ? 'currentColor' : 'none'}
      />
      <path d="M8.5 9h7M8.5 12h4.5" {...tratto} stroke={attiva ? 'white' : 'currentColor'} />
    </svg>
  )
}

// Sveglia (avvisami prima dell'arrivo)
export function IconaSveglia({ attiva, className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="13" r="7.25" {...tratto} fill={attiva ? 'currentColor' : 'none'} />
      <path d="M12 9.5V13l2.5 1.75" {...tratto} stroke={attiva ? 'white' : 'currentColor'} />
      <path d="M4 5.5 6.5 3.25M20 5.5l-2.5-2.25M7.5 19.75 6 21.25M16.5 19.75l1.5 1.5" {...tratto} />
    </svg>
  )
}
