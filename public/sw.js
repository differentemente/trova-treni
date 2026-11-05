// Service worker di Trova Treni: serve SOLO per le notifiche della sveglia.
// Non mette in cache il sito, così ogni aggiornamento dell'app arriva subito.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (e) => {
  let d = {}
  try {
    d = e.data ? e.data.json() : {}
  } catch {
    d = { testo: e.data ? e.data.text() : '' }
  }
  e.waitUntil(
    self.registration.showNotification(d.titolo || 'Trova Treni', {
      body: d.testo || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: d.tag || 'trova-treni',
      renotify: true,
      requireInteraction: true,
      vibrate: [400, 150, 400, 150, 700],
      data: { url: d.url || '/' },
    })
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = e.notification.data?.url || '/'
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((finestre) => {
      for (const f of finestre) if ('focus' in f) return f.focus()
      return self.clients.openWindow(url)
    })
  )
})
