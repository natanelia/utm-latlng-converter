import { bench, describe, beforeAll } from 'vitest';
import { latLngToUtmBatch, utmToLatLngBatch } from './utm';
import { latLngToUtmBatch as wasmLatLngToUtmBatch, utmToLatLngBatch as wasmUtmToLatLngBatch } from './utm-wasm';
import { initLibs, makeTestData, LatLon, Utm, proj4Utm } from './bench-utils';

const size = 1;
const opts = { iterations: 10, warmupIterations: 2, warmupTime: 0, time: 0 };
const { testData, utmData } = makeTestData(size);

beforeAll(initLibs);

describe('latLngToUtm n=1', () => {
  bench('TypeScript', () => { latLngToUtmBatch(testData); }, opts);
  bench('SIMD WASM', () => { wasmLatLngToUtmBatch(testData); }, opts);
  bench('geodesy', () => { for (let i = 0; i < size; i++) new LatLon(testData[i][0], testData[i][1]).toUtm(); }, opts);
  bench('proj4', () => { for (let i = 0; i < size; i++) { const [lat, lng] = testData[i]; proj4Utm[`${Math.floor((lng + 180) / 6) + 1}${lat >= 0 ? 'N' : 'S'}`].forward([lng, lat]); } }, opts);
});

describe('utmToLatLng n=1', () => {
  bench('TypeScript', () => { utmToLatLngBatch(utmData); }, opts);
  bench('SIMD WASM', () => { wasmUtmToLatLngBatch(utmData); }, opts);
  bench('geodesy', () => { for (let i = 0; i < size; i++) new Utm(utmData[i].zone, utmData[i].hemisphere, utmData[i].easting, utmData[i].northing).toLatLon(); }, opts);
  bench('proj4', () => { for (let i = 0; i < size; i++) proj4Utm[`${utmData[i].zone}${utmData[i].hemisphere}`].inverse([utmData[i].easting, utmData[i].northing]); }, opts);
});
