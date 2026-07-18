// Client-side image compression before upload — the free tier is 1 GB, and
// phone photos are 3–8 MB each. Downscale to a sensible size and re-encode as
// JPEG; PDFs pass through untouched.

export interface PreparedUpload {
  blob: Blob
  contentType: string
  ext: string
}

const MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.82

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

export async function prepareUpload(file: File): Promise<PreparedUpload> {
  if (file.type === 'application/pdf') {
    return { blob: file, contentType: file.type, ext: 'pdf' }
  }
  if (!file.type.startsWith('image/')) {
    throw new Error(`Неподдерживаемый тип файла: ${file.type || file.name}`)
  }

  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  const jpeg = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Не удалось сжать изображение'))),
      'image/jpeg',
      JPEG_QUALITY,
    ),
  )

  // Re-encoding a small/efficient original can come out bigger — keep the
  // smaller of the two (the bucket's mime allowlist covers both).
  if (jpeg.size >= file.size && EXT_BY_MIME[file.type]) {
    return { blob: file, contentType: file.type, ext: EXT_BY_MIME[file.type] }
  }
  return { blob: jpeg, contentType: 'image/jpeg', ext: 'jpg' }
}
