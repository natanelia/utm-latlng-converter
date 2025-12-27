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
      // f32 precision: ~1km tolerance for UTM coords
      expect(Math.abs(gpuResults[i].easting - ts.easting)).toBeLessThan(1000);
      expect(Math.abs(gpuResults[i].northing - ts.northing)).toBeLessThan(1000);
    });
  });

  it('round-trip accuracy (if available)', async () => {
    if (!(await isGpuAvailable())) return;
    const utms = await latLngToUtmBatchGpu(coords);
    const back = await utmToLatLngBatchGpu(utms);
    coords.forEach((c, i) => {
      // f32 precision: ~0.01 deg tolerance (~1km)
      expect(Math.abs(back[i].lat - c[0])).toBeLessThan(0.01);
      expect(Math.abs(back[i].lng - c[1])).toBeLessThan(0.01);
    });
  });

  it('throws when GPU unavailable', async () => {
    if (await isGpuAvailable()) return;
    await expect(latLngToUtmBatchGpu(coords)).rejects.toThrow('WebGPU not available');
  });
});
