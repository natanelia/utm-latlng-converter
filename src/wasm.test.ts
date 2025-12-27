import { describe, it, expect } from 'vitest';
import { latLngToUtmBatchWasm, utmToLatLngBatchWasm } from './wasm';
import { latLngToUtm } from './utm';

// Skip in browser - WASM loader uses Node fs
const isNode = typeof process !== 'undefined' && process.versions?.node;
const isBrowser = !isNode;

describe.skipIf(isBrowser)('WASM batch', () => {
  const coords: [number, number][] = [
    [0, 0], [40.7128, -74.006], [-33.8688, 151.2093], [51.5074, -0.1278]
  ];

  it('latLngToUtmBatchWasm matches TypeScript', async () => {
    const wasmResults = await latLngToUtmBatchWasm(coords);
    coords.forEach((c, i) => {
      const ts = latLngToUtm(c[0], c[1]);
      expect(wasmResults[i].zone).toBe(ts.zone);
      expect(wasmResults[i].hemisphere).toBe(ts.hemisphere);
      expect(wasmResults[i].easting).toBeCloseTo(ts.easting, 2);
      expect(wasmResults[i].northing).toBeCloseTo(ts.northing, 2);
    });
  });

  it('round-trip accuracy', async () => {
    const utms = await latLngToUtmBatchWasm(coords);
    const back = await utmToLatLngBatchWasm(utms);
    coords.forEach((c, i) => {
      expect(back[i].lat).toBeCloseTo(c[0], 6);
      expect(back[i].lng).toBeCloseTo(c[1], 6);
    });
  });
});
