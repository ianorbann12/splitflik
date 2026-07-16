// Turn a picked image file into a small square data URL suitable for a profile
// picture — center-cropped, downscaled, and JPEG-compressed so it stays a few
// KB and can live directly in people.avatar_url (no storage bucket needed).
const DEFAULT_SIZE = 160;
const QUALITY = 0.82;

export async function fileToAvatarDataUrl(file: File, size = DEFAULT_SIZE): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    const edge = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - edge) / 2;
    const sy = (bitmap.height - edge) / 2;
    ctx.drawImage(bitmap, sx, sy, edge, edge, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', QUALITY);
  } finally {
    bitmap.close?.();
  }
}
