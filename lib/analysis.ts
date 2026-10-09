export type ImageStats = {
  range: number;
  darkShare: number;
  lightShare: number;
  coverage: number;
  centerX: number;
  centerY: number;
  borderShare: number;
  edgeDensity: number;
};
export type Note = {
  area: 'Values' | 'Composition' | 'Reference' | 'Observation';
  title: string;
  body: string;
  kind: 'focus' | 'notice' | 'positive';
};
export type Review = {
  notes: Note[];
  exercise: string;
  summary: string;
  stats: ImageStats;
  referenceStats?: ImageStats;
  createdAt: number;
};

/** Dark-mark measurements for well-lit, front-facing artwork. Not semantic AI. */
export function measurePixels(pixels: Uint8ClampedArray, width: number, height: number): ImageStats {
  if (width < 2 || height < 2 || pixels.length !== width * height * 4) throw new Error('Invalid image dimensions.');
  const count = width * height;
  const gray = new Float64Array(count);
  const histogram = new Uint32Array(256);
  let dark = 0, light = 0;
  for (let i = 0; i < count; i++) {
    const alpha = pixels[i * 4 + 3] / 255;
    const value = Math.round((pixels[i * 4] * .2126 + pixels[i * 4 + 1] * .7152 + pixels[i * 4 + 2] * .0722) * alpha + 255 * (1 - alpha));
    gray[i] = value; histogram[value]++;
    if (value < 85) dark++;
    if (value > 215) light++;
  }
  const quantile = (q: number) => {
    let accumulated = 0;
    for (let i = 0; i < 256; i++) {
      accumulated += histogram[i];
      if (accumulated >= Math.max(1, count * q)) return i;
    }
    return 255;
  };
  const threshold = Math.max(25, quantile(.9) - 45);
  let marked = 0, mass = 0, xMass = 0, yMass = 0, border = 0, edges = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = gray[y * width + x];
      if (value < threshold) {
        marked++;
        const weight = (threshold - value) / 255;
        mass += weight; xMass += weight * x / (width - 1); yMass += weight * y / (height - 1);
        if (x < width * .045 || x > width * .955 || y < height * .045 || y > height * .955) border++;
      }
      if (x > 0 && y > 0 && Math.abs(value - gray[y * width + x - 1]) + Math.abs(value - gray[(y - 1) * width + x]) > 65) edges++;
    }
  }
  return {
    range: (quantile(.995) - quantile(.005)) / 255,
    darkShare: dark / count,
    lightShare: light / count,
    coverage: marked / count,
    centerX: mass ? xMass / mass : .5,
    centerY: mass ? yMass / mass : .5,
    borderShare: marked ? border / marked : 0,
    edgeDensity: edges / count,
  };
}

export function buildReview(stats: ImageStats, referenceStats?: ImageStats): Review {
  const notes: Note[] = [];
  let exercise = 'Squint at your drawing. Find the lightest light and darkest dark, then choose one small area where you can make the difference clearer.';
  let summary = 'A fresh perspective on your marks.';
  if (stats.range < .12 && stats.coverage < .025) {
    notes.push({ area: 'Observation', kind: 'notice', title: 'The marks are very faint.', body: 'There is little tonal variation in this frame. Check the lighting and fill the frame with your paper. If this is an early sketch, keep building the main shapes.' });
    exercise = 'Make sure all four corners of your paper are visible, move your hand out of the frame, and lay in a few clear construction lines.';
    summary = 'Let’s get a clearer look at your drawing.';
    notes.push({ area: 'Composition', kind: 'notice', title: 'Frame the whole page.', body: 'Keep the camera straight above the paper. Leave a small, even margin around the page so the desk and surrounding shadows do not dominate the measurements.' });
    if (referenceStats) notes.push({ area: 'Reference', kind: 'notice', title: 'Build the main shapes first.', body: 'There are not enough clear marks for a useful comparison yet. Look at the biggest shapes in your reference and lightly establish their placement.' });
    return { notes, exercise, summary, stats, referenceStats, createdAt: Date.now() };
  } else if (stats.range < .48) {
    notes.push({ area: 'Values', kind: 'focus', title: 'Explore a wider value range.', body: `The measured tonal range is ${Math.round(stats.range * 100)}%. If depth is your goal, gradually strengthen one shadow while keeping your lightest area untouched.` });
  } else {
    notes.push({ area: 'Values', kind: 'positive', title: 'You have a clear tonal range.', body: `This image spans ${Math.round(stats.range * 100)}% of the grayscale range. Look at the transitions between light and dark; a softer middle tone can help a rounded form feel continuous.` });
  }

  if (stats.borderShare > .17) {
    notes.push({ area: 'Composition', kind: 'notice', title: 'Check the edges of your frame.', body: 'A noticeable share of the darker marks sits near the image edges. Make sure the whole drawing is visible. If the crop is intentional, consider where shapes enter and leave the page.' });
  } else if (Math.abs(stats.centerX - .5) > .14 || Math.abs(stats.centerY - .5) > .17) {
    const direction = Math.abs(stats.centerX - .5) > Math.abs(stats.centerY - .5) ? (stats.centerX < .5 ? 'left' : 'right') : (stats.centerY < .5 ? 'top' : 'bottom');
    notes.push({ area: 'Composition', kind: 'notice', title: `Visual weight leans ${direction}.`, body: 'The darker areas pull attention toward that side of the image. Check the space around your subject and decide whether this balance is the one you want.' });
  } else {
    notes.push({ area: 'Composition', kind: 'positive', title: 'Your visual weight is centered.', body: 'The darker marks are distributed around the middle of the image. Compare the negative spaces on either side to see whether the placement supports your subject.' });
  }

  if (referenceStats) {
    const rangeDiff = referenceStats.range - stats.range;
    const dx = stats.centerX - referenceStats.centerX;
    const dy = stats.centerY - referenceStats.centerY;
    if (Math.abs(dx) > .12 || Math.abs(dy) > .12) {
      notes.push({ area: 'Reference', kind: 'focus', title: 'Compare where the shadows sit.', body: 'The center of your darker marks differs from the reference. Match the framing first, then compare the largest shadow shapes and the space around them. Lighting can also shift this measurement.' });
      exercise = 'Look at the largest shadow in the reference. Lightly mark its top, bottom, left, and right limits on your drawing before adding more detail.';
    } else if (rangeDiff > .16) {
      notes.push({ area: 'Reference', kind: 'focus', title: 'The reference has deeper contrast.', body: `Its tonal range is ${Math.round(referenceStats.range * 100)}%, compared with ${Math.round(stats.range * 100)}% in your drawing. If you want a similar effect, build the darkest region a little at a time.` });
    } else if (rangeDiff < -.16) {
      notes.push({ area: 'Reference', kind: 'notice', title: 'Your contrast is more pronounced.', body: 'Your drawing has a wider tonal range than the reference. This can be an intentional choice. For a softer study, compare the middle tones before pushing the shadows further.' });
    } else {
      notes.push({ area: 'Reference', kind: 'positive', title: 'The tonal ranges are close.', body: 'The overall light-to-dark range is similar to the reference. This does not measure likeness; use it as a prompt to look more closely at the individual shapes and their proportions.' });
    }
  } else {
    notes.push({ area: 'Observation', kind: 'notice', title: 'Give your eye a short reset.', body: 'Step back from the page and look at the largest shapes first. Add a reference if you would like a comparison of tonal range and shadow placement.' });
  }
  return { notes, exercise, summary, stats, referenceStats, createdAt: Date.now() };
}

export async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('This image could not be opened. Try a JPG, PNG, or WebP file.'));
    img.src = src;
  });
}

export async function analyzeImage(src: string): Promise<ImageStats> {
  const img = await loadImage(src);
  const ratio = Math.min(256 / img.naturalWidth, 256 / img.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(img.naturalWidth * ratio));
  canvas.height = Math.max(2, Math.round(img.naturalHeight * ratio));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Your browser could not analyze this image.');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return measurePixels(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
}

export async function readUpload(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG, or WebP image.');
  if (file.size > 12 * 1024 * 1024) throw new Error('This file is too large. Choose an image under 12 MB.');
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    const ratio = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    canvas.width = Math.max(2, Math.round(img.naturalWidth * ratio));
    canvas.height = Math.max(2, Math.round(img.naturalHeight * ratio));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Your browser could not open this image.');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', .9);
  } finally { URL.revokeObjectURL(url); }
}
