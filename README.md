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

### Batch Processing (TypeScript)

```typescript
import { latLngToUtmBatch, utmToLatLngBatch } from 'utm-latlng-converter';

const coords: [number, number][] = [[40.7128, -74.006], [51.5074, -0.1278]];
const utmResults = latLngToUtmBatch(coords);
```

### WASM SIMD (Fastest for batches)

```typescript
import { latLngToUtmBatchWasm, utmToLatLngBatchWasm } from 'utm-latlng-converter';

const coords: [number, number][] = [[40.7128, -74.006], [51.5074, -0.1278]];
const utmResults = await latLngToUtmBatchWasm(coords);
```

### Smart Auto-Selection

Automatically uses WebGPU for large batches (≥100k), WASM SIMD for smaller batches, falls back to TypeScript:

```typescript
import { latLngToUtmBatchSmart, setBackend } from 'utm-latlng-converter';

// Auto-selects best backend
const results = await latLngToUtmBatchSmart(coords);

// Force specific backend
setBackend('gpu');        // Always use WebGPU
setBackend('wasm');       // Always use WASM
setBackend('typescript'); // Always use TypeScript
setBackend('auto');       // Auto-select (default)
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

#### `latLngToUtmBatch(coords: [number, number][]): UTM[]`
Batch conversion of lat/lng pairs to UTM.

#### `utmToLatLngBatch(utms: UTM[]): LatLng[]`
Batch conversion of UTM coordinates to lat/lng.

### WASM Functions

#### `latLngToUtmBatchWasm(coords: [number, number][]): Promise<UTM[]>`
SIMD-accelerated batch conversion of lat/lng pairs to UTM.

#### `utmToLatLngBatchWasm(utms: UTM[]): Promise<LatLng[]>`
SIMD-accelerated batch conversion of UTM coordinates to lat/lng.

### Smart Functions

#### `latLngToUtmBatchSmart(coords: [number, number][]): Promise<UTM[]>`
Auto-selects best backend for batch conversion.

#### `utmToLatLngBatchSmart(utms: UTM[]): Promise<LatLng[]>`
Auto-selects best backend for batch conversion.

#### `setBackend(backend: 'auto' | 'gpu' | 'wasm' | 'typescript'): void`
Sets the preferred backend for smart functions.

### GPU Functions

#### `latLngToUtmBatchGpu(coords: [number, number][]): Promise<UTM[]>`
WebGPU-accelerated batch conversion of lat/lng pairs to UTM.

#### `utmToLatLngBatchGpu(utms: UTM[]): Promise<LatLng[]>`
WebGPU-accelerated batch conversion of UTM coordinates to lat/lng.

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
