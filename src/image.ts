export type LoadedImage = {
  src: string
  name: string
  width: number
  height: number
  mimeType: string
}

export const loadImageFile = async (file: File): Promise<LoadedImage> => {
  const normalizedName = normalizeFilename(file.name)
  const extension = normalizedName.split('.').pop()?.toLowerCase()

  let blob: Blob = file
  let mimeType = file.type || guessMimeType(extension)
  const isHeicLike =
    extension === 'heic' || extension === 'heif' || mimeType === 'image/heic' || mimeType === 'image/heif'

  if (isHeicLike) {
    const nativeHeicSupported = await canDecodeBlob(file)

    if (!nativeHeicSupported) {
      const converted = await convertHeicToPng(file)
      blob = converted
      mimeType = 'image/png'
    }
  }

  const src = URL.createObjectURL(blob)
  const dimensions = await getDimensions(src)

  return {
    src,
    name: normalizedName.replace(/\.(heic|heif)$/i, '.png'),
    width: dimensions.width,
    height: dimensions.height,
    mimeType,
  }
}

export const releaseImage = (src: string) => {
  URL.revokeObjectURL(src)
}

export const getImageElement = async (src: string): Promise<HTMLImageElement> => {
  const image = new Image()
  image.decoding = 'async'

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('Unable to decode image'))
    image.src = src
  })

  try {
    await image.decode()
  } catch {
    if (!image.complete || image.naturalWidth === 0 || image.naturalHeight === 0) {
      throw new Error('Unable to decode image')
    }
  }

  return image
}

const getDimensions = async (src: string) => {
  const image = await getImageElement(src)
  return {
    width: image.naturalWidth,
    height: image.naturalHeight,
  }
}

const normalizeFilename = (name: string) => name.trim() || 'image'

const canDecodeBlob = async (blob: Blob) => {
  const src = URL.createObjectURL(blob)
  try {
    await getImageElement(src)
    return true
  } catch {
    return false
  } finally {
    URL.revokeObjectURL(src)
  }
}

const convertHeicToPng = async (file: File): Promise<Blob> => {
  const module = await import('heic-to')
  const heicToFn =
    (module as unknown as { heicTo?: unknown; default?: unknown }).heicTo ??
    (module as unknown as { heicTo?: unknown; default?: unknown }).default

  if (typeof heicToFn !== 'function') {
    throw new Error('HEIC converter initialization failed')
  }

  const converted = (await heicToFn({
    blob: file,
    type: 'image/png',
    quality: 0.92,
  })) as Blob | Blob[]

  const result = Array.isArray(converted) ? converted[0] : converted
  if (!result) {
    throw new Error('HEIC conversion returned an empty result')
  }

  return result
}

const guessMimeType = (extension?: string) => {
  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'webp':
      return 'image/webp'
    case 'bmp':
      return 'image/bmp'
    case 'gif':
      return 'image/gif'
    case 'heic':
    case 'heif':
      return 'image/heic'
    default:
      return 'application/octet-stream'
  }
}