export interface PreparedImage {
  blob: Blob
  width: number
  height: number
  ext: string
}

function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file)
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片读取失败'))
    }
    img.src = url
  })
}

export async function prepareImage(
  file: File,
  options: { maxDim?: number; quality?: number; keepType?: boolean } = {},
): Promise<PreparedImage> {
  const maxDim = options.maxDim ?? 4096
  const quality = options.quality ?? 0.9
  const bitmap = await loadBitmap(file)
  const width = 'width' in bitmap ? bitmap.width : 0
  const height = 'height' in bitmap ? bitmap.height : 0
  if (!width || !height) throw new Error('图片尺寸无效')
  const scale = Math.min(1, maxDim / Math.max(width, height))
  const targetW = Math.max(1, Math.round(width * scale))
  const targetH = Math.max(1, Math.round(height * scale))
  const needsResize = scale < 1
  const keepOriginal = !needsResize && (file.size < 6 * 1024 * 1024 || options.keepType)
  if (keepOriginal) {
    const ext = file.type.includes('png')
      ? 'png'
      : file.type.includes('webp')
        ? 'webp'
        : file.type.includes('gif')
          ? 'gif'
          : 'jpg'
    return { blob: file, width, height, ext }
  }
  const canvas = document.createElement('canvas')
  canvas.width = targetW
  canvas.height = targetH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('浏览器不支持图片处理')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, targetW, targetH)
  if ('close' in bitmap) bitmap.close()
  const keepPng = options.keepType && file.type.includes('png')
  const type = keepPng ? 'image/png' : 'image/jpeg'
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('图片压缩失败'))),
      type,
      quality,
    )
  })
  return { blob, width: targetW, height: targetH, ext: keepPng ? 'png' : 'jpg' }
}
