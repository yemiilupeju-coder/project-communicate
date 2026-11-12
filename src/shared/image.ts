/**
 * Prepares a photo an adult picked: shrinks it to button size and re-encodes
 * it as JPEG. Re-encoding also drops the photo's metadata (such as where it
 * was taken), so that never ends up stored with a student's words.
 */
export const PHOTO_MAX_SIDE = 320;

export async function preparePhoto(file: Blob): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose a photo.");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser can't prepare photos.");
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    if (!blob) throw new Error("This photo couldn't be prepared.");
    return blob;
  } finally {
    bitmap.close();
  }
}
