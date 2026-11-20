/**
 * Reduce una foto del celular a JPEG (lado mayor ≤ 1600 px) antes de subirla.
 * Las fotos de celular suelen pesar más de 8 MB y el iPhone las toma en HEIC: el navegador
 * las decodifica y aquí se convierten, así la API siempre recibe un JPEG liviano.
 */
export async function shrinkPhoto(file: File, maxSide = 1600, quality = 0.8): Promise<File> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch {
    return file; // si el navegador no puede decodificarla, se envía la original y la API la valida
  }
}
