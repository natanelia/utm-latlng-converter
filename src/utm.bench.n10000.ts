import { bench, describe, beforeAll } from 'vitest';
import { latLngToUtmBatchTs, utmToLatLngBatchTs, latLngToUtmBatchWasm, utmToLatLngBatchWasm, latLngToUtmBatchGpu, utmToLatLngBatchGpu, isGpuAvailable } from './index';
import { initLibs, makeTestData, LatLon, Utm, proj4Utm } from './bench-utils';

const size = 10000;
const opts = { iterations: 1, warmupIterations: 2, warmupTime: 0, time: 0 };
const { testData, utmData } = makeTestData(size);

let wasmForward: typeof latLngToUtmBatchWasm, wasmInverse: typeof utmToLatLngBatchWasm;
let gpuAvailable = false;

beforeAll(async () => {
  await initLibs();
  wasmForward = latLngToUtmBatchWasm;
  wasmInverse = utmToLatLngBatchWasm;
  await wasmForward([[0, 0]]); // warm up wasm
  gpuAvailable = await isGpuAvailable();
  if (gpuAvailable) await latLngToUtmBatchGpu([[0, 0]]); // warm up gpu
});

describe('latLngToUtm n=10000', () => {
  bench('TypeScript', () => { latLngToUtmBatchTs(testData); }, opts);
  bench('SIMD WASM', async () => { await wasmForward(testData); }, opts);
  bench.skipIf(!gpuAvailable)('WebGPU', async () => { await latLngToUtmBatchGpu(testData); }, opts);
  bench('geodesy', () => { for (let i = 0; i < size; i++) new LatLon(testData[i][0], testData[i][1]).toUtm(); }, opts);
  bench('proj4', () => { for (let i = 0; i < size; i++) { const [lat, lng] = testData[i]; proj4Utm[`${Math.floor((lng + 180) / 6) + 1}${lat >= 0 ? 'N' : 'S'}`].forward([lng, lat]); } }, opts);
});

describe('utmToLatLng n=10000', () => {
  bench('TypeScript', () => { utmToLatLngBatchTs(utmData); }, opts);
  bench('SIMD WASM', async () => { await wasmInverse(utmData); }, opts);
  bench.skipIf(!gpuAvailable)('WebGPU', async () => { await utmToLatLngBatchGpu(utmData); }, opts);
  bench('geodesy', () => { for (let i = 0; i < size; i++) new Utm(utmData[i].zone, utmData[i].hemisphere, utmData[i].easting, utmData[i].northing).toLatLon(); }, opts);
  bench('proj4', () => { for (let i = 0; i < size; i++) proj4Utm[`${utmData[i].zone}${utmData[i].hemisphere}`].inverse([utmData[i].easting, utmData[i].northing]); }, opts);
});
