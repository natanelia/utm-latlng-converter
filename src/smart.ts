import { latLngToUtmBatch, utmToLatLngBatch } from './utm.js';
import { latLngToUtmBatchWasm, utmToLatLngBatchWasm } from './wasm.js';
import { latLngToUtmBatchGpu, utmToLatLngBatchGpu, isGpuAvailable } from './gpu.js';
import type { UTM, LatLng } from './utm.js';

export type Backend = 'auto' | 'gpu' | 'wasm' | 'typescript';

let preferredBackend: Backend = 'auto';
let wasmAvailable: boolean | null = null;
let gpuAvailable: boolean | null = null;

const GPU_THRESHOLD = 100000;

async function checkWasm(): Promise<boolean> {
  if (wasmAvailable !== null) return wasmAvailable;
  try {
    await latLngToUtmBatchWasm([[0, 0]]);
    wasmAvailable = true;
  } catch {
    wasmAvailable = false;
  }
  return wasmAvailable;
}

async function checkGpu(): Promise<boolean> {
  if (gpuAvailable !== null) return gpuAvailable;
  gpuAvailable = await isGpuAvailable();
  return gpuAvailable;
}

export function setBackend(backend: Backend): void {
  preferredBackend = backend;
}

export async function latLngToUtmBatchSmart(coords: [number, number][]): Promise<UTM[]> {
  if (preferredBackend === 'typescript') return latLngToUtmBatch(coords);
  if (preferredBackend === 'gpu') return latLngToUtmBatchGpu(coords);
  if (preferredBackend === 'wasm') return latLngToUtmBatchWasm(coords);
  
  // Auto: use GPU for large batches, WASM for medium, TS for small
  if (coords.length >= GPU_THRESHOLD && await checkGpu()) {
    return latLngToUtmBatchGpu(coords);
  }
  if (await checkWasm()) {
    return latLngToUtmBatchWasm(coords);
  }
  return latLngToUtmBatch(coords);
}

export async function utmToLatLngBatchSmart(utms: UTM[]): Promise<LatLng[]> {
  if (preferredBackend === 'typescript') return utmToLatLngBatch(utms);
  if (preferredBackend === 'gpu') return utmToLatLngBatchGpu(utms);
  if (preferredBackend === 'wasm') return utmToLatLngBatchWasm(utms);
  
  if (utms.length >= GPU_THRESHOLD && await checkGpu()) {
    return utmToLatLngBatchGpu(utms);
  }
  if (await checkWasm()) {
    return utmToLatLngBatchWasm(utms);
  }
  return utmToLatLngBatch(utms);
}
