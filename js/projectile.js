import * as THREE from 'three';

const GRAVITY = 9.81;
const SIM_DT = 0.02;
const TRAIL_LENGTH = 80;
const TORNADO_PULL_RADIUS = 25;
const TORNADO_PULL_STRENGTH = 15;

export class Projectile {
  constructor(scene, startPos, velocity, weapon, wind, terrain, tanks, tornadoes) {
    this.scene = scene;
    this.terrain = terrain;
    this.tanks = tanks;
    this.weapon = weapon;
    this.wind = wind;
    this.tornadoes = tornadoes || [];
    this.alive = true;
    this.finished = false;
    this.time = 0;
    this.hasSplit = false;
    this.submunitions = [];

    this.pos = startPos.clone();
    this.vel = velocity.clone();

    // Arrow-shaped projectile
    this.mesh = new THREE.Group();

    const shaftGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.8, 6);
    const shaftMat = new THREE.MeshBasicMaterial({ color: 0xc8a86e });
    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    this.mesh.add(shaft);

    const tipGeo = new THREE.ConeGeometry(0.1, 0.3, 4);
    const tipMat = new THREE.MeshBasicMaterial({ color: 0x999999 });
    const tip = new THREE.Mesh(tipGeo, tipMat);
    tip.position.y = 1.05;
    this.mesh.add(tip);

    const fletchGeo = new THREE.PlaneGeometry(0.18, 0.22);
    const fletchMat = new THREE.MeshBasicMaterial({
      color: weapon.color, side: THREE.DoubleSide, transparent: true, opacity: 0.8,
    });
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(fletchGeo, fletchMat);
      f.position.set(0.08, -0.7, 0);
      f.rotation.y = (i / 3) * Math.PI * 2;
      this.mesh.add(f);
    }

    this.mesh.position.copy(this.pos);
    this._orientArrow();
    scene.add(this.mesh);

    // Trail
    const trailGeo = new THREE.BufferGeometry();
    this.trailPositions = new Float32Array(TRAIL_LENGTH * 3);
    for (let i = 0; i < TRAIL_LENGTH; i++) {
      this.trailPositions[i * 3] = this.pos.x;
      this.trailPositions[i * 3 + 1] = this.pos.y;
      this.trailPositions[i * 3 + 2] = this.pos.z;
    }
    trailGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3));
    const trailMat = new THREE.LineBasicMaterial({ color: weapon.color, transparent: true, opacity: 0.5, linewidth: 2 });
    this.trail = new THREE.Line(trailGeo, trailMat);
    scene.add(this.trail);

    this.trailIndex = 0;
  }

  _orientArrow() {
    if (this.vel.lengthSq() > 0.01) {
      const dir = this.vel.clone().normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
      this.mesh.quaternion.copy(q);
    }
  }

  update(dt) {
    if (!this.alive) return null;

    const steps = Math.ceil(dt / SIM_DT);
    const stepDt = dt / steps;

    for (let s = 0; s < steps; s++) {
      this.time += stepDt;

      this.vel.y -= GRAVITY * stepDt;
      this.vel.x += this.wind.x * stepDt;
      this.vel.z += this.wind.z * stepDt;

      // Apply tornado pull
      for (const t of this.tornadoes) {
        const dx = t.x - this.pos.x;
        const dz = t.z - this.pos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < TORNADO_PULL_RADIUS && dist > 1) {
          const strength = TORNADO_PULL_STRENGTH * (1 - dist / TORNADO_PULL_RADIUS);
          this.vel.x += (dx / dist) * strength * stepDt;
          this.vel.z += (dz / dist) * strength * stepDt;
        }
      }

      this.pos.x += this.vel.x * stepDt;
      this.pos.y += this.vel.y * stepDt;
      this.pos.z += this.vel.z * stepDt;

      if (this.weapon.behavior === 'mirv' && !this.hasSplit && this.vel.y < 0) {
        this.hasSplit = true;
        return this.splitMIRV();
      }

      if (!this.terrain.isOutOfBounds(this.pos.x, this.pos.z)) {
        const groundH = this.terrain.getHeight(this.pos.x, this.pos.z);
        if (this.pos.y <= groundH) {
          this.pos.y = groundH;
          return this.impact();
        }
      }

      if (this.pos.y < -20 || this.terrain.isOutOfBounds(this.pos.x, this.pos.z)) {
        this.alive = false;
        this.cleanup();
        return { type: 'miss' };
      }

      for (const tank of this.tanks) {
        if (!tank.alive) continue;
        const dist = this.pos.distanceTo(tank.position);
        if (dist < 2.5) {
          return this.impact();
        }
      }
    }

    this.mesh.position.copy(this.pos);
    this._orientArrow();

    this.trailPositions[this.trailIndex * 3] = this.pos.x;
    this.trailPositions[this.trailIndex * 3 + 1] = this.pos.y;
    this.trailPositions[this.trailIndex * 3 + 2] = this.pos.z;
    this.trailIndex = (this.trailIndex + 1) % TRAIL_LENGTH;
    this.trail.geometry.attributes.position.needsUpdate = true;

    return null;
  }

  splitMIRV() {
    const count = this.weapon.submunitions;
    const spread = this.weapon.spreadRadius;
    const golden = Math.PI * (3 - Math.sqrt(5));

    for (let i = 0; i < count; i++) {
      const r = spread * Math.sqrt((i + 0.5) / count);
      const angle = i * golden;
      const offsetX = Math.cos(angle) * r * (0.8 + Math.random() * 0.4);
      const offsetZ = Math.sin(angle) * r * (0.8 + Math.random() * 0.4);

      const subVel = new THREE.Vector3(
        this.vel.x * 0.3 + offsetX,
        this.vel.y * 0.2 - 2,
        this.vel.z * 0.3 + offsetZ
      );

      const sub = new Projectile(
        this.scene,
        this.pos.clone(),
        subVel,
        { ...this.weapon, behavior: 'standard', name: 'Storm Arrow', damage: Math.round(this.weapon.damage * 5 / count) },
        this.wind,
        this.terrain,
        this.tanks,
        this.tornadoes
      );
      this.submunitions.push(sub);
    }

    this.alive = false;
    this.cleanup();
    return { type: 'split', submunitions: this.submunitions };
  }

  impact() {
    this.alive = false;
    const result = {
      type: 'impact',
      position: this.pos.clone(),
      weapon: this.weapon,
      launchAngleDeg: this.launchAngleDeg,
    };
    this.cleanup();
    return result;
  }

  cleanup() {
    this.scene.remove(this.mesh);
    this.scene.remove(this.trail);
    this.mesh.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
    this.trail.geometry.dispose();
    this.trail.material.dispose();
  }
}

export function predictTrajectory(startPos, velocity, wind, terrain, maxTime = 15) {
  const points = [];
  const pos = startPos.clone();
  const vel = velocity.clone();
  const dt = 0.05;

  for (let t = 0; t < maxTime; t += dt) {
    points.push({ x: pos.x, y: pos.y, z: pos.z, t });

    vel.y -= GRAVITY * dt;
    vel.x += wind.x * dt;
    vel.z += wind.z * dt;

    pos.x += vel.x * dt;
    pos.y += vel.y * dt;
    pos.z += vel.z * dt;

    if (!terrain.isOutOfBounds(pos.x, pos.z)) {
      const groundH = terrain.getHeight(pos.x, pos.z);
      if (pos.y <= groundH) {
        points.push({ x: pos.x, y: groundH, z: pos.z, t });
        break;
      }
    }

    if (pos.y < -20 || terrain.isOutOfBounds(pos.x, pos.z)) {
      break;
    }
  }

  return points;
}
