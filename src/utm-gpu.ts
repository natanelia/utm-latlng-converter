// WebGPU UTM converter - batch processing for maximum throughput

const SHADER_CODE = `
const WGS84_A: f32 = 6378137.0;
const WGS84_F: f32 = 1.0 / 298.257223563;
const K0: f32 = 0.9996;
const PI: f32 = 3.14159265358979323846;

const n: f32 = WGS84_F / (2.0 - WGS84_F);
const n2: f32 = n * n;
const n3: f32 = n2 * n;
const n4: f32 = n3 * n;
const n5: f32 = n4 * n;
const n6: f32 = n5 * n;

const A: f32 = (WGS84_A / (1.0 + n)) * (1.0 + n2/4.0 + n4/64.0 + n6/256.0);
const e2: f32 = 2.0 * WGS84_F - WGS84_F * WGS84_F;
const e: f32 = sqrt(e2);

const alpha1: f32 = n/2.0 - 2.0*n2/3.0 + 5.0*n3/16.0 + 41.0*n4/180.0 - 127.0*n5/288.0 + 7891.0*n6/37800.0;
const alpha2: f32 = 13.0*n2/48.0 - 3.0*n3/5.0 + 557.0*n4/1440.0 + 281.0*n5/630.0 - 1983433.0*n6/1935360.0;
const alpha3: f32 = 61.0*n3/240.0 - 103.0*n4/140.0 + 15061.0*n5/26880.0 + 167603.0*n6/181440.0;
const alpha4: f32 = 49561.0*n4/161280.0 - 179.0*n5/168.0 + 6601661.0*n6/7257600.0;
const alpha5: f32 = 34729.0*n5/80640.0 - 3418889.0*n6/1995840.0;
const alpha6: f32 = 212378941.0*n6/319334400.0;

fn atanh(x: f32) -> f32 { return 0.5 * log((1.0 + x) / (1.0 - x)); }

@group(0) @binding(0) var<storage, read> input: array<vec2<f32>>;
@group(0) @binding(1) var<storage, read_write> output: array<vec4<f32>>;

@compute @workgroup_size(256)
fn latLngToUtm(@builtin(global_invocation_id) id: vec3<u32>) {
  let idx = id.x;
  if (idx >= arrayLength(&input)) { return; }
  
  let lat = input[idx].x;
  let lng = input[idx].y;
  
  let zone = floor((lng + 180.0) / 6.0) + 1.0;
  let lng0 = (zone - 1.0) * 6.0 - 180.0 + 3.0;
  
  let phi = lat * PI / 180.0;
  let lam = (lng - lng0) * PI / 180.0;
  
  let sinPhi = sin(phi);
  let t = sinh(atanh(sinPhi) - e * atanh(e * sinPhi));
  let xi = atan2(t, cos(lam));
  let eta = atanh(sin(lam) / sqrt(1.0 + t * t));
  
  var xiSum = xi;
  var etaSum = eta;
  xiSum += alpha1 * sin(2.0 * xi) * cosh(2.0 * eta);
  etaSum += alpha1 * cos(2.0 * xi) * sinh(2.0 * eta);
  xiSum += alpha2 * sin(4.0 * xi) * cosh(4.0 * eta);
  etaSum += alpha2 * cos(4.0 * xi) * sinh(4.0 * eta);
  xiSum += alpha3 * sin(6.0 * xi) * cosh(6.0 * eta);
  etaSum += alpha3 * cos(6.0 * xi) * sinh(6.0 * eta);
  xiSum += alpha4 * sin(8.0 * xi) * cosh(8.0 * eta);
  etaSum += alpha4 * cos(8.0 * xi) * sinh(8.0 * eta);
  xiSum += alpha5 * sin(10.0 * xi) * cosh(10.0 * eta);
  etaSum += alpha5 * cos(10.0 * xi) * sinh(10.0 * eta);
  xiSum += alpha6 * sin(12.0 * xi) * cosh(12.0 * eta);
  etaSum += alpha6 * cos(12.0 * xi) * sinh(12.0 * eta);
  
  let easting = 500000.0 + K0 * A * etaSum;
  var northing = K0 * A * xiSum;
  if (lat < 0.0) { northing += 10000000.0; }
  
  output[idx] = vec4<f32>(easting, northing, zone, select(0.0, 1.0, lat >= 0.0));
}
`;

export async function createGpuConverter() {
  if (!navigator.gpu) throw new Error('WebGPU not supported');
  
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('No GPU adapter');
  const device = await adapter.requestDevice();
  
  const module = device.createShaderModule({ code: SHADER_CODE });
  const pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module, entryPoint: 'latLngToUtm' }
  });
  
  return async (coords: Float32Array): Promise<Float32Array> => {
    const inputBuffer = device.createBuffer({
      size: coords.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });
    device.queue.writeBuffer(inputBuffer, 0, coords);
    
    const outputBuffer = device.createBuffer({
      size: (coords.length / 2) * 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
    });
    
    const readBuffer = device.createBuffer({
      size: (coords.length / 2) * 16,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
    });
    
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: inputBuffer } },
        { binding: 1, resource: { buffer: outputBuffer } }
      ]
    });
    
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(coords.length / 2 / 256));
    pass.end();
    encoder.copyBufferToBuffer(outputBuffer, 0, readBuffer, 0, (coords.length / 2) * 16);
    device.queue.submit([encoder.finish()]);
    
    await readBuffer.mapAsync(GPUMapMode.READ);
    const result = new Float32Array(readBuffer.getMappedRange().slice(0));
    readBuffer.unmap();
    
    inputBuffer.destroy();
    outputBuffer.destroy();
    readBuffer.destroy();
    
    return result;
  };
}
