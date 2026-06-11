# Treni IT

PWA per cercare soluzioni di viaggio A→B sui treni italiani (con prezzi e cambi).
Stack: Vite + React + Tailwind + Netlify Functions (proxy verso l'API LeFrecce di Trenitalia).

## Come funziona

Le Netlify Functions fanno da proxy verso l'API del sito di vendita Trenitalia:

- `cerca-stazione.js` → GET lefrecce.it `/website/locations/search` (autocomplete, nessuna auth)
- `cerca-viaggio.js` → 1) POST `/website/whitelist/enabled` per token CSRF + cookie,
  2) POST `/website/ticket/solutions` con `x-csrf-token` e `cookie`

Gli id stazione sono quelli LeFrecce (es. 830002430), diversi dai codici
ViaggiaTreno (S02430). L'autocomplete restituisce già quelli giusti.

## Setup (Windows, PowerShell)

```powershell
npm install
npm install -g netlify-cli   # solo la prima volta
netlify dev
```

Apri http://localhost:8888 — netlify dev fa girare Vite + le Functions insieme,
così le chiamate /api/* funzionano come in produzione.

## Deploy su Netlify

1. Push del repo su GitHub
2. netlify.com → "Add new site" → "Import an existing project"
3. Seleziona il repo: le impostazioni vengono lette da `netlify.toml`

## Se Trenitalia blocca gli IP Netlify (403 sistematici)

Piano B: ospita le due functions sul Raspberry (IP residenziale) dietro
Cloudflare Tunnel e punta il frontend a quell'URL.
