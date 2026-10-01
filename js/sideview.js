import { predictTrajectory } from './projectile.js';

const SIDE_VIEW_DURATION = 10;

export class SideView {
  constructor() {
    this.canvas = document.getElementById('sideViewCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.active = false;
    this.timeRemaining = 0;
    this.timerBar = document.getElementById('sideViewTimeBar');
    this.timerContainer = document.getElementById('sideViewTimer');
  }

  show(tank, terrain, wind) {
    if (this.active) return;
    this.active = true;
    this.timeRemaining = SIDE_VIEW_DURATION;
    this.canvas.style.display = 'block';
    this.timerContainer.classList.remove('hidden');

    this.tank = tank;
    this.terrain = terrain;
    this.wind = wind;

    this.render();
  }

  hide() {
    this.active = false;
    this.canvas.style.display = 'none';
    this.timerContainer.classList.add('hidden');
  }

  update(dt) {
    if (!this.active) return;
    this.timeRemaining -= dt;
    if (this.timeRemaining <= 0) {
      this.hide();
      return;
    }
    const frac = this.timeRemaining / SIDE_VIEW_DURATION;
    this.timerBar.style.width = (frac * 100) + '%';

    if (frac < 0.3) {
      this.timerBar.style.background = '#ef5350';
    } else {
      this.timerBar.style.background = '#4fc3f7';
    }

    this.render();
  }

  render() {
    const canvas = this.canvas;
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.scale(dpr, dpr);

    const W = canvas.clientWidth;
    const H = canvas.clientHeight;

    ctx.clearRect(0, 0, W, H);

    const tank = this.tank;
    const terrain = this.terrain;
    const wind = this.wind;

    const startPos = tank.muzzleWorldPosition;
    const velocity = tank.getFireVelocity();
    const trajectory = predictTrajectory(startPos, velocity, wind, terrain);

    if (trajectory.length < 2) return;

    const dirX = velocity.x;
    const dirZ = velocity.z;
    const dirLen = Math.sqrt(dirX * dirX + dirZ * dirZ);
    const ndx = dirLen > 0.01 ? dirX / dirLen : 1;
    const ndz = dirLen > 0.01 ? dirZ / dirLen : 0;

    const tankPos = tank.position;
    const projPoints = trajectory.map(p => {
      const dx = p.x - tankPos.x;
      const dz = p.z - tankPos.z;
      const range = dx * ndx + dz * ndz;
      return { range, height: p.y };
    });

    const maxRange = Math.max(projPoints[projPoints.length - 1].range, 20);
    const profileRange = maxRange * 1.2;
    const profile = terrain.getTerrainProfile(
      tankPos.x, tankPos.z, ndx, ndz, profileRange, 300
    );

    const behindProfile = terrain.getTerrainProfile(
      tankPos.x, tankPos.z, -ndx, -ndz, 20, 60
    );

    let minRange = -20;
    let maxR = profileRange;
    let maxHeight = 0;
    for (const p of projPoints) {
      maxHeight = Math.max(maxHeight, p.height);
    }
    for (const p of profile) {
      maxHeight = Math.max(maxHeight, p.height);
    }
    maxHeight = Math.max(maxHeight, 40);
    maxHeight *= 1.15;

    const margin = { top: 40, bottom: 50, left: 60, right: 30 };
    const plotW = W - margin.left - margin.right;
    const plotH = H - margin.top - margin.bottom;

    const scaleX = plotW / (maxR - minRange);
    const scaleY = plotH / maxHeight;

    const toScreenX = (r) => margin.left + (r - minRange) * scaleX;
    const toScreenY = (h) => margin.top + plotH - h * scaleY;

    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    const gridSpacingH = Math.pow(10, Math.floor(Math.log10(maxHeight / 4)));
    const gridSpacingR = Math.pow(10, Math.floor(Math.log10((maxR - minRange) / 5)));

    ctx.beginPath();
    for (let h = 0; h <= maxHeight; h += gridSpacingH) {
      const y = toScreenY(h);
      ctx.moveTo(margin.left, y);
      ctx.lineTo(W - margin.right, y);
    }
    for (let r = 0; r <= maxR; r += gridSpacingR) {
      const x = toScreenX(r);
      ctx.moveTo(x, margin.top);
      ctx.lineTo(x, H - margin.bottom);
    }
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '11px monospace';
    ctx.textAlign = 'right';
    for (let h = 0; h <= maxHeight; h += gridSpacingH) {
      ctx.fillText(h.toFixed(0) + 'm', margin.left - 8, toScreenY(h) + 4);
    }
    ctx.textAlign = 'center';
    for (let r = 0; r <= maxR; r += gridSpacingR) {
      ctx.fillText(r.toFixed(0) + 'm', toScreenX(r), H - margin.bottom + 18);
    }

    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Range (m)', W / 2, H - 8);
    ctx.save();
    ctx.translate(14, H / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Height (m)', 0, 0);
    ctx.restore();

    ctx.beginPath();
    ctx.moveTo(toScreenX(-20), toScreenY(0));
    for (let i = behindProfile.length - 1; i >= 0; i--) {
      const p = behindProfile[i];
      ctx.lineTo(toScreenX(-p.dist), toScreenY(p.height));
    }
    for (const p of profile) {
      ctx.lineTo(toScreenX(p.dist), toScreenY(p.height));
    }
    ctx.lineTo(toScreenX(maxR), toScreenY(0));
    ctx.closePath();
    ctx.fillStyle = 'rgba(76, 120, 60, 0.5)';
    ctx.fill();

    ctx.beginPath();
    for (let i = behindProfile.length - 1; i >= 0; i--) {
      const p = behindProfile[i];
      if (i === behindProfile.length - 1) ctx.moveTo(toScreenX(-p.dist), toScreenY(p.height));
      else ctx.lineTo(toScreenX(-p.dist), toScreenY(p.height));
    }
    for (const p of profile) {
      ctx.lineTo(toScreenX(p.dist), toScreenY(p.height));
    }
    ctx.strokeStyle = 'rgba(100, 180, 80, 0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    for (let i = 0; i < projPoints.length; i++) {
      const p = projPoints[i];
      if (i === 0) ctx.moveTo(toScreenX(p.range), toScreenY(p.height));
      else ctx.lineTo(toScreenX(p.range), toScreenY(p.height));
    }
    ctx.strokeStyle = 'rgba(255, 255, 100, 0.9)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    const impactPt = projPoints[projPoints.length - 1];
    ctx.beginPath();
    ctx.arc(toScreenX(impactPt.range), toScreenY(impactPt.height), 6, 0, Math.PI * 2);
    ctx.fillStyle = '#ef5350';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(toScreenX(0), toScreenY(tank.position.y), 5, 0, Math.PI * 2);
    ctx.fillStyle = '#4fc3f7';
    ctx.fill();

    let maxH = 0;
    let maxHRange = 0;
    for (const p of projPoints) {
      if (p.height > maxH) {
        maxH = p.height;
        maxHRange = p.range;
      }
    }
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(toScreenX(maxHRange), toScreenY(maxH));
    ctx.lineTo(toScreenX(maxHRange), toScreenY(0));
    ctx.stroke();
    ctx.setLineDash([]);

    const totalRange = impactPt.range;
    const flightTime = trajectory[trajectory.length - 1].t;

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    const statsX = margin.left + 10;
    const statsY = margin.top + 16;
    ctx.fillText(`Max Height: ${maxH.toFixed(1)}m`, statsX, statsY);
    ctx.fillText(`Range: ${totalRange.toFixed(1)}m`, statsX, statsY + 16);
    ctx.fillText(`Flight Time: ${flightTime.toFixed(1)}s`, statsX, statsY + 32);

    const windMag = Math.sqrt(wind.x * wind.x + wind.z * wind.z);
    const windAlongFiring = wind.x * ndx + wind.z * ndz;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.textAlign = 'right';
    const windLabel = windAlongFiring > 0.5 ? 'TAILWIND' : windAlongFiring < -0.5 ? 'HEADWIND' : 'CROSSWIND';
    ctx.fillText(`Wind: ${windMag.toFixed(1)} m/s ${windLabel}`, W - margin.right - 10, statsY);

    ctx.fillStyle = this.timeRemaining < 3 ? '#ef5350' : '#4fc3f7';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.ceil(this.timeRemaining)}s`, W / 2, margin.top - 12);

    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('TRAJECTORY SCOUT VIEW', W / 2, margin.top - 28);
  }
}
