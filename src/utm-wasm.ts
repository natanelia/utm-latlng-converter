import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { UTM, LatLng } from './utm';

const wasmPath = join(dirname(fileURLToPath(import.meta.url)), '../build/utm.wasm');
const wasm = (await WebAssembly.instantiate(readFileSync(wasmPath))).instance.exports as any;

export function latLngToUtmBatch(coords: [number, number][]): UTM[] {
  const count = coords.length;
  const needed = Math.ceil((count * 16 + count * 32) / 65536);
  const current = wasm.memory.buffer.byteLength / 65536;
  if (needed > current) wasm.memory.grow(needed - current);

  const mem = new Float64Array(wasm.memory.buffer);
  for (let i = 0; i < count; i++) { mem[i * 2] = coords[i][0]; mem[i * 2 + 1] = coords[i][1]; }
  wasm.forwardBatchSimd(0, count * 16, count);

  const out = new Float64Array(wasm.memory.buffer, count * 16, count * 4);
  const results: UTM[] = [];
  for (let i = 0; i < count; i++) {
    results.push({ easting: out[i * 4], northing: out[i * 4 + 1], zone: out[i * 4 + 2], hemisphere: out[i * 4 + 3] === 1 ? 'N' : 'S' });
  }
  return results;
}

export function utmToLatLngBatch(utms: UTM[]): LatLng[] {
  const count = utms.length;
  const needed = Math.ceil((count * 32 + count * 16) / 65536);
  const current = wasm.memory.buffer.byteLength / 65536;
  if (needed > current) wasm.memory.grow(needed - current);

  const mem = new Float64Array(wasm.memory.buffer);
  for (let i = 0; i < count; i++) { mem[i * 4] = utms[i].easting; mem[i * 4 + 1] = utms[i].northing; mem[i * 4 + 2] = utms[i].zone; mem[i * 4 + 3] = utms[i].hemisphere === 'N' ? 1 : 0; }
  wasm.inverseBatchSimd(0, count * 32, count);

  const out = new Float64Array(wasm.memory.buffer, count * 32, count * 2);
  const results: LatLng[] = [];
  for (let i = 0; i < count; i++) {
    results.push({ lat: out[i * 2], lng: out[i * 2 + 1] });
  }
  return results;
}
