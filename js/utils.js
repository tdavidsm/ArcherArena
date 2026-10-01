// Simplex-like 2D noise (based on value noise with smoothing)
const NOISE_SEED = Math.random() * 65536;

function hash(x, y) {
  let h = NOISE_SEED + x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return (h & 0x7fffffff) / 0x7fffffff;
}

function smoothNoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const n00 = hash(ix, iy);
  const n10 = hash(ix + 1, iy);
  const n01 = hash(ix, iy + 1);
  const n11 = hash(ix + 1, iy + 1);

  const nx0 = n00 + sx * (n10 - n00);
  const nx1 = n01 + sx * (n11 - n01);
  return nx0 + sy * (nx1 - nx0);
}

export function noise2D(x, y) {
  return smoothNoise(x, y) * 2 - 1;
}

export function fbm(x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
  let sum = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxAmplitude = 0;

  for (let i = 0; i < octaves; i++) {
    sum += smoothNoise(x * frequency, y * frequency) * amplitude;
    maxAmplitude += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return sum / maxAmplitude;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

export function degToRad(deg) {
  return deg * Math.PI / 180;
}

export function radToDeg(rad) {
  return rad * 180 / Math.PI;
}

export function randRange(min, max) {
  return min + Math.random() * (max - min);
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function distXZ(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}
