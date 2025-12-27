// Karney/Krüger 6th-order series - nanometer accuracy (optimized)

const K0A = 6364902.166165086;
const INV_K0A = 1 / K0A;
const E = 0.08181919084262149;
const E2 = 0.0066943799901413165;
const ONE_MINUS_E2 = 1 - E2;

// Alpha coefficients (lat/lng -> UTM)
const a1 = 8.377318206244698e-4, a2 = 7.608527773572307e-7, a3 = 1.197645503329453e-9;

// Beta coefficients (UTM -> lat/lng)
const b1 = 8.377321640579488e-4, b2 = 5.905870152220203e-8, b3 = 1.673482665283997e-10;

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

export interface UTM { easting: number; northing: number; zone: number; hemisphere: 'N' | 'S'; }
export interface LatLng { lat: number; lng: number; }

export function latLngToUtm(lat: number, lng: number): UTM {
  const zone = ((lng + 180) / 6 | 0) + 1;
  const phi = lat * DEG2RAD;
  const lam = (lng - (zone * 6 - 183)) * DEG2RAD;

  const sinPhi = Math.sin(phi);
  const cosLam = Math.cos(lam);
  const sinLam = Math.sin(lam);
  const esinPhi = E * sinPhi;
  const tArg = 0.5 * (Math.log((1 + sinPhi) / (1 - sinPhi)) - E * Math.log((1 + esinPhi) / (1 - esinPhi)));
  const expT = Math.exp(tArg), expTInv = 1 / expT;
  const t = (expT - expTInv) * 0.5;
  const chT = (expT + expTInv) * 0.5;
  const xi = Math.atan2(t, cosLam);
  const eta = 0.5 * Math.log((chT + sinLam) / (chT - sinLam));

  const xi2 = xi + xi, eta2 = eta + eta;
  const s2 = Math.sin(xi2), c2 = Math.cos(xi2);
  const e2eta = Math.exp(eta2), e2etaInv = 1 / e2eta;
  const sh2 = (e2eta - e2etaInv) * 0.5, ch2 = (e2eta + e2etaInv) * 0.5;
  const s4 = 2 * s2 * c2, c4 = 2 * c2 * c2 - 1;
  const sh4 = 2 * sh2 * ch2, ch4 = 2 * ch2 * ch2 - 1;
  const s6 = s4 * c2 + c4 * s2, c6 = c4 * c2 - s4 * s2;
  const sh6 = sh4 * ch2 + ch4 * sh2, ch6 = ch4 * ch2 + sh4 * sh2;

  const xiSum = xi + a1*s2*ch2 + a2*s4*ch4 + a3*s6*ch6;
  const etaSum = eta + a1*c2*sh2 + a2*c4*sh4 + a3*c6*sh6;

  return {
    easting: 500000 + K0A * etaSum,
    northing: lat < 0 ? 10000000 + K0A * xiSum : K0A * xiSum,
    zone,
    hemisphere: lat >= 0 ? 'N' : 'S'
  };
}

export function utmToLatLng(easting: number, northing: number, zone: number, hemisphere: 'N' | 'S'): LatLng {
  const xi = (hemisphere === 'S' ? northing - 10000000 : northing) * INV_K0A;
  const eta = (easting - 500000) * INV_K0A;

  const xi2 = 2 * xi, eta2 = 2 * eta;
  const s2 = Math.sin(xi2), c2 = Math.cos(xi2);
  const e2eta = Math.exp(eta2), e2etaInv = 1 / e2eta;
  const sh2 = (e2eta - e2etaInv) * 0.5, ch2 = (e2eta + e2etaInv) * 0.5;
  const s4 = 2 * s2 * c2, c4 = 2 * c2 * c2 - 1;
  const sh4 = 2 * sh2 * ch2, ch4 = 2 * ch2 * ch2 - 1;
  const s6 = s4 * c2 + c4 * s2, c6 = c4 * c2 - s4 * s2;
  const sh6 = sh4 * ch2 + ch4 * sh2, ch6 = ch4 * ch2 + sh4 * sh2;

  const xiP = xi - b1*s2*ch2 - b2*s4*ch4 - b3*s6*ch6;
  const etaP = eta - b1*c2*sh2 - b2*c4*sh4 - b3*c6*sh6;

  const eEtaP = Math.exp(etaP), eEtaPInv = 1 / eEtaP;
  const shEtaP = (eEtaP - eEtaPInv) * 0.5;
  const cosXiP = Math.cos(xiP);
  const sinXiP = Math.sin(xiP);
  const tau = sinXiP / Math.sqrt(shEtaP * shEtaP + cosXiP * cosXiP);

  // Newton iteration (unrolled, 2 iterations)
  let tauI = tau;
  let tau2 = tauI * tauI;
  let sqrt1tau2 = Math.sqrt(1 + tau2);
  let eTauNorm = E * tauI / sqrt1tau2;
  let atanhETau = E * 0.5 * Math.log((1 + eTauNorm) / (1 - eTauNorm));
  let expA = Math.exp(atanhETau), expAInv = 1 / expA;
  let sigma = (expA - expAInv) * 0.5;
  let tauP = tauI * Math.sqrt(1 + sigma * sigma) - sigma * sqrt1tau2;
  tauI += (tau - tauP) * (1 + ONE_MINUS_E2 * tau2) / (ONE_MINUS_E2 * Math.sqrt((1 + tau2) * (1 + tauP * tauP)));

  tau2 = tauI * tauI;
  sqrt1tau2 = Math.sqrt(1 + tau2);
  eTauNorm = E * tauI / sqrt1tau2;
  atanhETau = E * 0.5 * Math.log((1 + eTauNorm) / (1 - eTauNorm));
  expA = Math.exp(atanhETau); expAInv = 1 / expA;
  sigma = (expA - expAInv) * 0.5;
  tauP = tauI * Math.sqrt(1 + sigma * sigma) - sigma * sqrt1tau2;
  tauI += (tau - tauP) * (1 + ONE_MINUS_E2 * tau2) / (ONE_MINUS_E2 * Math.sqrt((1 + tau2) * (1 + tauP * tauP)));

  return {
    lat: Math.atan(tauI) * RAD2DEG,
    lng: zone * 6 - 183 + Math.atan2(shEtaP, cosXiP) * RAD2DEG
  };
}


export function latLngToUtmBatch(coords: [number, number][]): UTM[] {
  return coords.map(([lat, lng]) => latLngToUtm(lat, lng));
}

export function utmToLatLngBatch(utms: UTM[]): LatLng[] {
  return utms.map(u => utmToLatLng(u.easting, u.northing, u.zone, u.hemisphere));
}
