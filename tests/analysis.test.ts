import test from 'node:test';
import assert from 'node:assert/strict';
import { measurePixels, buildReview } from '../lib/analysis';

function fixture(width: number, height: number, pixel: (x: number,y: number) => number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y=0; y<height; y++) for(let x=0; x<width; x++) {
    const i=(y*width+x)*4;
    data[i]=data[i+1]=data[i+2]=pixel(x,y); data[i+3]=255;
  }
  return measurePixels(data,width,height);
}

test('blank page produces a capture/early sketch prompt rather than invented praise', () => {
  const stats=fixture(100,100,()=>255);
  assert.equal(stats.range,0); assert.equal(stats.coverage,0);
  assert.ok(buildReview(stats).notes[0].title.includes('faint'));
  assert.ok(Number.isFinite(stats.centerX));
});
test('a balanced drawing has centered dark mass and full tonal range', () => {
  const stats=fixture(100,100,(x,y)=>x>29&&x<70&&y>29&&y<70?0:255);
  assert.equal(stats.range,1);
  assert.ok(Math.abs(stats.centerX-.5)<.001);
  assert.equal(stats.borderShare,0);
});
test('moving marks right moves the measured center and comparison feedback', () => {
  const ref=fixture(100,100,(x,y)=>x>29&&x<50&&y>29&&y<70?20:250);
  const drawing=fixture(100,100,(x,y)=>x>69&&x<90&&y>29&&y<70?20:250);
  assert.ok(drawing.centerX>ref.centerX+.3);
  const review=buildReview(drawing,ref);
  assert.match(review.notes.find(n=>n.area==='Reference')!.title,/shadows/);
});
test('transparent canvas is treated as white paper', () => {
  const stats=measurePixels(new Uint8ClampedArray(16),2,2);
  assert.equal(stats.range,0); assert.equal(stats.lightShare,1);
});
test('contrast comparison responds to a lighter drawing', () => {
  const ref=fixture(100,100,x=>x<50?0:255);
  const drawing=fixture(100,100,x=>x<50?180:250);
  assert.match(buildReview(drawing,ref).notes.find(n=>n.area==='Reference')!.title,/deeper contrast/);
});
test('invalid dimensions are rejected', () => {
  assert.throws(()=>measurePixels(new Uint8ClampedArray(4),4,4),/dimensions/);
});
