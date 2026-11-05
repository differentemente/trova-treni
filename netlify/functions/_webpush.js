// Web Push senza librerie esterne, con il modulo crypto di Node.
// - firma VAPID (RFC 8292): JWT ES256 che identifica il server
// - cifratura del messaggio (RFC 8291, codifica aes128gcm di RFC 8188)
// Funziona con Apple (web.push.apple.com), Google/Chrome, Firefox ed Edge.

import crypto from 'node:crypto'

const b64u = (buf) => Buffer.from(buf).toString('base64url')
const daB64u = (s) => Buffer.from(String(s), 'base64url')
const hmac = (chiave, dati) => crypto.createHmac('sha256', chiave).update(dati).digest()

// Coppia di chiavi VAPID (P-256). `pubblica` va al browser, `jwk` resta sul server.
export function generaChiaviVapid() {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const jwk = privateKey.export({ format: 'jwk' })
  const pubblica = Buffer.concat([Buffer.from([4]), daB64u(jwk.x), daB64u(jwk.y)])
  return { pubblica: b64u(pubblica), jwk }
}

export function jwtVapid(endpoint, jwk, soggetto) {
  const testata = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))
  const corpo = b64u(
    JSON.stringify({
      aud: new URL(endpoint).origin,
      exp: Math.floor(Date.now() / 1000) + 12 * 3600,
      sub: soggetto,
    })
  )
  const dati = `${testata}.${corpo}`
  const chiave = crypto.createPrivateKey({ key: jwk, format: 'jwk' })
  const firma = crypto.sign('sha256', Buffer.from(dati), { key: chiave, dsaEncoding: 'ieee-p1363' })
  return `${dati}.${b64u(firma)}`
}

// Cifra il messaggio per un'iscrizione (chiavi p256dh e auth del browser)
export function cifraMessaggio(testo, p256dh, auth) {
  const pubBrowser = daB64u(p256dh)
  const segretoAuth = daB64u(auth)
  const ecdh = crypto.createECDH('prime256v1')
  ecdh.generateKeys()
  const pubServer = ecdh.getPublicKey()
  const segretoCondiviso = ecdh.computeSecret(pubBrowser)

  const prkChiave = hmac(segretoAuth, segretoCondiviso)
  const infoChiave = Buffer.concat([Buffer.from('WebPush: info\x00'), pubBrowser, pubServer])
  const ikm = hmac(prkChiave, Buffer.concat([infoChiave, Buffer.from([1])]))

  const sale = crypto.randomBytes(16)
  const prk = hmac(sale, ikm)
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\x00\x01')).subarray(0, 16)
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\x00\x01')).subarray(0, 12)

  const cifrario = crypto.createCipheriv('aes-128-gcm', cek, nonce)
  const chiaro = Buffer.concat([Buffer.from(testo, 'utf8'), Buffer.from([2])]) // 0x02 = ultimo record
  const cifrato = Buffer.concat([cifrario.update(chiaro), cifrario.final(), cifrario.getAuthTag()])

  const dimRecord = Buffer.alloc(4)
  dimRecord.writeUInt32BE(4096)
  return Buffer.concat([sale, dimRecord, Buffer.from([pubServer.length]), pubServer, cifrato])
}

// Invia una notifica. Restituisce { stato, scaduta } (scaduta = iscrizione da eliminare).
export async function inviaNotifica(iscrizione, dati, vapid, soggetto) {
  const corpo = cifraMessaggio(JSON.stringify(dati), iscrizione.keys.p256dh, iscrizione.keys.auth)
  const res = await fetch(iscrizione.endpoint, {
    method: 'POST',
    headers: {
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '900',
      Urgency: 'high',
      Authorization: `vapid t=${jwtVapid(iscrizione.endpoint, vapid.jwk, soggetto)}, k=${vapid.pubblica}`,
    },
    body: corpo,
  })
  return { stato: res.status, scaduta: res.status === 404 || res.status === 410 }
}

// Accetto solo i servizi push dei browser: il server non deve fare richieste
// verso indirizzi arbitrari indicati da chi chiama la funzione.
export function endpointValido(endpoint) {
  try {
    const u = new URL(endpoint)
    if (u.protocol !== 'https:') return false
    const h = u.hostname
    return (
      h === 'web.push.apple.com' ||
      h === 'fcm.googleapis.com' ||
      h === 'updates.push.services.mozilla.com' ||
      h.endsWith('.notify.windows.com') ||
      h.endsWith('.push.apple.com')
    )
  } catch {
    return false
  }
}
