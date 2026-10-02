import { radToDeg } from './utils.js';

export class UI {
  constructor() {
    this.hud = document.getElementById('hud');
    this.startScreen = document.getElementById('startScreen');
    this.gameOverScreen = document.getElementById('gameOverScreen');
    this.turnBanner = document.getElementById('turnBanner');
    this.turnText = document.getElementById('turnText');

    this.p1Health = document.getElementById('p1Health');
    this.p2Health = document.getElementById('p2Health');
    this.p1HealthText = document.getElementById('p1HealthText');
    this.p2HealthText = document.getElementById('p2HealthText');

    this.angleDisplay = document.getElementById('angleDisplay');
    this.powerDisplay = document.getElementById('powerDisplay');
    this.powerBar = document.getElementById('powerBar');
    this.turretDisplay = document.getElementById('turretDisplay');

    this.weaponName = document.getElementById('weaponName');
    this.weaponAmmo = document.getElementById('weaponAmmo');

    this.fuelBar = document.getElementById('fuelBar');

    this.windCanvas = document.getElementById('windCanvas');
    this.windCtx = this.windCanvas.getContext('2d');
    this.windSpeed = document.getElementById('windSpeed');

    this.btnStart = document.getElementById('btnStart');
    this.btnRestart = document.getElementById('btnRestart');

    this.bannerTimeout = null;
  }

  showStart() {
    this.startScreen.classList.remove('hidden');
    this.gameOverScreen.classList.add('hidden');
    this.hud.classList.add('hidden');
  }

  hideStart() {
    this.startScreen.classList.add('hidden');
  }

  showHud() {
    this.hud.classList.remove('hidden');
  }

  hideHud() {
    this.hud.classList.add('hidden');
  }

  showGameOver(winnerIndex) {
    this.gameOverScreen.classList.remove('hidden');
    const winnerText = document.getElementById('winnerText');
    const winnerSubtext = document.getElementById('winnerSubtext');
    winnerText.textContent = `Archer ${winnerIndex + 1} Wins!`;
    winnerText.style.background = winnerIndex === 0
      ? 'linear-gradient(135deg, #4fc3f7, #29b6f6)'
      : 'linear-gradient(135deg, #ef5350, #e53935)';
    winnerText.style.webkitBackgroundClip = 'text';
    winnerText.style.webkitTextFillColor = 'transparent';
    winnerText.style.backgroundClip = 'text';
    winnerSubtext.textContent = 'Superior marksmanship!';
  }

  hideGameOver() {
    this.gameOverScreen.classList.add('hidden');
  }

  showTurnBanner(playerIndex) {
    const color = playerIndex === 0 ? '#4fc3f7' : '#ef5350';
    this.turnText.textContent = `Archer ${playerIndex + 1}'s Turn`;
    this.turnText.style.color = color;
    this.turnBanner.classList.remove('hidden');
    this.turnBanner.style.animation = 'none';
    void this.turnBanner.offsetHeight;
    this.turnBanner.style.animation = 'bannerPulse 0.6s ease-out';

    if (this.bannerTimeout) clearTimeout(this.bannerTimeout);
    this.bannerTimeout = setTimeout(() => {
      this.turnBanner.classList.add('hidden');
    }, 1500);
  }

  updateHealth(tanks) {
    const h1 = tanks[0].health;
    const h2 = tanks[1].health;
    this.p1Health.style.width = h1 + '%';
    this.p2Health.style.width = h2 + '%';
    this.p1HealthText.textContent = Math.round(h1);
    this.p2HealthText.textContent = Math.round(h2);
  }

  updateAim(tank) {
    const angleDeg = radToDeg(tank.barrelElevation).toFixed(1);
    const turretDeg = (radToDeg(tank.turretAngle) % 360).toFixed(1);
    this.angleDisplay.textContent = angleDeg + '°';
    this.powerDisplay.textContent = Math.round(tank.power);
    this.powerBar.style.width = tank.power + '%';
    this.turretDisplay.textContent = turretDeg + '°';
  }

  updateWeapon(tank) {
    const w = tank.currentWeapon;
    this.weaponName.textContent = w.name;
    this.weaponAmmo.textContent = w.currentAmmo === Infinity ? '∞' : `x${w.currentAmmo}`;
  }

  updateFuel(tank) {
    this.fuelBar.style.width = (tank.fuel / tank.maxFuel * 100) + '%';
    if (tank.fuel < 20) {
      this.fuelBar.style.background = '#ef5350';
    } else if (tank.fuel < 50) {
      this.fuelBar.style.background = '#fdd835';
    } else {
      this.fuelBar.style.background = '#66bb6a';
    }
  }

  getCompassDir(wind) {
    if (wind.x === 0 && wind.z === 0) return '';
    const angle = ((Math.atan2(wind.x, -wind.z) * 180 / Math.PI) + 360) % 360;
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(angle / 45) % 8];
  }

  drawWind(wind) {
    const ctx = this.windCtx;
    const w = this.windCanvas.width;
    const h = this.windCanvas.height;
    ctx.clearRect(0, 0, w, h);

    const mag = Math.sqrt(wind.x * wind.x + wind.z * wind.z);
    const angle = Math.atan2(wind.x, -wind.z);

    const cx = w / 2;
    const cy = h / 2;
    const maxLen = 20;
    const len = Math.min(mag / 5 * maxLen, maxLen);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, len);
    ctx.lineTo(0, -len);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.moveTo(0, -len - 4);
    ctx.lineTo(-5, -len + 4);
    ctx.lineTo(5, -len + 4);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    const dir = this.getCompassDir(wind);
    this.windSpeed.textContent = `${mag.toFixed(1)} m/s ${dir}`;
  }

  updateAll(tank, tanks, wind) {
    this.updateHealth(tanks);
    this.updateAim(tank);
    this.updateWeapon(tank);
    this.updateFuel(tank);
    this.drawWind(wind);
  }
}
