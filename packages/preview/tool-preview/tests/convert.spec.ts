import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { canConvertPptx, convertPptxToPng } from '../src/convert.ts'

interface SpawnRec {
  emitter: EventEmitter
  cmd: string
  args: string[]
  killed: boolean
}
const spawns: SpawnRec[] = []
const spawnSyncResults = new Map<string, { status: number }>()
const spawnSyncThrows = new Set<string>()

vi.mock('node:child_process', () => ({
  spawnSync: (cmd: string) => {
    if (spawnSyncThrows.has(cmd)) throw new Error('ENOENT')
    return spawnSyncResults.get(cmd) ?? { status: 0 }
  },
  spawn: (cmd: string, args: string[]) => {
    const emitter = new EventEmitter()
    const rec: SpawnRec = { emitter, cmd, args, killed: false }
    ;(emitter as unknown as { kill: (sig: string) => void }).kill = () => { rec.killed = true; emitter.emit('close', null) }
    spawns.push(rec)
    return emitter as unknown as ReturnType<typeof import('node:child_process').spawn>
  },
}))

const written = new Map<string, Uint8Array>()
vi.mock('node:fs/promises', () => ({
  mkdtemp: async () => '/tmp/dsh-fake',
  writeFile: async (path: string, data: Uint8Array) => { written.set(path, data) },
  readFile: async () => new TextEncoder().encode('PNG'),
  rm: async () => { throw new Error('cleanup failed') },
}))

afterEach(() => {
  spawns.length = 0
  written.clear()
  spawnSyncResults.clear()
  spawnSyncThrows.clear()
  vi.restoreAllMocks()
})

async function spawnRec(cmd: string): Promise<SpawnRec> {
  for (let i = 0; i < 200; i += 1) {
    const rec = spawns.find(s => s.cmd === cmd)
    if (rec !== undefined) return rec
    await Promise.resolve()
  }
  throw new Error(`spawn "${cmd}" never started`)
}

async function settle(cmd: string, code: number): Promise<void> {
  ;(await spawnRec(cmd)).emitter.emit('close', code)
}

describe('canConvertPptx', () => {
  it('is true when both binaries run', () => {
    expect(canConvertPptx()).toBe(true)
  })

  it('is false when a binary is absent', () => {
    spawnSyncResults.set('soffice', { status: 1 })
    expect(canConvertPptx()).toBe(false)
  })

  it('is false when a binary is not on PATH', () => {
    spawnSyncThrows.add('soffice')
    expect(canConvertPptx()).toBe(false)
  })
})

describe('convertPptxToPng', () => {
  it('returns PNG bytes when the conversion stack succeeds', async () => {
    const promise = convertPptxToPng(new Uint8Array([1]), undefined)
    await settle('soffice', 0)
    await settle('pdftoppm', 0)
    const png = await promise
    expect(Buffer.from(png as Uint8Array).toString('utf8')).toBe('PNG')
    expect(spawns.map(s => s.cmd)).toEqual(['soffice', 'pdftoppm'])
    expect(written.has('/tmp/dsh-fake/in.pptx')).toBe(true)
  })

  it('returns undefined without the conversion stack', async () => {
    spawnSyncResults.set('soffice', { status: 1 })
    await expect(convertPptxToPng(new Uint8Array([1]))).resolves.toBeUndefined()
  })

  it('returns undefined when soffice fails', async () => {
    const promise = convertPptxToPng(new Uint8Array([1]))
    await settle('soffice', 1)
    await expect(promise).resolves.toBeUndefined()
  })

  it('returns undefined when pdftoppm fails', async () => {
    const promise = convertPptxToPng(new Uint8Array([1]))
    await settle('soffice', 0)
    await settle('pdftoppm', 1)
    await expect(promise).resolves.toBeUndefined()
  })

  it('returns undefined when the child errors', async () => {
    const promise = convertPptxToPng(new Uint8Array([1]))
    const rec = await spawnRec('soffice')
    rec.emitter.emit('error', new Error('ENOENT'))
    await expect(promise).resolves.toBeUndefined()
  })

  it('kills the child when the caller aborts', async () => {
    const controller = new AbortController()
    const promise = convertPptxToPng(new Uint8Array([1]), controller.signal)
    await spawnRec('soffice')
    controller.abort()
    const rec = await spawnRec('soffice')
    expect(rec.killed).toBe(true)
    await expect(promise).resolves.toBeUndefined()
  })
})
