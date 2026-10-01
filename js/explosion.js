import * as THREE from 'three';

const PARTICLE_COUNT = 60;

export class ExplosionManager {
  constructor(scene) {
    this.scene = scene;
    this.explosions = [];
  }

  createExplosion(position, weapon, terrain, tanks) {
    const radius = weapon.blastRadius;
    const damage = weapon.damage;
    const craterDepth = weapon.craterDepth;

    // Terrain deformation
    if (craterDepth > 0) {
      terrain.deform(position.x, position.z, radius, craterDepth);
    } else if (craterDepth < 0) {
      terrain.addTerrain(position.x, position.z, radius, -craterDepth);
    }

    // Damage tanks
    const damageResults = [];
    for (const tank of tanks) {
      if (!tank.alive) continue;
      const dist = position.distanceTo(tank.position);
      if (dist < radius) {
        const falloff = 1 - (dist / radius);
        const dmg = Math.round(damage * falloff);
        tank.takeDamage(dmg);
        damageResults.push({ tank, damage: dmg });

        // Napalm burn effect
        if (weapon.behavior === 'napalm') {
          tank.setOnFire(weapon.burnDamage, weapon.burnTicks);
        }
      }
    }

    // Visual explosion
    const explosion = this.createVisual(position, radius, weapon);
    this.explosions.push(explosion);

    // Flash light
    const flash = new THREE.PointLight(
      weapon.behavior === 'nuke' ? 0xffffff : 0xff6600,
      weapon.behavior === 'nuke' ? 50 : 20,
      radius * 5
    );
    flash.position.copy(position);
    flash.position.y += 2;
    this.scene.add(flash);
    explosion.flash = flash;

    return damageResults;
  }

  createVisual(position, radius, weapon) {
    const isNuke = weapon.behavior === 'nuke';
    const particleCount = isNuke ? PARTICLE_COUNT * 3 : PARTICLE_COUNT;

    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = [];
    const lifetimes = [];

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = position.x;
      positions[i * 3 + 1] = position.y;
      positions[i * 3 + 2] = position.z;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const speed = (3 + Math.random() * 8) * (radius / 6);
      velocities.push(new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.abs(Math.cos(phi)) * speed * 1.5,
        Math.sin(phi) * Math.sin(theta) * speed
      ));

      lifetimes.push(0.5 + Math.random() * 1.0);
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const colors = [];
    const baseColor = new THREE.Color(weapon.color);
    if (isNuke) {
      for (let i = 0; i < particleCount; i++) {
        const t = Math.random();
        if (t < 0.3) colors.push(1, 1, 1);
        else if (t < 0.6) colors.push(1, 0.8, 0);
        else colors.push(1, 0.3, 0);
      }
    } else {
      for (let i = 0; i < particleCount; i++) {
        const t = Math.random();
        colors.push(
          baseColor.r * (0.5 + t * 0.5) + t * 0.3,
          baseColor.g * (0.5 + t * 0.5),
          baseColor.b * (0.3 + t * 0.3)
        );
      }
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: isNuke ? 2.5 : 1.5,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      sizeAttenuation: true,
    });

    const points = new THREE.Points(geo, mat);
    this.scene.add(points);

    // Fireball sphere
    const fireGeo = new THREE.SphereGeometry(radius * 0.6, 16, 16);
    const fireMat = new THREE.MeshBasicMaterial({
      color: isNuke ? 0xffffcc : 0xff6600,
      transparent: true,
      opacity: 0.8,
    });
    const fireball = new THREE.Mesh(fireGeo, fireMat);
    fireball.position.copy(position);
    this.scene.add(fireball);

    return {
      points,
      positions,
      velocities,
      lifetimes,
      geo,
      mat,
      fireball,
      fireGeo,
      fireMat,
      flash: null,
      age: 0,
      maxAge: isNuke ? 3.0 : 1.5,
      particleCount,
    };
  }

  update(dt) {
    for (let e = this.explosions.length - 1; e >= 0; e--) {
      const exp = this.explosions[e];
      exp.age += dt;

      if (exp.age > exp.maxAge) {
        this.scene.remove(exp.points);
        this.scene.remove(exp.fireball);
        if (exp.flash) this.scene.remove(exp.flash);
        exp.geo.dispose();
        exp.mat.dispose();
        exp.fireGeo.dispose();
        exp.fireMat.dispose();
        this.explosions.splice(e, 1);
        continue;
      }

      const t = exp.age / exp.maxAge;

      // Update particles
      const posArr = exp.positions;
      for (let i = 0; i < exp.particleCount; i++) {
        const v = exp.velocities[i];
        v.y -= 9.81 * dt;
        posArr[i * 3] += v.x * dt;
        posArr[i * 3 + 1] += v.y * dt;
        posArr[i * 3 + 2] += v.z * dt;
      }
      exp.geo.attributes.position.needsUpdate = true;
      exp.mat.opacity = 1 - t;

      // Fireball
      const fireScale = 1 + t * 2;
      exp.fireball.scale.set(fireScale, fireScale, fireScale);
      exp.fireMat.opacity = Math.max(0, 0.8 - t * 1.5);

      // Flash
      if (exp.flash) {
        exp.flash.intensity = Math.max(0, (1 - t * 3) * 20);
      }
    }
  }

  get active() {
    return this.explosions.length > 0;
  }
}
