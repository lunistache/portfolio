import * as THREE from "three";
import { mulberry32, Fbm, smoothstep, clamp01, punch } from "./noise.js";

// Real, photographic planet textures (NASA-derived imagery via Solar System
// Scope, CC BY 4.0) loaded from /textures. Falls back to a small amount of
// procedural generation only where no real asset exists (Uranus's rings).

const loader = new THREE.TextureLoader();
const textureCache = new Map();

function loadImageTexture(path, { srgb = true, wrapT = THREE.ClampToEdgeWrapping } = {}) {
  if (textureCache.has(path)) return textureCache.get(path);
  const tex = loader.load(path);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = wrapT;
  tex.anisotropy = 8;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(path, tex);
  return tex;
}

const bodyCache = new Map();

export function getBodyTextures(body) {
  if (bodyCache.has(body.id)) return bodyCache.get(body.id);

  if (body.texture.procedural) {
    const result = { map: makeProceduralPlanetTexture(body.texture.procedural) };
    if (body.texture.proceduralClouds) {
      result.cloudsMap = makeProceduralCloudsTexture(body.texture.proceduralClouds.seed);
    }
    bodyCache.set(body.id, result);
    return result;
  }

  if (!body.texture.file) {
    // no real photographic texture available for this body — shaded flat color
    const result = { map: null, color: body.texture.color || "#aaaaaa" };
    bodyCache.set(body.id, result);
    return result;
  }
  const result = { map: loadImageTexture(body.texture.file) };
  if (body.texture.cloudsFile) {
    // the cloud map is a grayscale luminance image, not a color texture —
    // used as an alphaMap (not sRGB, alpha isn't color data)
    result.cloudsMap = loadImageTexture(body.texture.cloudsFile, { srgb: false });
  }
  bodyCache.set(body.id, result);
  return result;
}

// ------------------------------------------------- procedural planet map ---
// Used for bodies with no real photo (e.g. a fictional project "planet"):
// generates an Earth-like but distinct continents/ocean map from noise, so
// it reads as a planet without literally reusing Earth's imagery.

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function makeProceduralPlanetTexture({ seed, oceanColor, landColors, iceColor = "#eef6f2", oceanLevel = 0.02 }) {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(w, h);

  const elevation = new Fbm(mulberry32(seed), { octaves: 6, baseGridU: 6, baseGridV: 3, persistence: 0.55, lacunarity: 2 });
  const detail = new Fbm(mulberry32(seed + 777), { octaves: 4, baseGridU: 10, baseGridV: 5, persistence: 0.5, lacunarity: 2.1 });

  const ocean = hexToRgb(oceanColor);
  const landLow = hexToRgb(landColors[0]);
  const landHigh = hexToRgb(landColors[1]);
  const ice = hexToRgb(iceColor);

  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    const lat = Math.abs(v - 0.5) * 2; // 0 at equator, 1 at poles
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const e = punch(elevation.get(u, v), 0.8);
      const coast = smoothstep(oceanLevel - 0.05, oceanLevel + 0.05, e);

      let r, g, b;
      if (coast <= 0) {
        const depth = clamp01((oceanLevel - e) * 2);
        r = lerp(ocean[0], ocean[0] * 0.55, depth);
        g = lerp(ocean[1], ocean[1] * 0.6, depth);
        b = lerp(ocean[2], ocean[2] * 0.7, depth);
      } else {
        const mix = clamp01(detail.get(u * 1.7, v * 1.7) * 0.5 + 0.5);
        r = lerp(landLow[0], landHigh[0], mix);
        g = lerp(landLow[1], landHigh[1], mix);
        b = lerp(landLow[2], landHigh[2], mix);
        if (coast < 1) {
          r = lerp(ocean[0], r, coast);
          g = lerp(ocean[1], g, coast);
          b = lerp(ocean[2], b, coast);
        }
      }

      const iceMix = smoothstep(0.8, 0.94, lat);
      r = lerp(r, ice[0], iceMix);
      g = lerp(g, ice[1], iceMix);
      b = lerp(b, ice[2], iceMix);

      const idx = (y * w + x) * 4;
      img.data[idx] = r | 0;
      img.data[idx + 1] = g | 0;
      img.data[idx + 2] = b | 0;
      img.data[idx + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeProceduralCloudsTexture(seed) {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(w, h);

  const fbm = new Fbm(mulberry32(seed), { octaves: 5, baseGridU: 8, baseGridV: 4, persistence: 0.5, lacunarity: 2.2 });

  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    for (let x = 0; x < w; x++) {
      const u = x / w;
      // grayscale luminance image, like the real cloud photos — alphaMap
      // sampling ignores the canvas's own alpha channel (see loadImageTexture)
      const gray = smoothstep(0.15, 0.55, fbm.get(u, v)) * 255;
      const idx = (y * w + x) * 4;
      img.data[idx] = gray;
      img.data[idx + 1] = gray;
      img.data[idx + 2] = gray;
      img.data[idx + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

export function getMoonTexture(file) {
  return loadImageTexture(file);
}

// ---------------------------------------------------------- ring texture ---

const ringCache = new Map();

export function getRingTexture(body) {
  if (ringCache.has(body.id)) return ringCache.get(body.id);
  const tex = body.ringTextureFile
    ? loadImageTexture(body.ringTextureFile, { wrapT: THREE.RepeatWrapping })
    : makeProceduralRingTexture(body.ringColor || "#c9b89a", hashSeed(body.id));
  ringCache.set(body.id, tex);
  return tex;
}

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return h;
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Used only for bodies with no real ring photo available (Uranus).
function makeProceduralRingTexture(baseColor, seed) {
  const w = 1024;
  const h = 96;
  const rand = mulberry32(seed * 1000);
  const base = hexToRgb(baseColor);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  let pos = 0;
  while (pos < w) {
    const width = 3 + rand() * 22;
    const isGap = rand() < 0.14;
    const shade = 0.45 + rand() * 0.65;
    const alpha = isGap ? 0.03 + rand() * 0.05 : 0.4 + shade * 0.55;
    ctx.fillStyle = `rgba(${base[0] * shade | 0},${base[1] * shade | 0},${base[2] * shade | 0},${alpha})`;
    ctx.fillRect(pos, 0, width, h);
    pos += width;
  }
  for (let x = 0; x < w; x++) {
    if (rand() < 0.35) {
      const y = (rand() * h) | 0;
      ctx.fillStyle = `rgba(255,255,255,${rand() * 0.1})`;
      ctx.fillRect(x, y, 1, 2);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
