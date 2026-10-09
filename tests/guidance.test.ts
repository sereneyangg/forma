import test from 'node:test';
import assert from 'node:assert/strict';
import { alignRaster, compareRasters, DEFAULT_ALIGNMENT, type Raster } from '../lib/guidance';
const size = 64;
const raster = (fn: (x: number, y: number) => number): Raster => ({ width: 600, height: 600, gray: Float32Array.from({ length: size * size }, (_, i) => fn(i % size, Math.floor(i / size))) });
const white = raster(() => 1);

test('identical images do not invent a visual correction', () => {
  const source = raster((x,y) => x > 20 && x < 40 && y > 15 && y < 50 ? .3 : 1);
  assert.equal(compareRasters(source, source).actions.length, 0);
});
test('a missing shadow produces localized hatching and actionable steps', () => {
  const reference = raster((x,y) => x > 35 && x < 54 && y > 34 && y < 53 ? .25 : 1);
  const result = compareRasters(white, reference);
  const shade = result.actions.find(a => a.kind === 'shade');
  assert.ok(shade); assert.ok(shade.pin.x > .55 && shade.pin.y > .5);
  assert.ok(shade.bounds.x > .4); assert.match(shade.path, /^M/);
  assert.equal(shade.steps.length, 3); assert.match(shade.steps[0], /pencil/);
});
test('a darker drawn patch produces an eraser guide in that patch', () => {
  const source = raster((x,y) => x > 8 && x < 24 && y > 8 && y < 26 ? .15 : 1);
  const lift = compareRasters(source, white).actions.find(a => a.kind === 'lift');
  assert.ok(lift); assert.ok(lift.pin.x < .4 && lift.pin.y < .45);
  assert.match(lift.steps[0], /eraser/);
});
test('a missing reference contour produces an actual traced path', () => {
  const ref = raster((x,y) => x > 28 && x < 32 && y > 10 && y < 51 ? .2 : 1);
  const guide = compareRasters(white, ref);
  const edge = guide.actions.find(a => a.kind === 'edge');
  assert.ok(edge); assert.match(edge.path, /L/); assert.ok(guide.referencePath.length > 0);
});
test('blank images without a reference ask for evidence, not arbitrary marks', () => {
  const result = compareRasters(white);
  assert.equal(result.actions.length, 0); assert.match(result.message, /reference/);
});
test('reference translation moves the suggested region by the same amount', () => {
  const ref = raster((x,y) => x > 9 && x < 22 && y > 20 && y < 41 ? .2 : 1);
  const original = compareRasters(white, ref).actions.find(a => a.kind === 'shade')!;
  const shifted = compareRasters(white, ref, { ...DEFAULT_ALIGNMENT, x: .25 }).actions.find(a => a.kind === 'shade')!;
  assert.ok(shifted.pin.x - original.pin.x > .2);
});
test('alignment identity preserves the reference exactly', () => {
  assert.deepEqual(alignRaster(white.gray, size, DEFAULT_ALIGNMENT), white.gray);
});
test('every target and pin stays inside the drawing', () => {
  const ref = raster((x,y) => x < 25 && y < 60 ? .1 : 1);
  for (const a of compareRasters(white, ref).actions) {
    assert.ok(a.bounds.x >= 0 && a.bounds.y >= 0);
    assert.ok(a.bounds.x + a.bounds.w <= 1.000001 && a.bounds.y + a.bounds.h <= 1.000001);
    assert.ok(a.pin.x >= a.bounds.x && a.pin.x <= a.bounds.x + a.bounds.w);
  }
});


test('large shadow differences are broken into manageable local edits', () => {
  const reference = raster((x,y) => x > 6 && x < 57 && y > 6 && y < 57 ? .2 : 1);
  const edits = compareRasters(white, reference).actions.filter(a => a.kind === 'shade');
  assert.ok(edits.length);
  for (const edit of edits) assert.ok(edit.bounds.w < .4 && edit.bounds.h < .4);
});
