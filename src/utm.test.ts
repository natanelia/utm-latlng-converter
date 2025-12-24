import { describe, it, expect } from 'vitest';
import { latLngToUtm, utmToLatLng } from './utm';

describe('latLngToUtm', () => {
  it('converts equator/prime meridian', () => {
    const result = latLngToUtm(0, 0);
    expect(result.zone).toBe(31);
    expect(result.easting).toBeCloseTo(166021.44, 1);
    expect(result.northing).toBeCloseTo(0, 1);
  });

  it('converts NYC', () => {
    const result = latLngToUtm(40.7128, -74.006);
    expect(result.zone).toBe(18);
    expect(result.hemisphere).toBe('N');
  });

  it('converts Sydney', () => {
    const result = latLngToUtm(-33.8688, 151.2093);
    expect(result.zone).toBe(56);
    expect(result.hemisphere).toBe('S');
  });
});

describe('utmToLatLng', () => {
  it('converts back from equator', () => {
    const utm = latLngToUtm(0, 0);
    const result = utmToLatLng(utm.easting, utm.northing, utm.zone, utm.hemisphere);
    expect(result.lat).toBeCloseTo(0, 9);
    expect(result.lng).toBeCloseTo(0, 9);
  });
});

describe('round-trip accuracy', () => {
  const testCases = [
    { lat: 0, lng: 0 },
    { lat: 40.7128, lng: -74.006 },
    { lat: -33.8688, lng: 151.2093 },
    { lat: 51.5074, lng: -0.1278 },
    { lat: 35.6762, lng: 139.6503 },
    { lat: -22.9068, lng: -43.1729 },
    { lat: 48.8566, lng: 2.3522 },
    { lat: 55.7558, lng: 37.6173 },
    { lat: 84, lng: 0 },
    { lat: -80, lng: 0 },
    { lat: 0, lng: 179 },
    { lat: 0, lng: -179 },
  ];

  testCases.forEach(({ lat, lng }) => {
    it(`round-trip (${lat}, ${lng})`, () => {
      const utm = latLngToUtm(lat, lng);
      const result = utmToLatLng(utm.easting, utm.northing, utm.zone, utm.hemisphere);
      expect(result.lat).toBeCloseTo(lat, 9);
      expect(result.lng).toBeCloseTo(lng, 9);
    });
  });

  // Random tests
  const randomCases = Array.from({ length: 100 }, () => ({
    lat: Math.random() * 160 - 80,
    lng: Math.random() * 360 - 180
  }));

  randomCases.forEach(({ lat, lng }, i) => {
    it(`random #${i}: (${lat.toFixed(4)}, ${lng.toFixed(4)})`, () => {
      const utm = latLngToUtm(lat, lng);
      const result = utmToLatLng(utm.easting, utm.northing, utm.zone, utm.hemisphere);
      expect(result.lat).toBeCloseTo(lat, 9);
      expect(result.lng).toBeCloseTo(lng, 9);
    });
  });
});

describe('edge cases', () => {
  it('handles equator', () => {
    const utm = latLngToUtm(0, 0);
    expect(utm.northing).toBeCloseTo(0, 0);
  });

  it('handles high latitudes', () => {
    const utm = latLngToUtm(84, 0);
    const result = utmToLatLng(utm.easting, utm.northing, utm.zone, utm.hemisphere);
    expect(result.lat).toBeCloseTo(84, 9);
  });

  it('handles negative latitudes', () => {
    const utm = latLngToUtm(-45, 0);
    expect(utm.hemisphere).toBe('S');
    const result = utmToLatLng(utm.easting, utm.northing, utm.zone, utm.hemisphere);
    expect(result.lat).toBeCloseTo(-45, 9);
  });

  it('handles date line', () => {
    const utm = latLngToUtm(0, 179);
    const result = utmToLatLng(utm.easting, utm.northing, utm.zone, utm.hemisphere);
    expect(result.lng).toBeCloseTo(179, 9);
  });
});
