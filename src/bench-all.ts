import { latLngToUtm, utmToLatLng } from './utm';
import * as loader from '@assemblyscript/loader';
import { readFileSync } from 'fs';

const ITERATIONS = 100000;
const BATCH_SIZE = 10000;

// Generate test data
const testData = Array.from({ length: 1000 }, () => ({
  lat: Math.random() * 160 - 80,
  lng: Math.random() * 360 - 180
}));

function bench(name: string, fn: () => void): number {
  for (let i = 0; i < 1000; i++) fn(); // warmup
  const start = performance.now();
  for (let i = 0; i < ITERATIONS; i++) fn();
  const ms = performance.now() - start;
  const ops = (ITERATIONS / ms) * 1000;
  console.log(`${name}: ${ops.toFixed(0)} ops/sec (${(ms / ITERATIONS * 1000).toFixed(3)} µs/op)`);
  return ops;
}

async function main() {
  console.log('=== UTM Converter Benchmark: TS vs WASM ===\n');

  // TypeScript
  let idx = 0;
  const tsForward = bench('TypeScript forward', () => {
    const { lat, lng } = testData[idx++ % testData.length];
    latLngToUtm(lat, lng);
  });

  const utmData = testData.map(({ lat, lng }) => latLngToUtm(lat, lng));
  idx = 0;
  const tsInverse = bench('TypeScript inverse', () => {
    const { easting, northing, zone, hemisphere } = utmData[idx++ % utmData.length];
    utmToLatLng(easting, northing, zone, hemisphere);
  });

  // AssemblyScript WASM
  const wasmBuffer = readFileSync('./build/utm.wasm');
  const wasm = await loader.instantiate(wasmBuffer);
  const { latLngToUtmEasting, latLngToUtmNorthing, latLngToUtmZone, utmToLat, utmToLng } = wasm.exports as any;

  idx = 0;
  const wasmForward = bench('WASM forward', () => {
    const { lat, lng } = testData[idx++ % testData.length];
    latLngToUtmEasting(lat, lng);
    latLngToUtmNorthing(lat, lng);
    latLngToUtmZone(lng);
  });

  idx = 0;
  const wasmInverse = bench('WASM inverse', () => {
    const { easting, northing, zone, hemisphere } = utmData[idx++ % utmData.length];
    utmToLat(easting, northing, zone, hemisphere === 'N');
    utmToLng(easting, northing, zone, hemisphere === 'N');
  });

  // Batch comparison
  console.log('\n=== Batch Processing (10K coords) ===\n');
  
  const batchData = Array.from({ length: BATCH_SIZE }, () => ({
    lat: Math.random() * 160 - 80,
    lng: Math.random() * 360 - 180
  }));

  // TS batch
  let start = performance.now();
  for (const { lat, lng } of batchData) latLngToUtm(lat, lng);
  const tsBatch = performance.now() - start;
  console.log(`TypeScript batch: ${tsBatch.toFixed(2)}ms (${(BATCH_SIZE / tsBatch * 1000).toFixed(0)} ops/sec)`);

  // WASM batch
  start = performance.now();
  for (const { lat, lng } of batchData) {
    latLngToUtmEasting(lat, lng);
    latLngToUtmNorthing(lat, lng);
  }
  const wasmBatch = performance.now() - start;
  console.log(`WASM batch: ${wasmBatch.toFixed(2)}ms (${(BATCH_SIZE / wasmBatch * 1000).toFixed(0)} ops/sec)`);

  console.log('\n=== Summary ===\n');
  console.log(`Forward: WASM is ${(wasmForward / tsForward).toFixed(2)}x vs TypeScript`);
  console.log(`Inverse: WASM is ${(wasmInverse / tsInverse).toFixed(2)}x vs TypeScript`);
  console.log(`\nNote: WebGPU requires browser environment (not available in Node/Bun)`);
}

main();
