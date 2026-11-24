import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const packagePath = require.resolve('electron-vite/package.json')
const cli = resolve(dirname(packagePath), require(packagePath).bin['electron-vite'])

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
// Electron's package entry point installs the binary on demand. Electron-Vite expects it to exist.
env.ELECTRON_EXEC_PATH ||= require('electron')

const child = spawn(process.execPath, [cli, 'dev', ...process.argv.slice(2)], { env, stdio: 'inherit' })
const stop = () => child.kill()
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
try {
  process.exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code) => resolve(code ?? 1))
  })
} finally {
  process.off('SIGINT', stop)
  process.off('SIGTERM', stop)
}
