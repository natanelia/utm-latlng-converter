// Core TypeScript implementation
export { latLngToUtm, utmToLatLng, latLngToUtmBatch, utmToLatLngBatch } from './utm.js';
export type { UTM, LatLng } from './utm.js';

// WASM SIMD batch functions
export { latLngToUtmBatchWasm, utmToLatLngBatchWasm } from './wasm.js';

// WebGPU batch functions
export { latLngToUtmBatchGpu, utmToLatLngBatchGpu, isGpuAvailable } from './gpu.js';

// Smart auto-selecting functions
export { latLngToUtmBatchSmart, utmToLatLngBatchSmart, setBackend } from './smart.js';
export type { Backend } from './smart.js';
