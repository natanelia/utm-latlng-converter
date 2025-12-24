// Karney/Krüger 6th-order series - nanometer accuracy
// Reference: C.F.F. Karney, "Transverse Mercator with an accuracy of a few nanometers"
// J. Geodesy 85(8), 475-485 (2011)

const WGS84_A = 6378137.0;
const WGS84_F = 1 / 298.257223563;
const K0 = 0.9996;

const n = WGS84_F / (2 - WGS84_F);
const n2 = n * n, n3 = n2 * n, n4 = n3 * n, n5 = n4 * n, n6 = n5 * n;

const A = (WGS84_A / (1 + n)) * (1 + n2/4 + n4/64 + n6/256);

// Alpha coefficients (lat/lng -> UTM)
const alpha = [
  0,
  n/2 - 2*n2/3 + 5*n3/16 + 41*n4/180 - 127*n5/288 + 7891*n6/37800,
  13*n2/48 - 3*n3/5 + 557*n4/1440 + 281*n5/630 - 1983433*n6/1935360,
  61*n3/240 - 103*n4/140 + 15061*n5/26880 + 167603*n6/181440,
  49561*n4/161280 - 179*n5/168 + 6601661*n6/7257600,
  34729*n5/80640 - 3418889*n6/1995840,
  212378941*n6/319334400
];

// Beta coefficients (UTM -> lat/lng)
const beta = [
  0,
  n/2 - 2*n2/3 + 37*n3/96 - n4/360 - 81*n5/512 + 96199*n6/604800,
  n2/48 + n3/15 - 437*n4/1440 + 46*n5/105 - 1118711*n6/3870720,
  17*n3/480 - 37*n4/840 - 209*n5/4480 + 5569*n6/90720,
  4397*n4/161280 - 11*n5/504 - 830251*n6/7257600,
  4583*n5/161280 - 108847*n6/3991680,
  20648693*n6/638668800
];

const e2 = 2 * WGS84_F - WGS84_F * WGS84_F;
const e = Math.sqrt(e2);

export interface UTM { easting: number; northing: number; zone: number; hemisphere: 'N' | 'S'; }
export interface LatLng { lat: number; lng: number; }

export function latLngToUtm(lat: number, lng: number): UTM {
  const zone = Math.floor((lng + 180) / 6) + 1;
  const lng0 = (zone - 1) * 6 - 180 + 3;
  
  const phi = lat * Math.PI / 180;
  const lam = (lng - lng0) * Math.PI / 180;
  
  const sinPhi = Math.sin(phi);
  const t = Math.sinh(Math.atanh(sinPhi) - e * Math.atanh(e * sinPhi));
  const xi = Math.atan2(t, Math.cos(lam));
  const eta = Math.atanh(Math.sin(lam) / Math.sqrt(1 + t * t));
  
  let xiSum = xi, etaSum = eta;
  for (let j = 1; j <= 6; j++) {
    xiSum += alpha[j] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    etaSum += alpha[j] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
  }
  
  const easting = 500000 + K0 * A * etaSum;
  let northing = K0 * A * xiSum;
  if (lat < 0) northing += 10000000;
  
  return { easting, northing, zone, hemisphere: lat >= 0 ? 'N' : 'S' };
}

export function utmToLatLng(easting: number, northing: number, zone: number, hemisphere: 'N' | 'S'): LatLng {
  const lng0 = (zone - 1) * 6 - 180 + 3;
  
  let y = northing;
  if (hemisphere === 'S') y -= 10000000;
  
  const xi = y / (K0 * A);
  const eta = (easting - 500000) / (K0 * A);
  
  // Compute xi' and eta' using beta series
  let xiPrime = xi, etaPrime = eta;
  for (let j = 1; j <= 6; j++) {
    xiPrime -= beta[j] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    etaPrime -= beta[j] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
  }
  
  const sinhEtaPrime = Math.sinh(etaPrime);
  const cosXiPrime = Math.cos(xiPrime);
  const sinXiPrime = Math.sin(xiPrime);
  
  // Conformal latitude chi
  const tau = sinXiPrime / Math.sqrt(sinhEtaPrime * sinhEtaPrime + cosXiPrime * cosXiPrime);
  
  // Newton iteration to find geodetic latitude from tau = tan(phi)
  // We need to solve: tau' = tau * sqrt(1 + sigma^2) - sigma * sqrt(1 + tau^2)
  // where sigma = sinh(e * atanh(e * tau / sqrt(1 + tau^2)))
  let tauI = tau;
  for (let i = 0; i < 5; i++) {
    const tau2 = tauI * tauI;
    const sigma = Math.sinh(e * Math.atanh(e * tauI / Math.sqrt(1 + tau2)));
    const tauPrime = tauI * Math.sqrt(1 + sigma * sigma) - sigma * Math.sqrt(1 + tau2);
    const dtau = (tau - tauPrime) * (1 + (1 - e2) * tau2) / ((1 - e2) * Math.sqrt((1 + tau2) * (1 + tauPrime * tauPrime)));
    tauI += dtau;
    if (Math.abs(dtau) < 1e-12) break;
  }
  
  const phi = Math.atan(tauI);
  const lam = Math.atan2(sinhEtaPrime, cosXiPrime);
  
  return { lat: phi * 180 / Math.PI, lng: lng0 + lam * 180 / Math.PI };
}
