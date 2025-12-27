// Core TypeScript implementation
export { latLngToUtm, utmToLatLng } from './utm.js';
export type { UTM, LatLng } from './utm.js';

// Smart auto-selecting functions (default)
export { latLngToUtmBatchSmart as latLngToUtmBatch, utmToLatLngBatchSmart as utmToLatLngBatch, setBackend } from './smart.js';
export type { Backend } from './smart.js';

// Direct backend access
export { latLngToUtmBatch as latLngToUtmBatchTs, utmToLatLngBatch as utmToLatLngBatchTs } from './utm.js';
export { latLngToUtmBatchWasm, utmToLatLngBatchWasm } from './wasm.js';
export { latLngToUtmBatchGpu, utmToLatLngBatchGpu, isGpuAvailable } from './gpu.js';
