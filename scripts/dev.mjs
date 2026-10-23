import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const isWin = process.platform === 'win32'
const bin = (name) => path.join(root, 'node_modules', '.bin', isWin ? `${name}.cmd` : name)

const children = []
let closing = false

function run(label, command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: isWin,
  })
  children.push(child)
  const prefix = `[${label}] `
  const pipe = (stream, target) => {
    let buffer = ''
    stream.on('data', (chunk) => {
      buffer += chunk.toString()
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() || ''
      for (const line of lines) target.write(prefix + line + '\n')
    })
  }
  pipe(child.stdout, process.stdout)
  pipe(child.stderr, process.stderr)
  child.on('exit', (code) => {
    if (closing) return
    console.error(`${prefix}进程退出 (${code})`)
    shutdown(code ?? 1)
  })
  return child
}

function shutdown(code = 0) {
  if (closing) return
  closing = true
  for (const child of children) {
    try {
      if (isWin) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
      else child.kill('SIGTERM')
    } catch {}
  }
  setTimeout(() => process.exit(code), 300)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

run('server', process.execPath, [path.join(root, 'server', 'index.js')], {
  ZHIZHANG_NO_OPEN: '1',
})
run('vite', bin('vite'), ['--host', '--port', '5173'])
