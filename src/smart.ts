import { latLngToUtm, utmToLatLng, latLngToUtmBatch, utmToLatLngBatch } from './utm.js';
import { latLngToUtmBatchWasm, utmToLatLngBatchWasm } from './wasm.js';
import type { UTM, LatLng } from './utm.js';

type Backend = 'auto' | 'wasm' | 'typescript';

let preferredBackend: Backend = 'auto';
let wasmAvailable: boolean | null = null;

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

export function setBackend(backend: Backend): void {
  preferredBackend = backend;
}

export async function latLngToUtmSmart(lat: number, lng: number): Promise<UTM> {
  return latLngToUtm(lat, lng);
}

export async function utmToLatLngSmart(easting: number, northing: number, zone: number, hemisphere: 'N' | 'S'): Promise<LatLng> {
  return utmToLatLng(easting, northing, zone, hemisphere);
}

export async function latLngToUtmBatchSmart(coords: [number, number][]): Promise<UTM[]> {
  if (preferredBackend === 'typescript') return latLngToUtmBatch(coords);
  if (preferredBackend === 'wasm' || (preferredBackend === 'auto' && await checkWasm())) {
    return latLngToUtmBatchWasm(coords);
  }
  return latLngToUtmBatch(coords);
}

export async function utmToLatLngBatchSmart(utms: UTM[]): Promise<LatLng[]> {
  if (preferredBackend === 'typescript') return utmToLatLngBatch(utms);
  if (preferredBackend === 'wasm' || (preferredBackend === 'auto' && await checkWasm())) {
    return utmToLatLngBatchWasm(utms);
  }
  return utmToLatLngBatch(utms);
}
