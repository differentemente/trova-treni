// netlify/functions/cerca-viaggio.js
// Ricerca soluzioni A→B via API LeFrecce (stesso meccanismo di treninoo-api):
// 1) POST /whitelist/enabled per ottenere token CSRF + cookie di sessione
// 2) POST /ticket/solutions con x-csrf-token + cookie
//
// GET /api/cerca-viaggio?da=830002430&a=830000219&quando=2026-06-12T08:30
//     [&soloFrecce=1] [&soloRegionali=1] [&soloIntercity=1] [&diretti=1] [&offset=0]
//
// "da" e "a" sono gli id LeFrecce restituiti da /api/cerca-stazione.

const BASE = 'https://www.lefrecce.it/Channels.Website.BFF.WEB/website'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

export async function handler(event) {
  const p = event.queryStringParameters || {}
  const { da, a, quando } = p

  if (!da || !a || !quando) {
    return json(400, { error: 'parametri richiesti: da, a, quando' })
  }

  // LeFrecce vuole un ISO locale senza offset: "2026-06-12T08:30:00.000"
  const departureTime = normalizeDate(quando)
  if (!departureTime) return json(400, { error: 'formato data non valido' })

  try {
    // --- Step 1: token CSRF + cookie ---
    const auth = await getAuth()

    // --- Step 2: ricerca soluzioni ---
    const body = {
      departureLocationId: Number(da),
      arrivalLocationId: Number(a),
      departureTime,
      adults: 1,
      children: 0,
      criteria: {
        frecceOnly: p.soloFrecce === '1',
        regionalOnly: p.soloRegionali === '1',
        intercityOnly: p.soloIntercity === '1',
        noChanges: p.diretti === '1',
        order: 'DEPARTURE_DATE',
        offset: Number(p.offset || 0),
        limit: 10,
      },
      advancedSearchRequest: {
        bestFare: false,
        bikeFilter: false,
      },
    }

    const res = await fetch(`${BASE}/ticket/solutions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': UA,
        ...(auth.token ? { 'x-csrf-token': auth.token } : {}),
        ...(auth.cookie ? { cookie: auth.cookie } : {}),
      },
      body: JSON.stringify(body),
    })

    // LeFrecce risponde 400 quando non ci sono soluzioni (es. tratta inesistente)
    if (res.status === 400) return json(200, { soluzioni: [] })
    if (!res.ok) return json(res.status, { error: 'upstream error' })

    const data = await res.json()

    const soluzioni = (data.solutions || []).map(({ solution }) => {
      const treni = (solution.nodes || []).map((n) => {
        const categoria = n.train?.trainCategory ?? n.train?.acronym ?? ''
        return {
          da: n.origin,
          a: n.destination,
          partenza: n.departureTime,
          arrivo: n.arrivalTime,
          categoria,
          // numero treno: serve a ViaggiaTreno per lo stato in tempo reale
          numero: estraiNumero(n.train),
          // true se il segmento è un autobus (sostitutivo o integrato):
          // questi non sono tracciati da ViaggiaTreno, quindi niente stato realtime
          isBus: rilevaBus(n),
        }
      })
      return {
        partenza: solution.origin,
        arrivo: solution.destination,
        orarioPartenza: solution.departureTime, // ISO con offset
        orarioArrivo: solution.arrivalTime,
        durata: solution.duration ?? null,
        prezzo: solution.price ? solution.price.amount : null,
        valuta: solution.price ? solution.price.currency : null,
        treni,
        // la soluzione contiene almeno un bus? (per nascondere il cuore in lista)
        contieneBus: treni.some((t) => t.isBus),
        cambi: Math.max((solution.nodes || []).length - 1, 0),
      }
    })

    return json(200, { soluzioni })
  } catch (e) {
    return json(500, { error: e.message })
  }
}

// POST /whitelist/enabled → token CSRF (nel body) + cookie di sessione (set-cookie)
async function getAuth() {
  const res = await fetch(`${BASE}/whitelist/enabled`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': UA,
    },
    body: '{}',
  })

  let token
  try {
    const data = await res.clone().json()
    token =
      (typeof data?.token === 'string' && data.token) ||
      (typeof data?.csrfToken === 'string' && data.csrfToken) ||
      undefined
  } catch {
    const text = await res.text()
    if (text && text.length > 0 && text.length < 500) token = text
  }

  // fetch nativo: getSetCookie() se disponibile, altrimenti header singolo
  let cookies = []
  if (typeof res.headers.getSetCookie === 'function') {
    cookies = res.headers.getSetCookie()
  } else {
    const sc = res.headers.get('set-cookie')
    if (sc) cookies = [sc]
  }
  const cookie = cookies.map((c) => c.split(';')[0]).join('; ') || undefined

  return { token, cookie }
}

// Il numero treno in LeFrecce può stare in più campi a seconda del tipo.
// Provo i più comuni e tengo solo le cifre.
function estraiNumero(train) {
  if (!train) return ''
  const raw =
    train.name ?? train.trainNumber ?? train.number ?? train.code ?? train.acronym ?? ''
  const m = String(raw).match(/\d{3,5}/)
  return m ? m[0] : String(raw)
}

// Riconosce se un segmento è un autobus (sostitutivo o servizio integrato su
// gomma). LeFrecce non usa un campo unico coerente, quindi cerco parole chiave
// nei vari campi testuali del mezzo e in eventuali flag di tipo trasporto.
function rilevaBus(n) {
  const t = n?.train || {}
  // campi testuali dove può comparire l'indicazione del mezzo
  const testi = [
    t.trainCategory,
    t.acronym,
    t.name,
    t.description,
    t.denomination,
    n.transportMean,
    n.transportMode,
    n.mean,
  ]
    .filter(Boolean)
    .join(' ')
    .toUpperCase()

  // parole chiave che indicano gomma (IT/EN)
  if (/\b(BUS|AUTOBUS|AUTOCORSA|AUTOSOSTITUTIVO|PULLMAN|COACH|GOMMA)\b/.test(testi)) return true
  // alcuni feed usano un codice mezzo esplicito
  const mode = String(n.transportMode || n.transportMean || '').toUpperCase()
  if (mode === 'BUS' || mode === 'COACH') return true
  return false
}

function normalizeDate(quando) {
  // accetta "2026-06-12T08:30" o "2026-06-12 08:30"
  const m = String(quando).match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/)
  if (!m) return null
  return `${m[1]}T${m[2]}:00.000`
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}
