import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const ORBIT_DISTANCE = 35;
const ORBIT_HEIGHT = 20;
const OVERVIEW_HEIGHT = 80;
const OVERVIEW_BACK = 80;

export class CameraController {
  constructor(camera, canvas) {
    this.camera = camera;
    this.canvas = canvas;

    this.orbit = new OrbitControls(camera, canvas);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.08;
    this.orbit.maxPolarAngle = Math.PI * 0.48;
    this.orbit.minPolarAngle = Math.PI * 0.05;
    this.orbit.minDistance = 8;
    this.orbit.maxDistance = 150;
    this.orbit.enablePan = false;
    this.orbit.enableZoom = true;
    this.orbit.zoomSpeed = 1.2;

    this.mode = 'orbit';
    this.followTarget = null;
    this.impactTarget = null;
    this.transitionSpeed = 3;
    this._transitioning = false;
    this._targetPos = null;
    this._targetCamPos = null;
    this.aimingTank = null;
    this.aimingEnemy = null;
    this.enemyArrow = null;
  }

  focusOn(position, instant = false) {
    const target = position.clone();
    const camPos = new THREE.Vector3(
      position.x - ORBIT_DISTANCE * 0.5,
      position.y + ORBIT_HEIGHT,
      position.z + ORBIT_DISTANCE
    );

    if (instant) {
      this.orbit.target.copy(target);
      this.camera.position.copy(camPos);
      this.orbit.update();
      this._transitioning = false;
    } else {
      this._targetPos = target;
      this._targetCamPos = camPos;
      this._transitioning = true;
    }
  }

  overviewFocusOn(mapCenter, instant = false) {
    const target = mapCenter.clone();
    target.y = 10;
    const camPos = new THREE.Vector3(
      mapCenter.x,
      OVERVIEW_HEIGHT,
      mapCenter.z + OVERVIEW_BACK
    );

    if (instant) {
      this.orbit.target.copy(target);
      this.camera.position.copy(camPos);
      this.orbit.update();
      this._transitioning = false;
    } else {
      this._targetPos = target;
      this._targetCamPos = camPos;
      this._transitioning = true;
    }
  }

  startFollow(projectile) {
    this.mode = 'follow';
    this.followTarget = projectile;
    this.orbit.enabled = false;
    this._transitioning = false;
  }

  showImpact(position) {
    this.mode = 'impact';
    this.impactTarget = position.clone();
    this.orbit.enabled = false;
  }

  returnToOrbit(mapCenter, instant = false) {
    this.mode = 'orbit';
    this.orbit.enabled = true;
    this.followTarget = null;
    this.impactTarget = null;
    this.hideEnemyArrow();
    this.overviewFocusOn(mapCenter, instant);
  }

  startAiming(tank, enemy, scene) {
    this.mode = 'aiming';
    this.aimingTank = tank;
    this.aimingEnemy = enemy;
    this.orbit.enabled = false;
    this._transitioning = false;
    this.showEnemyArrow(scene);
  }

  stopAiming(mapCenter) {
    this.mode = 'orbit';
    this.aimingTank = null;
    this.aimingEnemy = null;
    this.orbit.enabled = true;
    this.hideEnemyArrow();
    if (mapCenter) this.overviewFocusOn(mapCenter);
  }

  showEnemyArrow(scene) {
    if (this.enemyArrow) return;
    const shape = new THREE.Shape();
    shape.moveTo(0, -2.5);
    shape.lineTo(-1.5, 0.5);
    shape.lineTo(-0.5, 0.5);
    shape.lineTo(-0.5, 2.5);
    shape.lineTo(0.5, 2.5);
    shape.lineTo(0.5, 0.5);
    shape.lineTo(1.5, 0.5);
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff4444, transparent: true, opacity: 0.85,
      side: THREE.DoubleSide, depthTest: false,
    });
    this.enemyArrow = new THREE.Mesh(geo, mat);
    this.enemyArrow.renderOrder = 999;
    scene.add(this.enemyArrow);
  }

  hideEnemyArrow() {
    if (this.enemyArrow) {
      this.enemyArrow.parent?.remove(this.enemyArrow);
      this.enemyArrow.geometry.dispose();
      this.enemyArrow.material.dispose();
      this.enemyArrow = null;
    }
  }

  update(dt) {
    if (this.mode === 'aiming' && this.aimingTank) {
      const tank = this.aimingTank;
      const muzzle = tank.muzzleWorldPosition;
      const tankPos = tank.position;

      const cosEl = Math.cos(tank.barrelElevation);
      const sinEl = Math.sin(tank.barrelElevation);
      const barrelDir = new THREE.Vector3(
        cosEl * Math.sin(tank.turretAngle),
        sinEl,
        cosEl * Math.cos(tank.turretAngle)
      );

      const hDir = new THREE.Vector3(
        Math.sin(tank.turretAngle), 0, Math.cos(tank.turretAngle)
      );
      const camPos = new THREE.Vector3(
        tankPos.x - hDir.x * 5,
        tankPos.y + 5,
        tankPos.z - hDir.z * 5
      );
      const lookAt = new THREE.Vector3(
        tankPos.x + hDir.x * 20,
        tankPos.y + 3,
        tankPos.z + hDir.z * 20
      );

      this.camera.position.lerp(camPos, dt * 8);
      this.orbit.target.lerp(lookAt, dt * 8);
      this.orbit.update();

      if (this.enemyArrow && this.aimingEnemy) {
        const enemyPos = this.aimingEnemy.position;
        this.enemyArrow.position.set(enemyPos.x, enemyPos.y + 15, enemyPos.z);
        this.enemyArrow.lookAt(this.camera.position);
        const pulse = 1.8 + Math.sin(Date.now() * 0.004) * 0.4;
        this.enemyArrow.scale.setScalar(pulse);
      }

      return;
    }

    if (this.mode === 'follow' && this.followTarget) {
      const target = this.followTarget.pos || this.followTarget;

      let camOffset;
      if (this.followTarget.vel) {
        const vel = this.followTarget.vel;
        const hLen = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
        if (hLen > 0.1) {
          const dir = new THREE.Vector3(-vel.x / hLen, 0, -vel.z / hLen);
          camOffset = dir.multiplyScalar(18).add(new THREE.Vector3(0, 10, 0));
        } else {
          camOffset = new THREE.Vector3(0, 15, 18);
        }
      } else {
        camOffset = new THREE.Vector3(0, 15, 18);
      }
      const desiredPos = target.clone().add(camOffset);

      this.camera.position.lerp(desiredPos, dt * this.transitionSpeed);
      this.orbit.target.lerp(target, dt * this.transitionSpeed);
      this.orbit.update();
    } else if (this.mode === 'impact' && this.impactTarget) {
      this.orbit.target.lerp(this.impactTarget, dt * 3);
      this.orbit.update();
    } else {
      if (this._transitioning && this._targetPos && this._targetCamPos) {
        this.orbit.target.lerp(this._targetPos, dt * 4);
        this.camera.position.lerp(this._targetCamPos, dt * 4);
        if (this.orbit.target.distanceTo(this._targetPos) < 0.3) {
          this._transitioning = false;
        }
      }
      this.orbit.update();
    }
  }

  dispose() {
    this.orbit.dispose();
  }
}
