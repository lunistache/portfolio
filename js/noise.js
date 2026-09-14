// Tileable (horizontally-periodic) value noise + fbm, so textures wrap
// seamlessly at the longitude seam with no visible crack.

export function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// A single periodic-in-U value-noise grid. gridU wraps; gridV clamps.
class Grid {
  constructor(rand, gridU, gridV) {
    this.gridU = gridU;
    this.gridV = gridV;
    this.data = new Float32Array(gridU * (gridV + 1));
    for (let i = 0; i < this.data.length; i++) this.data[i] = rand() * 2 - 1;
  }

  sample(u, v) {
    const x = ((u % 1) + 1) % 1 * this.gridU;
    const y = Math.min(Math.max(v, 0), 1) * this.gridV;
    const x0 = Math.floor(x) % this.gridU;
    const x1 = (x0 + 1) % this.gridU;
    const y0 = Math.min(Math.floor(y), this.gridV - 1);
    const y1 = Math.min(y0 + 1, this.gridV);
    const fx = fade(x - Math.floor(x));
    const fy = fade(y - Math.floor(y));
    const g = this.data;
    const w = this.gridU;
    const v00 = g[y0 * w + x0];
    const v10 = g[y0 * w + x1];
    const v01 = g[y1 * w + x0];
    const v11 = g[y1 * w + x1];
    return lerp(lerp(v00, v10, fx), lerp(v01, v11, fx), fy);
  }
}

// Fractal Brownian motion built from several octaves of periodic grids.
export class Fbm {
  constructor(rand, { octaves = 5, baseGridU = 6, baseGridV = 3, persistence = 0.55, lacunarity = 2 } = {}) {
    this.octaves = [];
    let gu = baseGridU;
    let gv = baseGridV;
    let amp = 1;
    let total = 0;
    for (let i = 0; i < octaves; i++) {
      this.octaves.push({ grid: new Grid(rand, Math.round(gu), Math.max(2, Math.round(gv))), amp });
      total += amp;
      amp *= persistence;
      gu *= lacunarity;
      gv *= lacunarity;
    }
    this.norm = 1 / total;
  }

  get(u, v) {
    let sum = 0;
    for (const o of this.octaves) sum += o.grid.sample(u, v) * o.amp;
    return sum * this.norm; // roughly [-1, 1]
  }
}

export function smoothstep(edge0, edge1, x) {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

export function clamp01(x) {
  return Math.min(Math.max(x, 0), 1);
}

// Pushes a roughly [-1,1] value away from the midline (p<1) for punchier,
// less "averaged-out" contrast, or toward it (p>1) for softer blending.
export function punch(h, p = 0.7) {
  const s = h < 0 ? -1 : 1;
  return s * Math.pow(Math.min(Math.abs(h), 1), p);
}

// 1 at the zero-crossings of an fbm field, falling off away from them —
// produces sharp ridge-like structures (mountain ranges, canyon walls).
export function ridge(h) {
  return 1 - Math.abs(h);
}
