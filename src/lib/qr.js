import jsQR from 'jsqr'

/** QR scanning is entirely local, including video frames and uploaded images. */
const MAX_FRAME_DIMENSION = 1280

function scanCanvas(canvas) {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Your browser could not create a 2D drawing context.')
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  const result = jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' })
  return result?.data || null
}

export function scanVideoFrame(video, canvas) {
  if (!video || !video.videoWidth || !video.videoHeight) return null
  const scale = Math.min(1, MAX_FRAME_DIMENSION / Math.max(video.videoWidth, video.videoHeight))
  canvas.width = Math.max(1, Math.floor(video.videoWidth * scale))
  canvas.height = Math.max(1, Math.floor(video.videoHeight * scale))
  canvas.getContext('2d', { willReadFrequently: true }).drawImage(video, 0, 0, canvas.width, canvas.height)
  return scanCanvas(canvas)
}

export async function scanImage(file) {
  if (!file?.type?.startsWith('image/')) throw new Error('Please choose a PNG, JPG, WebP, or other supported image.')
  if (file.size > 12 * 1024 * 1024) throw new Error('Image is too large. Use an image smaller than 12 MB.')
  let bitmap = null
  let image = null
  let objectURL = null
  try {
    if (typeof createImageBitmap === 'function') {
      bitmap = await createImageBitmap(file)
    } else {
      objectURL = URL.createObjectURL(file)
      image = new Image()
      image.src = objectURL
      await new Promise((resolve, reject) => {
        image.onload = resolve
        image.onerror = () => reject(new Error('The browser could not open this image.'))
      })
    }
    const width = bitmap?.width || image?.naturalWidth
    const height = bitmap?.height || image?.naturalHeight
    if (!width || !height) throw new Error('The image has no readable pixels.')
    const scale = Math.min(1, 2000 / Math.max(width, height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.floor(width * scale))
    canvas.height = Math.max(1, Math.floor(height * scale))
    canvas.getContext('2d', { willReadFrequently: true }).drawImage(bitmap || image, 0, 0, canvas.width, canvas.height)
    // Scan at native-ish resolution; retry a smaller frame for enormous images.
    let result = scanCanvas(canvas)
    if (!result && Math.max(canvas.width, canvas.height) > 1000) {
      const reduced = document.createElement('canvas')
      const ratio = 1000 / Math.max(canvas.width, canvas.height)
      reduced.width = Math.round(canvas.width * ratio)
      reduced.height = Math.round(canvas.height * ratio)
      reduced.getContext('2d', { willReadFrequently: true }).drawImage(canvas, 0, 0, reduced.width, reduced.height)
      result = scanCanvas(reduced)
    }
    return result
  } finally {
    bitmap?.close?.()
    if (objectURL) URL.revokeObjectURL(objectURL)
  }
}
