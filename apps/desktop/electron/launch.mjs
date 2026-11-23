import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { createServer } from 'vite'

const require = createRequire(import.meta.url)
const executable = require('electron')
if (typeof executable !== 'string') {
  throw new Error('Electron did not provide an executable path.')
}

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.MATES_DESKTOP_DEV_URL

const server = process.argv.includes('--dev')
  ? await createServer({ server: { host: '127.0.0.1' } })
  : undefined

try {
  if (server) {
    await server.listen()
    const url = server.resolvedUrls?.local[0]
    if (!url) throw new Error('Vite did not provide a local renderer URL.')
    env.MATES_DESKTOP_DEV_URL = url
  }

  const child = spawn(executable, ['.'], { env, stdio: 'inherit' })
  const stop = () => child.kill()
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  try {
    process.exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)))
    })
  } finally {
    process.off('SIGINT', stop)
    process.off('SIGTERM', stop)
  }
} finally {
  await server?.close()
}
