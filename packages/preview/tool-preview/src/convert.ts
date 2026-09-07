/** PPT-to-PNG thumbnail conversion via LibreOffice + poppler, with graceful degradation. */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PPTX_MEDIA_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

/** Whether a LibreOffice-like binary and poppler are available on the host. */
export function canConvertPptx(): boolean {
  return runs('soffice', ['--version']) && runs('pdftoppm', ['-v'])
}

/**
 * Convert one PPTX's bytes to a single-page PNG thumbnail (the slide image).
 * @param data - the PPTX bytes read from the workspace.
 * @param signal - caller lifetime; abort kills the child conversion.
 * @returns the PNG bytes, or undefined when the conversion stack is absent or fails.
 */
export async function convertPptxToPng(data: Uint8Array, signal?: AbortSignal): Promise<Uint8Array | undefined> {
  if (!canConvertPptx()) return undefined
  const dir = await mkdtemp(join(tmpdir(), 'dsh-pptx-'))
  try {
    const inPptx = join(dir, 'in.pptx')
    const inPdf = join(dir, 'in.pdf')
    await writeFile(inPptx, data)
    await run('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', dir, inPptx], signal)
    await run('pdftoppm', ['-png', '-singlefile', '-r', '96', inPdf, join(dir, 'page')], signal)
    return await readFile(join(dir, 'page.png'))
  } catch {
    return undefined
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

/** True when `bin` runs and exits with code 0 for `args`; false when not on PATH / throws. */
function runs(bin: string, args: readonly string[]): boolean {
  try {
    const result = spawnSync(bin, args, { stdio: 'ignore' })
    return result.status === 0
  } catch {
    return false
  }
}

function run(cmd: string, args: readonly string[], signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'ignore' })
    const onAbort = () => { child.kill('SIGKILL') }
    signal?.addEventListener('abort', onAbort, { once: true })
    child.once('error', (error) => { signal?.removeEventListener('abort', onAbort); reject(error) })
    child.once('close', (code) => {
      signal?.removeEventListener('abort', onAbort)
      if (code === 0) resolve()
      else reject(new Error(`${cmd} exited ${String(code)}`))
    })
  })
}

export { PPTX_MEDIA_TYPE }
