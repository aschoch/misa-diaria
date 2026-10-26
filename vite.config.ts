import { defineConfig, type Plugin } from 'vite'

// Solo un build contra Supabase local (pruebas) abre conexiones a 127.0.0.1.
const local = /127\.0\.0\.1|localhost/.test(process.env.VITE_SUPABASE_URL ?? '')

function csp(): Plugin {
  const content = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data:",
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co${local ? ' http://127.0.0.1:* http://localhost:*' : ''}`,
    "worker-src 'self'",
    "manifest-src 'self'",
  ].join('; ')
  return {
    name: 'csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${content}">`)
    },
  }
}

export default defineConfig({
  base: '/misa-diaria/',
  plugins: [csp()],
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
})
