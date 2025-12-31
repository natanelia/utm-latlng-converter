# utm-latlng-converter

High-precision UTM ↔ Lat/Lng converter using the Karney/Krüger 6th-order series algorithm.

[![npm version](https://img.shields.io/npm/v/utm-latlng-converter.svg)](https://www.npmjs.com/package/utm-latlng-converter)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- ~200 nanometer precision within UTM domain
- Zero dependencies for core TypeScript implementation
- SIMD-accelerated WASM for batch processing
- Smart auto-selection between WASM and TypeScript
- Based on C.F.F. Karney's algorithm (J. Geodesy 85(8), 475-485, 2011)
- WGS84 ellipsoid

## Installation

```bash
npm install utm-latlng-converter
```

## Usage

### Basic (TypeScript)

```typescript
import { latLngToUtm, utmToLatLng } from 'utm-latlng-converter';

// Lat/Lng to UTM
const utm = latLngToUtm(40.7128, -74.006);
// { easting: 583960.0, northing: 4507523.0, zone: 18, hemisphere: 'N' }

// UTM to Lat/Lng
const latLng = utmToLatLng(583960, 4507523, 18, 'N');
// { lat: 40.7128, lng: -74.006 }
```

### Batch Processing

```typescript
import { latLngToUtmBatch, utmToLatLngBatch } from 'utm-latlng-converter';

const coords: [number, number][] = [[40.7128, -74.006], [51.5074, -0.1278]];
const utmResults = await latLngToUtmBatch(coords);
```

Batch functions auto-select WASM SIMD for ~14 micrometer precision, with TypeScript fallback.

**Note:** GPU backend available via `setBackend('gpu')` for large batches where ~100m precision is acceptable.

### Force Backend

```typescript
import { setBackend } from 'utm-latlng-converter';

setBackend('gpu');        // Always use WebGPU
setBackend('wasm');       // Always use WASM
setBackend('typescript'); // Always use TypeScript
setBackend('auto');       // Auto-select (default)
```

### Direct Backend Access

```typescript
import { 
  latLngToUtmBatchTs,   // TypeScript
  latLngToUtmBatchWasm, // WASM SIMD
  latLngToUtmBatchGpu   // WebGPU
} from 'utm-latlng-converter';
```

## Benchmarks

Compared against [proj4](https://www.npmjs.com/package/proj4) and [geodesy](https://www.npmjs.com/package/geodesy) (Node.js, single-threaded):

### latLngToUtm (10,000 coordinates)

| Implementation | ops/sec | vs SIMD WASM |
|----------------|---------|--------------|
| SIMD WASM      | 697     | 1.00x        |
| TypeScript     | 447     | 0.64x        |
| proj4          | 110     | 0.16x        |
| geodesy        | 52      | 0.07x        |

### utmToLatLng (10,000 coordinates)

| Implementation | ops/sec | vs SIMD WASM |
|----------------|---------|--------------|
| SIMD WASM      | 402     | 1.00x        |
| TypeScript     | 284     | 0.71x        |
| proj4          | 118     | 0.29x        |
| geodesy        | 45      | 0.11x        |

Run benchmarks locally:

```bash
npm run bench
```

## API

### Core Functions

#### `latLngToUtm(lat: number, lng: number): UTM`
Converts latitude/longitude to UTM coordinates.

#### `utmToLatLng(easting: number, northing: number, zone: number, hemisphere: 'N' | 'S'): LatLng`
Converts UTM coordinates to latitude/longitude.

#### `latLngToUtmBatch(coords: [number, number][]): Promise<UTM[]>`
Batch conversion with auto-selected backend.

#### `utmToLatLngBatch(utms: UTM[]): Promise<LatLng[]>`
Batch conversion with auto-selected backend.

#### `setBackend(backend: 'auto' | 'gpu' | 'wasm' | 'typescript'): void`
Sets the preferred backend for batch functions.

### Direct Backend Access

#### `latLngToUtmBatchTs(coords: [number, number][]): UTM[]`
TypeScript batch conversion.

#### `latLngToUtmBatchWasm(coords: [number, number][]): Promise<UTM[]>`
SIMD-accelerated WASM batch conversion.

#### `latLngToUtmBatchGpu(coords: [number, number][]): Promise<UTM[]>`
WebGPU-accelerated batch conversion.

#### `isGpuAvailable(): Promise<boolean>`
Check if WebGPU is available.

### Types

```typescript
interface UTM {
  easting: number;
  northing: number;
  zone: number;
  hemisphere: 'N' | 'S';
}

interface LatLng {
  lat: number;
  lng: number;
}
```

## Precision

| Backend    | Precision      | Round-trip Error | Use Case |
|------------|----------------|------------------|----------|
| TypeScript | f64 (double)   | ~14 micrometers  | Surveying, high-precision |
| WASM SIMD  | f64 (double)   | ~14 micrometers  | Surveying, high-precision |
| WebGPU     | f64 (hybrid)   | ~14 micrometers  | Large batch, high-precision |

## Algorithm

Uses the Krüger series expansion to 6th order in the third flattening (n):
- Forward: α coefficients for lat/lng → UTM
- Inverse: β coefficients for UTM → lat/lng

The 6th-order series provides sub-millimeter accuracy across the entire UTM domain.

## References

- [GeographicLib](https://geographiclib.sourceforge.io/tm.html)
- [Karney 2011 Paper](https://doi.org/10.1007/s00190-011-0445-3)

## License

MIT
