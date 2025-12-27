import { latLngToUtmBatchTs } from './index';

export let LatLon: any, Utm: any, proj4Utm: Record<string, any>;

export async function initLibs() {
  ({ LatLon, default: Utm } = await import('geodesy/utm.js'));
  const proj4 = (await import('proj4')).default;
  proj4Utm = {};
  for (let z = 1; z <= 60; z++) {
    proj4Utm[`${z}N`] = proj4(`+proj=utm +zone=${z} +datum=WGS84`);
    proj4Utm[`${z}S`] = proj4(`+proj=utm +zone=${z} +south +datum=WGS84`);
  }
}

export function makeTestData(size: number) {
  const testData: [number, number][] = Array.from({ length: size }, () => [Math.random() * 160 - 80, Math.random() * 360 - 180]);
  return { testData, utmData: latLngToUtmBatchTs(testData) };
}
