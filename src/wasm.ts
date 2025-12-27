import type { UTM, LatLng } from './utm.js';

let wasmExports: any = null;
let wasmMemory: WebAssembly.Memory | null = null;

async function loadWasm(): Promise<void> {
  if (wasmExports) return;
  
  const isNode = typeof process !== 'undefined' && process.versions?.node;
  
  if (isNode) {
    const { readFileSync } = await import('fs');
    const { join, dirname } = await import('path');
    const { fileURLToPath } = await import('url');
    const wasmPath = join(dirname(fileURLToPath(import.meta.url)), 'utm.wasm');
    const { instance } = await WebAssembly.instantiate(readFileSync(wasmPath));
    wasmExports = instance.exports;
    wasmMemory = wasmExports.memory;
  } else {
    const wasmUrl = new URL('./utm.wasm', import.meta.url);
    const { instance } = await WebAssembly.instantiateStreaming(fetch(wasmUrl));
    wasmExports = instance.exports;
    wasmMemory = wasmExports.memory;
  }
}

export async function latLngToUtmBatchWasm(coords: [number, number][]): Promise<UTM[]> {
  await loadWasm();
  const count = coords.length;
  const needed = Math.ceil((count * 16 + count * 32) / 65536);
  const current = wasmMemory!.buffer.byteLength / 65536;
  if (needed > current) wasmMemory!.grow(needed - current);

  const mem = new Float64Array(wasmMemory!.buffer);
  for (let i = 0; i < count; i++) { mem[i * 2] = coords[i][0]; mem[i * 2 + 1] = coords[i][1]; }
  wasmExports.forwardBatchSimd(0, count * 16, count);

  const out = new Float64Array(wasmMemory!.buffer, count * 16, count * 4);
  const results: UTM[] = [];
  for (let i = 0; i < count; i++) {
    results.push({ easting: out[i * 4], northing: out[i * 4 + 1], zone: out[i * 4 + 2], hemisphere: out[i * 4 + 3] === 1 ? 'N' : 'S' });
  }
  return results;
}

export async function utmToLatLngBatchWasm(utms: UTM[]): Promise<LatLng[]> {
  await loadWasm();
  const count = utms.length;
  const needed = Math.ceil((count * 32 + count * 16) / 65536);
  const current = wasmMemory!.buffer.byteLength / 65536;
  if (needed > current) wasmMemory!.grow(needed - current);

  const mem = new Float64Array(wasmMemory!.buffer);
  for (let i = 0; i < count; i++) { mem[i * 4] = utms[i].easting; mem[i * 4 + 1] = utms[i].northing; mem[i * 4 + 2] = utms[i].zone; mem[i * 4 + 3] = utms[i].hemisphere === 'N' ? 1 : 0; }
  wasmExports.inverseBatchSimd(0, count * 32, count);

  const out = new Float64Array(wasmMemory!.buffer, count * 32, count * 2);
  const results: LatLng[] = [];
  for (let i = 0; i < count; i++) {
    results.push({ lat: out[i * 2], lng: out[i * 2 + 1] });
  }
  return results;
}
