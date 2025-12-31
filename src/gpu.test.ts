import { describe, it, expect } from 'vitest';
import { latLngToUtmBatchGpu, utmToLatLngBatchGpu, isGpuAvailable } from './gpu';
import { latLngToUtm } from './utm';

describe('GPU batch', () => {
  const coords: [number, number][] = [
    [0, 0], [40.7128, -74.006], [-33.8688, 151.2093], [51.5074, -0.1278]
  ];

  it('isGpuAvailable returns boolean', async () => {
    const available = await isGpuAvailable();
    expect(typeof available).toBe('boolean');
  });

  it('latLngToUtmBatchGpu matches TypeScript (if available)', async () => {
    if (!(await isGpuAvailable())) return;
    const gpuResults = await latLngToUtmBatchGpu(coords);
    coords.forEach((c, i) => {
      const ts = latLngToUtm(c[0], c[1]);
      expect(gpuResults[i].zone).toBe(ts.zone);
      expect(gpuResults[i].hemisphere).toBe(ts.hemisphere);
      // DD precision: <1m tolerance
      expect(Math.abs(gpuResults[i].easting - ts.easting)).toBeLessThan(1);
      expect(Math.abs(gpuResults[i].northing - ts.northing)).toBeLessThan(1);
    });
  });

  it('round-trip accuracy (if available)', async () => {
    if (!(await isGpuAvailable())) return;
    const utms = await latLngToUtmBatchGpu(coords);
    const back = await utmToLatLngBatchGpu(utms);
    coords.forEach((c, i) => {
      // Target: micrometer precision ~0.00000001 deg
      expect(Math.abs(back[i].lat - c[0])).toBeLessThan(0.0000001);
      expect(Math.abs(back[i].lng - c[1])).toBeLessThan(0.0000001);
    });
  });

  it('throws when GPU unavailable', async () => {
    if (await isGpuAvailable()) return;
    await expect(latLngToUtmBatchGpu(coords)).rejects.toThrow('WebGPU not available');
  });
});
