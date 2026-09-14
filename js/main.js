import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { BODIES, DWARF_BODIES } from "./data.js?v=9";
import { getBodyTextures, getRingTexture, getMoonTexture } from "./textures.js";
import { createStarfield, ShootingStars } from "./starfield.js";
import { loadModelMesh } from "./models.js?v=3";
import { pauseMusic, resumeMusic } from "./music.js?v=5";

const ALL_BODIES = [...BODIES, ...DWARF_BODIES];

// ---------- renderer / scene / camera ----------

const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// CSS2DRenderer draws the always-on planet name labels as real DOM text
// (crisp at any size/distance) layered on top of the WebGL canvas.
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = "fixed";
labelRenderer.domElement.style.top = "0px";
labelRenderer.domElement.style.left = "0px";
labelRenderer.domElement.style.pointerEvents = "none";
document.body.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const SYSTEM_RADIUS = Math.max(...ALL_BODIES.map((b) => b.orbitRadius)) + 3;

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  3000
);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 2;
controls.maxDistance = SYSTEM_RADIUS * 2.4;
controls.target.set(0, 0, 0);
controls.autoRotate = true;
controls.autoRotateSpeed = 0.05;

// ---------- lighting ----------

scene.add(new THREE.AmbientLight(0xffffff, 0.22));
const sunLight = new THREE.PointLight(0xffffff, 2.4, 0, 0); // radiates from the Sun's position
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(1024, 1024);
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = SYSTEM_RADIUS * 2.5;
sunLight.shadow.bias = -0.0015;
scene.add(sunLight);
const rimLight = new THREE.DirectionalLight(0x6f8fff, 0.15);
rimLight.position.set(-6, -2, -4);
scene.add(rimLight);

// ---------- background ----------

const starfield = createStarfield(scene);
const shootingStars = new ShootingStars(scene);

function makeGlowTexture(inner, outer) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

const sunGlowTexture = makeGlowTexture("rgba(255,180,80,0.55)", "rgba(255,120,40,0)");

function makeRingGlowTexture(color) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(128, 128, 100, 0, Math.PI * 2);
  ctx.stroke();
  return new THREE.CanvasTexture(c);
}

const hoverRingTexture = makeRingGlowTexture("rgba(150,220,255,0.95)");

// ---------- helpers ----------

function idealDistance(radius) {
  return radius * 4.2 + 3.2;
}

// Thin Fresnel-rim glow shell rendered from the back side, so it reads as a
// soft halo around the limb without covering the planet's face.
function makeAtmosphere(radius, colorHex, power = 3.5, opacity = 0.5) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: new THREE.Color(colorHex) },
      power: { value: power },
      opacity: { value: opacity },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 glowColor;
      uniform float power;
      uniform float opacity;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        float rim = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0), power);
        gl_FragColor = vec4(glowColor, rim * opacity);
      }
    `,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 48), mat);
}

// The classic "www" globe: a dark see-through core wrapped in glowing
// latitude/longitude lines. The core is the actual Mesh (so raycasting and
// the hover ring treat it like any other planet); the grid is a child, so
// it spins with it.
function makeWireframeGlobe(radius, colorHex, lineOpacity = 0.9) {
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 48, 48),
    new THREE.MeshBasicMaterial({ color: 0x06121c, transparent: true, opacity: 0.55, depthWrite: false })
  );

  const points = [];
  const r = radius * 1.002;
  const steps = 96;
  const ringAt = (lat) => {
    for (let i = 0; i < steps; i++) {
      const a0 = (i / steps) * Math.PI * 2;
      const a1 = ((i + 1) / steps) * Math.PI * 2;
      const y = r * Math.sin(lat);
      const rr = r * Math.cos(lat);
      points.push(rr * Math.cos(a0), y, rr * Math.sin(a0), rr * Math.cos(a1), y, rr * Math.sin(a1));
    }
  };
  for (let deg = -60; deg <= 60; deg += 30) ringAt((deg * Math.PI) / 180);
  const meridians = 12;
  for (let m = 0; m < meridians; m++) {
    const lon = (m / meridians) * Math.PI;
    for (let i = 0; i < steps; i++) {
      const t0 = (i / steps) * Math.PI * 2;
      const t1 = ((i + 1) / steps) * Math.PI * 2;
      points.push(
        r * Math.cos(t0) * Math.cos(lon), r * Math.sin(t0), r * Math.cos(t0) * Math.sin(lon),
        r * Math.cos(t1) * Math.cos(lon), r * Math.sin(t1), r * Math.cos(t1) * Math.sin(lon)
      );
    }
  }
  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  const grid = new THREE.LineSegments(
    gridGeo,
    new THREE.LineBasicMaterial({ color: colorHex, transparent: true, opacity: lineOpacity, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  core.add(grid);
  return core;
}

function makeLabel(text) {
  const div = document.createElement("div");
  div.className = "planet-label";
  div.textContent = text;
  const obj = new CSS2DObject(div);
  obj.center.set(0.5, 1); // anchor at the label's bottom-center, so it sits above its 3D point
  return obj;
}

// ---------- build the whole system once, persistently ----------
// Nothing is rebuilt or disposed when the user clicks a planet — only the
// camera moves. Moons, rings and belts are all built up front so the
// overview shows the whole system at a glance, not just the focused planet.

const bodies = new Map(); // id -> { body, pivot, group, mesh, hitMesh, label, moonEntries, ringGroup, beltPoints }
const focusables = new Map(); // id -> { name, facts, subtitle, radius, getWorldPosition, pause, resume, onFocus, menuId }
// focusId -> current visible mesh, for both top-level bodies and moons —
// kept up to date (including the swap when an async-loaded model finishes)
// so the hover ring can look up "whatever is currently shown for this id"
// without caring whether it's a body or a moon
const meshByFocusId = new Map();
const planetOrbitLines = [];
const moonOrbitLines = []; // hidden in the overview, shown when something is focused
let showOrbits = true; // the "Orbits" toggle in the bottom controls

function updateOrbitVisibility() {
  for (const line of planetOrbitLines) line.visible = showOrbits;
  for (const line of moonOrbitLines) line.visible = showOrbits && !!focusedId;
}

for (const body of ALL_BODIES) {
  const pivot = new THREE.Object3D();
  pivot.rotation.y = Math.random() * Math.PI * 2; // don't start every planet aligned
  pivot.userData.angularSpeed = body.orbitRadius > 0 ? 1.1 / Math.pow(body.orbitRadius, 1.4) : 0;
  pivot.userData.paused = false;

  // each planet's orbit plane is tipped by its own small inclination, around
  // its own axis (the "node"), so the orbits aren't all perfectly parallel —
  // the pivot and its orbit line both live inside this tilted plane
  const orbitPlane = new THREE.Object3D();
  orbitPlane.rotation.order = "YXZ";
  orbitPlane.rotation.set(body.orbitInclination || 0, body.orbitNode || 0, 0);
  scene.add(orbitPlane);
  orbitPlane.add(pivot);

  const group = new THREE.Group();
  group.position.x = body.orbitRadius;
  group.rotation.z = body.axialTilt || 0;
  pivot.add(group);

  const tex = body.texture ? getBodyTextures(body) : null;
  let mesh;
  if (body.model) {
    // placeholder while the glTF loads asynchronously — swapped for the
    // real mesh (and re-registered in `bodies` below) once it resolves
    mesh = new THREE.Object3D();
    group.add(mesh);
  } else if (body.wireframeGlobe) {
    mesh = makeWireframeGlobe(body.radius, body.wireframeGlobe.color, body.wireframeGlobe.opacity);
    group.add(mesh);
    if (body.atmosphere) {
      group.add(makeAtmosphere(body.radius * 1.1, body.atmosphere.color, body.atmosphere.power, body.atmosphere.opacity));
    }
  } else if (body.isStar) {
    mesh = new THREE.Mesh(
      new THREE.SphereGeometry(body.radius, 64, 64),
      new THREE.MeshBasicMaterial({ map: tex.map })
    );
    group.add(mesh);

    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: sunGlowTexture,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    glow.scale.setScalar(body.radius * 4.2);
    group.add(glow);
  } else {
    const matParams = tex.map
      ? { map: tex.map, roughness: 0.85, metalness: 0.04 }
      : { color: tex.color, roughness: 0.9, metalness: 0.02 };
    mesh = new THREE.Mesh(new THREE.SphereGeometry(body.radius, 64, 64), new THREE.MeshStandardMaterial(matParams));
    mesh.receiveShadow = true;
    group.add(mesh);

    if (body.hasClouds && tex.cloudsMap) {
      const cloudMesh = new THREE.Mesh(
        new THREE.SphereGeometry(body.radius * 1.015, 64, 64),
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          alphaMap: tex.cloudsMap,
          transparent: true,
          depthWrite: false,
          roughness: 1,
        })
      );
      group.add(cloudMesh);
      group.userData.clouds = cloudMesh;
    }

    if (body.atmosphere) {
      group.add(makeAtmosphere(body.radius * 1.1, body.atmosphere.color, body.atmosphere.power, body.atmosphere.opacity));
    }
  }

  // generous invisible sphere so distant/tiny planets are still easy to click —
  // but capped so it doesn't swallow up any moon's own click target, otherwise
  // clicking near a close-orbiting moon would always hit the planet instead
  // the Sun is already big and easy to click — it doesn't need the generous
  // padding tiny/distant planets get, which would otherwise balloon out far
  // past its visible surface and steal clicks meant for a nearby planet
  let hitRadius = body.isStar ? body.radius * 1.05 : Math.max(body.radius * 2.4, 0.9);
  if (body.moons && body.moons.length) {
    const closestMoonEdge = Math.min(
      ...body.moons.map((m) => m.orbitRadius - Math.max(m.radius * 2.8, 0.35))
    );
    hitRadius = Math.min(hitRadius, Math.max(closestMoonEdge - 0.05, body.radius * 1.05));
  }
  const hitMesh = new THREE.Mesh(
    new THREE.SphereGeometry(hitRadius, 12, 12),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  hitMesh.userData.focusId = body.id;
  mesh.userData.focusId = body.id;
  meshByFocusId.set(body.id, mesh);
  group.add(hitMesh);

  // faint orbit path so the overview reads clearly
  if (body.orbitRadius > 0) {
    const orbitGeo = new THREE.RingGeometry(body.orbitRadius - 0.015, body.orbitRadius + 0.015, 128);
    const orbitLine = new THREE.Mesh(
      orbitGeo,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: body.isDwarf ? 0.06 : 0.12, side: THREE.DoubleSide })
    );
    orbitLine.rotation.x = Math.PI / 2;
    orbitPlane.add(orbitLine);
    planetOrbitLines.push(orbitLine);
  }

  // parented to the orbit pivot (not the axially-tilted group) so the label
  // stays directly above the planet even for a heavily tilted one like Uranus
  const label = makeLabel(body.name);
  label.position.set(body.orbitRadius, body.radius * 1.35 + 0.15, 0);
  pivot.add(label);

  // rings/belts are visible in the overview from the start, not gated behind
  // focusing the planet — only moons are built lazily on first focus below
  let ringGroup = null;
  if (body.hasRings) {
    ringGroup = new THREE.Group();
    const inner = body.radius * 1.4;
    const outer = body.radius * (body.ringThin ? 1.9 : 2.6);
    const ringGeo = new THREE.RingGeometry(inner, outer, 128, 1);
    const uv = ringGeo.attributes.uv;
    const pos = ringGeo.attributes.position;
    const v3 = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v3.fromBufferAttribute(pos, i);
      uv.setXY(i, (v3.length() - inner) / (outer - inner), 0.5);
    }
    const ringMesh = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        map: getRingTexture(body),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: body.ringThin ? 0.55 : 0.85,
      })
    );
    ringMesh.rotation.x = Math.PI / 2;
    ringMesh.castShadow = true;
    ringGroup.add(ringMesh);
    group.add(ringGroup);
  }

  let beltPoints = null;
  if (body.ringBelt) {
    const count = 2200;
    const positions = new Float32Array(count * 3);
    const inner = body.radius * 1.5;
    const outer = body.radius * 2.55;
    for (let i = 0; i < count; i++) {
      const r = inner + Math.random() * (outer - inner);
      const a = Math.random() * Math.PI * 2;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 0.04;
      positions[i * 3 + 2] = Math.sin(a) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    beltPoints = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0xd8c9a8, size: 0.045, transparent: true, opacity: 0.85 })
    );
    group.add(beltPoints);
  }

  // moons are visible in the overview from the start, same as rings/belts
  const moonEntries = [];
  for (const m of body.moons || []) {
    const moonPivot = new THREE.Object3D();
    moonPivot.rotation.x = m.orbitTilt ?? (Math.random() - 0.5) * 0.5;
    moonPivot.rotation.y = Math.random() * Math.PI * 2;
    moonPivot.userData.paused = false;
    group.add(moonPivot);

    const moonId = `${body.id}:${m.name}`;
    // model moons get a placeholder until the glTF loads async, same as a
    // top-level body with `model` set (see the loadModelMesh call below)
    let moonMesh;
    if (m.model) {
      moonMesh = new THREE.Object3D();
    } else if (m.texture) {
      // a full planet-style moon (e.g. Kalbon): same procedural map, clouds
      // and atmosphere a top-level planet gets, just parented to the moon
      const moonTex = getBodyTextures({ id: moonId, texture: m.texture });
      moonMesh = new THREE.Mesh(
        new THREE.SphereGeometry(m.radius, 48, 48),
        new THREE.MeshStandardMaterial({ map: moonTex.map, roughness: 0.85, metalness: 0.04 })
      );
      if (moonTex.cloudsMap) {
        moonMesh.add(
          new THREE.Mesh(
            new THREE.SphereGeometry(m.radius * 1.015, 48, 48),
            new THREE.MeshStandardMaterial({ color: 0xffffff, alphaMap: moonTex.cloudsMap, transparent: true, depthWrite: false, roughness: 1 })
          )
        );
      }
      if (m.atmosphere) {
        moonMesh.add(makeAtmosphere(m.radius * 1.1, m.atmosphere.color, m.atmosphere.power, m.atmosphere.opacity));
      }
    } else {
      const moonMat = m.textureFile
        ? new THREE.MeshStandardMaterial({ map: getMoonTexture(m.textureFile), roughness: 0.9 })
        : new THREE.MeshStandardMaterial({ color: m.color, roughness: 0.95 });
      moonMesh = new THREE.Mesh(new THREE.SphereGeometry(m.radius, 20, 20), moonMat);
    }
    moonMesh.position.set(m.orbitRadius, 0, 0);
    moonMesh.userData.focusId = moonId;
    moonPivot.add(moonMesh);
    meshByFocusId.set(moonId, moonMesh);

    const moonHitMesh = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(m.radius * 2.8, 0.35), 10, 10),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    moonHitMesh.userData.focusId = moonId;
    moonMesh.add(moonHitMesh);

    const moonOrbitLine = new THREE.Mesh(
      new THREE.RingGeometry(m.orbitRadius - 0.01, m.orbitRadius + 0.01, 64),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, side: THREE.DoubleSide })
    );
    moonOrbitLine.rotation.x = Math.PI / 2;
    moonOrbitLine.visible = false; // starts in the overview, where moon orbits are hidden
    moonPivot.add(moonOrbitLine);
    moonOrbitLines.push(moonOrbitLine);

    const moonEntry = { pivot: moonPivot, speed: m.orbitSpeed, rotationSpeed: m.rotationSpeed || 0, rotationSpeedX: m.rotationSpeedX || 0, leanToSun: m.leanToSun || 0, spinY: 0, hitMesh: moonHitMesh, mesh: moonMesh };
    moonEntries.push(moonEntry);

    focusables.set(moonId, {
      name: m.name,
      facts: m.facts || "",
      subtitle: `Moon of ${body.name}`,
      radius: m.radius,
      hoverRadius: m.atmosphere ? m.radius * 1.1 : m.radius,
      cvLink: m.cvLink || null,
      linkLabel: m.linkLabel,
      getWorldPosition: () => {
        const v = new THREE.Vector3();
        moonMesh.getWorldPosition(v);
        return v;
      },
      pause: () => { moonPivot.userData.paused = true; pivot.userData.paused = true; },
      resume: () => { moonPivot.userData.paused = false; pivot.userData.paused = false; },
      onFocus: null,
      menuId: moonId,
    });

    if (m.model) {
      loadModelMesh(m.model, m.radius)
        .then((finalMesh) => {
          finalMesh.position.copy(moonMesh.position);
          finalMesh.userData.focusId = moonId;
          moonMesh.remove(moonHitMesh);
          finalMesh.add(moonHitMesh);
          moonPivot.remove(moonMesh);
          moonPivot.add(finalMesh);
          moonMesh = finalMesh;
          moonEntry.mesh = finalMesh;
          meshByFocusId.set(moonId, finalMesh);
        })
        .catch((err) => console.error(`Failed to load model for moon "${moonId}":`, err));
    }
  }

  const entry = { body, pivot, group, mesh, hitMesh, label, moonEntries, ringGroup, beltPoints, rotationSpeed: body.rotationSpeed, companions: [] };
  bodies.set(body.id, entry);

  // Companions are extra props that belong to this body but spin on their
  // own (e.g. the phone next to the Apps laptop): each sits in its own tilted
  // holder at a fixed spot in the body's group and turns at its own speed.
  // They count as the body for hover/click and the hover ring.
  for (const c of body.companions || []) {
    loadModelMesh(c.model, c.radius)
      .then((companionMesh) => {
        const holder = new THREE.Object3D();
        holder.position.set(...c.position);
        holder.rotation.z = c.tilt || 0;
        companionMesh.rotation.y = c.initialRotationY || 0;
        companionMesh.userData.focusId = body.id;
        holder.add(companionMesh);
        group.add(holder);
        entry.companions.push({ mesh: companionMesh, rotationSpeed: c.rotationSpeed || 0 });
      })
      .catch((err) => console.error(`Failed to load companion for "${body.id}":`, err));
  }

  if (body.model) {
    loadModelMesh(body.model, body.radius)
      .then((finalMesh) => {
        group.remove(entry.mesh);
        finalMesh.userData.focusId = body.id;
        group.add(finalMesh);
        entry.mesh = finalMesh;
        meshByFocusId.set(body.id, finalMesh);
      })
      .catch((err) => console.error(`Failed to load model for "${body.id}":`, err));
  }

  focusables.set(body.id, {
    name: body.name,
    facts: body.facts,
    subtitle: "",
    radius: body.radius,
    // atmosphere/clouds visually bulk the planet out past its bare radius —
    // size the hover ring off that outer edge so it hugs what's actually seen
    hoverRadius: body.atmosphere ? body.radius * 1.1 : body.radius,
    cvLink: body.cvLink || null,
    linkLabel: body.linkLabel,
    externalLink: body.externalLink,
    openOnFirstClick: !!body.openOnFirstClick,
    getWorldPosition: () => {
      const v = new THREE.Vector3();
      group.getWorldPosition(v);
      return v;
    },
    pause: () => { pivot.userData.paused = true; },
    resume: () => { pivot.userData.paused = false; },
    onFocus: null,
    menuId: body.id,
  });
}

// ---------- menu / HUD ----------

const listEl = document.getElementById("planet-list");
const nameEl = document.getElementById("planet-name");
const subtitleEl = document.getElementById("planet-subtitle");
const factsEl = document.getElementById("planet-facts");
const cvLinkEl = document.getElementById("cv-link");
const navHelpEl = document.getElementById("nav-help");

// ---------- CV modal (embeds the PDF in-page instead of a new tab) ----------

const cvModalEl = document.getElementById("cv-modal");
const cvModalFrame = document.getElementById("cv-modal-frame");
const cvModalDownload = document.getElementById("cv-modal-download");
const cvModalClose = document.getElementById("cv-modal-close");

// `externalLink` is what "Open in new tab" points to when it differs from the
// embeddable URL (e.g. a YouTube embed vs. its normal watch page)
function openCvModal(link, externalLink = link) {
  cvModalFrame.src = link;
  cvModalDownload.href = externalLink;
  cvModalEl.hidden = false;
  // don't play the background music over a video
  if (link.includes("youtube.com")) pauseMusic();
}

function closeCvModal() {
  cvModalEl.hidden = true;
  cvModalFrame.src = ""; // stop the embedded PDF viewer once closed
  resumeMusic();
}

cvModalClose.addEventListener("click", closeCvModal);
document.getElementById("cv-modal-backdrop").addEventListener("click", closeCvModal);
window.addEventListener("keydown", (evt) => {
  if (evt.key === "Escape" && !cvModalEl.hidden) closeCvModal();
});

cvLinkEl.addEventListener("click", (evt) => {
  evt.preventDefault();
  const target = focusedId && focusables.get(focusedId);
  if (target?.cvLink) openCv(target);
  else openCvModal(cvLinkEl.href);
});

const overviewLi = document.createElement("li");
overviewLi.textContent = "Overview";
overviewLi.className = "overview-item";
overviewLi.addEventListener("click", () => focusOn(null));
listEl.appendChild(overviewLi);

function buildPlanetLi(body, extraClass) {
  const li = document.createElement("li");
  if (extraClass) li.className = extraClass;
  li.dataset.bodyId = body.id;

  const row = document.createElement("div");
  row.className = "row";
  const name = document.createElement("span");
  name.textContent = body.name;
  row.appendChild(name);
  row.addEventListener("click", () => focusOn(focusedId === body.id ? null : body.id));
  li.appendChild(row);

  if (body.moons && body.moons.length) {
    const moonList = document.createElement("ul");
    moonList.className = "moon-list";
    body.moons.forEach((m) => {
      const moonId = `${body.id}:${m.name}`;
      const moonLi = document.createElement("li");
      moonLi.className = "moon-item";
      moonLi.textContent = m.name;
      moonLi.dataset.bodyId = moonId;
      moonLi.addEventListener("click", (evt) => {
        evt.stopPropagation();
        focusOn(moonId);
      });
      moonList.appendChild(moonLi);
    });
    li.appendChild(moonList);
  }

  return li;
}

BODIES.forEach((body) => {
  listEl.appendChild(buildPlanetLi(body));
});

DWARF_BODIES.forEach((body) => {
  listEl.appendChild(buildPlanetLi(body, "dwarf-item"));
});

function updateMenuActive(menuId) {
  listEl.querySelectorAll("li").forEach((li) => {
    const isActive = li.dataset.bodyId === menuId || (!menuId && li === overviewLi);
    li.classList.toggle("active", isActive);
  });
  // a planet's moon list is only shown while that planet — or one of its
  // moons — is the current selection, and closes as soon as something else is picked
  listEl.querySelectorAll(".moon-list").forEach((moonList) => {
    const planetLi = moonList.parentElement;
    const showMoons = planetLi.classList.contains("active") || moonList.querySelector(".moon-item.active") !== null;
    planetLi.classList.toggle("expanded", showMoons);
  });
}

function updateHud(target) {
  navHelpEl.hidden = !!target;
  if (!target) {
    nameEl.textContent = "Portfolio";
    subtitleEl.textContent = "";
    factsEl.textContent = "";
    cvLinkEl.classList.remove("visible");
    return;
  }
  nameEl.textContent = target.name;
  subtitleEl.textContent = target.subtitle || "";
  factsEl.textContent = target.facts;
  if (target.cvLink) {
    cvLinkEl.href = target.cvLink;
    cvLinkEl.textContent = target.linkLabel || "View full CV ↗";
    cvLinkEl.classList.add("visible");
  } else {
    cvLinkEl.classList.remove("visible");
  }
}

// ---------- camera flight ----------

let focusedId = null;
let isFlying = false;
const tweens = [];

function addTween({ duration, onUpdate, onComplete }) {
  tweens.push({ start: performance.now(), duration: duration * 1000, onUpdate, onComplete });
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function overviewPose() {
  return {
    position: new THREE.Vector3(0, SYSTEM_RADIUS * 1.0, SYSTEM_RADIUS * 1.8),
    target: new THREE.Vector3(0, 0, 0),
  };
}

function closePoseFor(target) {
  const worldPos = target.getWorldPosition();
  const dist = idealDistance(target.radius);
  const offset = new THREE.Vector3(0.6, 0.35, 1).normalize().multiplyScalar(dist);
  return { position: worldPos.clone().add(offset), target: worldPos };
}

function flyTo(pose, duration = 1.1) {
  isFlying = true;
  controls.enabled = false;
  const startPos = camera.position.clone();
  const startTarget = controls.target.clone();
  addTween({
    duration,
    onUpdate: (t) => {
      const e = easeInOutCubic(t);
      camera.position.lerpVectors(startPos, pose.position, e);
      controls.target.lerpVectors(startTarget, pose.target, e);
    },
    onComplete: () => {
      isFlying = false;
      controls.enabled = true;
    },
  });
}

function openCv(target) {
  if (target?.cvLink) openCvModal(target.cvLink, target.externalLink);
}

function focusOn(id) {
  if (isFlying) return;
  if (id === focusedId) {
    openCv(focusables.get(id));
    return;
  }

  if (focusedId) {
    const prev = focusables.get(focusedId);
    prev?.resume();
  }

  focusedId = id;
  // moon orbits only clutter the overview; show them once something is focused
  updateOrbitVisibility();

  if (!id) {
    updateMenuActive(null);
    updateHud(null);
    flyTo(overviewPose());
    return;
  }

  const target = focusables.get(id);
  updateMenuActive(target.menuId);
  updateHud(target);
  target.pause();
  if (target.onFocus) target.onFocus();
  flyTo(closePoseFor(target));
  // bodies flagged `openOnFirstClick` (e.g. the Sun's video) pop their link
  // up right away instead of waiting for a second click
  if (target.openOnFirstClick) openCv(target);
}

updateMenuActive(null);
updateHud(null);
const startPose = overviewPose();
camera.position.copy(startPose.position);
controls.target.copy(startPose.target);

// ---------- click-to-zoom in the 3D view ----------

const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
let pointerDownPos = null;

function setPointerNdc(evt) {
  const rect = canvas.getBoundingClientRect();
  pointerNdc.x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
  pointerNdc.y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;
}

function collectHitMeshes() {
  const meshes = [];
  for (const entry of bodies.values()) {
    meshes.push(entry.hitMesh);
    for (const m of entry.moonEntries || []) meshes.push(m.hitMesh);
  }
  return meshes;
}

// The actual visible spheres (not the oversized invisible hit spheres above)
// — used for hover so the highlight tracks whichever body is really under the
// cursor, even when two bodies' generous click targets overlap.
function collectVisibleMeshes() {
  const meshes = [];
  for (const entry of bodies.values()) {
    meshes.push(entry.mesh);
    for (const c of entry.companions) meshes.push(c.mesh);
    for (const m of entry.moonEntries || []) meshes.push(m.mesh);
  }
  return meshes;
}

// ---------- hover highlight ----------
// A camera-facing glow ring is dropped onto whichever planet/moon is under
// the pointer, so hovering gives clear visual feedback before clicking.

const hoverRingSprite = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: hoverRingTexture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  })
);
hoverRingSprite.renderOrder = 999;
hoverRingSprite.visible = false;
scene.add(hoverRingSprite);

// the ring drawn inside the texture only fills ~78% of the sprite's square
// (see makeRingGlowTexture: radius 100 out of a 256px canvas) — compensate
// so the drawn ring itself, not the invisible sprite quad around it, is
// what actually matches the target size
const RING_TEXTURE_FILL = 200 / 256;

// Fits the ring to a mesh's true current on-screen silhouette: project a
// spread of its actual vertices through the mesh's live world matrix into
// camera view space (whose X/Y axes are exactly the camera's right/up —
// the same axes a billboarded sprite scales along) and take their extent.
// Sampling real vertices (rather than the 8 corners of the local bounding
// box) matters here because the box's corners project loosely once the
// mesh is rotated — a box tilted relative to the camera needs a bigger
// axis-aligned rectangle to cover its corners than the shape actually
// occupies on screen. Recomputed every frame, so it stays snug as the
// mesh spins or the camera moves.
// Takes several meshes (a model plus any separately-spinning companions,
// e.g. the laptop and its phone) and fits one ring around all of them,
// re-centering the ring on their combined silhouette since that's no longer
// necessarily centered on the body's own origin.
const ringSample = new THREE.Vector3();
const RING_SAMPLE_BUDGET = 4000;
function fitRingToMeshes(meshes) {
  // this runs before the frame's render() call, so pull fresh world
  // matrices ourselves rather than relying on this frame's rotation
  // increments having already propagated through the scene graph
  camera.updateMatrixWorld();
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const mesh of meshes) {
    mesh.updateWorldMatrix(true, false);
    const position = mesh.geometry.attributes.position;
    const stride = Math.max(1, Math.floor(position.count / (RING_SAMPLE_BUDGET / meshes.length)));
    for (let i = 0; i < position.count; i += stride) {
      ringSample.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
      if (ringSample.x < minX) minX = ringSample.x;
      if (ringSample.x > maxX) maxX = ringSample.x;
      if (ringSample.y < minY) minY = ringSample.y;
      if (ringSample.y > maxY) maxY = ringSample.y;
    }
  }
  // a hair of slack since sampling can skip the exact extreme vertex
  const SLACK = 1.03;
  hoverRingSprite.scale.set(((maxX - minX) * SLACK) / RING_TEXTURE_FILL, ((maxY - minY) * SLACK) / RING_TEXTURE_FILL, 1);
  // keep the ring's depth (already set to the body's position) but move it
  // to the middle of the silhouette on screen
  ringSample.copy(hoverRingSprite.position).applyMatrix4(camera.matrixWorldInverse);
  ringSample.x = (minX + maxX) / 2;
  ringSample.y = (minY + maxY) / 2;
  hoverRingSprite.position.copy(ringSample.applyMatrix4(camera.matrixWorld));
}

let hoveredFocusId = null;

// Decides what's under the pointer. The real visible shapes win first, so a
// planet/moon you're actually pointing at is never stolen by a neighbour's
// oversized invisible click bubble (a real problem up close, where the
// nearby body's bubble sits in front of everything). Only when the pointer
// misses every real shape do the bubbles count — and then the body whose
// centre is nearest the pointer ray wins, not whichever bubble is in front.
const pickCenter = new THREE.Vector3();
function pickFocusId() {
  const visibleHits = raycaster.intersectObjects(collectVisibleMeshes(), false);
  if (visibleHits.length > 0) return visibleHits[0].object.userData.focusId;

  let best = null;
  let bestDist = Infinity;
  for (const hit of raycaster.intersectObjects(collectHitMeshes(), false)) {
    hit.object.getWorldPosition(pickCenter);
    const d = raycaster.ray.distanceToPoint(pickCenter);
    if (d < bestDist) {
      bestDist = d;
      best = hit.object.userData.focusId;
    }
  }
  return best;
}

// pointermove can fire many times per frame, and picking isn't free — just
// note the latest position here and resolve the hover once per frame in
// updateHover() (called from the render loop). No hover while dragging the
// camera: nothing's being pointed at, and it'd only cost frames mid-drag.
let hoverPointerDirty = false;
canvas.addEventListener("pointermove", (evt) => {
  setPointerNdc(evt);
  hoverPointerDirty = true;
});

function updateHover() {
  if (isFlying || pointerDownPos) {
    hoveredFocusId = null;
    canvas.style.cursor = "";
    return;
  }
  if (!hoverPointerDirty) return;
  hoverPointerDirty = false;
  raycaster.setFromCamera(pointerNdc, camera);
  hoveredFocusId = pickFocusId();
  canvas.style.cursor = hoveredFocusId ? "pointer" : "";
}

canvas.addEventListener("pointerleave", () => {
  hoverPointerDirty = false;
  hoveredFocusId = null;
  canvas.style.cursor = "";
});

canvas.addEventListener("pointerdown", (evt) => {
  pointerDownPos = { x: evt.clientX, y: evt.clientY };
  noteUserInteraction();
});

canvas.addEventListener("pointerup", (evt) => {
  if (!pointerDownPos) return;
  const moved = Math.hypot(evt.clientX - pointerDownPos.x, evt.clientY - pointerDownPos.y);
  pointerDownPos = null;
  if (moved > 6 || isFlying) return; // was a drag, not a click

  setPointerNdc(evt);
  raycaster.setFromCamera(pointerNdc, camera);
  const id = pickFocusId();
  if (id) focusOn(id);
});

// ---------- camera auto-rotate (paused during user interaction) ----------

let autoRotateEnabled = true;
let idleTimer = null;
let dragging = false;

function scheduleResume(delay) {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { autoRotateEnabled = true; }, delay);
}

function noteUserInteraction() {
  autoRotateEnabled = false;
  clearTimeout(idleTimer);
}

canvas.addEventListener("wheel", () => {
  noteUserInteraction();
  scheduleResume(500); // wheel has no "release" event, so resume after a short idle pause
}, { passive: true });

canvas.addEventListener("pointerdown", () => { dragging = true; });

// listen on window, not canvas, so a drag released outside the canvas still resumes
window.addEventListener("pointerup", () => {
  // runs after the canvas's own pointerup (bubbling), so a drag released
  // outside the canvas doesn't leave hover switched off; re-pick hover since
  // the camera may have moved under a still pointer
  pointerDownPos = null;
  hoverPointerDirty = true;
  if (!dragging) return;
  dragging = false;
  scheduleResume(500);
});

// manual override — fully stops the camera from moving on its own
// (auto-rotate drift), independent of the idle timer above. Dragging to
// look around and clicking to zoom into a planet still work as normal.
// Starts locked (stopped) so the view is still until the user activates it.
const cameraToggle = document.getElementById("camera-toggle");
let cameraLocked = !cameraToggle.checked;

cameraToggle.addEventListener("change", () => {
  cameraLocked = !cameraToggle.checked;
  if (!cameraLocked) autoRotateEnabled = true;
});

// ---------- orbits toggle ----------

const orbitsToggle = document.getElementById("orbits-toggle");
showOrbits = orbitsToggle.checked;
updateOrbitVisibility();

orbitsToggle.addEventListener("change", () => {
  showOrbits = orbitsToggle.checked;
  updateOrbitVisibility();
});

// ---------- speed control ----------

let timeScale = 1;
const speedSlider = document.getElementById("speed-slider");
speedSlider.addEventListener("input", (evt) => {
  timeScale = parseFloat(evt.target.value);
});

// ---------- animation loop ----------

const clock = new THREE.Clock();

// Tilts a moon by `leanToSun` radians toward the Sun (at the world origin),
// measured from true vertical in world space, so the planet's axial tilt and
// the moon's orbit tilt don't change the angle. Recomputed every frame since
// the Sun's direction changes as the moon and its planet orbit; the moon
// still spins on that tilted axis (spinY).
const _toSun = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _tilt = new THREE.Quaternion();
const _spin = new THREE.Quaternion();
const _parentQuat = new THREE.Quaternion();
function leanTowardSun(m) {
  m.mesh.updateWorldMatrix(true, false);
  m.mesh.getWorldPosition(_toSun).negate(); // Sun is at the origin
  _toSun.y = 0; // only the horizontal direction matters for the lean
  _axis.crossVectors(_up, _toSun);
  if (_axis.lengthSq() < 1e-8) return;
  _tilt.setFromAxisAngle(_axis.normalize(), m.leanToSun);
  _spin.setFromAxisAngle(_up, m.spinY);
  // world-space orientation, converted into the moon's parent (pivot) frame
  m.pivot.getWorldQuaternion(_parentQuat).invert();
  m.mesh.quaternion.copy(_parentQuat).multiply(_tilt).multiply(_spin);
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();

  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    const t = Math.min((now - tw.start) / tw.duration, 1);
    tw.onUpdate(t);
    if (t >= 1) {
      tw.onComplete && tw.onComplete();
      tweens.splice(i, 1);
    }
  }

  for (const entry of bodies.values()) {
    if (!entry.pivot.userData.paused) {
      entry.pivot.rotation.y += entry.pivot.userData.angularSpeed * dt * timeScale;
    }
    entry.mesh.rotation.y += entry.rotationSpeed * dt * 10 * timeScale;
    for (const c of entry.companions) c.mesh.rotation.y += c.rotationSpeed * dt * 10 * timeScale;
    if (entry.group.userData.clouds) {
      entry.group.userData.clouds.rotation.y += entry.rotationSpeed * dt * 6 * timeScale;
    }
    for (const m of entry.moonEntries || []) {
      if (!m.pivot.userData.paused) m.pivot.rotation.y += m.speed * dt * timeScale;
      // spins the moon on its own axis, same as a top-level body's mesh —
      // independent of the orbit pause, so it keeps spinning while focused
      if (m.leanToSun) {
        m.spinY += m.rotationSpeed * dt * 10 * timeScale;
        leanTowardSun(m);
      } else if (m.rotationSpeed) {
        m.mesh.rotation.y += m.rotationSpeed * dt * 10 * timeScale;
      }
      // optional tumble on X too (e.g. the clapperboard)
      if (m.rotationSpeedX) m.mesh.rotation.x += m.rotationSpeedX * dt * 10 * timeScale;
    }
    if (entry.ringGroup) entry.ringGroup.rotation.y += 0.01 * dt * 10 * timeScale;
    if (entry.beltPoints) entry.beltPoints.rotation.y += 0.05 * dt * timeScale;
    entry.label.visible = focusedId !== entry.body.id;
  }
  updateHover();
  const hoveredFocusable = hoveredFocusId ? focusables.get(hoveredFocusId) : null;
  if (hoveredFocusable) {
    hoverRingSprite.visible = true;
    hoverRingSprite.position.copy(hoveredFocusable.getWorldPosition());
    const hoveredMesh = meshByFocusId.get(hoveredFocusId);
    if (hoveredMesh?.userData?.isModel) {
      // a loaded model (e.g. the bust, or a model-based moon like the CV
      // scroll) — fit the ring to its true current on-screen silhouette,
      // which stays correct as it spins
      const companions = bodies.get(hoveredFocusId)?.companions || [];
      fitRingToMeshes([hoveredMesh, ...companions.map((c) => c.mesh)]);
    } else {
      // everything else is a sphere (optionally bulked out by an
      // atmosphere) — a plain circle already fits it exactly
      const r = hoveredFocusable.hoverRadius ?? hoveredFocusable.radius;
      hoverRingSprite.scale.set(r * 2.6, r * 2.6, 1);
    }
  } else {
    hoverRingSprite.visible = false;
  }

  starfield.update(dt);
  shootingStars.update(dt);

  controls.autoRotate = autoRotateEnabled && !isFlying && !cameraLocked;
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

animate();

// ---------- resize ----------

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
});
