import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Loads external glTF/GLB model(s) (downloaded assets, e.g. a Sketchfab bust
// or poly.pizza props) and flattens every mesh primitive in them — after
// baking each one's world transform in, so multi-part models still come out
// correctly posed — into a single Mesh, centered and rescaled to
// targetRadius. Each primitive keeps its own material (as a mesh group), so
// multi-material models (e.g. a scroll with separate parchment/wood colors)
// don't collapse to one flat color. Bodies built this way then behave
// exactly like the procedural ones (single Mesh) for raycasting/hover, and
// the same targetRadius drops into all the existing radius-based math
// (label height, hit-sphere size, camera framing).
//
// `model` is either { file } or { parts: [{ file, scale, stretch, position, rotationY }] }
// — parts are placed in the first file's raw units, then the whole
// composition is merged and normalized together, so several props (e.g. a
// laptop and a phone) read and behave as one object.
const loader = new GLTFLoader();

function loadGltf(file) {
  return new Promise((resolve, reject) => loader.load(file, resolve, undefined, reject));
}

export async function loadModelMesh(model, targetRadius) {
  const parts = model.parts || [{ file: model.file }];
  const gltfs = await Promise.all(parts.map((p) => loadGltf(p.file)));

  const geometries = [];
  const materials = [];
  gltfs.forEach((gltf, i) => {
    const part = parts[i];
    const placement = new THREE.Matrix4().compose(
      new THREE.Vector3(...(part.position || [0, 0, 0])),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), part.rotationY || 0),
      // `stretch` scales a part per axis on top of `scale` (e.g. a chubbier lion)
      new THREE.Vector3(...(part.stretch || [1, 1, 1])).multiplyScalar(part.scale || 1)
    );
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((obj) => {
      if (!obj.isMesh) return;
      const geo = obj.geometry.clone();
      geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(placement, obj.matrixWorld));
      geometries.push(geo);
      materials.push(obj.material);
    });
  });

  // mergeGeometries needs every input to share the same attributes and
  // indexing — separately authored files often don't (one has UVs, one
  // doesn't), so trim to the common set first
  const shared = Object.keys(geometries[0].attributes).filter((name) => geometries.every((g) => g.attributes[name]));
  for (const g of geometries) {
    for (const name of Object.keys(g.attributes)) if (!shared.includes(name)) g.deleteAttribute(name);
  }
  const mixedIndexing = geometries.some((g) => g.index) && geometries.some((g) => !g.index);
  const mergeable = mixedIndexing ? geometries.map((g) => (g.index ? g.toNonIndexed() : g)) : geometries;

  // useGroups so each source primitive's material survives the merge as its
  // own group instead of every part collapsing to one material
  const merged = mergeGeometries(mergeable, true);
  merged.computeVertexNormals();
  merged.center();
  // `thicken` stretches the model along its thinnest axis only (e.g. a flat
  // clapperboard that almost disappears when seen edge-on)
  if (model.thicken) {
    merged.computeBoundingBox();
    const size = merged.boundingBox.getSize(new THREE.Vector3());
    const s = [1, 1, 1];
    s[[size.x, size.y, size.z].indexOf(Math.min(size.x, size.y, size.z))] = model.thicken;
    merged.scale(...s);
  }
  merged.computeBoundingSphere();
  const scale = targetRadius / merged.boundingSphere.radius;
  merged.scale(scale, scale, scale);

  // `recolor` maps a material name to a new color, e.g. repainting a green
  // frog blue without editing the downloaded file
  if (model.recolor) {
    for (const m of new Set(materials)) {
      if (m.color && model.recolor[m.name]) m.color.set(model.recolor[m.name]);
    }
  }

  // near-black props (e.g. the laptop/phone) vanish against the black sky
  // on their unlit side — `lighten` blends every color part-way to white
  // and adds a faint matching self-glow so the shape still reads there
  if (model.lighten) {
    for (const m of new Set(materials)) {
      if (!m.color) continue;
      if (m.map && m.emissive) {
        // textured: glow with the texture itself, so stripes/details stay
        // readable instead of the whole thing washing out to flat grey
        m.emissiveMap = m.map;
        m.emissive.setScalar(Math.min(1, model.lighten * 2));
        continue;
      }
      m.color.lerp(new THREE.Color(0xffffff), model.lighten);
      if (m.emissive) m.emissive.copy(m.color).multiplyScalar(0.35);
    }
  }

  const mesh = new THREE.Mesh(merged, materials);
  // the Sun is a point light, so every shadow caster is re-drawn 6 extra
  // times per frame — very heavy models (e.g. the ~800k-triangle bust) can
  // opt out with `castShadow: false`
  mesh.castShadow = model.castShadow ?? true;
  mesh.receiveShadow = true;
  // tells main.js this is a real loaded model — its hover/focus ring should
  // be fit tightly to the actual vertices (see fitRingToMesh), not sized off
  // a generic sphere radius like the procedural bodies
  mesh.userData.isModel = true;
  useRaycastProxy(mesh);
  return mesh;
}

// Hover/click picking raycasts every triangle in JS. On a very dense model
// that's tens of milliseconds per pointer move — visible lag. Swap in a
// sparse stand-in (an evenly spread subset of the triangles) for raycasting
// only; rendering still uses the full mesh. A pointer that slips between the
// sampled triangles just falls back to the body's click bubble in main.js,
// which still selects the same model.
const RAYCAST_TRIANGLE_BUDGET = 40000;
function useRaycastProxy(mesh) {
  const geo = mesh.geometry;
  const position = geo.attributes.position;
  const index = geo.index;
  const triangles = (index ? index.count : position.count) / 3;
  if (triangles <= RAYCAST_TRIANGLE_BUDGET) return;

  const stride = Math.ceil(triangles / RAYCAST_TRIANGLE_BUDGET);
  const out = [];
  for (let t = 0; t < triangles; t += stride) {
    for (let k = 0; k < 3; k++) {
      const v = index ? index.getX(t * 3 + k) : t * 3 + k;
      out.push(position.getX(v), position.getY(v), position.getZ(v));
    }
  }
  const proxyGeo = new THREE.BufferGeometry();
  proxyGeo.setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
  proxyGeo.computeBoundingSphere();
  const proxy = new THREE.Mesh(proxyGeo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));

  mesh.raycast = (raycaster, intersects) => {
    proxy.matrixWorld.copy(mesh.matrixWorld);
    const hits = [];
    proxy.raycast(raycaster, hits);
    for (const hit of hits) {
      hit.object = mesh;
      intersects.push(hit);
    }
  };
}
