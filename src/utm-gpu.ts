// Optimized WebGPU UTM converter

const SHADER_CODE = `
const K0A: f32 = 6364902.166165086;
const INV_K0A: f32 = 1.0 / 6364902.166165086;
const E: f32 = 0.08181919084262149;
const ONE_MINUS_E2: f32 = 0.9933056200098587;
const DEG2RAD: f32 = 0.017453292519943295;
const RAD2DEG: f32 = 57.29577951308232;

const a1: f32 = 8.377318206244698e-4;
const a2: f32 = 7.608527773572307e-7;
const a3: f32 = 1.197645503329453e-9;

const b1: f32 = 8.377321640579488e-4;
const b2: f32 = 5.905870152220203e-8;
const b3: f32 = 1.673482665283997e-10;

@group(0) @binding(0) var<storage, read> input: array<vec2<f32>>;
@group(0) @binding(1) var<storage, read_write> output: array<vec4<f32>>;

@compute @workgroup_size(256)
fn forward(@builtin(global_invocation_id) id: vec3<u32>) {
  let idx = id.x;
  if (idx >= arrayLength(&input)) { return; }
  
  let lat = input[idx].x;
  let lng = input[idx].y;
  
  let zone = floor((lng + 180.0) / 6.0) + 1.0;
  let phi = lat * DEG2RAD;
  let lam = (lng - (zone * 6.0 - 183.0)) * DEG2RAD;
  
  let sinPhi = sin(phi);
  let cosLam = cos(lam);
  let sinLam = sin(lam);
  let esinPhi = E * sinPhi;
  let tArg = 0.5 * (log((1.0 + sinPhi) / (1.0 - sinPhi)) - E * log((1.0 + esinPhi) / (1.0 - esinPhi)));
  let expT = exp(tArg);
  let expTInv = 1.0 / expT;
  let t = (expT - expTInv) * 0.5;
  let chT = (expT + expTInv) * 0.5;
  let xi = atan2(t, cosLam);
  let eta = 0.5 * log((chT + sinLam) / (chT - sinLam));
  
  let xi2 = xi + xi;
  let eta2 = eta + eta;
  let s2 = sin(xi2);
  let c2 = cos(xi2);
  let e2eta = exp(eta2);
  let e2etaInv = 1.0 / e2eta;
  let sh2 = (e2eta - e2etaInv) * 0.5;
  let ch2 = (e2eta + e2etaInv) * 0.5;
  let s4 = 2.0 * s2 * c2;
  let c4 = 2.0 * c2 * c2 - 1.0;
  let sh4 = 2.0 * sh2 * ch2;
  let ch4 = 2.0 * ch2 * ch2 - 1.0;
  let s6 = s4 * c2 + c4 * s2;
  let c6 = c4 * c2 - s4 * s2;
  let sh6 = sh4 * ch2 + ch4 * sh2;
  let ch6 = ch4 * ch2 + sh4 * sh2;
  
  let xiSum = xi + a1*s2*ch2 + a2*s4*ch4 + a3*s6*ch6;
  let etaSum = eta + a1*c2*sh2 + a2*c4*sh4 + a3*c6*sh6;
  
  let easting = 500000.0 + K0A * etaSum;
  var northing = K0A * xiSum;
  if (lat < 0.0) { northing += 10000000.0; }
  
  output[idx] = vec4<f32>(easting, northing, zone, select(0.0, 1.0, lat >= 0.0));
}

@group(0) @binding(0) var<storage, read> invInput: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> invOutput: array<vec2<f32>>;

@compute @workgroup_size(256)
fn inverse(@builtin(global_invocation_id) id: vec3<u32>) {
  let idx = id.x;
  if (idx >= arrayLength(&invInput)) { return; }
  
  let easting = invInput[idx].x;
  var northing = invInput[idx].y;
  let zone = invInput[idx].z;
  let isNorth = invInput[idx].w > 0.5;
  
  if (!isNorth) { northing -= 10000000.0; }
  
  let xi = northing * INV_K0A;
  let eta = (easting - 500000.0) * INV_K0A;
  
  let xi2 = xi + xi;
  let eta2 = eta + eta;
  let s2 = sin(xi2);
  let c2 = cos(xi2);
  let e2eta = exp(eta2);
  let e2etaInv = 1.0 / e2eta;
  let sh2 = (e2eta - e2etaInv) * 0.5;
  let ch2 = (e2eta + e2etaInv) * 0.5;
  let s4 = 2.0 * s2 * c2;
  let c4 = 2.0 * c2 * c2 - 1.0;
  let sh4 = 2.0 * sh2 * ch2;
  let ch4 = 2.0 * ch2 * ch2 - 1.0;
  let s6 = s4 * c2 + c4 * s2;
  let c6 = c4 * c2 - s4 * s2;
  let sh6 = sh4 * ch2 + ch4 * sh2;
  let ch6 = ch4 * ch2 + sh4 * sh2;
  
  let xiP = xi - b1*s2*ch2 - b2*s4*ch4 - b3*s6*ch6;
  let etaP = eta - b1*c2*sh2 - b2*c4*sh4 - b3*c6*sh6;
  
  let eEtaP = exp(etaP);
  let eEtaPInv = 1.0 / eEtaP;
  let shEtaP = (eEtaP - eEtaPInv) * 0.5;
  let cosXiP = cos(xiP);
  let sinXiP = sin(xiP);
  let tau0 = sinXiP / sqrt(shEtaP * shEtaP + cosXiP * cosXiP);
  
  // Newton iteration (2 iterations)
  var tauI = tau0;
  var tau2 = tauI * tauI;
  var sqrt1tau2 = sqrt(1.0 + tau2);
  var eTauNorm = E * tauI / sqrt1tau2;
  var atanhETau = E * 0.5 * log((1.0 + eTauNorm) / (1.0 - eTauNorm));
  var expA = exp(atanhETau);
  var expAInv = 1.0 / expA;
  var sigma = (expA - expAInv) * 0.5;
  var tauP = tauI * sqrt(1.0 + sigma * sigma) - sigma * sqrt1tau2;
  tauI += (tau0 - tauP) * (1.0 + ONE_MINUS_E2 * tau2) / (ONE_MINUS_E2 * sqrt((1.0 + tau2) * (1.0 + tauP * tauP)));
  
  tau2 = tauI * tauI;
  sqrt1tau2 = sqrt(1.0 + tau2);
  eTauNorm = E * tauI / sqrt1tau2;
  atanhETau = E * 0.5 * log((1.0 + eTauNorm) / (1.0 - eTauNorm));
  expA = exp(atanhETau);
  expAInv = 1.0 / expA;
  sigma = (expA - expAInv) * 0.5;
  tauP = tauI * sqrt(1.0 + sigma * sigma) - sigma * sqrt1tau2;
  tauI += (tau0 - tauP) * (1.0 + ONE_MINUS_E2 * tau2) / (ONE_MINUS_E2 * sqrt((1.0 + tau2) * (1.0 + tauP * tauP)));
  
  let lat = atan(tauI) * RAD2DEG;
  let lng = zone * 6.0 - 183.0 + atan2(shEtaP, cosXiP) * RAD2DEG;
  
  invOutput[idx] = vec2<f32>(lat, lng);
}
`;

interface GpuConverter {
  forward: (coords: Float32Array) => Promise<Float32Array>;
  inverse: (utm: Float32Array) => Promise<Float32Array>;
  destroy: () => void;
}

export async function createGpuConverter(): Promise<GpuConverter> {
  if (!navigator.gpu) throw new Error('WebGPU not supported');
  
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('No GPU adapter');
  const device = await adapter.requestDevice();
  
  const module = device.createShaderModule({ code: SHADER_CODE });
  
  const fwdPipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module, entryPoint: 'forward' }
  });
  
  const invPipeline = device.createComputePipeline({
    layout: 'auto', 
    compute: { module, entryPoint: 'inverse' }
  });
  
  const MAX = 1000000;
  const fwdIn = device.createBuffer({ size: MAX * 8, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  const fwdOut = device.createBuffer({ size: MAX * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const fwdRead = device.createBuffer({ size: MAX * 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const invIn = device.createBuffer({ size: MAX * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  const invOut = device.createBuffer({ size: MAX * 8, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const invRead = device.createBuffer({ size: MAX * 8, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  
  const fwdBind = device.createBindGroup({ layout: fwdPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: fwdIn } }, { binding: 1, resource: { buffer: fwdOut } }] });
  const invBind = device.createBindGroup({ layout: invPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: invIn } }, { binding: 1, resource: { buffer: invOut } }] });
  
  const forward = async (coords: Float32Array): Promise<Float32Array> => {
    const count = coords.length / 2, outSize = count * 16;
    device.queue.writeBuffer(fwdIn, 0, coords);
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(fwdPipeline);
    pass.setBindGroup(0, fwdBind);
    pass.dispatchWorkgroups(Math.ceil(count / 256));
    pass.end();
    encoder.copyBufferToBuffer(fwdOut, 0, fwdRead, 0, outSize);
    device.queue.submit([encoder.finish()]);
    await fwdRead.mapAsync(GPUMapMode.READ);
    const result = new Float32Array(fwdRead.getMappedRange().slice(0, outSize));
    fwdRead.unmap();
    return result;
  };
  
  const inverse = async (utm: Float32Array): Promise<Float32Array> => {
    const count = utm.length / 4, outSize = count * 8;
    device.queue.writeBuffer(invIn, 0, utm);
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(invPipeline);
    pass.setBindGroup(0, invBind);
    pass.dispatchWorkgroups(Math.ceil(count / 256));
    pass.end();
    encoder.copyBufferToBuffer(invOut, 0, invRead, 0, outSize);
    device.queue.submit([encoder.finish()]);
    await invRead.mapAsync(GPUMapMode.READ);
    const result = new Float32Array(invRead.getMappedRange().slice(0, outSize));
    invRead.unmap();
    return result;
  };
  
  const destroy = () => {
    fwdIn.destroy(); fwdOut.destroy(); fwdRead.destroy();
    invIn.destroy(); invOut.destroy(); invRead.destroy();
  };
  
  return { forward, inverse, destroy };
}
