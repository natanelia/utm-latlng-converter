import { latLngToUtm, utmToLatLng } from './utm';

const ITERATIONS = 100000;

function benchmark(name: string, fn: () => void): number {
  // Warmup
  for (let i = 0; i < 1000; i++) fn();
  
  const start = performance.now();
  for (let i = 0; i < ITERATIONS; i++) fn();
  const elapsed = performance.now() - start;
  
  const opsPerSec = (ITERATIONS / elapsed) * 1000;
  console.log(`${name}: ${opsPerSec.toFixed(0)} ops/sec (${(elapsed / ITERATIONS * 1000).toFixed(3)} µs/op)`);
  return opsPerSec;
}

// Generate test data
const testData = Array.from({ length: 1000 }, () => ({
  lat: Math.random() * 160 - 80,
  lng: Math.random() * 360 - 180
}));

const utmData = testData.map(({ lat, lng }) => latLngToUtm(lat, lng));

console.log('=== UTM Converter Benchmark ===\n');
console.log(`Iterations: ${ITERATIONS.toLocaleString()}\n`);

let idx = 0;
benchmark('TypeScript latLngToUtm', () => {
  const { lat, lng } = testData[idx++ % testData.length];
  latLngToUtm(lat, lng);
});

idx = 0;
benchmark('TypeScript utmToLatLng', () => {
  const { easting, northing, zone, hemisphere } = utmData[idx++ % utmData.length];
  utmToLatLng(easting, northing, zone, hemisphere);
});

idx = 0;
benchmark('TypeScript round-trip', () => {
  const { lat, lng } = testData[idx++ % testData.length];
  const utm = latLngToUtm(lat, lng);
  utmToLatLng(utm.easting, utm.northing, utm.zone, utm.hemisphere);
});

// Accuracy test
console.log('\n=== Accuracy Test ===\n');
let maxError = 0;
for (const { lat, lng } of testData) {
  const utm = latLngToUtm(lat, lng);
  const result = utmToLatLng(utm.easting, utm.northing, utm.zone, utm.hemisphere);
  const error = Math.max(Math.abs(result.lat - lat), Math.abs(result.lng - lng));
  maxError = Math.max(maxError, error);
}
console.log(`Max round-trip error: ${maxError.toExponential(3)} degrees`);
console.log(`Equivalent to: ~${(maxError * 111000).toExponential(3)} meters at equator`);
