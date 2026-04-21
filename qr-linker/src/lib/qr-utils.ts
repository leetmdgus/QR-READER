import jsQR from 'jsqr';

/**
 * Enhanced QR decoding with image preprocessing.
 * Attempts to decode using multiple image filters to handle blurry/small/low-contrast QR codes.
 */
export async function decodeQRWithEnhancement(imageSource: HTMLImageElement | string): Promise<string | null> {
  const img = await loadImage(imageSource);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  
  if (!ctx) return null;

  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);

  // 1. Initial Attempt
  let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let code = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: "dontInvert",
  });
  if (code) return code.data;

  // 2. Sharpening + High Contrast Boost
  applySharpen(ctx, canvas.width, canvas.height);
  applyGrayscaleAndContrast(ctx, canvas.width, canvas.height, 100); // Strong contrast (100/255 scale)
  imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  code = jsQR(imageData.data, imageData.width, imageData.height);
  if (code) return code.data;

  // 3. Extreme Contrast + Thresholding
  applyGrayscaleAndContrast(ctx, canvas.width, canvas.height, 150); // Even stronger
  applyThreshold(ctx, canvas.width, canvas.height, 128);
  imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  code = jsQR(imageData.data, imageData.width, imageData.height);
  if (code) return code.data;

  // 4. Try Upscaling if it's small or still not decoded
  const scale = 2;
  canvas.width = img.width * scale;
  canvas.height = img.height * scale;
  ctx.imageSmoothingEnabled = false; // Keep edges sharp
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  
  // Apply sharpening and contrast on upscaled image
  applySharpen(ctx, canvas.width, canvas.height);
  applyGrayscaleAndContrast(ctx, canvas.width, canvas.height, 120);
  imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  code = jsQR(imageData.data, imageData.width, imageData.height);
  if (code) return code.data;

  return null;
}

function loadImage(src: HTMLImageElement | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (typeof src !== 'string') {
        resolve(src);
        return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    img.onload = () => resolve(img);
    img.onerror = reject;
  });
}

function applySharpen(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const copy = new Uint8ClampedArray(data);
  
  // Sharpen kernel:
  //  0 -1  0
  // -1  5 -1
  //  0 -1  0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) { // RGB
        const center = copy[idx + c] * 5;
        const top = copy[((y - 1) * width + x) * 4 + c];
        const bottom = copy[((y + 1) * width + x) * 4 + c];
        const left = copy[(y * width + (x - 1)) * 4 + c];
        const right = copy[(y * width + (x + 1)) * 4 + c];
        
        const val = center - top - bottom - left - right;
        data[idx + c] = Math.min(255, Math.max(0, val));
      }
      // Alpha stays same
      data[idx + 3] = copy[idx + 3];
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

function applyGrayscaleAndContrast(ctx: CanvasRenderingContext2D, width: number, height: number, contrast: number) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

  for (let i = 0; i < data.length; i += 4) {
    // Grayscale using luminance formula
    const avg = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    
    // Contrast
    const newVal = factor * (avg - 128) + 128;
    
    data[i] = data[i + 1] = data[i + 2] = Math.min(255, Math.max(0, newVal));
  }
  ctx.putImageData(imageData, 0, 0);
}

function applyThreshold(ctx: CanvasRenderingContext2D, width: number, height: number, threshold: number) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
    const val = avg >= threshold ? 255 : 0;
    data[i] = data[i + 1] = data[i + 2] = val;
  }
  ctx.putImageData(imageData, 0, 0);
}
