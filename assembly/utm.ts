// SIMD-optimized UTM using v128 for parallel f64 operations (2 coords at once)

const K0A: f64 = 6364902.166165086;
const INV_K0A: f64 = 1.0 / K0A;
const E: f64 = 0.08181919084262149;
const E2: f64 = 0.0066943799901413165;
const ONE_MINUS_E2: f64 = 1.0 - E2;
const DEG2RAD: f64 = 0.017453292519943295;
const RAD2DEG: f64 = 57.29577951308232;

const a1: f64 = 8.377318206244698e-4, a2: f64 = 7.608527773572307e-7, a3: f64 = 1.197645503329453e-9;
const b1: f64 = 8.377321640579488e-4, b2: f64 = 5.905870152220203e-8, b3: f64 = 1.673482665283997e-10;

// SIMD constants
const K0A_V = f64x2.splat(K0A);
const E_V = f64x2.splat(E);
const DEG2RAD_V = f64x2.splat(DEG2RAD);
const HALF_V = f64x2.splat(0.5);
const ONE_V = f64x2.splat(1.0);
const TWO_V = f64x2.splat(2.0);
const SIX_V = f64x2.splat(6.0);
const V180 = f64x2.splat(180.0);
const V183 = f64x2.splat(183.0);
const V500K = f64x2.splat(500000.0);
const V10M = f64x2.splat(10000000.0);
const a1_V = f64x2.splat(a1), a2_V = f64x2.splat(a2), a3_V = f64x2.splat(a3);

// Scalar fallback for transcendentals (WASM SIMD lacks these)
function simd_sin(v: v128): v128 {
  return f64x2(Math.sin(f64x2.extract_lane(v, 0)), Math.sin(f64x2.extract_lane(v, 1)));
}
function simd_cos(v: v128): v128 {
  return f64x2(Math.cos(f64x2.extract_lane(v, 0)), Math.cos(f64x2.extract_lane(v, 1)));
}
function simd_exp(v: v128): v128 {
  return f64x2(Math.exp(f64x2.extract_lane(v, 0)), Math.exp(f64x2.extract_lane(v, 1)));
}
function simd_log(v: v128): v128 {
  return f64x2(Math.log(f64x2.extract_lane(v, 0)), Math.log(f64x2.extract_lane(v, 1)));
}
function simd_atan2(y: v128, x: v128): v128 {
  return f64x2(Math.atan2(f64x2.extract_lane(y, 0), f64x2.extract_lane(x, 0)), Math.atan2(f64x2.extract_lane(y, 1), f64x2.extract_lane(x, 1)));
}
function simd_floor(v: v128): v128 {
  return f64x2.floor(v);
}
function simd_sqrt(v: v128): v128 {
  return f64x2.sqrt(v);
}

export function forwardBatchSimd(inputPtr: i32, outputPtr: i32, count: i32): void {
  const pairs = count >> 1;
  
  for (let i: i32 = 0; i < pairs; i++) {
    const base = inputPtr + i * 32;
    const lat = v128.load(base);       // [lat0, lat1]
    const lng = v128.load(base + 16);  // [lng0, lng1]
    
    // zone = floor((lng + 180) / 6) + 1
    const zone = f64x2.add(simd_floor(f64x2.div(f64x2.add(lng, V180), SIX_V)), ONE_V);
    
    // phi = lat * DEG2RAD, lam = (lng - (zone*6 - 183)) * DEG2RAD
    const phi = f64x2.mul(lat, DEG2RAD_V);
    const lng0 = f64x2.sub(f64x2.mul(zone, SIX_V), V183);
    const lam = f64x2.mul(f64x2.sub(lng, lng0), DEG2RAD_V);
    
    const sinPhi = simd_sin(phi);
    const cosLam = simd_cos(lam);
    const sinLam = simd_sin(lam);
    
    // t = sinh(atanh(sinPhi) - e*atanh(e*sinPhi))
    const esinPhi = f64x2.mul(E_V, sinPhi);
    const atanh1 = f64x2.mul(HALF_V, simd_log(f64x2.div(f64x2.add(ONE_V, sinPhi), f64x2.sub(ONE_V, sinPhi))));
    const atanh2 = f64x2.mul(HALF_V, simd_log(f64x2.div(f64x2.add(ONE_V, esinPhi), f64x2.sub(ONE_V, esinPhi))));
    const tArg = f64x2.sub(atanh1, f64x2.mul(E_V, atanh2));
    const expT = simd_exp(tArg);
    const expTInv = f64x2.div(ONE_V, expT);
    const t = f64x2.mul(f64x2.sub(expT, expTInv), HALF_V);
    const chT = f64x2.mul(f64x2.add(expT, expTInv), HALF_V);
    
    const xi = simd_atan2(t, cosLam);
    const eta = f64x2.mul(HALF_V, simd_log(f64x2.div(f64x2.add(chT, sinLam), f64x2.sub(chT, sinLam))));
    
    // Series expansion
    const xi2 = f64x2.add(xi, xi), eta2 = f64x2.add(eta, eta);
    const s2 = simd_sin(xi2), c2 = simd_cos(xi2);
    const e2eta = simd_exp(eta2), e2etaInv = f64x2.div(ONE_V, e2eta);
    const sh2 = f64x2.mul(f64x2.sub(e2eta, e2etaInv), HALF_V);
    const ch2 = f64x2.mul(f64x2.add(e2eta, e2etaInv), HALF_V);
    
    const s4 = f64x2.mul(TWO_V, f64x2.mul(s2, c2));
    const c4 = f64x2.sub(f64x2.mul(TWO_V, f64x2.mul(c2, c2)), ONE_V);
    const sh4 = f64x2.mul(TWO_V, f64x2.mul(sh2, ch2));
    const ch4 = f64x2.sub(f64x2.mul(TWO_V, f64x2.mul(ch2, ch2)), ONE_V);
    
    const s6 = f64x2.add(f64x2.mul(s4, c2), f64x2.mul(c4, s2));
    const c6 = f64x2.sub(f64x2.mul(c4, c2), f64x2.mul(s4, s2));
    const sh6 = f64x2.add(f64x2.mul(sh4, ch2), f64x2.mul(ch4, sh2));
    const ch6 = f64x2.add(f64x2.mul(ch4, ch2), f64x2.mul(sh4, sh2));
    
    const xiSum = f64x2.add(f64x2.add(f64x2.add(xi, f64x2.mul(a1_V, f64x2.mul(s2, ch2))), f64x2.mul(a2_V, f64x2.mul(s4, ch4))), f64x2.mul(a3_V, f64x2.mul(s6, ch6)));
    const etaSum = f64x2.add(f64x2.add(f64x2.add(eta, f64x2.mul(a1_V, f64x2.mul(c2, sh2))), f64x2.mul(a2_V, f64x2.mul(c4, sh4))), f64x2.mul(a3_V, f64x2.mul(c6, sh6)));
    
    const easting = f64x2.add(V500K, f64x2.mul(K0A_V, etaSum));
    let northing = f64x2.mul(K0A_V, xiSum);
    
    // Add 10M for southern hemisphere
    const lat0 = f64x2.extract_lane(lat, 0);
    const lat1 = f64x2.extract_lane(lat, 1);
    const n0 = f64x2.extract_lane(northing, 0) + (lat0 < 0 ? 10000000.0 : 0);
    const n1 = f64x2.extract_lane(northing, 1) + (lat1 < 0 ? 10000000.0 : 0);
    
    // Store results: [e0, n0, z0, h0, e1, n1, z1, h1]
    const outBase = outputPtr + i * 64;
    store<f64>(outBase, f64x2.extract_lane(easting, 0));
    store<f64>(outBase + 8, n0);
    store<f64>(outBase + 16, f64x2.extract_lane(zone, 0));
    store<f64>(outBase + 24, lat0 >= 0 ? 1.0 : 0.0);
    store<f64>(outBase + 32, f64x2.extract_lane(easting, 1));
    store<f64>(outBase + 40, n1);
    store<f64>(outBase + 48, f64x2.extract_lane(zone, 1));
    store<f64>(outBase + 56, lat1 >= 0 ? 1.0 : 0.0);
  }
  
  // Handle odd element
  if (count & 1) {
    const idx = count - 1;
    const lat = load<f64>(inputPtr + idx * 16);
    const lng = load<f64>(inputPtr + idx * 16 + 8);
    const zone = Math.floor((lng + 180.0) / 6.0) + 1.0;
    const phi = lat * DEG2RAD;
    const lam = (lng - (zone * 6.0 - 183.0)) * DEG2RAD;
    const sinPhi = Math.sin(phi);
    const esinPhi = E * sinPhi;
    const tArg = 0.5 * (Math.log((1.0 + sinPhi) / (1.0 - sinPhi)) - E * Math.log((1.0 + esinPhi) / (1.0 - esinPhi)));
    const expT = Math.exp(tArg), expTInv = 1.0 / expT;
    const t = (expT - expTInv) * 0.5, chT = (expT + expTInv) * 0.5;
    const cosLam = Math.cos(lam), sinLam = Math.sin(lam);
    const xi = Math.atan2(t, cosLam);
    const eta = 0.5 * Math.log((chT + sinLam) / (chT - sinLam));
    const xi2 = xi * 2, eta2 = eta * 2;
    const s2 = Math.sin(xi2), c2 = Math.cos(xi2);
    const e2eta = Math.exp(eta2), e2etaInv = 1.0 / e2eta;
    const sh2 = (e2eta - e2etaInv) * 0.5, ch2 = (e2eta + e2etaInv) * 0.5;
    const s4 = 2*s2*c2, c4 = 2*c2*c2-1, sh4 = 2*sh2*ch2, ch4 = 2*ch2*ch2-1;
    const s6 = s4*c2+c4*s2, c6 = c4*c2-s4*s2, sh6 = sh4*ch2+ch4*sh2, ch6 = ch4*ch2+sh4*sh2;
    const xiSum = xi + a1*s2*ch2 + a2*s4*ch4 + a3*s6*ch6;
    const etaSum = eta + a1*c2*sh2 + a2*c4*sh4 + a3*c6*sh6;
    const outBase = outputPtr + idx * 32;
    store<f64>(outBase, 500000.0 + K0A * etaSum);
    store<f64>(outBase + 8, (lat < 0 ? 10000000.0 : 0) + K0A * xiSum);
    store<f64>(outBase + 16, zone);
    store<f64>(outBase + 24, lat >= 0 ? 1.0 : 0.0);
  }
}


export function inverseBatchSimd(inputPtr: i32, outputPtr: i32, count: i32): void {
  for (let i: i32 = 0; i < count; i++) {
    const base = inputPtr + i * 32;
    const easting = load<f64>(base);
    const northing = load<f64>(base + 8);
    const zone = load<f64>(base + 16);
    const hemi = load<f64>(base + 24);

    const xi = (hemi === 0.0 ? northing - 10000000.0 : northing) * INV_K0A;
    const eta = (easting - 500000.0) * INV_K0A;

    const xi2 = 2.0 * xi, eta2 = 2.0 * eta;
    const s2 = Math.sin(xi2), c2 = Math.cos(xi2);
    const e2eta = Math.exp(eta2), e2etaInv = 1.0 / e2eta;
    const sh2 = (e2eta - e2etaInv) * 0.5, ch2 = (e2eta + e2etaInv) * 0.5;
    const s4 = 2.0*s2*c2, c4 = 2.0*c2*c2-1.0, sh4 = 2.0*sh2*ch2, ch4 = 2.0*ch2*ch2-1.0;
    const s6 = s4*c2+c4*s2, c6 = c4*c2-s4*s2, sh6 = sh4*ch2+ch4*sh2, ch6 = ch4*ch2+sh4*sh2;

    const xiP = xi - b1*s2*ch2 - b2*s4*ch4 - b3*s6*ch6;
    const etaP = eta - b1*c2*sh2 - b2*c4*sh4 - b3*c6*sh6;

    const eEtaP = Math.exp(etaP), eEtaPInv = 1.0 / eEtaP;
    const shEtaP = (eEtaP - eEtaPInv) * 0.5;
    const cosXiP = Math.cos(xiP), sinXiP = Math.sin(xiP);
    const tau = sinXiP / Math.sqrt(shEtaP * shEtaP + cosXiP * cosXiP);

    let tauI = tau;
    for (let j = 0; j < 2; j++) {
      const tau2 = tauI * tauI;
      const sqrt1tau2 = Math.sqrt(1.0 + tau2);
      const eTauNorm = E * tauI / sqrt1tau2;
      const atanhETau = E * 0.5 * Math.log((1.0 + eTauNorm) / (1.0 - eTauNorm));
      const expA = Math.exp(atanhETau), expAInv = 1.0 / expA;
      const sigma = (expA - expAInv) * 0.5;
      const tauP = tauI * Math.sqrt(1.0 + sigma * sigma) - sigma * sqrt1tau2;
      tauI += (tau - tauP) * (1.0 + ONE_MINUS_E2 * tau2) / (ONE_MINUS_E2 * Math.sqrt((1.0 + tau2) * (1.0 + tauP * tauP)));
    }

    const outBase = outputPtr + i * 16;
    store<f64>(outBase, Math.atan(tauI) * RAD2DEG);
    store<f64>(outBase + 8, zone * 6.0 - 183.0 + Math.atan2(shEtaP, cosXiP) * RAD2DEG);
  }
}
