const CACHE = 'misa-v9'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['./', './index.html', './manifest.webmanifest'])))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))))
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  event.respondWith(
    fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone()
        caches.open(CACHE).then((cache) => cache.put(request, copy))
      }
      return response
    }).catch(async () => {
      const hit = await caches.match(request)
      return hit || caches.match('./index.html')
    }),
  )
})

self.addEventListener('push', (event) => {
  let body = ''
  try {
    const data = event.data?.json()
    body = typeof data?.body === 'string' ? data.body : ''
  } catch {
    body = event.data?.text() ?? ''
  }
  event.waitUntil(self.registration.showNotification('Misa diaria', {
    body,
    icon: './icon-192.png',
    lang: 'es',
  }))
})
