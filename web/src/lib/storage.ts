// Storage helpers for the private `files` bucket. Access is enforced by the
// bucket's RLS policies (editors only); the client reaches objects through
// short-lived signed URLs.

import { getSupabase } from './session'
import { isMock } from './data'
import { prepareUpload } from './compress'

const BUCKET = 'files'
const SIGNED_URL_TTL = 3600 // seconds

// Upload files one by one (compressing images), reporting progress.
// Returns the storage paths in input order.
export async function uploadFiles(
  childId: string,
  files: File[],
  onProgress?: (done: number, total: number) => void,
): Promise<string[]> {
  const paths: string[] = []
  let done = 0
  for (const file of files) {
    onProgress?.(done, files.length)
    if (isMock) {
      paths.push(`mock/${crypto.randomUUID()}-${file.name}`)
      done += 1
      continue
    }
    const prep = await prepareUpload(file)
    const path = `${childId}/${crypto.randomUUID()}.${prep.ext}`
    const { error } = await getSupabase()
      .storage.from(BUCKET)
      .upload(path, prep.blob, { contentType: prep.contentType })
    if (error) throw error
    paths.push(path)
    done += 1
  }
  onProgress?.(files.length, files.length)
  return paths
}

// Open a file via a signed URL (external browser tab in Telegram).
export async function openFile(path: string): Promise<void> {
  if (isMock || path.startsWith('mock/')) {
    alert('В демо-режиме файлы не открываются')
    return
  }
  const { data, error } = await getSupabase()
    .storage.from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL)
  if (error || !data) throw error ?? new Error('no signed url')
  window.open(data.signedUrl, '_blank')
}

// Best-effort removal of storage objects. A failure here should not block
// deleting the database record — orphans are cheap, broken UX is not.
export async function removeFiles(paths: string[]): Promise<void> {
  const real = paths.filter((p) => !p.startsWith('mock/'))
  if (isMock || real.length === 0) return
  const { error } = await getSupabase().storage.from(BUCKET).remove(real)
  if (error) console.warn('storage remove failed:', error.message)
}
