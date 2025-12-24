# UTM Converter

High-precision UTM ↔ Lat/Lng converter using the Karney/Krüger 6th-order series algorithm.

## Accuracy

- **~200 nanometer precision** within UTM domain
- Based on: C.F.F. Karney, "Transverse Mercator with an accuracy of a few nanometers", J. Geodesy 85(8), 475-485 (2011)
- Uses WGS84 ellipsoid

## Implementations

| Implementation | Use Case | Precision |
|---------------|----------|-----------|
| TypeScript | General use, Node.js/browser | float64 (~15 digits) |
| AssemblyScript | WASM for near-native speed | float64 |
| WebGPU | Batch processing (1M+ coords) | float32 (~7 digits) |

## Usage

```typescript
import { latLngToUtm, utmToLatLng } from 'utm-converter';

// Lat/Lng to UTM
const utm = latLngToUtm(40.7128, -74.006);
// { easting: 583960.0, northing: 4507523.0, zone: 18, hemisphere: 'N' }

// UTM to Lat/Lng
const latLng = utmToLatLng(583960, 4507523, 18, 'N');
// { lat: 40.7128, lng: -74.006 }
```

## Scripts

```bash
npm test        # Run tests
npm run bench   # Run benchmarks
npm run build   # Build TypeScript
npm run asbuild # Build AssemblyScript WASM
```

## Algorithm

Uses the Krüger series expansion to 6th order in the third flattening (n):
- Forward: α coefficients for lat/lng → UTM
- Inverse: β coefficients for UTM → lat/lng

The 6th-order series provides sub-millimeter accuracy across the entire UTM domain.

## References

- [GeographicLib](https://geographiclib.sourceforge.io/tm.html)
- [Karney 2011 Paper](https://doi.org/10.1007/s00190-011-0445-3)
