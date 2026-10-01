import * as THREE from 'three';
import { clamp, degToRad } from './utils.js';
import { WEAPONS } from './weapons.js';

const ARCHER_COLORS = [
  { body: 0x1565c0, turret: 0x1e88e5, accent: 0x42a5f5 },
  { body: 0xb71c1c, turret: 0xc62828, accent: 0xe53935 },
];

export class Archer {
  constructor(scene, terrain, playerIndex) {
    this.scene = scene;
    this.terrain = terrain;
    this.playerIndex = playerIndex;
    this.colors = ARCHER_COLORS[playerIndex];

    this.health = 100;
    this.maxHealth = 100;
    this.alive = true;

    this.turretAngle = playerIndex === 0 ? 0 : Math.PI;
    this.barrelElevation = degToRad(45);
    this.power = 50;
    this.fuel = 100;
    this.maxFuel = 100;

    this.fallVelocity = 0;
    this.falling = false;

    this.burnDamagePerTick = 0;
    this.burnTicksRemaining = 0;

    this.weaponInventory = WEAPONS.map(w => ({
      ...w,
      currentAmmo: w.ammo,
    }));
    this.selectedWeaponIndex = 0;

    this.group = new THREE.Group();
    this.turretGroup = new THREE.Group();
    this.barrelGroup = new THREE.Group();
    this.buildModel();
    scene.add(this.group);
  }

  buildModel() {
    const c = this.colors;

    // Legs
    const legGeo = new THREE.CylinderGeometry(0.12, 0.16, 1.2, 6);
    const legMat = new THREE.MeshLambertMaterial({ color: 0x5d4037 });
    for (const x of [-0.25, 0.25]) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(x, 0.6, 0);
      leg.castShadow = true;
      this.group.add(leg);
    }

    // Boots
    const bootGeo = new THREE.BoxGeometry(0.3, 0.2, 0.4);
    const bootMat = new THREE.MeshLambertMaterial({ color: 0x3e2723 });
    for (const x of [-0.25, 0.25]) {
      const boot = new THREE.Mesh(bootGeo, bootMat);
      boot.position.set(x, 0.1, 0.04);
      this.group.add(boot);
    }

    // Tunic skirt
    const skirtGeo = new THREE.CylinderGeometry(0.35, 0.55, 0.5, 8);
    const skirtMat = new THREE.MeshLambertMaterial({ color: c.body });
    const skirt = new THREE.Mesh(skirtGeo, skirtMat);
    skirt.position.y = 1.15;
    skirt.castShadow = true;
    this.group.add(skirt);

    // === UPPER BODY (turretGroup, rotates for horizontal aim) ===

    // Torso
    const torsoGeo = new THREE.BoxGeometry(0.9, 1.0, 0.5);
    const torsoMat = new THREE.MeshLambertMaterial({ color: c.turret });
    const torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.y = 0.5;
    torso.castShadow = true;
    this.turretGroup.add(torso);

    // Belt
    const beltGeo = new THREE.BoxGeometry(0.95, 0.12, 0.55);
    const beltMat = new THREE.MeshLambertMaterial({ color: 0x4e342e });
    const belt = new THREE.Mesh(beltGeo, beltMat);
    belt.position.y = 0.05;
    this.turretGroup.add(belt);

    // Shoulders
    const shoulderGeo = new THREE.BoxGeometry(1.2, 0.2, 0.55);
    const shoulderMat = new THREE.MeshLambertMaterial({ color: c.turret });
    const shoulders = new THREE.Mesh(shoulderGeo, shoulderMat);
    shoulders.position.y = 0.95;
    this.turretGroup.add(shoulders);

    // Head
    const headGeo = new THREE.SphereGeometry(0.28, 8, 6);
    const headMat = new THREE.MeshLambertMaterial({ color: 0xdeb887 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.25;
    head.castShadow = true;
    this.turretGroup.add(head);

    // Hood
    const hoodGeo = new THREE.ConeGeometry(0.32, 0.5, 6);
    const hoodMat = new THREE.MeshLambertMaterial({ color: c.accent });
    const hood = new THREE.Mesh(hoodGeo, hoodMat);
    hood.position.y = 1.6;
    this.turretGroup.add(hood);

    // Draw arm (right, pulling back bowstring)
    const drawArmGeo = new THREE.CylinderGeometry(0.07, 0.09, 0.7, 6);
    const drawArmMat = new THREE.MeshLambertMaterial({ color: c.turret });
    const drawArm = new THREE.Mesh(drawArmGeo, drawArmMat);
    drawArm.rotation.x = Math.PI / 3.5;
    drawArm.position.set(0.4, 0.55, -0.25);
    this.turretGroup.add(drawArm);

    // Quiver on back
    const quiverGeo = new THREE.CylinderGeometry(0.12, 0.14, 1.2, 6);
    const quiverMat = new THREE.MeshLambertMaterial({ color: 0x6d4c41 });
    const quiver = new THREE.Mesh(quiverGeo, quiverMat);
    quiver.position.set(0.2, 0.6, -0.35);
    quiver.rotation.x = -0.15;
    this.turretGroup.add(quiver);

    // Arrow shafts sticking out of quiver
    const stickGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.5, 4);
    const stickMat = new THREE.MeshLambertMaterial({ color: 0xc8a86e });
    for (let i = 0; i < 4; i++) {
      const stick = new THREE.Mesh(stickGeo, stickMat);
      stick.position.set(
        0.2 + (Math.random() - 0.5) * 0.08,
        1.3 + Math.random() * 0.15,
        -0.35 + (Math.random() - 0.5) * 0.08
      );
      stick.rotation.x = -0.15;
      this.turretGroup.add(stick);
    }

    this.turretGroup.position.y = 1.3;
    this.group.add(this.turretGroup);

    // === BOW + ARROW ASSEMBLY (barrelGroup, tilts for elevation) ===

    // Bow arm (extends forward along Y in local space)
    const bowArmGeo = new THREE.CylinderGeometry(0.07, 0.09, 0.9, 6);
    const bowArmMat = new THREE.MeshLambertMaterial({ color: c.turret });
    const bowArm = new THREE.Mesh(bowArmGeo, bowArmMat);
    bowArm.position.y = 0.45;
    this.barrelGroup.add(bowArm);

    // Bow (curved tube)
    const bowR = 0.65;
    const bowBulge = 0.2;
    const bowPts = [];
    const bowSegs = 16;
    for (let i = 0; i <= bowSegs; i++) {
      const t = i / bowSegs;
      const angle = (t - 0.5) * Math.PI;
      bowPts.push(new THREE.Vector3(
        0,
        0.95 + Math.cos(angle) * bowBulge,
        Math.sin(angle) * bowR
      ));
    }
    const bowCurve = new THREE.CatmullRomCurve3(bowPts);
    const bowTubeGeo = new THREE.TubeGeometry(bowCurve, 16, 0.04, 6, false);
    const bowTubeMat = new THREE.MeshLambertMaterial({ color: 0x8d6e63 });
    const bowMesh = new THREE.Mesh(bowTubeGeo, bowTubeMat);
    bowMesh.castShadow = true;
    this.barrelGroup.add(bowMesh);

    // Bowstring
    const stringPoints = [
      new THREE.Vector3(0, 0.95, -bowR),
      new THREE.Vector3(0, 0.95, bowR),
    ];
    const stringGeo = new THREE.BufferGeometry().setFromPoints(stringPoints);
    const stringMat = new THREE.LineBasicMaterial({ color: 0xccccaa, linewidth: 2 });
    const bowstring = new THREE.Line(stringGeo, stringMat);
    this.barrelGroup.add(bowstring);

    // Arrow shaft
    const shaftGeo = new THREE.CylinderGeometry(0.03, 0.03, 3.0, 6);
    const shaftMat = new THREE.MeshLambertMaterial({ color: 0xc8a86e });
    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    shaft.position.y = 1.5;
    shaft.castShadow = true;
    this.barrelGroup.add(shaft);

    // Arrowhead
    const tipGeo = new THREE.ConeGeometry(0.08, 0.3, 4);
    const tipMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
    const arrowTip = new THREE.Mesh(tipGeo, tipMat);
    arrowTip.position.y = 3.15;
    this.barrelGroup.add(arrowTip);

    // Fletching
    const fletchGeo = new THREE.PlaneGeometry(0.15, 0.2);
    const fletchMat = new THREE.MeshLambertMaterial({
      color: 0xeeeeee, side: THREE.DoubleSide, transparent: true, opacity: 0.8,
    });
    for (let i = 0; i < 3; i++) {
      const fletch = new THREE.Mesh(fletchGeo, fletchMat);
      fletch.position.set(0.07, 0.15, 0);
      fletch.rotation.y = (i / 3) * Math.PI * 2;
      this.barrelGroup.add(fletch);
    }

    this.barrelGroup.position.set(0, 0.4, 0);
    this.turretGroup.add(this.barrelGroup);

    this.updateTurretRotation();
  }

  setPosition(x, z) {
    const y = this.terrain.getHeight(x, z);
    this.group.position.set(x, y, z);
    this.fallVelocity = 0;
    this.falling = false;
    this.alignToTerrain(x, z);
  }

  update(dt) {
    if (!this.alive) return;
    const pos = this.group.position;
    const groundY = this.terrain.getHeight(pos.x, pos.z);

    if (pos.y > groundY + 0.1) {
      this.falling = true;
      this.fallVelocity += 9.81 * dt;
      pos.y -= this.fallVelocity * dt;

      if (pos.y <= groundY) {
        pos.y = groundY;
        this.fallVelocity = 0;
        this.falling = false;
        this.alignToTerrain(pos.x, pos.z);
      }
    } else if (pos.y < groundY - 0.05) {
      pos.y = groundY;
      this.alignToTerrain(pos.x, pos.z);
    }
  }

  alignToTerrain(x, z) {
    const n = this.terrain.getNormal(x, z);
    const up = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(up, n);
    const identity = new THREE.Quaternion();
    identity.slerp(q, 0.4);
    this.group.quaternion.copy(identity);
  }

  get position() {
    return this.group.position;
  }

  get muzzleWorldPosition() {
    const tip = new THREE.Vector3(0, 3.3, 0);
    this.barrelGroup.localToWorld(tip);
    return tip;
  }

  getFireDirection() {
    const dir = new THREE.Vector3(0, 1, 0);
    dir.applyQuaternion(this.barrelGroup.quaternion);
    dir.applyQuaternion(this.turretGroup.quaternion);
    return dir.normalize();
  }

  getFireVelocity() {
    const speed = (this.power / 100) * 60;
    const cosEl = Math.cos(this.barrelElevation);
    const sinEl = Math.sin(this.barrelElevation);
    const vx = speed * cosEl * Math.sin(this.turretAngle);
    const vy = speed * sinEl;
    const vz = speed * cosEl * Math.cos(this.turretAngle);
    return new THREE.Vector3(vx, vy, vz);
  }

  updateTurretRotation() {
    this.turretGroup.rotation.y = this.turretAngle;
    this.barrelGroup.rotation.x = Math.PI / 2 - this.barrelElevation;
  }

  rotateTurret(delta) {
    this.turretAngle += delta;
    this.updateTurretRotation();
  }

  adjustElevation(delta) {
    this.barrelElevation = clamp(this.barrelElevation + delta, degToRad(5), degToRad(85));
    this.updateTurretRotation();
  }

  adjustPower(delta) {
    this.power = clamp(this.power + delta, 5, 100);
  }

  move(direction) {
    if (this.fuel <= 0) return;
    const moveSpeed = 0.5;
    const cost = 2;

    const facing = this.turretAngle;
    const dx = Math.sin(facing) * direction * moveSpeed;
    const dz = Math.cos(facing) * direction * moveSpeed;

    const newX = this.group.position.x + dx;
    const newZ = this.group.position.z + dz;

    if (!this.terrain.isOutOfBounds(newX, newZ)) {
      this.setPosition(newX, newZ);
      this.fuel = Math.max(0, this.fuel - cost);
    }
  }

  moveXZ(dx, dz, magnitude) {
    if (this.fuel <= 0) return;
    const moveSpeed = 0.5 * magnitude;
    const cost = 2 * magnitude;

    const newX = this.group.position.x + dx * moveSpeed;
    const newZ = this.group.position.z + dz * moveSpeed;

    if (!this.terrain.isOutOfBounds(newX, newZ)) {
      this.setPosition(newX, newZ);
      this.fuel = Math.max(0, this.fuel - cost);
    }
  }

  resetFuel() {
    this.fuel = this.maxFuel;
  }

  cycleWeapon(dir = 1) {
    const available = this.weaponInventory;
    let idx = this.selectedWeaponIndex;
    for (let i = 0; i < available.length; i++) {
      idx = (idx + dir + available.length) % available.length;
      if (available[idx].currentAmmo > 0) {
        this.selectedWeaponIndex = idx;
        return;
      }
    }
  }

  get currentWeapon() {
    return this.weaponInventory[this.selectedWeaponIndex];
  }

  useAmmo() {
    const w = this.currentWeapon;
    if (w.currentAmmo !== Infinity) {
      w.currentAmmo--;
      if (w.currentAmmo <= 0) {
        this.cycleWeapon(1);
      }
    }
  }

  takeDamage(amount) {
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) {
      this.alive = false;
    }
    return this.health;
  }

  applyBurnDamage() {
    if (this.burnTicksRemaining > 0) {
      this.takeDamage(this.burnDamagePerTick);
      this.burnTicksRemaining--;
      return this.burnDamagePerTick;
    }
    return 0;
  }

  setOnFire(damagePerTick, ticks) {
    this.burnDamagePerTick = damagePerTick;
    this.burnTicksRemaining = ticks;
  }

  destroy() {
    this.scene.remove(this.group);
  }
}
