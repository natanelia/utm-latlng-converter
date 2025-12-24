// AssemblyScript UTM converter - Karney/Krüger 6th-order series

const WGS84_A: f64 = 6378137.0;
const WGS84_F: f64 = 1.0 / 298.257223563;
const K0: f64 = 0.9996;

const n: f64 = WGS84_F / (2.0 - WGS84_F);
const n2: f64 = n * n;
const n3: f64 = n2 * n;
const n4: f64 = n3 * n;
const n5: f64 = n4 * n;
const n6: f64 = n5 * n;

const A: f64 = (WGS84_A / (1.0 + n)) * (1.0 + n2/4.0 + n4/64.0 + n6/256.0);

const e2: f64 = 2.0 * WGS84_F - WGS84_F * WGS84_F;
const e: f64 = Math.sqrt(e2);

const alpha1: f64 = n/2.0 - 2.0*n2/3.0 + 5.0*n3/16.0 + 41.0*n4/180.0 - 127.0*n5/288.0 + 7891.0*n6/37800.0;
const alpha2: f64 = 13.0*n2/48.0 - 3.0*n3/5.0 + 557.0*n4/1440.0 + 281.0*n5/630.0 - 1983433.0*n6/1935360.0;
const alpha3: f64 = 61.0*n3/240.0 - 103.0*n4/140.0 + 15061.0*n5/26880.0 + 167603.0*n6/181440.0;
const alpha4: f64 = 49561.0*n4/161280.0 - 179.0*n5/168.0 + 6601661.0*n6/7257600.0;
const alpha5: f64 = 34729.0*n5/80640.0 - 3418889.0*n6/1995840.0;
const alpha6: f64 = 212378941.0*n6/319334400.0;

const beta1: f64 = n/2.0 - 2.0*n2/3.0 + 37.0*n3/96.0 - n4/360.0 - 81.0*n5/512.0 + 96199.0*n6/604800.0;
const beta2: f64 = n2/48.0 + n3/15.0 - 437.0*n4/1440.0 + 46.0*n5/105.0 - 1118711.0*n6/3870720.0;
const beta3: f64 = 17.0*n3/480.0 - 37.0*n4/840.0 - 209.0*n5/4480.0 + 5569.0*n6/90720.0;
const beta4: f64 = 4397.0*n4/161280.0 - 11.0*n5/504.0 - 830251.0*n6/7257600.0;
const beta5: f64 = 4583.0*n5/161280.0 - 108847.0*n6/3991680.0;
const beta6: f64 = 20648693.0*n6/638668800.0;

@inline function atanh(x: f64): f64 { return 0.5 * Math.log((1.0 + x) / (1.0 - x)); }

export function latLngToUtmEasting(lat: f64, lng: f64): f64 {
  const zone = Math.floor((lng + 180.0) / 6.0) + 1.0;
  const lng0 = (zone - 1.0) * 6.0 - 180.0 + 3.0;
  
  const phi = lat * Math.PI / 180.0;
  const lam = (lng - lng0) * Math.PI / 180.0;
  
  const sinPhi = Math.sin(phi);
  const t = Math.sinh(atanh(sinPhi) - e * atanh(e * sinPhi));
  const xi = Math.atan2(t, Math.cos(lam));
  const eta = atanh(Math.sin(lam) / Math.sqrt(1.0 + t * t));
  
  let etaSum = eta
    + alpha1 * Math.cos(2.0 * xi) * Math.sinh(2.0 * eta)
    + alpha2 * Math.cos(4.0 * xi) * Math.sinh(4.0 * eta)
    + alpha3 * Math.cos(6.0 * xi) * Math.sinh(6.0 * eta)
    + alpha4 * Math.cos(8.0 * xi) * Math.sinh(8.0 * eta)
    + alpha5 * Math.cos(10.0 * xi) * Math.sinh(10.0 * eta)
    + alpha6 * Math.cos(12.0 * xi) * Math.sinh(12.0 * eta);
  
  return 500000.0 + K0 * A * etaSum;
}

export function latLngToUtmNorthing(lat: f64, lng: f64): f64 {
  const zone = Math.floor((lng + 180.0) / 6.0) + 1.0;
  const lng0 = (zone - 1.0) * 6.0 - 180.0 + 3.0;
  
  const phi = lat * Math.PI / 180.0;
  const lam = (lng - lng0) * Math.PI / 180.0;
  
  const sinPhi = Math.sin(phi);
  const t = Math.sinh(atanh(sinPhi) - e * atanh(e * sinPhi));
  const xi = Math.atan2(t, Math.cos(lam));
  const eta = atanh(Math.sin(lam) / Math.sqrt(1.0 + t * t));
  
  let xiSum = xi
    + alpha1 * Math.sin(2.0 * xi) * Math.cosh(2.0 * eta)
    + alpha2 * Math.sin(4.0 * xi) * Math.cosh(4.0 * eta)
    + alpha3 * Math.sin(6.0 * xi) * Math.cosh(6.0 * eta)
    + alpha4 * Math.sin(8.0 * xi) * Math.cosh(8.0 * eta)
    + alpha5 * Math.sin(10.0 * xi) * Math.cosh(10.0 * eta)
    + alpha6 * Math.sin(12.0 * xi) * Math.cosh(12.0 * eta);
  
  let northing = K0 * A * xiSum;
  if (lat < 0.0) northing += 10000000.0;
  return northing;
}

export function latLngToUtmZone(lng: f64): i32 {
  return <i32>Math.floor((lng + 180.0) / 6.0) + 1;
}

export function utmToLat(easting: f64, northing: f64, zone: i32, isNorth: bool): f64 {
  const lng0 = <f64>(zone - 1) * 6.0 - 180.0 + 3.0;
  
  let y = northing;
  if (!isNorth) y -= 10000000.0;
  
  const xi = y / (K0 * A);
  const eta = (easting - 500000.0) / (K0 * A);
  
  let xiPrime = xi
    - beta1 * Math.sin(2.0 * xi) * Math.cosh(2.0 * eta)
    - beta2 * Math.sin(4.0 * xi) * Math.cosh(4.0 * eta)
    - beta3 * Math.sin(6.0 * xi) * Math.cosh(6.0 * eta)
    - beta4 * Math.sin(8.0 * xi) * Math.cosh(8.0 * eta)
    - beta5 * Math.sin(10.0 * xi) * Math.cosh(10.0 * eta)
    - beta6 * Math.sin(12.0 * xi) * Math.cosh(12.0 * eta);
  
  let etaPrime = eta
    - beta1 * Math.cos(2.0 * xi) * Math.sinh(2.0 * eta)
    - beta2 * Math.cos(4.0 * xi) * Math.sinh(4.0 * eta)
    - beta3 * Math.cos(6.0 * xi) * Math.sinh(6.0 * eta)
    - beta4 * Math.cos(8.0 * xi) * Math.sinh(8.0 * eta)
    - beta5 * Math.cos(10.0 * xi) * Math.sinh(10.0 * eta)
    - beta6 * Math.cos(12.0 * xi) * Math.sinh(12.0 * eta);
  
  const sinhEtaPrime = Math.sinh(etaPrime);
  const cosXiPrime = Math.cos(xiPrime);
  const sinXiPrime = Math.sin(xiPrime);
  
  let tau = sinXiPrime / Math.sqrt(sinhEtaPrime * sinhEtaPrime + cosXiPrime * cosXiPrime);
  
  for (let i = 0; i < 5; i++) {
    const tau2 = tau * tau;
    const sigma = Math.sinh(e * atanh(e * tau / Math.sqrt(1.0 + tau2)));
    const tauPrime = tau * Math.sqrt(1.0 + sigma * sigma) - sigma * Math.sqrt(1.0 + tau2);
    const dtau = (tau - tauPrime) * (1.0 + (1.0 - e2) * tau2) / ((1.0 - e2) * Math.sqrt((1.0 + tau2) * (1.0 + tauPrime * tauPrime)));
    tau += dtau;
    if (Math.abs(dtau) < 1e-12) break;
  }
  
  return Math.atan(tau) * 180.0 / Math.PI;
}

export function utmToLng(easting: f64, northing: f64, zone: i32, isNorth: bool): f64 {
  const lng0 = <f64>(zone - 1) * 6.0 - 180.0 + 3.0;
  
  let y = northing;
  if (!isNorth) y -= 10000000.0;
  
  const xi = y / (K0 * A);
  const eta = (easting - 500000.0) / (K0 * A);
  
  let etaPrime = eta
    - beta1 * Math.cos(2.0 * xi) * Math.sinh(2.0 * eta)
    - beta2 * Math.cos(4.0 * xi) * Math.sinh(4.0 * eta)
    - beta3 * Math.cos(6.0 * xi) * Math.sinh(6.0 * eta)
    - beta4 * Math.cos(8.0 * xi) * Math.sinh(8.0 * eta)
    - beta5 * Math.cos(10.0 * xi) * Math.sinh(10.0 * eta)
    - beta6 * Math.cos(12.0 * xi) * Math.sinh(12.0 * eta);
  
  let xiPrime = xi
    - beta1 * Math.sin(2.0 * xi) * Math.cosh(2.0 * eta)
    - beta2 * Math.sin(4.0 * xi) * Math.cosh(4.0 * eta)
    - beta3 * Math.sin(6.0 * xi) * Math.cosh(6.0 * eta)
    - beta4 * Math.sin(8.0 * xi) * Math.cosh(8.0 * eta)
    - beta5 * Math.sin(10.0 * xi) * Math.cosh(10.0 * eta)
    - beta6 * Math.sin(12.0 * xi) * Math.cosh(12.0 * eta);
  
  const lam = Math.atan2(Math.sinh(etaPrime), Math.cos(xiPrime));
  
  return lng0 + lam * 180.0 / Math.PI;
}
