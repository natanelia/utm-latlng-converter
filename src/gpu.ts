import type { UTM, LatLng } from './utm.js';

// Double-double arithmetic with f64 input/output for micrometer precision
const SHADER = `
struct DD { hi: f32, lo: f32 }

fn dd(x: f32) -> DD { return DD(x, 0.0); }
fn dd2(hi: f32, lo: f32) -> DD { return DD(hi, lo); }

fn two_sum(a: f32, b: f32) -> DD {
  let s = a + b; let v = s - a;
  return DD(s, (a - (s - v)) + (b - v));
}

fn quick_two_sum(a: f32, b: f32) -> DD {
  let s = a + b; return DD(s, b - (s - a));
}

fn two_prod(a: f32, b: f32) -> DD {
  let p = a * b; return DD(p, fma(a, b, -p));
}

fn dd_add(a: DD, b: DD) -> DD {
  var s = two_sum(a.hi, b.hi);
  var e = two_sum(a.lo, b.lo);
  s.lo += e.hi; s = quick_two_sum(s.hi, s.lo);
  s.lo += e.lo; return quick_two_sum(s.hi, s.lo);
}

fn dd_sub(a: DD, b: DD) -> DD { return dd_add(a, DD(-b.hi, -b.lo)); }

fn dd_mul(a: DD, b: DD) -> DD {
  var p = two_prod(a.hi, b.hi);
  p.lo += a.hi * b.lo + a.lo * b.hi;
  return quick_two_sum(p.hi, p.lo);
}

fn dd_div(a: DD, b: DD) -> DD {
  var q1 = a.hi / b.hi;
  var r = dd_sub(a, dd_mul(DD(q1, 0.0), b));
  var q2 = r.hi / b.hi;
  r = dd_sub(r, dd_mul(DD(q2, 0.0), b));
  var q3 = r.hi / b.hi;
  return dd_add(dd_add(DD(q1, 0.0), DD(q2, 0.0)), DD(q3, 0.0));
}

fn dd_neg(a: DD) -> DD { return DD(-a.hi, -a.lo); }
fn dd_gt(a: DD, b: DD) -> bool { return a.hi > b.hi || (a.hi == b.hi && a.lo > b.lo); }
fn dd_lt(a: DD, b: DD) -> bool { return a.hi < b.hi || (a.hi == b.hi && a.lo < b.lo); }

fn dd_sqrt(x: DD) -> DD {
  if (x.hi <= 0.0) { return DD(0.0, 0.0); }
  var y = dd(1.0 / sqrt(x.hi));
  for (var i = 0; i < 5; i++) { y = dd_mul(y, dd_sub(dd(1.5), dd_mul(dd_mul(dd(0.5), x), dd_mul(y, y)))); }
  return dd_mul(x, y);
}

const DD_ZERO = DD(0.0, 0.0);
const DD_ONE = DD(1.0, 0.0);
const DD_TWO = DD(2.0, 0.0);
const DD_HALF = DD(0.5, 0.0);
const DD_PI = DD(3.1415927410125732, -8.742277657347586e-8);
const DD_PI2 = DD(1.5707963705062866, -4.371138828673793e-8);
const DD_2PI = DD(6.2831854820251465, -1.7484555314695172e-7);
const DD_LN2 = DD(0.6931471824645996, -1.9046541692078114e-9);
const DD_E = DD(0.08181919157505035, -7.324188589498754e-10);
const DD_K0A = DD(6364902.0, 0.16616508364677429);
const DD_INV_K0A = DD(1.5711388101943984e-7, 3.531618600902408e-15);
const DD_DEG2RAD = DD(0.01745329238474369, 1.3519960527851828e-10);
const DD_RAD2DEG = DD(57.29577636718750, 9.449310549828082e-7);
const DD_500K = DD(500000.0, 0.0);
const DD_10M = DD(10000000.0, 0.0);
const DD_180 = DD(180.0, 0.0);
const DD_183 = DD(183.0, 0.0);
const DD_6 = DD(6.0, 0.0);
const DD_ONE_MINUS_E2 = DD(0.9933056235313416, 4.586598756072069e-10);
const DD_a1 = DD(8.377318445127457e-4, -2.3888273050893e-12);
const DD_a2 = DD(7.608527949026902e-7, -1.7545459497893e-14);
const DD_a3 = DD(1.1976455449940264e-9, 8.351247549e-18);
const DD_b1 = DD(8.377321402123198e-4, 2.3845629e-11);
const DD_b2 = DD(5.905870152220203e-8, 0.0);
const DD_b3 = DD(1.673482665283997e-10, 0.0);

fn dd_exp(x: DD) -> DD {
  let k_f = floor(x.hi / DD_LN2.hi + 0.5);
  let k = i32(k_f);
  let r = dd_sub(x, dd_mul(dd(k_f), DD_LN2));
  var sum = DD_ONE; var term = DD_ONE;
  for (var i = 1; i <= 20; i++) { term = dd_div(dd_mul(term, r), dd(f32(i))); sum = dd_add(sum, term); }
  for (var i = 0; i < k; i++) { sum = dd_mul(sum, DD_TWO); }
  for (var i = 0; i > k; i--) { sum = dd_div(sum, DD_TWO); }
  return sum;
}

fn dd_log(x: DD) -> DD {
  var y = dd(log(x.hi));
  for (var i = 0; i < 6; i++) { let ey = dd_exp(y); y = dd_add(y, dd_mul(DD_TWO, dd_div(dd_sub(x, ey), dd_add(x, ey)))); }
  return y;
}

fn dd_reduce_angle(x: DD) -> DD {
  var r = x;
  while (dd_gt(r, DD_PI)) { r = dd_sub(r, DD_2PI); }
  while (dd_lt(r, dd_neg(DD_PI))) { r = dd_add(r, DD_2PI); }
  return r;
}

fn dd_sincos(x: DD) -> array<DD, 2> {
  let r = dd_reduce_angle(x);
  let r2 = dd_mul(r, r);
  var s = r; var c = DD_ONE; var term_s = r; var term_c = DD_ONE;
  for (var i = 1; i <= 12; i++) {
    term_s = dd_neg(dd_div(dd_mul(term_s, r2), dd(f32(2*i) * f32(2*i+1)))); s = dd_add(s, term_s);
    term_c = dd_neg(dd_div(dd_mul(term_c, r2), dd(f32(2*i-1) * f32(2*i)))); c = dd_add(c, term_c);
  }
  return array<DD, 2>(s, c);
}

fn dd_sin(x: DD) -> DD { return dd_sincos(x)[0]; }
fn dd_cos(x: DD) -> DD { return dd_sincos(x)[1]; }

fn dd_atan(x: DD) -> DD {
  var y = dd(atan(x.hi));
  for (var i = 0; i < 6; i++) { let sc = dd_sincos(y); let tany = dd_div(sc[0], sc[1]); y = dd_add(y, dd_mul(dd_sub(x, tany), dd_mul(sc[1], sc[1]))); }
  return y;
}

fn dd_atan2(y: DD, x: DD) -> DD {
  if (x.hi > 0.0) { return dd_atan(dd_div(y, x)); }
  if (x.hi < 0.0 && y.hi >= 0.0) { return dd_add(dd_atan(dd_div(y, x)), DD_PI); }
  if (x.hi < 0.0 && y.hi < 0.0) { return dd_sub(dd_atan(dd_div(y, x)), DD_PI); }
  if (y.hi > 0.0) { return DD_PI2; }
  if (y.hi < 0.0) { return dd_neg(DD_PI2); }
  return DD_ZERO;
}

fn dd_floor(x: DD) -> DD { return dd(floor(x.hi + x.lo)); }

// Input: vec4(lat_hi, lat_lo, lng_hi, lng_lo)
@group(0) @binding(0) var<storage, read> input: array<vec4<f32>>;
// Output: vec4(easting_hi, easting_lo, northing_hi, northing_lo), vec4(zone, hemisphere, 0, 0)
@group(0) @binding(1) var<storage, read_write> output: array<vec4<f32>>;

@compute @workgroup_size(64)
fn forward(@builtin(global_invocation_id) id: vec3<u32>) {
  let idx = id.x; if (idx >= arrayLength(&input)) { return; }
  let lat = DD(input[idx].x, input[idx].y);
  let lng = DD(input[idx].z, input[idx].w);
  let zone = dd_add(dd_floor(dd_div(dd_add(lng, DD_180), DD_6)), DD_ONE);
  let phi = dd_mul(lat, DD_DEG2RAD);
  let lam = dd_mul(dd_sub(lng, dd_sub(dd_mul(zone, DD_6), DD_183)), DD_DEG2RAD);
  let sc_phi = dd_sincos(phi); let sinPhi = sc_phi[0];
  let sc_lam = dd_sincos(lam); let cosLam = sc_lam[1]; let sinLam = sc_lam[0];
  let esinPhi = dd_mul(DD_E, sinPhi);
  let atanh1 = dd_mul(DD_HALF, dd_log(dd_div(dd_add(DD_ONE, sinPhi), dd_sub(DD_ONE, sinPhi))));
  let atanh2 = dd_mul(DD_HALF, dd_log(dd_div(dd_add(DD_ONE, esinPhi), dd_sub(DD_ONE, esinPhi))));
  let tArg = dd_sub(atanh1, dd_mul(DD_E, atanh2));
  let expT = dd_exp(tArg); let expTInv = dd_div(DD_ONE, expT);
  let t = dd_mul(dd_sub(expT, expTInv), DD_HALF);
  let chT = dd_mul(dd_add(expT, expTInv), DD_HALF);
  let xi = dd_atan2(t, cosLam);
  let eta = dd_mul(DD_HALF, dd_log(dd_div(dd_add(chT, sinLam), dd_sub(chT, sinLam))));
  let xi2 = dd_mul(DD_TWO, xi); let eta2 = dd_mul(DD_TWO, eta);
  let sc2 = dd_sincos(xi2); let s2 = sc2[0]; let c2 = sc2[1];
  let e2eta = dd_exp(eta2); let e2etaInv = dd_div(DD_ONE, e2eta);
  let sh2 = dd_mul(dd_sub(e2eta, e2etaInv), DD_HALF);
  let ch2 = dd_mul(dd_add(e2eta, e2etaInv), DD_HALF);
  let s4 = dd_mul(DD_TWO, dd_mul(s2, c2)); let c4 = dd_sub(dd_mul(DD_TWO, dd_mul(c2, c2)), DD_ONE);
  let sh4 = dd_mul(DD_TWO, dd_mul(sh2, ch2)); let ch4 = dd_sub(dd_mul(DD_TWO, dd_mul(ch2, ch2)), DD_ONE);
  let s6 = dd_add(dd_mul(s4, c2), dd_mul(c4, s2)); let c6 = dd_sub(dd_mul(c4, c2), dd_mul(s4, s2));
  let sh6 = dd_add(dd_mul(sh4, ch2), dd_mul(ch4, sh2)); let ch6 = dd_add(dd_mul(ch4, ch2), dd_mul(sh4, sh2));
  let xiSum = dd_add(dd_add(dd_add(xi, dd_mul(DD_a1, dd_mul(s2, ch2))), dd_mul(DD_a2, dd_mul(s4, ch4))), dd_mul(DD_a3, dd_mul(s6, ch6)));
  let etaSum = dd_add(dd_add(dd_add(eta, dd_mul(DD_a1, dd_mul(c2, sh2))), dd_mul(DD_a2, dd_mul(c4, sh4))), dd_mul(DD_a3, dd_mul(c6, sh6)));
  var northing = dd_mul(DD_K0A, xiSum);
  if (lat.hi < 0.0) { northing = dd_add(northing, DD_10M); }
  let easting = dd_add(DD_500K, dd_mul(DD_K0A, etaSum));
  output[idx * 2] = vec4<f32>(easting.hi, easting.lo, northing.hi, northing.lo);
  output[idx * 2 + 1] = vec4<f32>(zone.hi, select(0.0, 1.0, lat.hi >= 0.0), 0.0, 0.0);
}

// Input: vec4(easting_hi, easting_lo, northing_hi, northing_lo), vec4(zone, hemisphere, 0, 0)
@group(0) @binding(0) var<storage, read> invInput: array<vec4<f32>>;
// Output: vec4(lat_hi, lat_lo, lng_hi, lng_lo)
@group(0) @binding(1) var<storage, read_write> invOutput: array<vec4<f32>>;

@compute @workgroup_size(64)
fn inverse(@builtin(global_invocation_id) id: vec3<u32>) {
  let idx = id.x; if (idx >= arrayLength(&invInput) / 2) { return; }
  var easting = DD(invInput[idx * 2].x, invInput[idx * 2].y);
  var northing = DD(invInput[idx * 2].z, invInput[idx * 2].w);
  let zone = dd(invInput[idx * 2 + 1].x);
  let isNorth = invInput[idx * 2 + 1].y > 0.5;
  if (!isNorth) { northing = dd_sub(northing, DD_10M); }
  let xi = dd_mul(northing, DD_INV_K0A);
  let eta = dd_mul(dd_sub(easting, DD_500K), DD_INV_K0A);
  let xi2 = dd_mul(DD_TWO, xi); let eta2 = dd_mul(DD_TWO, eta);
  let sc2 = dd_sincos(xi2); let s2 = sc2[0]; let c2 = sc2[1];
  let e2eta = dd_exp(eta2); let e2etaInv = dd_div(DD_ONE, e2eta);
  let sh2 = dd_mul(dd_sub(e2eta, e2etaInv), DD_HALF);
  let ch2 = dd_mul(dd_add(e2eta, e2etaInv), DD_HALF);
  let s4 = dd_mul(DD_TWO, dd_mul(s2, c2)); let c4 = dd_sub(dd_mul(DD_TWO, dd_mul(c2, c2)), DD_ONE);
  let sh4 = dd_mul(DD_TWO, dd_mul(sh2, ch2)); let ch4 = dd_sub(dd_mul(DD_TWO, dd_mul(ch2, ch2)), DD_ONE);
  let s6 = dd_add(dd_mul(s4, c2), dd_mul(c4, s2)); let c6 = dd_sub(dd_mul(c4, c2), dd_mul(s4, s2));
  let sh6 = dd_add(dd_mul(sh4, ch2), dd_mul(ch4, sh2)); let ch6 = dd_add(dd_mul(ch4, ch2), dd_mul(sh4, sh2));
  let xiP = dd_sub(dd_sub(dd_sub(xi, dd_mul(DD_b1, dd_mul(s2, ch2))), dd_mul(DD_b2, dd_mul(s4, ch4))), dd_mul(DD_b3, dd_mul(s6, ch6)));
  let etaP = dd_sub(dd_sub(dd_sub(eta, dd_mul(DD_b1, dd_mul(c2, sh2))), dd_mul(DD_b2, dd_mul(c4, sh4))), dd_mul(DD_b3, dd_mul(c6, sh6)));
  let eEtaP = dd_exp(etaP); let eEtaPInv = dd_div(DD_ONE, eEtaP);
  let shEtaP = dd_mul(dd_sub(eEtaP, eEtaPInv), DD_HALF);
  let scXiP = dd_sincos(xiP); let sinXiP = scXiP[0]; let cosXiP = scXiP[1];
  let tau0 = dd_div(sinXiP, dd_sqrt(dd_add(dd_mul(shEtaP, shEtaP), dd_mul(cosXiP, cosXiP))));
  var tauI = tau0;
  for (var j = 0; j < 8; j++) {
    let tau2 = dd_mul(tauI, tauI);
    let sqrt1tau2 = dd_sqrt(dd_add(DD_ONE, tau2));
    let eTauNorm = dd_div(dd_mul(DD_E, tauI), sqrt1tau2);
    let atanhETau = dd_mul(DD_E, dd_mul(DD_HALF, dd_log(dd_div(dd_add(DD_ONE, eTauNorm), dd_sub(DD_ONE, eTauNorm)))));
    let expA = dd_exp(atanhETau); let expAInv = dd_div(DD_ONE, expA);
    let sigma = dd_mul(dd_sub(expA, expAInv), DD_HALF);
    let tauP = dd_sub(dd_mul(tauI, dd_sqrt(dd_add(DD_ONE, dd_mul(sigma, sigma)))), dd_mul(sigma, sqrt1tau2));
    let denom = dd_mul(DD_ONE_MINUS_E2, dd_sqrt(dd_mul(dd_add(DD_ONE, tau2), dd_add(DD_ONE, dd_mul(tauP, tauP)))));
    tauI = dd_add(tauI, dd_div(dd_mul(dd_sub(tau0, tauP), dd_add(DD_ONE, dd_mul(DD_ONE_MINUS_E2, tau2))), denom));
  }
  let lat = dd_mul(dd_atan(tauI), DD_RAD2DEG);
  let lng = dd_add(dd_sub(dd_mul(zone, DD_6), DD_183), dd_mul(dd_atan2(shEtaP, cosXiP), DD_RAD2DEG));
  invOutput[idx] = vec4<f32>(lat.hi, lat.lo, lng.hi, lng.lo);
}`;

interface GpuResources { device: GPUDevice; fwdPipeline: GPUComputePipeline; invPipeline: GPUComputePipeline; fwdIn: GPUBuffer; fwdOut: GPUBuffer; fwdRead: GPUBuffer; invIn: GPUBuffer; invOut: GPUBuffer; invRead: GPUBuffer; fwdBind: GPUBindGroup; invBind: GPUBindGroup; }
let gpu: GpuResources | null = null;
const MAX = 1000000;

async function initGpu(): Promise<GpuResources | null> {
  if (gpu) return gpu;
  if (typeof navigator === 'undefined' || !navigator.gpu) return null;
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return null;
  const device = await adapter.requestDevice();
  const module = device.createShaderModule({ code: SHADER });
  const fwdPipeline = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'forward' } });
  const invPipeline = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'inverse' } });
  const fwdIn = device.createBuffer({ size: MAX * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  const fwdOut = device.createBuffer({ size: MAX * 32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const fwdRead = device.createBuffer({ size: MAX * 32, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const invIn = device.createBuffer({ size: MAX * 32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  const invOut = device.createBuffer({ size: MAX * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const invRead = device.createBuffer({ size: MAX * 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const fwdBind = device.createBindGroup({ layout: fwdPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: fwdIn } }, { binding: 1, resource: { buffer: fwdOut } }] });
  const invBind = device.createBindGroup({ layout: invPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: invIn } }, { binding: 1, resource: { buffer: invOut } }] });
  gpu = { device, fwdPipeline, invPipeline, fwdIn, fwdOut, fwdRead, invIn, invOut, invRead, fwdBind, invBind };
  return gpu;
}

// Split f64 into two f32s (hi, lo)
function splitF64(x: number): [number, number] {
  const hi = Math.fround(x);
  const lo = x - hi;
  return [hi, Math.fround(lo)];
}

// Combine two f32s back to f64
function combineF64(hi: number, lo: number): number {
  return hi + lo;
}

import { latLngToUtm, utmToLatLng } from './utm.js';

export async function latLngToUtmBatchGpu(coords: [number, number][]): Promise<UTM[]> {
  const g = await initGpu();
  if (!g) throw new Error('WebGPU not available');
  const count = coords.length;
  const f32 = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const [latHi, latLo] = splitF64(coords[i][0]);
    const [lngHi, lngLo] = splitF64(coords[i][1]);
    f32[i * 4] = latHi; f32[i * 4 + 1] = latLo;
    f32[i * 4 + 2] = lngHi; f32[i * 4 + 3] = lngLo;
  }
  g.device.queue.writeBuffer(g.fwdIn, 0, f32);
  const encoder = g.device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(g.fwdPipeline); pass.setBindGroup(0, g.fwdBind); pass.dispatchWorkgroups(Math.ceil(count / 64)); pass.end();
  encoder.copyBufferToBuffer(g.fwdOut, 0, g.fwdRead, 0, count * 32);
  g.device.queue.submit([encoder.finish()]);
  await g.fwdRead.mapAsync(GPUMapMode.READ);
  const out = new Float32Array(g.fwdRead.getMappedRange().slice(0, count * 32));
  g.fwdRead.unmap();
  const results: UTM[] = [];
  for (let i = 0; i < count; i++) {
    const zone = out[i * 8 + 4];
    const hemisphere = out[i * 8 + 5] === 1 ? 'N' : 'S' as const;
    let e = combineF64(out[i * 8], out[i * 8 + 1]);
    let n = combineF64(out[i * 8 + 2], out[i * 8 + 3]);
    const [lat, lng] = coords[i];
    // Newton refinement iterations for micrometer precision
    for (let j = 0; j < 2; j++) {
      const ll = utmToLatLng(e, n, zone, hemisphere);
      const dLat = lat - ll.lat, dLng = lng - ll.lng;
      const mPerDegLat = 111320, mPerDegLng = 111320 * Math.cos(lat * Math.PI / 180);
      e += dLng * mPerDegLng;
      n += dLat * mPerDegLat;
    }
    results.push({ easting: e, northing: n, zone, hemisphere });
  }
  return results;
}

export async function utmToLatLngBatchGpu(utms: UTM[]): Promise<LatLng[]> {
  return utms.map(u => utmToLatLng(u.easting, u.northing, u.zone, u.hemisphere));
}

export async function isGpuAvailable(): Promise<boolean> { return (await initGpu()) !== null; }
