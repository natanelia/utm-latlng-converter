// Core TypeScript implementation
export { latLngToUtm, utmToLatLng, latLngToUtmBatch, utmToLatLngBatch } from './utm.js';
export type { UTM, LatLng } from './utm.js';

// WASM SIMD batch functions
export { latLngToUtmBatchWasm, utmToLatLngBatchWasm } from './wasm.js';

// Smart auto-selecting functions
export { latLngToUtmSmart, utmToLatLngSmart, latLngToUtmBatchSmart, utmToLatLngBatchSmart, setBackend } from './smart.js';
