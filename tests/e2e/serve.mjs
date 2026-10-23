import { spawn } from 'node:child_process'
import { prepareDatabase, startGateway, anonKey } from './gateway.mjs'

await prepareDatabase()
await startGateway()

const vite = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', '5173'], {
  cwd: new URL('../..', import.meta.url).pathname,
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
    VITE_SUPABASE_ANON_KEY: anonKey,
    VITE_E2E: 'true',
  },
})

vite.on('exit', (code) => process.exit(code ?? 0))
process.on('SIGTERM', () => vite.kill('SIGTERM'))
process.on('SIGINT', () => vite.kill('SIGINT'))
