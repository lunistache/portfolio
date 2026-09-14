import * as THREE from "three";

export function createStarfield(scene, count = 4000) {
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const radius = 200 + Math.random() * 600;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = radius * Math.cos(phi);
    sizes[i] = Math.random() * 1.6 + 0.4;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1.1,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.85,
  });

  const stars = new THREE.Points(geo, mat);
  scene.add(stars);

  // gentle twinkle by pulsing opacity
  let t = 0;
  function update(dt) {
    t += dt;
    mat.opacity = 0.7 + Math.sin(t * 0.5) * 0.15;
  }

  return { points: stars, update };
}

function makeHeadTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.7)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// Occasional shooting stars: a bright head streaking across part of the sky
// with a short fading tail behind it, at random unpredictable intervals.
export class ShootingStars {
  constructor(scene) {
    this.scene = scene;
    this.active = [];
    this.headTexture = makeHeadTexture();
    this._scheduleNext();
  }

  _scheduleNext() {
    const delay = 2500 + Math.random() * 7000;
    this._timer = setTimeout(() => {
      this._spawn();
      this._scheduleNext();
    }, delay);
  }

  _spawn() {
    const radius = 150 + Math.random() * 150;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 1.4 - 0.7);
    const start = new THREE.Vector3(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.sin(phi) * Math.sin(theta),
      radius * Math.cos(phi)
    );

    const dir = new THREE.Vector3(
      (Math.random() - 0.5) * 2,
      -(0.5 + Math.random() * 0.5),
      (Math.random() - 0.5) * 2
    ).normalize();

    const tailLength = 5 + Math.random() * 6;
    const travelDistance = 60 + Math.random() * 90;
    const duration = 0.35 + Math.random() * 0.35; // fast — a real meteor crosses the sky in under a second
    const speed = travelDistance / duration;

    // mostly white-hot, occasionally a warm or cool tint like real meteors
    const color = [0xffffff, 0xffffff, 0xffffff, 0xfff2c8, 0xcfe8ff][Math.floor(Math.random() * 5)];

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);

    const head = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.headTexture,
        color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    head.scale.setScalar(0.8 + Math.random() * 0.5);
    this.scene.add(head);

    this.active.push({ line, mat, head, start, dir, tailLength, speed, life: 0, duration });
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const s = this.active[i];
      s.life += dt;
      const t = s.life / s.duration;
      if (t >= 1) {
        this.scene.remove(s.line);
        s.line.geometry.dispose();
        s.mat.dispose();
        this.scene.remove(s.head);
        s.head.material.dispose();
        this.active.splice(i, 1);
        continue;
      }

      const traveled = s.life * s.speed;
      const headPos = s.start.clone().addScaledVector(s.dir, traveled);
      const tailPos = headPos.clone().addScaledVector(s.dir, -s.tailLength);
      const pos = s.line.geometry.attributes.position;
      pos.setXYZ(0, tailPos.x, tailPos.y, tailPos.z);
      pos.setXYZ(1, headPos.x, headPos.y, headPos.z);
      pos.needsUpdate = true;
      s.head.position.copy(headPos);

      const fade = t < 0.12 ? t / 0.12 : t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
      s.mat.opacity = fade * 0.85;
      s.head.material.opacity = fade;
    }
  }

  dispose() {
    clearTimeout(this._timer);
    for (const s of this.active) {
      this.scene.remove(s.line);
      s.line.geometry.dispose();
      s.mat.dispose();
      this.scene.remove(s.head);
      s.head.material.dispose();
    }
    this.active = [];
    this.headTexture.dispose();
  }
}
