/**
 * Shrink a photo on the device before upload (free-tier discipline):
 * longest side ≤ 1280 px, JPEG, aiming for ≤ 150 KB.
 */
export async function compressImage(
  file: Blob,
  maxSide = 1280,
  targetBytes = 150_000,
): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let quality = 0.7;
  let blob = await toJpeg(canvas, quality);
  while (blob.size > targetBytes && quality > 0.4) {
    quality -= 0.1;
    blob = await toJpeg(canvas, quality);
  }
  return blob;
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not encode image'))),
      'image/jpeg',
      quality,
    ),
  );
}
