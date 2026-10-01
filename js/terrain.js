import * as THREE from 'three';
import { fbm, lerp, clamp, smoothstep } from './utils.js';

const WORLD_SIZE = 170;
const GRID_RES = 128;
const MAX_HEIGHT = 18;

export class Terrain {
  constructor(scene) {
    this.scene = scene;
    this.worldSize = WORLD_SIZE;
    this.gridRes = GRID_RES;
    this.heightData = new Float32Array((GRID_RES + 1) * (GRID_RES + 1));
    this.damageData = new Float32Array((GRID_RES + 1) * (GRID_RES + 1));
    this.mesh = null;
    this.generate();
  }

  generate() {
    this.style = Math.floor(Math.random() * 5);
    const res = this.gridRes;
    const half = this.worldSize / 2;
    const seed = Math.random() * 100;

    for (let iz = 0; iz <= res; iz++) {
      for (let ix = 0; ix <= res; ix++) {
        const wx = (ix / res) * this.worldSize - half;
        const wz = (iz / res) * this.worldSize - half;
        const nx = (ix / res) + seed;
        const nz = (iz / res) + seed;

        let h = fbm(nx * 3, nz * 3, 5, 2.0, 0.45) * MAX_HEIGHT;

        if (this.style === 0) {
          // Central ridge — classic Scorched Earth
          const ridgeDist = Math.abs(wx) / half;
          const ridgeProfile = Math.exp(-(ridgeDist ** 2) / (2 * 0.06));
          const ridgeNoise = fbm(nx * 5 + 50, nz * 5 + 50, 3, 2, 0.5);
          h += ridgeProfile * 14 * (0.6 + 0.4 * ridgeNoise);
          const obs1 = Math.exp(-(((wx - 30) ** 2 + (wz - 25) ** 2) / (2 * 120)));
          const obs2 = Math.exp(-(((wx + 25) ** 2 + (wz + 30) ** 2) / (2 * 100)));
          h += obs1 * 10 + obs2 * 8;
        } else if (this.style === 1) {
          // Valley — tanks on high ground, basin in center
          const centerDist = Math.sqrt(wx * wx + wz * wz) / half;
          const bowl = smoothstep(0.15, 0.6, centerDist) * 18;
          h = h * 0.4 + bowl;
          const rimNoise = fbm(nx * 4 + 30, nz * 4 + 30, 3, 2, 0.5);
          h += (1 - centerDist) < 0.3 ? 0 : rimNoise * 6;
        } else if (this.style === 2) {
          // Cliff — one side high, other low
          const slope = (wx / half) * 0.5 + 0.5;
          const cliffH = lerp(4, 22, slope);
          h = h * 0.5 + cliffH;
          const ledgeNoise = fbm(nx * 6 + 70, nz * 3 + 70, 3, 2, 0.5);
          const ledge = Math.exp(-((slope - 0.5) ** 2) / 0.02) * 8 * ledgeNoise;
          h += ledge;
        } else if (this.style === 3) {
          // Rolling hills — scattered mounds, no dominant feature
          h *= 0.7;
          for (let k = 0; k < 6; k++) {
            const cx = (fbm(seed + k * 7, 0, 2, 2, 0.5) - 0.5) * this.worldSize * 0.7;
            const cz = (fbm(0, seed + k * 11, 2, 2, 0.5) - 0.5) * this.worldSize * 0.7;
            const amp = 6 + fbm(seed + k * 3, seed + k * 5, 2, 2, 0.5) * 12;
            const width = 80 + fbm(seed + k * 13, 0, 2, 2, 0.5) * 200;
            h += Math.exp(-((wx - cx) ** 2 + (wz - cz) ** 2) / (2 * width)) * amp;
          }
        } else {
          // Canyon — deep channel cutting between spawn areas
          h *= 0.6;
          const baseLevel = 12 + fbm(nx * 2 + 90, nz * 2 + 90, 3, 2, 0.5) * 6;
          h += baseLevel;
          const canyonPath = Math.sin(wz / 30) * 8 + fbm(nx * 0.5 + 40, nz * 2 + 40, 3, 2, 0.5) * 12;
          const distFromCanyon = Math.abs(wx - canyonPath);
          const canyonCut = smoothstep(6, 18, distFromCanyon);
          h *= canyonCut;
          h = Math.max(h, 1.5);
        }

        // Flatten spawn areas
        let flatBaseL, flatBaseR;
        if (this.style === 2) {
          flatBaseL = 6;
          flatBaseR = 20;
        } else if (this.style === 1) {
          flatBaseL = 16 + fbm(nx * 2 + 10, nz * 2 + 10, 2, 2, 0.5) * 3;
          flatBaseR = 16 + fbm(nx * 2 + 20, nz * 2 + 20, 2, 2, 0.5) * 3;
        } else {
          const baseH = 4 + fbm(nx * 2 + 10, nz * 2 + 10, 2, 2, 0.5) * 4;
          flatBaseL = baseH;
          flatBaseR = baseH;
        }
        const spawnFlatL = Math.exp(-(((wx + 60) ** 2 + wz ** 2) / (2 * 60)));
        const spawnFlatR = Math.exp(-(((wx - 60) ** 2 + wz ** 2) / (2 * 60)));
        h = lerp(h, flatBaseL, spawnFlatL * 0.6);
        h = lerp(h, flatBaseR, spawnFlatR * 0.6);

        // Keep edges lower
        const edgeDist = Math.max(Math.abs(wx), Math.abs(wz)) / half;
        const edgeFade = smoothstep(0.8, 1.0, edgeDist);
        h = lerp(h, 1, edgeFade);

        h = Math.max(0, h);
        this.heightData[iz * (res + 1) + ix] = h;
      }
    }

    this.buildMesh();
  }

  buildMesh() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
    }

    const res = this.gridRes;
    const half = this.worldSize / 2;
    const geo = new THREE.PlaneGeometry(this.worldSize, this.worldSize, res, res);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    let actualMax = 1;
    for (let i = 0; i < this.heightData.length; i++) {
      if (this.heightData[i] > actualMax) actualMax = this.heightData[i];
    }

    for (let i = 0; i < pos.count; i++) {
      const ix = i % (res + 1);
      const iz = Math.floor(i / (res + 1));
      const h = this.heightData[iz * (res + 1) + ix];
      pos.setY(i, h);

      // Vertex colors based on height
      const t = clamp(h / actualMax, 0, 1);
      let r, g, b;
      if (t < 0.15) {
        r = lerp(0.22, 0.28, t / 0.15);
        g = lerp(0.38, 0.52, t / 0.15);
        b = lerp(0.18, 0.15, t / 0.15);
      } else if (t < 0.4) {
        const s = (t - 0.15) / 0.25;
        r = lerp(0.28, 0.35, s);
        g = lerp(0.52, 0.45, s);
        b = lerp(0.15, 0.12, s);
      } else if (t < 0.7) {
        const s = (t - 0.4) / 0.3;
        r = lerp(0.35, 0.55, s);
        g = lerp(0.45, 0.40, s);
        b = lerp(0.12, 0.25, s);
      } else {
        const s = (t - 0.7) / 0.3;
        r = lerp(0.55, 0.8, s);
        g = lerp(0.40, 0.78, s);
        b = lerp(0.25, 0.75, s);
      }
      const dmg = this.damageData[iz * (res + 1) + ix];
      if (dmg > 0) {
        const darken = 1 - dmg * 0.7;
        r *= darken;
        g *= darken;
        b *= darken;
        r += dmg * 0.05;
      }
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.FrontSide,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.scene.add(this.mesh);
  }

  getHeight(wx, wz) {
    const half = this.worldSize / 2;
    const res = this.gridRes;

    const fx = ((wx + half) / this.worldSize) * res;
    const fz = ((wz + half) / this.worldSize) * res;

    const ix = clamp(Math.floor(fx), 0, res - 1);
    const iz = clamp(Math.floor(fz), 0, res - 1);
    const sx = fx - ix;
    const sz = fz - iz;

    const h00 = this.heightData[iz * (res + 1) + ix];
    const h10 = this.heightData[iz * (res + 1) + ix + 1];
    const h01 = this.heightData[(iz + 1) * (res + 1) + ix];
    const h11 = this.heightData[(iz + 1) * (res + 1) + ix + 1];

    return lerp(lerp(h00, h10, sx), lerp(h01, h11, sx), sz);
  }

  getNormal(wx, wz) {
    const d = this.worldSize / this.gridRes;
    const hL = this.getHeight(wx - d, wz);
    const hR = this.getHeight(wx + d, wz);
    const hD = this.getHeight(wx, wz - d);
    const hU = this.getHeight(wx, wz + d);
    const n = new THREE.Vector3(hL - hR, 2 * d, hD - hU);
    n.normalize();
    return n;
  }

  deform(wx, wz, radius, depth) {
    const half = this.worldSize / 2;
    const res = this.gridRes;
    const cellSize = this.worldSize / res;

    const minIx = clamp(Math.floor(((wx - radius) + half) / cellSize), 0, res);
    const maxIx = clamp(Math.ceil(((wx + radius) + half) / cellSize), 0, res);
    const minIz = clamp(Math.floor(((wz - radius) + half) / cellSize), 0, res);
    const maxIz = clamp(Math.ceil(((wz + radius) + half) / cellSize), 0, res);

    for (let iz = minIz; iz <= maxIz; iz++) {
      for (let ix = minIx; ix <= maxIx; ix++) {
        const vx = (ix / res) * this.worldSize - half;
        const vz = (iz / res) * this.worldSize - half;
        const dist = Math.sqrt((vx - wx) ** 2 + (vz - wz) ** 2);
        if (dist < radius) {
          const factor = 1 - (dist / radius);
          const idx = iz * (res + 1) + ix;
          this.heightData[idx] = Math.max(0, this.heightData[idx] - depth * factor * factor);
          this.damageData[idx] = Math.min(1, this.damageData[idx] + factor * factor * 0.6);
        }
      }
    }

    this.buildMesh();
  }

  addTerrain(wx, wz, radius, height) {
    const half = this.worldSize / 2;
    const res = this.gridRes;
    const cellSize = this.worldSize / res;

    const minIx = clamp(Math.floor(((wx - radius) + half) / cellSize), 0, res);
    const maxIx = clamp(Math.ceil(((wx + radius) + half) / cellSize), 0, res);
    const minIz = clamp(Math.floor(((wz - radius) + half) / cellSize), 0, res);
    const maxIz = clamp(Math.ceil(((wz + radius) + half) / cellSize), 0, res);

    for (let iz = minIz; iz <= maxIz; iz++) {
      for (let ix = minIx; ix <= maxIx; ix++) {
        const vx = (ix / res) * this.worldSize - half;
        const vz = (iz / res) * this.worldSize - half;
        const dist = Math.sqrt((vx - wx) ** 2 + (vz - wz) ** 2);
        if (dist < radius) {
          const factor = 1 - (dist / radius);
          const idx = iz * (res + 1) + ix;
          this.heightData[idx] += height * factor * factor;
        }
      }
    }

    this.buildMesh();
  }

  getTerrainProfile(startX, startZ, dirX, dirZ, maxDist, samples = 200) {
    const profile = [];
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const d = t * maxDist;
      const x = startX + dirX * d;
      const z = startZ + dirZ * d;
      const half = this.worldSize / 2;
      if (Math.abs(x) > half || Math.abs(z) > half) break;
      profile.push({ dist: d, height: this.getHeight(x, z) });
    }
    return profile;
  }

  isOutOfBounds(x, z) {
    const half = this.worldSize / 2;
    return Math.abs(x) > half || Math.abs(z) > half;
  }
}
