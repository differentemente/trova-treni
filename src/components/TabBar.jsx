import { IconaTreno, IconaTabellone, IconaCerca, IconaCuore, IconaSuggerimenti } from './Icone'

// Barra in basso in stile iOS, con 5 schede. Scorrendo verso il basso scivola
// fuori dallo schermo, scorrendo verso l'alto rientra (vedi `visibile`).
// Rispetta la safe-area degli iPhone (barra home).

export const SCHEDE = [
  { id: 'numero', etichetta: 'Cerca n. treno', Icona: IconaTreno },
  { id: 'tabellone', etichetta: 'Tabellone', Icona: IconaTabellone },
  { id: 'ricerca', etichetta: 'Cerca', Icona: IconaCerca },
  { id: 'mio', etichetta: 'Il mio treno', Icona: IconaCuore },
  { id: 'suggerimenti', etichetta: 'Suggerimenti', Icona: IconaSuggerimenti },
]

export default function TabBar({ vista, onCambia, numPreferiti, visibile }) {
  return (
    <nav className={`barra-tab ${visibile ? '' : 'barra-tab-nascosta'}`} aria-label="Sezioni dell'app">
      <div className="mx-auto grid max-w-xl grid-cols-5">
        {SCHEDE.map(({ id, etichetta, Icona }) => {
          const attiva = vista === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => onCambia(id)}
              aria-current={attiva ? 'page' : undefined}
              className={`barra-tab-voce ${attiva ? 'barra-tab-attiva' : ''}`}
            >
              <span className="relative">
                <Icona attiva={attiva} />
                {id === 'mio' && numPreferiti > 0 && (
                  <span className="barra-tab-badge">{numPreferiti}</span>
                )}
              </span>
              <span className="barra-tab-etichetta">{etichetta}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
