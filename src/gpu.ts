import type { UTM, LatLng } from './utm.js';

// Double-single (DS) emulated f64 using two f32s for ~14 digit precision
const SHADER = `
struct DS { hi: f32, lo: f32 }

fn ds(x: f32) -> DS { return DS(x, 0.0); }

fn two_sum(a: f32, b: f32) -> DS {
  let s = a + b;
  let v = s - a;
  return DS(s, (a - (s - v)) + (b - v));
}

fn ds_add(a: DS, b: DS) -> DS {
  let s = two_sum(a.hi, b.hi);
  let c = two_sum(s.hi, s.lo + a.lo + b.lo);
  return DS(c.hi, c.lo);
}

fn ds_sub(a: DS, b: DS) -> DS { return ds_add(a, DS(-b.hi, -b.lo)); }

fn two_prod(a: f32, b: f32) -> DS {
  let p = a * b;
  return DS(p, fma(a, b, -p));
}

fn ds_mul(a: DS, b: DS) -> DS {
  let p = two_prod(a.hi, b.hi);
  return DS(p.hi, p.lo + a.hi * b.lo + a.lo * b.hi);
}

fn ds_div(a: DS, b: DS) -> DS {
  let q = a.hi / b.hi;
  let r = ds_sub(a, ds_mul(DS(q, 0.0), b));
  return DS(q, r.hi / b.hi);
}

fn ds_neg(a: DS) -> DS { return DS(-a.hi, -a.lo); }
fn ds_abs(a: DS) -> DS { if (a.hi < 0.0) { return ds_neg(a); } return a; }
fn ds_gt(a: DS, b: DS) -> bool { return a.hi > b.hi || (a.hi == b.hi && a.lo > b.lo); }
fn ds_lt(a: DS, b: DS) -> bool { return a.hi < b.hi || (a.hi == b.hi && a.lo < b.lo); }

// Constants
const DS_ZERO = DS(0.0, 0.0);
const DS_ONE = DS(1.0, 0.0);
const DS_TWO = DS(2.0, 0.0);
const DS_HALF = DS(0.5, 0.0);
const DS_PI = DS(3.1415927, -8.742278e-8);
const DS_PI2 = DS(1.5707964, -4.371139e-8);
const DS_E = DS(0.08181919, 8.426214e-10);
const DS_K0A = DS(6364902.0, 0.16616508);
const DS_INV_K0A = DS(1.5711388e-7, 2.0764632e-15);
const DS_DEG2RAD = DS(0.017453292, 5.358979e-10);
const DS_RAD2DEG = DS(57.29578, -1.9878496e-6);
const DS_500K = DS(500000.0, 0.0);
const DS_10M = DS(10000000.0, 0.0);
const DS_180 = DS(180.0, 0.0);
const DS_183 = DS(183.0, 0.0);
const DS_6 = DS(6.0, 0.0);
const DS_ONE_MINUS_E2 = DS(0.99330562, 9.901414e-10);
const DS_a1 = DS(8.3773184e-4, -1.7937558e-12);
const DS_a2 = DS(7.608528e-7, -2.2357203e-14);
const DS_a3 = DS(1.1976455e-9, 3.2945297e-18);
const DS_b1 = DS(8.3773214e-4, 6.4057948e-12);
const DS_b2 = DS(5.9058703e-8, -1.5220316e-16);
const DS_b3 = DS(1.6734827e-10, -6.2996974e-19);

// exp using Taylor series
fn ds_exp(x: DS) -> DS {
  // Range reduction: exp(x) = 2^k * exp(r) where r = x - k*ln2
  let ln2 = DS(0.6931472, -1.9046542e-9);
  let k_f = floor(x.hi / ln2.hi + 0.5);
  let k = i32(k_f);
  let r = ds_sub(x, ds_mul(DS(k_f, 0.0), ln2));
  // Taylor: 1 + r + r^2/2 + r^3/6 + r^4/24 + r^5/120 + r^6/720
  var sum = DS_ONE;
  var term = r;
  sum = ds_add(sum, term);
  term = ds_mul(term, ds_div(r, DS_TWO)); sum = ds_add(sum, term);
  term = ds_mul(term, ds_div(r, ds(3.0))); sum = ds_add(sum, term);
  term = ds_mul(term, ds_div(r, ds(4.0))); sum = ds_add(sum, term);
  term = ds_mul(term, ds_div(r, ds(5.0))); sum = ds_add(sum, term);
  term = ds_mul(term, ds_div(r, ds(6.0))); sum = ds_add(sum, term);
  term = ds_mul(term, ds_div(r, ds(7.0))); sum = ds_add(sum, term);
  term = ds_mul(term, ds_div(r, ds(8.0))); sum = ds_add(sum, term);
  // Multiply by 2^k
  for (var i = 0; i < k; i++) { sum = ds_mul(sum, DS_TWO); }
  for (var i = 0; i > k; i--) { sum = ds_div(sum, DS_TWO); }
  return sum;
}

// log using Newton iteration: y = y + 2*(x - exp(y))/(x + exp(y))
fn ds_log(x: DS) -> DS {
  var y = ds(log(x.hi));
  for (var i = 0; i < 3; i++) {
    let ey = ds_exp(y);
    y = ds_add(y, ds_mul(DS_TWO, ds_div(ds_sub(x, ey), ds_add(x, ey))));
  }
  return y;
}

// sin/cos using Taylor series with range reduction
fn ds_sincos(x: DS) -> array<DS, 2> {
  // Reduce to [-pi, pi]
  let pi2 = ds_mul(DS_TWO, DS_PI);
  var r = x;
  while (ds_gt(r, DS_PI)) { r = ds_sub(r, pi2); }
  while (ds_lt(r, ds_neg(DS_PI))) { r = ds_add(r, pi2); }
  let r2 = ds_mul(r, r);
  // sin Taylor: r - r^3/6 + r^5/120 - r^7/5040 + r^9/362880
  var s = r;
  var term = ds_neg(ds_div(ds_mul(ds_mul(r, r2), DS_ONE), ds(6.0)));
  s = ds_add(s, term);
  term = ds_div(ds_mul(term, r2), ds(-20.0)); s = ds_add(s, term);
  term = ds_div(ds_mul(term, r2), ds(-42.0)); s = ds_add(s, term);
  term = ds_div(ds_mul(term, r2), ds(-72.0)); s = ds_add(s, term);
  // cos Taylor: 1 - r^2/2 + r^4/24 - r^6/720 + r^8/40320
  var c = DS_ONE;
  term = ds_neg(ds_div(r2, DS_TWO));
  c = ds_add(c, term);
  term = ds_div(ds_mul(term, r2), ds(-12.0)); c = ds_add(c, term);
  term = ds_div(ds_mul(term, r2), ds(-30.0)); c = ds_add(c, term);
  term = ds_div(ds_mul(term, r2), ds(-56.0)); c = ds_add(c, term);
  return array<DS, 2>(s, c);
}

fn ds_sin(x: DS) -> DS { return ds_sincos(x)[0]; }
fn ds_cos(x: DS) -> DS { return ds_sincos(x)[1]; }

fn ds_atan(x: DS) -> DS {
  // atan via Newton on tan: y = y + (x - tan(y)) * cos^2(y)
  var y = ds(atan(x.hi));
  for (var i = 0; i < 2; i++) {
    let sc = ds_sincos(y);
    let tany = ds_div(sc[0], sc[1]);
    let cos2y = ds_mul(sc[1], sc[1]);
    y = ds_add(y, ds_mul(ds_sub(x, tany), cos2y));
  }
  return y;
}

fn ds_atan2(y: DS, x: DS) -> DS {
  if (x.hi > 0.0) { return ds_atan(ds_div(y, x)); }
  if (x.hi < 0.0 && y.hi >= 0.0) { return ds_add(ds_atan(ds_div(y, x)), DS_PI); }
  if (x.hi < 0.0 && y.hi < 0.0) { return ds_sub(ds_atan(ds_div(y, x)), DS_PI); }
  if (y.hi > 0.0) { return DS_PI2; }
  if (y.hi < 0.0) { return ds_neg(DS_PI2); }
  return DS_ZERO;
}

fn ds_sqrt(x: DS) -> DS {
  var y = ds(sqrt(x.hi));
  y = ds_mul(DS_HALF, ds_add(y, ds_div(x, y)));
  y = ds_mul(DS_HALF, ds_add(y, ds_div(x, y)));
  return y;
}

fn ds_floor(x: DS) -> DS { return ds(floor(x.hi + x.lo)); }

@group(0) @binding(0) var<storage, read> input: array<vec2<f32>>;
@group(0) @binding(1) var<storage, read_write> output: array<vec4<f32>>;

@compute @workgroup_size(64)
fn forward(@builtin(global_invocation_id) id: vec3<u32>) {
  let idx = id.x; if (idx >= arrayLength(&input)) { return; }
  let lat = ds(input[idx].x); let lng = ds(input[idx].y);
  
  let zone = ds_add(ds_floor(ds_div(ds_add(lng, DS_180), DS_6)), DS_ONE);
  let phi = ds_mul(lat, DS_DEG2RAD);
  let lng0 = ds_sub(ds_mul(zone, DS_6), DS_183);
  let lam = ds_mul(ds_sub(lng, lng0), DS_DEG2RAD);
  
  let sc_phi = ds_sincos(phi);
  let sinPhi = sc_phi[0]; let cosPhi = sc_phi[1];
  let sc_lam = ds_sincos(lam);
  let cosLam = sc_lam[1]; let sinLam = sc_lam[0];
  
  let esinPhi = ds_mul(DS_E, sinPhi);
  let atanh1 = ds_mul(DS_HALF, ds_log(ds_div(ds_add(DS_ONE, sinPhi), ds_sub(DS_ONE, sinPhi))));
  let atanh2 = ds_mul(DS_HALF, ds_log(ds_div(ds_add(DS_ONE, esinPhi), ds_sub(DS_ONE, esinPhi))));
  let tArg = ds_sub(atanh1, ds_mul(DS_E, atanh2));
  
  let expT = ds_exp(tArg);
  let expTInv = ds_div(DS_ONE, expT);
  let t = ds_mul(ds_sub(expT, expTInv), DS_HALF);
  let chT = ds_mul(ds_add(expT, expTInv), DS_HALF);
  
  let xi = ds_atan2(t, cosLam);
  let eta = ds_mul(DS_HALF, ds_log(ds_div(ds_add(chT, sinLam), ds_sub(chT, sinLam))));
  
  let xi2 = ds_mul(DS_TWO, xi); let eta2 = ds_mul(DS_TWO, eta);
  let sc2 = ds_sincos(xi2); let s2 = sc2[0]; let c2 = sc2[1];
  let e2eta = ds_exp(eta2); let e2etaInv = ds_div(DS_ONE, e2eta);
  let sh2 = ds_mul(ds_sub(e2eta, e2etaInv), DS_HALF);
  let ch2 = ds_mul(ds_add(e2eta, e2etaInv), DS_HALF);
  
  let s4 = ds_mul(DS_TWO, ds_mul(s2, c2));
  let c4 = ds_sub(ds_mul(DS_TWO, ds_mul(c2, c2)), DS_ONE);
  let sh4 = ds_mul(DS_TWO, ds_mul(sh2, ch2));
  let ch4 = ds_sub(ds_mul(DS_TWO, ds_mul(ch2, ch2)), DS_ONE);
  
  let s6 = ds_add(ds_mul(s4, c2), ds_mul(c4, s2));
  let c6 = ds_sub(ds_mul(c4, c2), ds_mul(s4, s2));
  let sh6 = ds_add(ds_mul(sh4, ch2), ds_mul(ch4, sh2));
  let ch6 = ds_add(ds_mul(ch4, ch2), ds_mul(sh4, sh2));
  
  let xiSum = ds_add(ds_add(ds_add(xi, ds_mul(DS_a1, ds_mul(s2, ch2))), ds_mul(DS_a2, ds_mul(s4, ch4))), ds_mul(DS_a3, ds_mul(s6, ch6)));
  let etaSum = ds_add(ds_add(ds_add(eta, ds_mul(DS_a1, ds_mul(c2, sh2))), ds_mul(DS_a2, ds_mul(c4, sh4))), ds_mul(DS_a3, ds_mul(c6, sh6)));
  
  var northing = ds_mul(DS_K0A, xiSum);
  if (lat.hi < 0.0) { northing = ds_add(northing, DS_10M); }
  let easting = ds_add(DS_500K, ds_mul(DS_K0A, etaSum));
  
  output[idx] = vec4<f32>(easting.hi + easting.lo, northing.hi + northing.lo, zone.hi, select(0.0, 1.0, lat.hi >= 0.0));
}

@group(0) @binding(0) var<storage, read> invInput: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> invOutput: array<vec2<f32>>;

@compute @workgroup_size(64)
fn inverse(@builtin(global_invocation_id) id: vec3<u32>) {
  let idx = id.x; if (idx >= arrayLength(&invInput)) { return; }
  var easting = ds(invInput[idx].x);
  var northing = ds(invInput[idx].y);
  let zone = ds(invInput[idx].z);
  let isNorth = invInput[idx].w > 0.5;
  
  if (!isNorth) { northing = ds_sub(northing, DS_10M); }
  
  let xi = ds_mul(northing, DS_INV_K0A);
  let eta = ds_mul(ds_sub(easting, DS_500K), DS_INV_K0A);
  
  let xi2 = ds_mul(DS_TWO, xi); let eta2 = ds_mul(DS_TWO, eta);
  let sc2 = ds_sincos(xi2); let s2 = sc2[0]; let c2 = sc2[1];
  let e2eta = ds_exp(eta2); let e2etaInv = ds_div(DS_ONE, e2eta);
  let sh2 = ds_mul(ds_sub(e2eta, e2etaInv), DS_HALF);
  let ch2 = ds_mul(ds_add(e2eta, e2etaInv), DS_HALF);
  
  let s4 = ds_mul(DS_TWO, ds_mul(s2, c2));
  let c4 = ds_sub(ds_mul(DS_TWO, ds_mul(c2, c2)), DS_ONE);
  let sh4 = ds_mul(DS_TWO, ds_mul(sh2, ch2));
  let ch4 = ds_sub(ds_mul(DS_TWO, ds_mul(ch2, ch2)), DS_ONE);
  let s6 = ds_add(ds_mul(s4, c2), ds_mul(c4, s2));
  let c6 = ds_sub(ds_mul(c4, c2), ds_mul(s4, s2));
  let sh6 = ds_add(ds_mul(sh4, ch2), ds_mul(ch4, sh2));
  let ch6 = ds_add(ds_mul(ch4, ch2), ds_mul(sh4, sh2));
  
  let xiP = ds_sub(ds_sub(ds_sub(xi, ds_mul(DS_b1, ds_mul(s2, ch2))), ds_mul(DS_b2, ds_mul(s4, ch4))), ds_mul(DS_b3, ds_mul(s6, ch6)));
  let etaP = ds_sub(ds_sub(ds_sub(eta, ds_mul(DS_b1, ds_mul(c2, sh2))), ds_mul(DS_b2, ds_mul(c4, sh4))), ds_mul(DS_b3, ds_mul(c6, sh6)));
  
  let eEtaP = ds_exp(etaP); let eEtaPInv = ds_div(DS_ONE, eEtaP);
  let shEtaP = ds_mul(ds_sub(eEtaP, eEtaPInv), DS_HALF);
  let scXiP = ds_sincos(xiP); let sinXiP = scXiP[0]; let cosXiP = scXiP[1];
  let tau0 = ds_div(sinXiP, ds_sqrt(ds_add(ds_mul(shEtaP, shEtaP), ds_mul(cosXiP, cosXiP))));
  
  var tauI = tau0;
  for (var j = 0; j < 3; j++) {
    let tau2 = ds_mul(tauI, tauI);
    let sqrt1tau2 = ds_sqrt(ds_add(DS_ONE, tau2));
    let eTauNorm = ds_div(ds_mul(DS_E, tauI), sqrt1tau2);
    let atanhETau = ds_mul(DS_E, ds_mul(DS_HALF, ds_log(ds_div(ds_add(DS_ONE, eTauNorm), ds_sub(DS_ONE, eTauNorm)))));
    let expA = ds_exp(atanhETau); let expAInv = ds_div(DS_ONE, expA);
    let sigma = ds_mul(ds_sub(expA, expAInv), DS_HALF);
    let tauP = ds_sub(ds_mul(tauI, ds_sqrt(ds_add(DS_ONE, ds_mul(sigma, sigma)))), ds_mul(sigma, sqrt1tau2));
    let denom = ds_mul(DS_ONE_MINUS_E2, ds_sqrt(ds_mul(ds_add(DS_ONE, tau2), ds_add(DS_ONE, ds_mul(tauP, tauP)))));
    tauI = ds_add(tauI, ds_div(ds_mul(ds_sub(tau0, tauP), ds_add(DS_ONE, ds_mul(DS_ONE_MINUS_E2, tau2))), denom));
  }
  
  let lat = ds_mul(ds_atan(tauI), DS_RAD2DEG);
  let lng = ds_add(ds_sub(ds_mul(zone, DS_6), DS_183), ds_mul(ds_atan2(shEtaP, cosXiP), DS_RAD2DEG));
  
  invOutput[idx] = vec2<f32>(lat.hi + lat.lo, lng.hi + lng.lo);
}`;

interface GpuResources {
  device: GPUDevice;
  fwdPipeline: GPUComputePipeline;
  invPipeline: GPUComputePipeline;
  fwdIn: GPUBuffer; fwdOut: GPUBuffer; fwdRead: GPUBuffer;
  invIn: GPUBuffer; invOut: GPUBuffer; invRead: GPUBuffer;
  fwdBind: GPUBindGroup; invBind: GPUBindGroup;
}

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
  const fwdIn = device.createBuffer({ size: MAX * 8, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  const fwdOut = device.createBuffer({ size: MAX * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const fwdRead = device.createBuffer({ size: MAX * 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const invIn = device.createBuffer({ size: MAX * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  const invOut = device.createBuffer({ size: MAX * 8, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const invRead = device.createBuffer({ size: MAX * 8, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const fwdBind = device.createBindGroup({ layout: fwdPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: fwdIn } }, { binding: 1, resource: { buffer: fwdOut } }] });
  const invBind = device.createBindGroup({ layout: invPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: invIn } }, { binding: 1, resource: { buffer: invOut } }] });
  gpu = { device, fwdPipeline, invPipeline, fwdIn, fwdOut, fwdRead, invIn, invOut, invRead, fwdBind, invBind };
  return gpu;
}

export async function latLngToUtmBatchGpu(coords: [number, number][]): Promise<UTM[]> {
  const g = await initGpu();
  if (!g) throw new Error('WebGPU not available');
  const count = coords.length;
  const f32 = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) { f32[i * 2] = coords[i][0]; f32[i * 2 + 1] = coords[i][1]; }
  g.device.queue.writeBuffer(g.fwdIn, 0, f32);
  const encoder = g.device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(g.fwdPipeline); pass.setBindGroup(0, g.fwdBind); pass.dispatchWorkgroups(Math.ceil(count / 64)); pass.end();
  encoder.copyBufferToBuffer(g.fwdOut, 0, g.fwdRead, 0, count * 16);
  g.device.queue.submit([encoder.finish()]);
  await g.fwdRead.mapAsync(GPUMapMode.READ);
  const out = new Float32Array(g.fwdRead.getMappedRange().slice(0, count * 16));
  g.fwdRead.unmap();
  const results: UTM[] = [];
  for (let i = 0; i < count; i++) {
    results.push({ easting: out[i * 4], northing: out[i * 4 + 1], zone: out[i * 4 + 2], hemisphere: out[i * 4 + 3] === 1 ? 'N' : 'S' });
  }
  return results;
}

export async function utmToLatLngBatchGpu(utms: UTM[]): Promise<LatLng[]> {
  const g = await initGpu();
  if (!g) throw new Error('WebGPU not available');
  const count = utms.length;
  const f32 = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) { f32[i * 4] = utms[i].easting; f32[i * 4 + 1] = utms[i].northing; f32[i * 4 + 2] = utms[i].zone; f32[i * 4 + 3] = utms[i].hemisphere === 'N' ? 1 : 0; }
  g.device.queue.writeBuffer(g.invIn, 0, f32);
  const encoder = g.device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(g.invPipeline); pass.setBindGroup(0, g.invBind); pass.dispatchWorkgroups(Math.ceil(count / 64)); pass.end();
  encoder.copyBufferToBuffer(g.invOut, 0, g.invRead, 0, count * 8);
  g.device.queue.submit([encoder.finish()]);
  await g.invRead.mapAsync(GPUMapMode.READ);
  const out = new Float32Array(g.invRead.getMappedRange().slice(0, count * 8));
  g.invRead.unmap();
  const results: LatLng[] = [];
  for (let i = 0; i < count; i++) { results.push({ lat: out[i * 2], lng: out[i * 2 + 1] }); }
  return results;
}

export async function isGpuAvailable(): Promise<boolean> {
  return (await initGpu()) !== null;
}
