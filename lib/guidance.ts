import { analyzeImage, buildReview, loadImage, type Review } from './analysis';

export type Alignment = { x: number; y: number; scale: number };
export const DEFAULT_ALIGNMENT: Alignment = { x: 0, y: 0, scale: 1 };
export type Box = { x: number; y: number; w: number; h: number };
export type DrawingAction = {
  id: string;
  kind: 'edge' | 'shade' | 'lift' | 'soften';
  title: string;
  location: string;
  evidence: string;
  steps: string[];
  tool: string;
  bounds: Box;
  pin: { x: number; y: number };
  path: string;
  strength: number;
};
export type Guidance = {
  width: number;
  height: number;
  source: string;
  reference?: string;
  alignment: Alignment;
  actions: DrawingAction[];
  referencePath: string;
  message: string;
};
export type Raster = { width: number; height: number; gray: Float32Array };
export type GuidedReview = Review & { guidance: Guidance };
const SIZE = 128;

function percentile(data: Float32Array, p: number) {
  const sorted = Float32Array.from(data).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}
function smooth(input: Float32Array, size: number, radius = 1) {
  const out = new Float32Array(input.length);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let sum = 0, n = 0;
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && xx < size && yy >= 0 && yy < size) { sum += input[yy * size + xx]; n++; }
    }
    out[y * size + x] = sum / n;
  }
  return out;
}
function darkness(gray: Float32Array) {
  const paper = Math.max(.1, percentile(gray, .9));
  return Float32Array.from(gray, value => Math.max(0, (paper - value) / paper));
}
function edgeMap(gray: Float32Array, size: number) {
  const blurred = smooth(gray, size);
  const edges = new Float32Array(gray.length);
  for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
    const i = y * size + x;
    const dx = blurred[i + 1] - blurred[i - 1];
    const dy = blurred[i + size] - blurred[i - size];
    edges[i] = Math.hypot(dx, dy);
  }
  return edges;
}
function neighborhoodMax(values: Float32Array, size: number, radius: number) {
  const out = new Float32Array(values.length);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let max = 0;
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && xx < size && yy >= 0 && yy < size) max = Math.max(max, values[yy * size + xx]);
    }
    out[y * size + x] = max;
  }
  return out;
}

// Raster coordinates always refer to the drawing, after the same transform used by the overlay.
export function alignRaster(source: Float32Array, size: number, alignment: Alignment) {
  const out = new Float32Array(size * size).fill(1);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const sx = ((x / size - .5 - alignment.x) / alignment.scale + .5) * size;
    const sy = ((y / size - .5 - alignment.y) / alignment.scale + .5) * size;
    if (sx >= 0 && sx < size && sy >= 0 && sy < size) out[y * size + x] = source[Math.floor(sy) * size + Math.floor(sx)];
  }
  return out;
}

function components(mask: Uint8Array, size: number) {
  const seen = new Uint8Array(mask.length);
  const groups: number[][] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    const group: number[] = [], queue = [start]; seen[start] = 1;
    for (let index = 0; index < queue.length; index++) {
      const i = queue[index]; group.push(i);
      const x = i % size, y = Math.floor(i / size);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy, j = yy * size + xx;
        if (xx >= 2 && xx < size - 2 && yy >= 2 && yy < size - 2 && !seen[j] && mask[j]) { seen[j] = 1; queue.push(j); }
      }
    }
    groups.push(group);
  }
  return groups.sort((a, b) => b.length - a.length);
}
function boundsOf(group: number[], size: number): Box {
  const xs = group.map(i => i % size), ys = group.map(i => Math.floor(i / size));
  const x = Math.max(0, Math.min(...xs) / size - .03), y = Math.max(0, Math.min(...ys) / size - .03);
  return { x, y, w: Math.min(1 - x, (Math.max(...xs) + 1) / size + .03 - x), h: Math.min(1 - y, (Math.max(...ys) + 1) / size + .03 - y) };
}
// Exact contiguous runs keep guide shading inside the measured region, not a generic ellipse.
export function maskPath(group: number[], size: number): string {
  const mask = new Set(group), unit = 1000 / size;
  let path = '';
  for (let y = 0; y < size; y++) {
    let x = 0;
    while (x < size) {
      if (!mask.has(y * size + x)) { x++; continue; }
      const start = x;
      while (x < size && mask.has(y * size + x)) x++;
      path += `M${start * unit},${y * unit}h${(x - start) * unit}v${unit + .1}h${-(x - start) * unit}Z`;
    }
  }
  return path;
}
// Trace only adjacent edge pixels; disconnected contours get separate SVG subpaths.
export function edgePath(indices: number[], size: number): string {
  const remaining = new Set(indices), unit = 1000 / size;
  let result = '';
  while (remaining.size) {
    let current = remaining.values().next().value as number;
    const points: number[] = [];
    while (remaining.has(current)) {
      remaining.delete(current); points.push(current);
      const x = current % size, y = Math.floor(current / size);
      let next: number | undefined;
      for (const [dx, dy] of [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]) {
        const xx = x + dx, yy = y + dy, i = yy * size + xx;
        if (xx >= 0 && xx < size && yy >= 0 && yy < size && remaining.has(i)) { next = i; break; }
      }
      if (next === undefined) break;
      current = next;
    }
    if (points.length >= 3) result += points.map((i, index) => `${index ? 'L' : 'M'}${(i % size + .5) * unit},${(Math.floor(i / size) + .5) * unit}`).join('');
  }
  return result;
}
function locationFor(x: number, y: number) {
  const vertical = y < .35 ? 'upper' : y > .65 ? 'lower' : 'middle';
  const horizontal = x < .35 ? 'left' : x > .65 ? 'right' : 'center';
  return `${vertical} ${horizontal}`;
}
function actionFor(kind: DrawingAction['kind'], group: number[], size: number, strength: number, withReference: boolean): DrawingAction {
  const bounds = boundsOf(group, size);
  // Use the pixel nearest the region's centroid so the pin sits on actual evidence.
  const cx = group.reduce((sum, i) => sum + i % size, 0) / group.length;
  const cy = group.reduce((sum, i) => sum + Math.floor(i / size), 0) / group.length;
  const center = group.reduce((best, i) => Math.hypot(i % size - cx, Math.floor(i / size) - cy) < Math.hypot(best % size - cx, Math.floor(best / size) - cy) ? i : best, group[0]);
  const pin = { x: (center % size + .5) / size, y: (Math.floor(center / size) + .5) / size };
  const location = locationFor(pin.x, pin.y);
  const shade = kind === 'shade', lift = kind === 'lift', edge = kind === 'edge';
  const title = edge ? `Work on this edge` : shade ? `Build up this shadow` : lift ? `Lift some graphite here` : 'Try a softer transition';
  const evidence = edge ? `A visible reference edge is missing or much fainter near the ${location}. Check the alignment, then follow the green contour if it belongs in your study.` : withReference ? `This ${location} region is ${shade ? 'lighter' : 'darker'} than the corresponding reference region. The ${shade ? 'green hatching' : 'amber patch'} shows exactly where to try an adjustment.` : shade ? `This is an existing darker region in the ${location} of your drawing. As an optional depth study, strengthen it while preserving the nearby light paper.` : `This is a strong light-to-dark transition in the ${location}. If you want a softer form, try the short blending strokes shown here. Keep a hard edge if that is intentional.`;
  const steps = edge ? ['Compare the green contour with the reference detail below. Ignore any contour that comes from the background.', 'Use a light HB pencil to follow the green guide in short strokes. Adjust the existing edge or add the missing section.', 'Step back and check the silhouette before committing to a darker line.'] : shade ? ['Start inside the green hatching with the side of an HB or 2B pencil. Add one light layer of close, even strokes.', 'Build a second layer toward the darkest part of the reference; ease the pressure as you approach the lighter edge.', 'Stop after one small pass and compare again. Keep unmarked highlights clear.'] : lift ? ['Press a clean kneaded eraser lightly into the amber area. Dab and lift instead of rubbing across the paper.', 'Work from the brightest part outward, lifting less graphite as you reach the surrounding tone.', 'Use a light pencil pass to soften the boundary while keeping nearby dark accents intact.'] : ['With a clean blending stump, make short strokes across the marked transition.', 'Work from the darker tone toward the light area and lift pressure gradually. Leave the outer contour alone.', 'Compare with the original view. Keep this change only if a softer transition suits your drawing.'];
  return { id: `${kind}-${Math.round(pin.x * 10)}-${Math.round(pin.y * 10)}`, kind, title, location, evidence, steps, tool: edge ? 'HB pencil · light pressure' : shade ? 'HB / 2B · one light layer' : lift ? 'Kneaded eraser · dab & lift' : 'Blending stump · light pressure', bounds, pin, path: edge ? edgePath(group, size) : maskPath(group, size), strength };
}
function overlap(a: Box, b: Box) {
  const intersection = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return intersection / Math.max(.001, Math.min(a.w * a.h, b.w * b.h));
}

export function compareRasters(drawing: Raster, reference?: Raster, alignment = DEFAULT_ALIGNMENT): Omit<Guidance, 'source' | 'reference'> {
  const size = Math.sqrt(drawing.gray.length);
  if (!Number.isInteger(size) || size < 8 || reference && reference.gray.length !== drawing.gray.length) throw new Error('Comparable square rasters are required.');
  const dDark = darkness(drawing.gray), dSoft = smooth(dDark, size, 2), dEdges = edgeMap(drawing.gray, size);
  const candidates: DrawingAction[] = [];
  let referencePath = '';
  const thresholdMask = (values: Float32Array, threshold: number) => Uint8Array.from(values, (v, i) => {
    const x = i % size, y = Math.floor(i / size);
    return x > 3 && x < size - 4 && y > 3 && y < size - 4 && v > threshold ? 1 : 0;
  });
  const addGroups = (kind: DrawingAction['kind'], values: Float32Array, threshold: number, min: number) => {
    const groups = components(thresholdMask(values, threshold), size);
    for (const group of groups.slice(0, 4)) {
      if (group.length < min || group.length > size * size * .95) continue;
      const bounds = boundsOf(group, size);
      let regions = [group];
      // Broad photo shadows can cover most of a line drawing. Turn those into
      // smaller, high-evidence patches that are practical to tackle one at a time.
      if (kind !== 'edge' && (bounds.w > .42 || bounds.h > .42)) {
        const window = Math.max(8, Math.round(size * .26));
        const step = Math.max(4, Math.round(window / 2));
        const tiles: { pixels: number[]; score: number }[] = [];
        for (let y = 2; y < size - window - 1; y += step) for (let x = 2; x < size - window - 1; x += step) {
          const pixels = group.filter(i => i % size >= x && i % size < x + window && Math.floor(i / size) >= y && Math.floor(i / size) < y + window);
          if (pixels.length < min) continue;
          tiles.push({ pixels, score: pixels.reduce((sum, i) => sum + values[i], 0) / (window * window) });
        }
        tiles.sort((a, b) => b.score - a.score);
        regions = [];
        for (const tile of tiles) {
          if (regions.length === 3) break;
          if (!regions.some(region => overlap(boundsOf(region, size), boundsOf(tile.pixels, size)) > .3)) regions.push(tile.pixels);
        }
      }
      for (const region of regions) {
        const strength = region.reduce((sum, i) => sum + values[i], 0) / region.length;
        const action = actionFor(kind, region, size, strength, !!reference);
        if (action.path) candidates.push(action);
      }
    }
  };
  if (reference) {
    const rGray = alignRaster(reference.gray, size, alignment);
    const rSoft = smooth(darkness(rGray), size, 2), rEdges = edgeMap(rGray, size);
    const allEdges = Array.from(rEdges, (v, i) => v > .105 ? i : -1).filter(i => i >= 0);
    referencePath = edgePath(allEdges, size);
    const nearDrawingEdge = neighborhoodMax(dEdges, size, 2);
    const missing = Float32Array.from(rEdges, (v, i) => nearDrawingEdge[i] < .065 ? v : 0);
    addGroups('edge', missing, .11, Math.max(10, size * .12));
    addGroups('shade', Float32Array.from(rSoft, (v, i) => v - dSoft[i]), .17, size * size * .009);
    addGroups('lift', Float32Array.from(dSoft, (v, i) => v - rSoft[i]), .17, size * size * .009);
  } else if (percentile(dDark, .995) > .1) {
    const peak = percentile(dSoft, .98);
    if (peak > .055 && peak < .6) addGroups('shade', dSoft, Math.max(.04, peak * .65), size * size * .005);
    else addGroups('soften', dEdges, Math.max(.065, percentile(dEdges, .94)), Math.max(12, size * .14));
  }
  candidates.sort((a, b) => {
    const score = (a: DrawingAction) => a.strength * Math.sqrt(a.bounds.w * a.bounds.h) * (a.kind === 'edge' ? 3 : 1);
    return score(b) - score(a);
  });
  const actions: DrawingAction[] = [];
  // Prioritize different kinds of edit before offering another edit of the same kind.
  for (const candidate of candidates) if (!actions.some(a => a.kind === candidate.kind) && actions.length < 3) actions.push(candidate);
  for (const candidate of candidates) if (actions.length < 3 && !actions.includes(candidate) && !actions.some(a => overlap(a.bounds, candidate.bounds) > .55)) actions.push(candidate);
  return { width: drawing.width, height: drawing.height, actions, referencePath, alignment, message: reference ? actions.length ? 'Start with one marked area. These guides follow visible differences in your reference.' : 'No large local differences found. Adjust the reference alignment if the two images are framed differently.' : actions.length ? 'An optional technique exercise based on your marks. Add a reference to locate missing shapes and details.' : 'Add a clear reference to see where shapes, edges, or shadows could be added.' };
}

async function readRaster(src: string): Promise<Raster> {
  const image = await loadImage(src);
  const canvas = document.createElement('canvas'); canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Your browser could not prepare the visual guides.');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, SIZE, SIZE); ctx.drawImage(image, 0, 0, SIZE, SIZE);
  const rgba = ctx.getImageData(0, 0, SIZE, SIZE).data;
  const gray = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < gray.length; i++) gray[i] = (rgba[i * 4] * .2126 + rgba[i * 4 + 1] * .7152 + rgba[i * 4 + 2] * .0722) / 255;
  return { width: image.naturalWidth, height: image.naturalHeight, gray };
}
export async function analyzeDrawing(source: string, reference?: string | null, alignment = DEFAULT_ALIGNMENT): Promise<GuidedReview> {
  const [stats, referenceStats, raster, refRaster] = await Promise.all([analyzeImage(source), reference ? analyzeImage(reference) : undefined, readRaster(source), reference ? readRaster(reference) : undefined]);
  const review = buildReview(stats, referenceStats);
  const guidance = { ...compareRasters(raster, refRaster, alignment), source, reference: reference ?? undefined };
  return { ...review, summary: guidance.actions.length ? `${guidance.actions.length === 1 ? 'One small edit' : `${guidance.actions.length} small edits`} to try next.` : review.summary, guidance };
}
