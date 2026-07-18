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

// ---------------------------------------------------------------------------
// `media` bucket — memory photos, displayed inline via signed URLs.
// Guests can read (bucket policy), only editors write.
// ---------------------------------------------------------------------------

const MEDIA_BUCKET = 'media'

export async function uploadMedia(
  childId: string,
  files: File[],
  onProgress?: (done: number, total: number) => void,
): Promise<string[]> {
  const paths: string[] = []
  let done = 0
  for (const file of files) {
    onProgress?.(done, files.length)
    if (isMock) {
      paths.push(`mock/${crypto.randomUUID()}.jpg`)
      done += 1
      continue
    }
    const prep = await prepareUpload(file)
    if (prep.contentType === 'application/pdf') {
      throw new Error('В «На память» можно загружать только фото')
    }
    const path = `${childId}/${crypto.randomUUID()}.${prep.ext}`
    const { error } = await getSupabase()
      .storage.from(MEDIA_BUCKET)
      .upload(path, prep.blob, { contentType: prep.contentType })
    if (error) throw error
    paths.push(path)
    done += 1
  }
  onProgress?.(files.length, files.length)
  return paths
}

// Signed-URL cache: grid thumbnails re-render often, and every signature is a
// network round-trip. URLs live 1h; refresh a few minutes early.
const mediaUrlCache = new Map<string, { url: string; expires: number }>()

export async function mediaUrl(path: string): Promise<string | null> {
  if (isMock || path.startsWith('mock/')) return null
  const hit = mediaUrlCache.get(path)
  if (hit && hit.expires > Date.now()) return hit.url
  const { data, error } = await getSupabase()
    .storage.from(MEDIA_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL)
  if (error || !data) {
    console.warn('mediaUrl failed:', error?.message)
    return null
  }
  mediaUrlCache.set(path, {
    url: data.signedUrl,
    expires: Date.now() + (SIGNED_URL_TTL - 300) * 1000,
  })
  return data.signedUrl
}

export async function removeMedia(paths: string[]): Promise<void> {
  const real = paths.filter((p) => !p.startsWith('mock/'))
  if (isMock || real.length === 0) return
  const { error } = await getSupabase().storage.from(MEDIA_BUCKET).remove(real)
  if (error) console.warn('media remove failed:', error.message)
}
