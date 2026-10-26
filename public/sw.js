// Red primero. Solo se guarda el armazón (la página y los assets con hash) para abrir sin conexión.
// Supabase va a otro origen y nunca pasa por aquí.
const CACHE = 'misa-v19'
const SHELL = './'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([SHELL, './manifest.webmanifest', './icon-192.png'])))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))))
  self.clients.claim()
})

function isAsset(url) {
  return url.pathname.includes('/assets/') || /\.(png|jpg|svg|webmanifest|woff2?)$/.test(url.pathname)
}

// Quita los assets de builds anteriores que la página actual ya no nombra.
async function prune(cache, html) {
  const keep = new Set([...html.matchAll(/assets\/[^"')\s]+/g)].map((match) => match[0]))
  for (const request of await cache.keys()) {
    const url = new URL(request.url)
    if (!url.pathname.includes('/assets/')) continue
    const name = url.pathname.slice(url.pathname.indexOf('assets/'))
    if (!keep.has(name) && !/\.(woff2?|png|jpg|svg)$/.test(name)) await cache.delete(request)
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request)
        if (response.ok) {
          const copy = response.clone()
          event.waitUntil((async () => {
            const cache = await caches.open(CACHE)
            const html = await copy.clone().text()
            await cache.put(SHELL, copy)
            await prune(cache, html)
          })())
        }
        return response
      } catch {
        const cache = await caches.open(CACHE)
        return (await cache.match(SHELL)) || Response.error()
      }
    })())
    return
  }

  if (!isAsset(url)) return
  event.respondWith((async () => {
    const cache = await caches.open(CACHE)
    try {
      const response = await fetch(request)
      if (response.ok) event.waitUntil(cache.put(request, response.clone()))
      return response
    } catch {
      return (await cache.match(request)) || Response.error()
    }
  })())
})

self.addEventListener('push', (event) => {
  let body = ''
  let title = 'Misa diaria'
  let lang = 'es'
  try {
    const data = event.data?.json()
    body = typeof data?.body === 'string' ? data.body : ''
    if (typeof data?.title === 'string' && data.title) title = data.title
    if (typeof data?.lang === 'string' && data.lang) lang = data.lang
  } catch {
    body = event.data?.text() ?? ''
  }
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag: 'aviso-tarde',
    lang,
    data: { url: `${self.registration.scope}calendario` },
  }))
})

// Tocar el aviso abre la app en el calendario, o enfoca la ventana que ya estaba abierta.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url || self.registration.scope
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const open = windows.find((client) => client.url.startsWith(self.registration.scope))
    // Si ya estaba abierta solo se enfoca: navegar recargaría y perdería lo que hubiera a medias.
    if (open) {
      await open.focus()
      return
    }
    await self.clients.openWindow(target)
  })())
})
