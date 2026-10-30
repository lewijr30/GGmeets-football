function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Invalid image file data.'));
      }
    };
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(
        new Error('Could not decode image format. Please choose a JPG, PNG, or WebP screenshot.')
      );
    img.src = src;
  });
}

function renderCompressedJpeg(
  img: HTMLImageElement,
  maxDimension: number,
  quality: number
): string {
  let { width, height } = img;
  if (width > maxDimension || height > maxDimension) {
    if (width >= height) {
      height = Math.max(1, Math.round((height * maxDimension) / width));
      width = maxDimension;
    } else {
      width = Math.max(1, Math.round((width * maxDimension) / height));
      height = maxDimension;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Image processing is unavailable in this browser.');
  }
  // Fill white background so transparent PNG screenshots remain crisp and readable
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}

export async function compressImageFile(
  file: File,
  maxChars = 650000
): Promise<string> {
  const rawDataUrl = await readFileAsDataUrl(file);
  const img = await loadImageElement(rawDataUrl);

  const passes: Array<{ maxDim: number; quality: number }> = [
    { maxDim: 1150, quality: 0.78 },
    { maxDim: 960, quality: 0.68 },
    { maxDim: 780, quality: 0.58 },
    { maxDim: 620, quality: 0.5 },
    { maxDim: 480, quality: 0.42 },
  ];

  for (const pass of passes) {
    const candidate = renderCompressedJpeg(img, pass.maxDim, pass.quality);
    if (candidate.length <= maxChars) {
      return candidate;
    }
  }

  throw new Error('Screenshot is too large even after compression. Please crop or choose another image.');
}
