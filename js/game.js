import * as THREE from 'three';
import { Terrain } from './terrain.js';
import { Archer } from './archer.js';
import { Projectile } from './projectile.js';
import { ExplosionManager } from './explosion.js';
import { CameraController } from './camera.js';
import { SideView } from './sideview.js';
import { UI } from './ui.js';
import { randRange, degToRad } from './utils.js';

const STATES = {
  MENU: 'menu',
  TURN_START: 'turn_start',
  AIM: 'aim',
  FIRING: 'firing',
  IMPACT: 'impact',
  GAME_OVER: 'game_over',
};

export class Game {
  constructor(renderer, scene, camera, canvas) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.canvas = canvas;

    this.state = STATES.MENU;
    this.currentPlayer = 0;
    this.turn = 0;

    this.terrain = null;
    this.tanks = [];
    this.projectile = null;
    this.activeProjectiles = [];
    this.explosions = new ExplosionManager(scene);
    this.cameraCtrl = new CameraController(camera, canvas);
    this.sideView = new SideView();
    this.ui = new UI();

    this.wind = { x: 0, z: 0 };
    this.keys = {};
    this.impactTimer = 0;
    this.napalmFlow = null;
    this.joystick = { dx: 0, dz: 0, active: false };
    this.ghostTank = null;
    this.rangeRing = null;
    this.ghostPlaced = false;
    this.driving = null;
    this.cameraMode = 'drone';
    this.shotMarkers = [];
    this.tracerLabels = [];
    this.trees = [];
    this.ruins = [];
    this.replayData = [];
    this.currentShotPath = null;
    this.replay = null;

    this.setupScene();
    this.setupInput();
    this.ui.showStart();
  }

  setupScene() {
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 70, 170);

    const ambient = new THREE.AmbientLight(0x6688aa, 0.6);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xfff5e0, 1.2);
    sun.position.set(40, 60, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.left = -100;
    sun.shadow.camera.right = 100;
    sun.shadow.camera.top = 100;
    sun.shadow.camera.bottom = -100;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 200;
    this.scene.add(sun);

    const waterGeo = new THREE.PlaneGeometry(260, 260);
    const waterMat = new THREE.MeshLambertMaterial({
      color: 0x2196f3,
      transparent: true,
      opacity: 0.6,
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = -0.5;
    this.scene.add(water);
  }

  setupInput() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'Tab') {
        e.preventDefault();
        if (this.state === STATES.AIM) {
          this.currentTank.cycleWeapon(e.shiftKey ? -1 : 1);
          this.ui.updateWeapon(this.currentTank);
        }
      }
      if (e.code === 'Enter' && this.state === STATES.AIM) {
        this.fire();
      }
      if (e.code === 'Space') {
        e.preventDefault();
        if (this.state === STATES.AIM && !this.sideView.active) {
          this.sideView.show(this.currentTank, this.terrain, this.wind);
        }
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    this.ui.btnStart.addEventListener('click', () => this.startGame());
    this.ui.btnRestart.addEventListener('click', () => this.startGame());

    this.setupTouchControls();
  }

  setupTouchControls() {
    const holdButtons = document.querySelectorAll('[data-key]');
    for (const btn of holdButtons) {
      const key = btn.dataset.key;
      const onDown = (e) => {
        e.preventDefault();
        this.keys[key] = true;
        btn.classList.add('pressed');
      };
      const onUp = (e) => {
        e.preventDefault();
        this.keys[key] = false;
        btn.classList.remove('pressed');
      };
      btn.addEventListener('touchstart', onDown, { passive: false });
      btn.addEventListener('touchend', onUp, { passive: false });
      btn.addEventListener('touchcancel', onUp, { passive: false });
      btn.addEventListener('mousedown', onDown);
      btn.addEventListener('mouseup', onUp);
      btn.addEventListener('mouseleave', onUp);
    }

    document.getElementById('btnFire').addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.state === STATES.AIM) this.fire();
    }, { passive: false });
    document.getElementById('btnFire').addEventListener('click', () => {
      if (this.state === STATES.AIM) this.fire();
    });

    document.getElementById('btnWeaponNext').addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.state === STATES.AIM) {
        this.currentTank.cycleWeapon(1);
        this.ui.updateWeapon(this.currentTank);
      }
    }, { passive: false });
    document.getElementById('btnWeaponNext').addEventListener('click', () => {
      if (this.state === STATES.AIM) {
        this.currentTank.cycleWeapon(1);
        this.ui.updateWeapon(this.currentTank);
      }
    });

    document.getElementById('btnWeaponPrev').addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.state === STATES.AIM) {
        this.currentTank.cycleWeapon(-1);
        this.ui.updateWeapon(this.currentTank);
      }
    }, { passive: false });
    document.getElementById('btnWeaponPrev').addEventListener('click', () => {
      if (this.state === STATES.AIM) {
        this.currentTank.cycleWeapon(-1);
        this.ui.updateWeapon(this.currentTank);
      }
    });

    const sideViewBtn = document.getElementById('btnSideView');
    const showSideView = (e) => {
      if (e) e.preventDefault();
      if (this.state === STATES.AIM && !this.sideView.active) {
        this.sideView.show(this.currentTank, this.terrain, this.wind);
      }
    };
    sideViewBtn.addEventListener('touchstart', showSideView, { passive: false });
    sideViewBtn.addEventListener('click', showSideView);

    const camToggle = document.getElementById('btnCameraToggle');
    const toggleCamera = (e) => {
      if (e) e.preventDefault();
      if (this.state !== STATES.AIM) return;
      if (this.cameraMode === 'drone') {
        this.cameraMode = 'aiming';
        camToggle.textContent = 'HAWK VIEW';
        camToggle.classList.add('active');
        const enemy = this.tanks[1 - this.currentPlayer];
        this.cameraCtrl.startAiming(this.currentTank, enemy, this.scene);
      } else {
        this.cameraMode = 'drone';
        camToggle.textContent = 'AIM VIEW';
        camToggle.classList.remove('active');
        const mid = this.tanks[0].position.clone().add(this.tanks[1].position).multiplyScalar(0.5);
        this.cameraCtrl.stopAiming(mid);
      }
    };
    camToggle.addEventListener('touchstart', toggleCamera, { passive: false });
    camToggle.addEventListener('click', toggleCamera);

    document.getElementById('btnMoveOk').addEventListener('click', () => this.confirmMove());
    document.getElementById('btnMoveOk').addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.confirmMove();
    }, { passive: false });
    document.getElementById('btnMoveCancel').addEventListener('click', () => this.cancelMove());
    document.getElementById('btnMoveCancel').addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.cancelMove();
    }, { passive: false });

    this.setupJoystick();
  }

  setupJoystick() {
    const base = document.getElementById('joystickBase');
    const knob = document.getElementById('joystickKnob');
    const maxDist = 30;
    let touchId = null;
    let centerX = 0;
    let centerY = 0;

    const getCenter = () => {
      const rect = base.getBoundingClientRect();
      centerX = rect.left + rect.width / 2;
      centerY = rect.top + rect.height / 2;
    };

    const updateKnob = (clientX, clientY) => {
      let offX = clientX - centerX;
      let offY = clientY - centerY;
      const dist = Math.sqrt(offX * offX + offY * offY);
      const clamped = Math.min(dist, maxDist);
      if (dist > 0) {
        offX = (offX / dist) * clamped;
        offY = (offY / dist) * clamped;
      }
      knob.style.transform = `translate(calc(-50% + ${offX}px), calc(-50% + ${offY}px))`;
      knob.classList.add('active');

      const magnitude = clamped / maxDist;
      if (magnitude > 0.1 && this.state === STATES.AIM && !this.driving) {
        this.updateGhostPosition(offX / maxDist, offY / maxDist, magnitude);
      }
    };

    const releaseKnob = () => {
      knob.style.transform = 'translate(-50%, -50%)';
      knob.classList.remove('active');
      touchId = null;
      if (this.ghostTank && this.ghostPlaced) {
        document.getElementById('moveConfirm').classList.remove('hidden');
      }
    };

    base.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (touchId !== null) return;
      if (this.driving) return;
      const touch = e.changedTouches[0];
      touchId = touch.identifier;
      getCenter();
      this.showRangeRing();
      updateKnob(touch.clientX, touch.clientY);
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (touchId === null) return;
      for (const touch of e.changedTouches) {
        if (touch.identifier === touchId) {
          e.preventDefault();
          updateKnob(touch.clientX, touch.clientY);
          break;
        }
      }
    }, { passive: false });

    window.addEventListener('touchend', (e) => {
      for (const touch of e.changedTouches) {
        if (touch.identifier === touchId) {
          releaseKnob();
          break;
        }
      }
    });

    window.addEventListener('touchcancel', (e) => {
      for (const touch of e.changedTouches) {
        if (touch.identifier === touchId) {
          releaseKnob();
          break;
        }
      }
    });

    let mouseDown = false;
    base.addEventListener('mousedown', (e) => {
      if (this.driving) return;
      mouseDown = true;
      getCenter();
      this.showRangeRing();
      updateKnob(e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', (e) => {
      if (!mouseDown) return;
      updateKnob(e.clientX, e.clientY);
    });
    window.addEventListener('mouseup', () => {
      if (mouseDown) {
        mouseDown = false;
        releaseKnob();
      }
    });
  }

  getMoveRadius() {
    const tank = this.currentTank;
    return (tank.fuel / tank.maxFuel) * 25;
  }

  showRangeRing() {
    this.hideRangeRing();
    this.removeGhost();
    const tank = this.currentTank;
    if (tank.fuel <= 0) return;

    const radius = this.getMoveRadius();
    const segments = 64;
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = tank.position.x + Math.cos(angle) * radius;
      const z = tank.position.z + Math.sin(angle) * radius;
      const y = this.terrain.getHeight(x, z) + 0.5;
      points.push(new THREE.Vector3(x, y, z));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineDashedMaterial({
      color: 0x66bb6a, dashSize: 1.5, gapSize: 1, transparent: true, opacity: 0.7,
    });
    this.rangeRing = new THREE.Line(geo, mat);
    this.rangeRing.computeLineDistances();
    this.scene.add(this.rangeRing);
  }

  hideRangeRing() {
    if (this.rangeRing) {
      this.scene.remove(this.rangeRing);
      this.rangeRing.geometry.dispose();
      this.rangeRing.material.dispose();
      this.rangeRing = null;
    }
  }

  updateGhostPosition(dx, dz, magnitude) {
    const tank = this.currentTank;
    if (tank.fuel <= 0) return;
    const radius = this.getMoveRadius();
    const targetX = tank.position.x + dx * radius * magnitude;
    const targetZ = tank.position.z + dz * radius * magnitude;

    if (this.terrain.isOutOfBounds(targetX, targetZ)) return;

    if (!this.ghostTank) {
      const geo = new THREE.CylinderGeometry(0.3, 0.45, 2.5, 8);
      const mat = new THREE.MeshLambertMaterial({
        color: tank.colors.body, transparent: true, opacity: 0.4,
      });
      this.ghostTank = new THREE.Mesh(geo, mat);
      this.ghostTank.position.y = 1.25;
      const ghostGroup = new THREE.Group();
      ghostGroup.add(this.ghostTank);
      this.ghostTank._group = ghostGroup;
      this.scene.add(ghostGroup);
    }

    const y = this.terrain.getHeight(targetX, targetZ);
    this.ghostTank._group.position.set(targetX, y, targetZ);
    const n = this.terrain.getNormal(targetX, targetZ);
    const up = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(up, n);
    const identity = new THREE.Quaternion();
    identity.slerp(q, 0.4);
    this.ghostTank._group.quaternion.copy(identity);

    this.ghostPlaced = true;
    this.ghostTargetPos = new THREE.Vector3(targetX, y, targetZ);
  }

  removeGhost() {
    if (this.ghostTank) {
      this.scene.remove(this.ghostTank._group);
      this.ghostTank.geometry.dispose();
      this.ghostTank.material.dispose();
      this.ghostTank = null;
    }
    this.ghostPlaced = false;
    document.getElementById('moveConfirm').classList.add('hidden');
  }

  confirmMove() {
    if (!this.ghostPlaced || !this.ghostTargetPos || this.driving) return;
    const tank = this.currentTank;
    const start = tank.position.clone();
    const end = this.ghostTargetPos.clone();
    const dist = start.distanceTo(end);
    const duration = Math.max(0.5, dist / 15);

    this.hideRangeRing();
    this.removeGhost();

    const fuelCost = Math.min(tank.fuel, (dist / this.getMoveRadius()) * tank.fuel);

    this.driving = { start, end, elapsed: 0, duration, fuelCost };
  }

  cancelMove() {
    this.hideRangeRing();
    this.removeGhost();
  }

  updateDriving(dt) {
    if (!this.driving) return;
    const d = this.driving;
    d.elapsed += dt;
    const t = Math.min(d.elapsed / d.duration, 1);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    const x = d.start.x + (d.end.x - d.start.x) * eased;
    const z = d.start.z + (d.end.z - d.start.z) * eased;
    this.currentTank.setPosition(x, z);

    if (t >= 1) {
      this.currentTank.fuel = Math.max(0, this.currentTank.fuel - d.fuelCost);
      this.driving = null;
      this.ui.updateFuel(this.currentTank);
    }
  }

  startGame() {
    if (this.terrain) {
      this.scene.remove(this.terrain.mesh);
    }
    for (const t of this.tanks) {
      t.destroy();
    }
    this.tanks = [];
    this.activeProjectiles = [];
    for (const m of this.shotMarkers) {
      this.scene.remove(m.ring);
      this.scene.remove(m.dot);
      m.ringGeo.dispose();
      m.ringMat.dispose();
      m.dotGeo.dispose();
      m.dotMat.dispose();
    }
    this.shotMarkers = [];
    this.clearTracerLabels();
    this.hideRangeRing();
    this.removeGhost();
    this.driving = null;
    this.resetCameraMode();
    for (const tree of this.trees) {
      this.scene.remove(tree.group);
      for (const child of tree.group.children) {
        child.geometry.dispose();
        child.material.dispose();
      }
    }
    this.trees = [];
    for (const ruin of this.ruins) {
      this.scene.remove(ruin.group);
      ruin.group.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
    }
    this.ruins = [];
    this.cleanupReplay();
    this.replayData = [];
    this.currentShotPath = null;

    this.ui.hideStart();
    this.ui.hideGameOver();
    this.ui.showHud();

    this.terrain = new Terrain(this.scene);

    const a1 = new Archer(this.scene, this.terrain, 0);
    a1.setPosition(-60, randRange(-17, 17));
    a1.turretAngle = Math.PI / 2;
    a1.updateTurretRotation();

    const a2 = new Archer(this.scene, this.terrain, 1);
    a2.setPosition(60, randRange(-17, 17));
    a2.turretAngle = -Math.PI / 2;
    a2.updateTurretRotation();

    this.tanks = [a1, a2];

    this.placeTrees(a1.position, a2.position);
    this.placeRuins(a1.position, a2.position);

    this.randomizeWind();

    this.currentPlayer = 0;
    this.turn = 0;
    this.firstTurn = true;
    this.startTurn();
  }

  get currentTank() {
    return this.tanks[this.currentPlayer];
  }

  get otherTank() {
    return this.tanks[1 - this.currentPlayer];
  }

  randomizeWind() {
    const angle = Math.random() * Math.PI * 2;
    const speed = randRange(0, 3);
    this.wind = {
      x: Math.cos(angle) * speed,
      z: Math.sin(angle) * speed,
    };
  }

  resetCameraMode() {
    this.cameraMode = 'drone';
    const btn = document.getElementById('btnCameraToggle');
    if (btn) {
      btn.textContent = 'AIM VIEW';
      btn.classList.remove('active');
    }
  }

  startTurn() {
    this.state = STATES.TURN_START;
    this.turn++;
    this.currentTank.resetFuel();
    this.resetCameraMode();
    this.cancelMove();
    this.driving = null;
    this.ui.showTurnBanner(this.currentPlayer);
    this.ui.updateAll(this.currentTank, this.tanks, this.wind);
    const instant = this.firstTurn || false;
    this.firstTurn = false;
    const mid = this.tanks[0].position.clone().add(this.tanks[1].position).multiplyScalar(0.5);
    this.cameraCtrl.returnToOrbit(mid, instant);

    const burnDmg = this.currentTank.applyBurnDamage();
    if (burnDmg > 0) {
      this.ui.updateHealth(this.tanks);
      if (!this.currentTank.alive) {
        this.gameOver(1 - this.currentPlayer);
        return;
      }
    }

    setTimeout(() => {
      if (this.state === STATES.TURN_START) {
        this.state = STATES.AIM;
      }
    }, 1600);
  }

  fire() {
    if (this.state !== STATES.AIM) return;
    if (this.driving) return;
    this.sideView.hide();
    this.cancelMove();
    if (this.cameraMode === 'aiming') {
      this.cameraCtrl.hideEnemyArrow();
    }

    const tank = this.currentTank;
    const weapon = tank.currentWeapon;
    if (weapon.currentAmmo <= 0) return;

    tank.useAmmo();
    this.state = STATES.FIRING;

    const startPos = tank.muzzleWorldPosition;
    this.activeProjectiles = [];
    this.currentShotPath = { positions: [], color: weapon.color, impactPos: null, sampleCounter: 0 };

    if (weapon.elevationOffsets) {
      if (weapon.behavior === 'tracer') this.clearTracerLabels();
      const baseElevation = tank.barrelElevation;
      const baseAngleDeg = (baseElevation * 180) / Math.PI;
      for (const offsetDeg of weapon.elevationOffsets) {
        const el = baseElevation + degToRad(offsetDeg);
        const speed = (tank.power / 100) * 60;
        const velocity = new THREE.Vector3(
          speed * Math.cos(el) * Math.sin(tank.turretAngle),
          speed * Math.sin(el),
          speed * Math.cos(el) * Math.cos(tank.turretAngle)
        );
        const proj = new Projectile(
          this.scene, startPos.clone(), velocity, weapon,
          this.wind, this.terrain, this.tanks
        );
        proj.launchAngleDeg = Math.round((baseAngleDeg + offsetDeg) * 10) / 10;
        this.activeProjectiles.push(proj);
      }
    } else {
      const velocity = tank.getFireVelocity();
      const proj = new Projectile(
        this.scene, startPos, velocity, weapon,
        this.wind, this.terrain, this.tanks
      );
      this.activeProjectiles.push(proj);
    }

    this.cameraCtrl.startFollow(this.activeProjectiles[0]);
  }

  handleImpact(result) {
    if (result.type === 'impact') {
      if (this.currentShotPath && !this.currentShotPath.impactPos) {
        this.currentShotPath.impactPos = { x: result.position.x, y: result.position.y, z: result.position.z };
      }
      if (result.weapon.behavior === 'tracer') {
        this.addTracerLabel(result.position, result.launchAngleDeg);
      } else {
        this.addShotMarker(result.position);
      }
      if (result.weapon.behavior === 'napalm') {
        this.startNapalmFlow(result.position, result.weapon);
        return;
      }
      this.explosions.createExplosion(
        result.position,
        result.weapon,
        this.terrain,
        this.tanks
      );
      this.destroyTreesInRadius(result.position.x, result.position.z, result.weapon.blastRadius);
      this.cameraCtrl.showImpact(result.position);
      this.ui.updateHealth(this.tanks);
    }
  }

  addShotMarker(position) {
    const y = this.terrain.getHeight(position.x, position.z) + 0.3;
    const ringGeo = new THREE.RingGeometry(0.8, 1.2, 16);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1.0,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(position.x, y, position.z);
    ring.rotation.x = -Math.PI / 2;
    this.scene.add(ring);

    const dotGeo = new THREE.CircleGeometry(0.4, 12);
    const dotMat = new THREE.MeshBasicMaterial({
      color: 0xff4444,
      transparent: true,
      opacity: 1.0,
      side: THREE.DoubleSide,
    });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.set(position.x, y + 0.05, position.z);
    dot.rotation.x = -Math.PI / 2;
    this.scene.add(dot);

    this.shotMarkers.push({ ring, ringGeo, ringMat, dot, dotGeo, dotMat });

    while (this.shotMarkers.length > 3) {
      const old = this.shotMarkers.shift();
      this.scene.remove(old.ring);
      this.scene.remove(old.dot);
      old.ringGeo.dispose();
      old.ringMat.dispose();
      old.dotGeo.dispose();
      old.dotMat.dispose();
    }

    this.updateMarkerOpacity();
  }

  updateMarkerOpacity() {
    const count = this.shotMarkers.length;
    for (let i = 0; i < count; i++) {
      const age = count - 1 - i;
      const opacity = age === 0 ? 1.0 : age === 1 ? 0.5 : 0.2;
      this.shotMarkers[i].ringMat.opacity = opacity;
      this.shotMarkers[i].dotMat.opacity = opacity;
    }
  }

  addTracerLabel(position, angleDeg) {
    const y = this.terrain.getHeight(position.x, position.z) + 0.3;

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#aaffaa';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    const text = `${angleDeg}°`;
    ctx.strokeText(text, 64, 32);
    ctx.fillText(text, 64, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(position.x, y + 2.5, position.z);
    sprite.scale.set(4, 2, 1);
    this.scene.add(sprite);

    const dotGeo = new THREE.CircleGeometry(0.3, 12);
    const dotMat = new THREE.MeshBasicMaterial({
      color: 0xaaffaa, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
    });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.set(position.x, y + 0.05, position.z);
    dot.rotation.x = -Math.PI / 2;
    this.scene.add(dot);

    this.tracerLabels.push({ sprite, texture, mat, dot, dotGeo, dotMat });
  }

  clearTracerLabels() {
    for (const t of this.tracerLabels) {
      this.scene.remove(t.sprite);
      t.texture.dispose();
      t.mat.dispose();
      this.scene.remove(t.dot);
      t.dotGeo.dispose();
      t.dotMat.dispose();
    }
    this.tracerLabels = [];
  }

  placeTrees(spawn1, spawn2) {
    const count = 25 + Math.floor(Math.random() * 20);
    const half = this.terrain.worldSize / 2;

    for (let i = 0; i < count; i++) {
      const x = randRange(-half + 10, half - 10);
      const z = randRange(-half + 10, half - 10);

      const d1 = Math.sqrt((x - spawn1.x) ** 2 + (z - spawn1.z) ** 2);
      const d2 = Math.sqrt((x - spawn2.x) ** 2 + (z - spawn2.z) ** 2);
      if (d1 < 15 || d2 < 15) continue;

      const h = this.terrain.getHeight(x, z);
      if (h < 1.5) continue;

      const group = new THREE.Group();
      const isPine = Math.random() > 0.4;
      const scale = 0.7 + Math.random() * 0.6;

      const trunkH = (isPine ? 3 : 2.5) * scale;
      const trunkR = 0.25 * scale;
      const trunkGeo = new THREE.CylinderGeometry(trunkR * 0.7, trunkR, trunkH, 6);
      const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5d4037 });
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = trunkH / 2;
      trunk.castShadow = true;
      group.add(trunk);

      if (isPine) {
        const tiers = 2 + Math.floor(Math.random() * 2);
        for (let t = 0; t < tiers; t++) {
          const tierR = (2.0 - t * 0.5) * scale;
          const tierH = (2.5 - t * 0.4) * scale;
          const leafGeo = new THREE.ConeGeometry(tierR, tierH, 7);
          const green = 0x2e7d32 + Math.floor(Math.random() * 0x001500);
          const leafMat = new THREE.MeshLambertMaterial({ color: green });
          const leaf = new THREE.Mesh(leafGeo, leafMat);
          leaf.position.y = trunkH + t * tierH * 0.55 + tierH * 0.3;
          leaf.castShadow = true;
          group.add(leaf);
        }
      } else {
        const crownR = (1.8 + Math.random() * 0.8) * scale;
        const leafGeo = new THREE.SphereGeometry(crownR, 8, 6);
        const green = 0x388e3c + Math.floor(Math.random() * 0x002200);
        const leafMat = new THREE.MeshLambertMaterial({ color: green });
        const leaf = new THREE.Mesh(leafGeo, leafMat);
        leaf.position.y = trunkH + crownR * 0.6;
        leaf.castShadow = true;
        group.add(leaf);
      }

      group.position.set(x, h, z);
      group.rotation.y = Math.random() * Math.PI * 2;
      this.scene.add(group);
      this.trees.push({ group, x, z });
    }
  }

  placeRuins(spawn1, spawn2) {
    const half = this.terrain.worldSize / 2;
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0x8a817c });
    const darkStoneMat = new THREE.MeshLambertMaterial({ color: 0x6b6560 });
    const mossyMat = new THREE.MeshLambertMaterial({ color: 0x7a8a6e });

    const count = 8 + Math.floor(Math.random() * 6);

    for (let i = 0; i < count; i++) {
      const x = randRange(-half + 15, half - 15);
      const z = randRange(-half + 15, half - 15);

      const d1 = Math.sqrt((x - spawn1.x) ** 2 + (z - spawn1.z) ** 2);
      const d2 = Math.sqrt((x - spawn2.x) ** 2 + (z - spawn2.z) ** 2);
      if (d1 < 12 || d2 < 12) continue;

      const h = this.terrain.getHeight(x, z);
      if (h < 1.0) continue;

      const group = new THREE.Group();
      const type = Math.random();

      if (type < 0.35) {
        const wallW = 4 + Math.random() * 6;
        const wallH = 2.5 + Math.random() * 3;
        const wallD = 0.8 + Math.random() * 0.4;
        const geo = new THREE.BoxGeometry(wallW, wallH, wallD);
        const wall = new THREE.Mesh(geo, stoneMat.clone());
        wall.position.y = wallH / 2;
        wall.castShadow = true;
        wall.receiveShadow = true;
        group.add(wall);

        if (Math.random() > 0.4) {
          const chipW = 1 + Math.random() * 2;
          const chipH = 0.5 + Math.random() * 1.5;
          const chipGeo = new THREE.BoxGeometry(chipW, chipH, wallD + 0.1);
          const chip = new THREE.Mesh(chipGeo, stoneMat.clone());
          chip.position.set(
            (Math.random() - 0.5) * (wallW - chipW),
            wallH - chipH / 2,
            0
          );
          group.add(chip);
          wall.scale.y = (wallH - chipH * 0.6) / wallH;
        }
      } else if (type < 0.6) {
        const colCount = 2 + Math.floor(Math.random() * 3);
        const spacing = 2.5 + Math.random() * 1.5;
        for (let c = 0; c < colCount; c++) {
          const colH = 3 + Math.random() * 3;
          const colR = 0.3 + Math.random() * 0.2;
          const geo = new THREE.CylinderGeometry(colR * 0.85, colR, colH, 8);
          const col = new THREE.Mesh(geo, darkStoneMat.clone());
          col.position.set((c - (colCount - 1) / 2) * spacing, colH / 2, 0);
          col.castShadow = true;
          group.add(col);

          if (Math.random() > 0.5) {
            const capGeo = new THREE.BoxGeometry(colR * 2.5, 0.4, colR * 2.5);
            const cap = new THREE.Mesh(capGeo, darkStoneMat.clone());
            cap.position.set(col.position.x, colH + 0.2, 0);
            group.add(cap);
          }
        }

        if (colCount >= 2 && Math.random() > 0.4) {
          const lintelW = (colCount - 1) * spacing + 1.5;
          const lintelGeo = new THREE.BoxGeometry(lintelW, 0.5, 0.8);
          const lintel = new THREE.Mesh(lintelGeo, mossyMat.clone());
          const avgH = 4.5;
          lintel.position.set(0, avgH + 0.25, 0);
          lintel.castShadow = true;
          group.add(lintel);
        }
      } else if (type < 0.8) {
        const wallL = 3 + Math.random() * 4;
        const wallH = 2 + Math.random() * 2;
        const geo1 = new THREE.BoxGeometry(wallL, wallH, 0.7);
        const w1 = new THREE.Mesh(geo1, mossyMat.clone());
        w1.position.y = wallH / 2;
        w1.castShadow = true;
        group.add(w1);

        const geo2 = new THREE.BoxGeometry(0.7, wallH * 0.8, wallL * 0.7);
        const w2 = new THREE.Mesh(geo2, stoneMat.clone());
        w2.position.set(-wallL / 2 + 0.35, wallH * 0.4, wallL * 0.35);
        w2.castShadow = true;
        group.add(w2);
      } else {
        const blockCount = 3 + Math.floor(Math.random() * 4);
        for (let b = 0; b < blockCount; b++) {
          const bw = 0.6 + Math.random() * 1.2;
          const bh = 0.4 + Math.random() * 0.8;
          const bd = 0.6 + Math.random() * 1.0;
          const geo = new THREE.BoxGeometry(bw, bh, bd);
          const block = new THREE.Mesh(geo, (Math.random() > 0.5 ? stoneMat : darkStoneMat).clone());
          block.position.set(
            (Math.random() - 0.5) * 4,
            bh / 2,
            (Math.random() - 0.5) * 4
          );
          block.rotation.y = Math.random() * Math.PI;
          block.castShadow = true;
          group.add(block);
        }
      }

      group.position.set(x, h, z);
      group.rotation.y = Math.random() * Math.PI * 2;
      this.scene.add(group);
      this.ruins.push({ group, x, z });
    }
  }

  destroyTreesInRadius(wx, wz, radius) {
    for (let i = this.trees.length - 1; i >= 0; i--) {
      const t = this.trees[i];
      const dx = t.x - wx;
      const dz = t.z - wz;
      if (dx * dx + dz * dz < radius * radius) {
        this.scene.remove(t.group);
        for (const child of t.group.children) {
          child.geometry.dispose();
          child.material.dispose();
        }
        this.trees.splice(i, 1);
      }
    }
    for (let i = this.ruins.length - 1; i >= 0; i--) {
      const r = this.ruins[i];
      const dx = r.x - wx;
      const dz = r.z - wz;
      if (dx * dx + dz * dz < radius * radius) {
        this.scene.remove(r.group);
        r.group.traverse(child => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        });
        this.ruins.splice(i, 1);
      }
    }
  }

  startNapalmFlow(position, weapon) {
    this.cameraCtrl.showImpact(position);
    const DROPLET_COUNT = 40;
    const droplets = [];
    for (let i = 0; i < DROPLET_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 6;
      droplets.push({
        x: position.x,
        y: position.y + 1,
        z: position.z,
        vx: Math.cos(angle) * speed,
        vy: 3 + Math.random() * 5,
        vz: Math.sin(angle) * speed,
        grounded: false,
        settled: false,
      });
    }

    const geo = new THREE.BufferGeometry();
    const posArr = new Float32Array(DROPLET_COUNT * 3);
    const colors = new Float32Array(DROPLET_COUNT * 3);
    for (let i = 0; i < DROPLET_COUNT; i++) {
      posArr[i * 3] = position.x;
      posArr[i * 3 + 1] = position.y;
      posArr[i * 3 + 2] = position.z;
      colors[i * 3] = 1.0;
      colors[i * 3 + 1] = 0.4 + Math.random() * 0.2;
      colors[i * 3 + 2] = 0;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 1.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geo, mat);
    this.scene.add(points);

    this.napalmFlow = {
      droplets,
      points,
      geo,
      mat,
      posArr,
      weapon,
      phase: 'flow',
      flowTime: 0,
      flowDuration: 2.5,
      burnTime: 0,
      burnDuration: 2.0,
      fireVisuals: [],
    };
  }

  updateNapalmFlow(dt) {
    const nf = this.napalmFlow;
    if (!nf) return;

    if (nf.phase === 'flow') {
      nf.flowTime += dt;
      let allSettled = true;

      for (let i = 0; i < nf.droplets.length; i++) {
        const d = nf.droplets[i];
        if (d.settled) continue;

        if (!d.grounded) {
          d.vy -= 9.81 * dt;
          d.x += d.vx * dt;
          d.y += d.vy * dt;
          d.z += d.vz * dt;
          if (!this.terrain.isOutOfBounds(d.x, d.z)) {
            const gh = this.terrain.getHeight(d.x, d.z);
            if (d.y <= gh) {
              d.y = gh;
              d.grounded = true;
              d.vy = 0;
            }
          }
          allSettled = false;
        } else {
          const n = this.terrain.getNormal(d.x, d.z);
          const slopeX = n.x / n.y;
          const slopeZ = n.z / n.y;
          const slopeMag = Math.sqrt(slopeX * slopeX + slopeZ * slopeZ);

          if (slopeMag > 0.02) {
            const flowSpeed = slopeMag * 18;
            d.vx = d.vx * 0.9 + slopeX / slopeMag * flowSpeed * 0.1;
            d.vz = d.vz * 0.9 + slopeZ / slopeMag * flowSpeed * 0.1;
            const mag = Math.sqrt(d.vx * d.vx + d.vz * d.vz);
            const maxSpeed = 15;
            if (mag > maxSpeed) {
              d.vx *= maxSpeed / mag;
              d.vz *= maxSpeed / mag;
            }
            d.x += d.vx * dt;
            d.z += d.vz * dt;
            if (!this.terrain.isOutOfBounds(d.x, d.z)) {
              d.y = this.terrain.getHeight(d.x, d.z);
            }
            allSettled = false;
          } else {
            d.vx *= 0.85;
            d.vz *= 0.85;
            if (Math.abs(d.vx) + Math.abs(d.vz) < 0.3) {
              d.settled = true;
            } else {
              d.x += d.vx * dt;
              d.z += d.vz * dt;
              if (!this.terrain.isOutOfBounds(d.x, d.z)) {
                d.y = this.terrain.getHeight(d.x, d.z);
              }
              allSettled = false;
            }
          }
        }

        nf.posArr[i * 3] = d.x;
        nf.posArr[i * 3 + 1] = d.y + 0.2;
        nf.posArr[i * 3 + 2] = d.z;
      }
      nf.geo.attributes.position.needsUpdate = true;

      if (allSettled || nf.flowTime > nf.flowDuration) {
        nf.phase = 'ignite';
        this.igniteNapalm(nf);
      }
    } else if (nf.phase === 'ignite') {
      nf.burnTime += dt;
      const t = nf.burnTime / nf.burnDuration;

      for (const fv of nf.fireVisuals) {
        const flicker = 0.8 + Math.random() * 0.4;
        const scaleY = (1 - t * 0.5) * flicker;
        fv.mesh.scale.set(1, Math.max(0.1, scaleY), 1);
        for (const child of fv.mesh.children) {
          child.material.opacity = Math.max(0, (1 - t) * 0.5 * flicker);
          child.rotation.y += dt * (1 + Math.random());
          if (child.userData.vy) {
            child.position.y += child.userData.vy * dt;
            if (child.position.y > child.userData.maxY) child.position.y = 0;
          }
        }
        fv.light.intensity = Math.max(0, (1 - t) * 10 * flicker);
      }
      nf.mat.opacity = Math.max(0, 0.9 - t);

      if (nf.burnTime > nf.burnDuration) {
        this.cleanupNapalm(nf);
        this.napalmFlow = null;
      }
    }
  }

  igniteNapalm(nf) {
    const clusterRadius = 3;
    const clusters = [];

    for (const d of nf.droplets) {
      let added = false;
      for (const c of clusters) {
        const dx = d.x - c.x;
        const dz = d.z - c.z;
        if (dx * dx + dz * dz < clusterRadius * clusterRadius) {
          c.x = (c.x * c.count + d.x) / (c.count + 1);
          c.z = (c.z * c.count + d.z) / (c.count + 1);
          c.count++;
          added = true;
          break;
        }
      }
      if (!added) {
        clusters.push({ x: d.x, z: d.z, count: 1 });
      }
    }

    for (const c of clusters) {
      const intensity = Math.min(c.count / 5, 1);
      const radius = nf.weapon.blastRadius * (0.3 + intensity * 0.7);
      const y = this.terrain.getHeight(c.x, c.z);

      const fireGroup = new THREE.Group();
      fireGroup.position.set(c.x, y, c.z);

      const layers = [
        { color: 0xff2200, h: radius * 0.8, r: radius * 0.45, yOff: 0 },
        { color: 0xff6600, h: radius * 1.0, r: radius * 0.35, yOff: radius * 0.1 },
        { color: 0xffaa00, h: radius * 0.6, r: radius * 0.2, yOff: radius * 0.3 },
        { color: 0xffdd44, h: radius * 0.3, r: radius * 0.1, yOff: radius * 0.5 },
      ];
      const allGeos = [];
      for (const l of layers) {
        const g = new THREE.ConeGeometry(l.r, l.h, 6);
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
          color: l.color, transparent: true, opacity: 0.5,
        }));
        m.position.y = l.yOff + l.h * 0.5;
        m.rotation.y = Math.random() * Math.PI;
        fireGroup.add(m);
        allGeos.push(g);
      }

      const emberCount = Math.floor(8 * intensity);
      for (let e = 0; e < emberCount; e++) {
        const eg = new THREE.SphereGeometry(0.15 + Math.random() * 0.2, 4, 4);
        const em = new THREE.Mesh(eg, new THREE.MeshBasicMaterial({
          color: Math.random() > 0.5 ? 0xff4400 : 0xffaa00, transparent: true, opacity: 0.8,
        }));
        em.position.set(
          (Math.random() - 0.5) * radius * 0.8,
          Math.random() * radius * 0.8,
          (Math.random() - 0.5) * radius * 0.8
        );
        em.userData.vy = 1 + Math.random() * 3;
        em.userData.maxY = radius * 1.5;
        fireGroup.add(em);
        allGeos.push(eg);
      }

      this.scene.add(fireGroup);

      const fireMat = fireGroup.children[0].material;

      const light = new THREE.PointLight(0xff6600, 10 * intensity, radius * 5);
      light.position.set(c.x, y + 2, c.z);
      this.scene.add(light);

      nf.fireVisuals.push({ mesh: fireGroup, geo: allGeos, mat: fireMat, light });

      this.destroyTreesInRadius(c.x, c.z, radius);

      for (const tank of this.tanks) {
        if (!tank.alive) continue;
        const dist = Math.sqrt(
          (tank.position.x - c.x) ** 2 + (tank.position.z - c.z) ** 2
        );
        if (dist < radius) {
          const falloff = 1 - dist / radius;
          tank.takeDamage(Math.round(nf.weapon.damage * falloff * intensity));
          tank.setOnFire(nf.weapon.burnDamage, nf.weapon.burnTicks);
        }
      }
    }

    this.ui.updateHealth(this.tanks);
  }

  cleanupNapalm(nf) {
    this.scene.remove(nf.points);
    nf.geo.dispose();
    nf.mat.dispose();
    for (const fv of nf.fireVisuals) {
      for (const child of fv.mesh.children) {
        child.geometry.dispose();
        child.material.dispose();
      }
      this.scene.remove(fv.mesh);
      this.scene.remove(fv.light);
    }
  }

  gameOver(winnerIndex) {
    this.state = STATES.GAME_OVER;
    this.ui.hideHud();
    this.ui.showGameOver(winnerIndex);
    this.startReplay();
  }

  startReplay() {
    if (this.replayData.length === 0) return;
    this.replay = {
      shotIndex: 0,
      pathIndex: 0,
      pauseTimer: 1.0,
      pausing: true,
      speed: 3,
      mesh: null,
      glow: null,
      trail: null,
      trailGeo: null,
      flash: null,
      flashTimer: 0,
    };
    this.cameraCtrl.orbit.enabled = false;
  }

  updateReplay(dt) {
    if (!this.replay || this.replayData.length === 0) return;
    const r = this.replay;

    if (r.pausing) {
      r.pauseTimer -= dt;
      if (r.pauseTimer <= 0) {
        r.pausing = false;
        r.pathIndex = 0;
        this.setupReplayShot(r.shotIndex);
      }
      return;
    }

    if (r.flash) {
      r.flashTimer -= dt;
      r.flash.intensity = Math.max(0, r.flashTimer * 30);
      if (r.flashTimer <= 0) {
        this.scene.remove(r.flash);
        r.flash = null;
      }
    }

    const shot = this.replayData[r.shotIndex];
    r.pathIndex += dt * 60 * r.speed;

    const idx = Math.floor(r.pathIndex);
    if (idx >= shot.positions.length) {
      this.cleanupReplayShot();
      if (shot.impactPos) {
        const fl = new THREE.PointLight(0xff6600, 30, 40);
        fl.position.set(shot.impactPos.x, shot.impactPos.y + 2, shot.impactPos.z);
        this.scene.add(fl);
        r.flash = fl;
        r.flashTimer = 0.5;
      }
      r.shotIndex = (r.shotIndex + 1) % this.replayData.length;
      r.pausing = true;
      r.pauseTimer = 1.5;

      const mid = this.tanks[0].position.clone().add(this.tanks[1].position).multiplyScalar(0.5);
      this.cameraCtrl.overviewFocusOn(mid);
      return;
    }

    const p = shot.positions[idx];
    if (r.mesh) {
      r.mesh.position.set(p.x, p.y, p.z);

      const trailStart = Math.max(0, idx - 30);
      const trailPts = [];
      for (let i = trailStart; i <= idx; i++) {
        const tp = shot.positions[i];
        trailPts.push(new THREE.Vector3(tp.x, tp.y, tp.z));
      }
      if (trailPts.length >= 2) {
        if (r.trail) {
          this.scene.remove(r.trail);
          r.trailGeo.dispose();
        }
        r.trailGeo = new THREE.BufferGeometry().setFromPoints(trailPts);
        r.trail = new THREE.Line(r.trailGeo, new THREE.LineBasicMaterial({
          color: shot.color, transparent: true, opacity: 0.5,
        }));
        this.scene.add(r.trail);
      }

      const camTarget = new THREE.Vector3(p.x, p.y, p.z);
      this.camera.position.lerp(
        new THREE.Vector3(p.x - 15, p.y + 12, p.z + 20), dt * 4
      );
      this.cameraCtrl.orbit.target.lerp(camTarget, dt * 4);
      this.cameraCtrl.orbit.update();
    }
  }

  setupReplayShot(shotIndex) {
    const shot = this.replayData[shotIndex];
    if (!shot || shot.positions.length === 0) return;

    const geo = new THREE.SphereGeometry(0.5, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color: shot.color });
    this.replay.mesh = new THREE.Mesh(geo, mat);
    const start = shot.positions[0];
    this.replay.mesh.position.set(start.x, start.y, start.z);
    this.scene.add(this.replay.mesh);

    const glowGeo = new THREE.SphereGeometry(1.5, 6, 6);
    const glowMat = new THREE.MeshBasicMaterial({
      color: shot.color, transparent: true, opacity: 0.2,
    });
    this.replay.glow = new THREE.Mesh(glowGeo, glowMat);
    this.replay.mesh.add(this.replay.glow);
  }

  cleanupReplayShot() {
    if (this.replay.mesh) {
      if (this.replay.glow) {
        this.replay.glow.geometry.dispose();
        this.replay.glow.material.dispose();
      }
      this.replay.mesh.geometry.dispose();
      this.replay.mesh.material.dispose();
      this.scene.remove(this.replay.mesh);
      this.replay.mesh = null;
      this.replay.glow = null;
    }
    if (this.replay.trail) {
      this.scene.remove(this.replay.trail);
      this.replay.trailGeo.dispose();
      this.replay.trail.material.dispose();
      this.replay.trail = null;
      this.replay.trailGeo = null;
    }
  }

  cleanupReplay() {
    if (this.replay) {
      this.cleanupReplayShot();
      if (this.replay.flash) {
        this.scene.remove(this.replay.flash);
      }
      this.replay = null;
    }
  }

  handleInput(dt) {
    if (this.state !== STATES.AIM) return;
    if (this.driving) return;
    const tank = this.currentTank;
    const aimSpeed = degToRad(25) * dt;
    const powerSpeed = 15 * dt;

    if (this.keys['KeyA']) tank.rotateTurret(aimSpeed);
    if (this.keys['KeyD']) tank.rotateTurret(-aimSpeed);
    if (this.keys['KeyW']) tank.adjustElevation(aimSpeed * 0.6);
    if (this.keys['KeyS']) tank.adjustElevation(-aimSpeed * 0.6);
    if (this.keys['KeyQ']) tank.adjustPower(-powerSpeed);
    if (this.keys['KeyE']) tank.adjustPower(powerSpeed);

    this.ui.updateAim(tank);
    this.ui.updateFuel(tank);
  }

  update(dt) {
    this.cameraCtrl.update(dt);
    this.explosions.update(dt);
    this.sideView.update(dt);

    for (const tank of this.tanks) {
      tank.update(dt);
    }
    this.updateNapalmFlow(dt);

    if (this.state === STATES.GAME_OVER) {
      this.updateReplay(dt);
    }

    if (this.state === STATES.AIM || this.state === STATES.TURN_START) {
      this.handleInput(dt);
      this.updateDriving(dt);
    }

    if (this.state === STATES.FIRING) {
      let allDone = true;
      let newProjectiles = [];
      for (let i = this.activeProjectiles.length - 1; i >= 0; i--) {
        const proj = this.activeProjectiles[i];
        if (!proj.alive) continue;
        allDone = false;
        const result = proj.update(dt);
        if (result) {
          if (result.type === 'split') {
            newProjectiles.push(...result.submunitions);
          } else {
            this.handleImpact(result);
          }
          this.activeProjectiles.splice(i, 1);
        }
      }
      if (newProjectiles.length > 0) {
        this.activeProjectiles.push(...newProjectiles);
        allDone = false;
      }

      if (this.currentShotPath && this.activeProjectiles.length > 0) {
        const lead = this.activeProjectiles.find(p => p.alive);
        if (lead) {
          this.currentShotPath.sampleCounter++;
          if (this.currentShotPath.sampleCounter % 2 === 0) {
            this.currentShotPath.positions.push({ x: lead.pos.x, y: lead.pos.y, z: lead.pos.z });
          }
        }
      }

      if (allDone && !this.explosions.active && !this.napalmFlow) {
        if (this.currentShotPath && this.currentShotPath.positions.length > 2) {
          this.replayData.push(this.currentShotPath);
        }
        this.currentShotPath = null;
        this.state = STATES.IMPACT;
        this.impactTimer = 0;
      }
    }

    if (this.state === STATES.IMPACT) {
      this.impactTimer += dt;
      if (this.impactTimer > 1.5) {
        for (let i = 0; i < this.tanks.length; i++) {
          if (!this.tanks[i].alive) {
            this.gameOver(1 - i);
            return;
          }
        }
        this.currentPlayer = 1 - this.currentPlayer;
        this.wind.x += randRange(-0.5, 0.5);
        this.wind.z += randRange(-0.5, 0.5);
        this.startTurn();
      }
    }
  }
}
