// potato.js
// Infinite runner platformer controlled by MediaPipe Hands.

const video = document.getElementById('input_video');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const globalEl = document.getElementById('globalBest');
const speedEl = document.getElementById('speed');
const statusEl = document.getElementById('statusLine');
const leaderboardList = document.getElementById('leaderboardList');
const globalLeaderboardList = document.getElementById('globalLeaderboardList');
const restartBtn = document.getElementById('restartBtn');

const GAME_KEY = 'potatoRunnerLeaderboardV1';
const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3001'
  : '';

const groundY = 380;
const player = {
  x: 120,
  y: groundY,
  w: 54,
  h: 42,
  vy: 0,
  onGround: true,
  blink: 0
};

let enemies = [];
let fingerY = null;
let score = 0;
let distance = 0;
let gameRunning = false;
let lastTime = 0;
let speed = 3.2;
let lastStatus = '';

const enemyTypes = [
  { name: 'carrot', color: '#e67e22', w: 26, h: 64 },
  { name: 'broccoli', color: '#27ae60', w: 50, h: 44 },
  { name: 'eggplant', color: '#8e44ad', w: 34, h: 60 },
  { name: 'tomato', color: '#e74c3c', w: 40, h: 40 }
];

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function setStatus(message) {
  if (!statusEl || lastStatus === message) return;
  statusEl.textContent = message;
  lastStatus = message;
}

function loadLeaderboard() {
  const raw = localStorage.getItem(GAME_KEY);
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data)) return data;
  } catch (err) {
    console.warn('Failed to parse leaderboard', err);
  }
  return [];
}

function saveLeaderboard(entries) {
  localStorage.setItem(GAME_KEY, JSON.stringify(entries));
}

function renderLeaderboard() {
  const entries = loadLeaderboard();
  leaderboardList.innerHTML = '';
  if (entries.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No runs yet. Be the first!';
    leaderboardList.appendChild(li);
    return;
  }
  entries.slice(0, 10).forEach((entry, index) => {
    const li = document.createElement('li');
    const rank = index + 1;
    const medal = rank === 1 ? 'Gold' : rank === 2 ? 'Silver' : rank === 3 ? 'Bronze' : '';
    const medalTag = medal ? ` (${medal})` : '';
    li.textContent = `${rank}. ${entry.name} — ${entry.score}${medalTag}`;
    leaderboardList.appendChild(li);
  });
}

function updateLocalBest() {
  const entries = loadLeaderboard();
  const best = entries.length ? entries[0].score : 0;
  bestEl.textContent = `Best: ${best}`;
}

function maybeAddLeaderboard(scoreValue) {
  const entries = loadLeaderboard();
  const minScore = entries.length < 10 ? 0 : entries[entries.length - 1].score;
  if (scoreValue <= minScore && entries.length >= 10) return;

  const nameInput = window.prompt('New high score! Enter your name (max 10 chars):', 'Potato');
  const name = (nameInput || 'Potato').trim().slice(0, 10);
  entries.push({ name: name || 'Potato', score: scoreValue });
  entries.sort((a, b) => b.score - a.score);
  saveLeaderboard(entries.slice(0, 10));
  renderLeaderboard();
  updateLocalBest();
}

function renderGlobal(entries) {
  if (!entries || entries.length === 0) {
    globalEl.textContent = 'Global: --';
    if (globalLeaderboardList) {
      globalLeaderboardList.innerHTML = '';
      const li = document.createElement('li');
      li.textContent = 'No scores yet. Be the first!';
      globalLeaderboardList.appendChild(li);
    }
    return;
  }
  globalEl.textContent = `Global: ${entries[0].score}`;
  if (globalLeaderboardList) {
    globalLeaderboardList.innerHTML = '';
    entries.slice(0, 10).forEach((entry, index) => {
      const li = document.createElement('li');
      const rank = index + 1;
      const medal = rank === 1 ? 'Gold' : rank === 2 ? 'Silver' : rank === 3 ? 'Bronze' : '';
      const medalTag = medal ? ` (${medal})` : '';
      li.textContent = `${rank}. ${entry.name} — ${entry.score}${medalTag}`;
      globalLeaderboardList.appendChild(li);
    });
  }
}

async function loadGlobalLeaderboard() {
  try {
    const response = await fetch(`${API_BASE}/api/leaderboards/potato?limit=10`);
    if (!response.ok) throw new Error('Global fetch failed');
    const data = await response.json();
    renderGlobal(data.entries || []);
    return data.entries || [];
  } catch (err) {
    renderGlobal([]);
    return [];
  }
}

async function submitGlobalScore(scoreValue) {
  try {
    const nameInput = window.prompt('New high score! Enter your name (max 12 chars):', 'Potato');
    const name = (nameInput || 'Potato').trim().slice(0, 12) || 'Potato';
    const response = await fetch(`${API_BASE}/api/leaderboards/potato`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, score: scoreValue })
    });
    if (!response.ok) throw new Error('Global submit failed');
    return loadGlobalLeaderboard();
  } catch (err) {
    return loadGlobalLeaderboard();
  }
}

function resetGame() {
  score = 0;
  distance = 0;
  speed = 3.2;
  player.y = groundY;
  player.vy = 0;
  player.onGround = true;
  enemies = [];
  spawnEnemies();
  scoreEl.textContent = 'Score: 0';
  speedEl.textContent = 'Speed: 1.0x';
}

function spawnEnemies() {
  let x = canvas.width + 140;
  for (let i = 0; i < 4; i += 1) {
    const type = randomChoice(enemyTypes);
    const y = groundY + 8 - type.h;
    enemies.push({
      type,
      x,
      y,
      w: type.w,
      h: type.h
    });
    x += 200 + Math.random() * 140;
  }
}

function updateEnemies(delta) {
  const speedFactor = speed + Math.min(3, score / 80);
  enemies.forEach((enemy) => {
    enemy.x -= speedFactor * delta;
  });

  for (let i = 0; i < enemies.length; i += 1) {
    if (enemies[i].x + enemies[i].w < -20) {
      const type = randomChoice(enemyTypes);
      enemies[i] = {
        type,
        w: type.w,
        h: type.h,
        x: canvas.width + 140 + Math.random() * 160,
        y: groundY + 8 - type.h
      };
    }
  }
}

function checkCollision(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function updatePlayer(delta) {
  const gravity = 0.8;
  if (fingerY !== null && player.onGround && fingerY < canvas.height * 0.42) {
    player.vy = -14.5;
    player.onGround = false;
  }

  player.vy += gravity * delta;
  player.y += player.vy * delta;

  if (player.y >= groundY) {
    player.y = groundY;
    player.vy = 0;
    player.onGround = true;
  }
}

function updateScore(delta) {
  distance += delta * speed;
  const scaled = Math.floor(distance);
  if (scaled !== score) {
    score = scaled;
    scoreEl.textContent = `Score: ${score}`;
  }
  const speedMultiplier = (speed + Math.min(3, score / 120)) / 3.2;
  speedEl.textContent = `Speed: ${speedMultiplier.toFixed(1)}x`;
}

function drawBackground() {
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (video.readyState >= 2) {
    ctx.scale(-1, 1);
    ctx.translate(-canvas.width, 0);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.restore();

  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const horizon = groundY - 40;
  const farOffset = -((distance * 0.2) % canvas.width);
  const nearOffset = -((distance * 0.5) % canvas.width);

  ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
  ctx.fillRect(0, 0, canvas.width, horizon);

  ctx.fillStyle = '#1f2937';
  for (let i = -1; i < 3; i += 1) {
    const baseX = farOffset + i * canvas.width;
    ctx.beginPath();
    ctx.moveTo(baseX, horizon);
    ctx.quadraticCurveTo(baseX + canvas.width * 0.25, horizon - 30, baseX + canvas.width * 0.5, horizon);
    ctx.quadraticCurveTo(baseX + canvas.width * 0.75, horizon + 20, baseX + canvas.width, horizon - 10);
    ctx.lineTo(baseX + canvas.width, groundY + 10);
    ctx.lineTo(baseX, groundY + 10);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = '#0f172a';
  for (let i = -1; i < 3; i += 1) {
    const baseX = nearOffset + i * canvas.width;
    ctx.beginPath();
    ctx.moveTo(baseX, groundY + 10);
    ctx.quadraticCurveTo(baseX + canvas.width * 0.2, groundY - 10, baseX + canvas.width * 0.45, groundY + 10);
    ctx.quadraticCurveTo(baseX + canvas.width * 0.7, groundY + 35, baseX + canvas.width, groundY + 10);
    ctx.lineTo(baseX + canvas.width, canvas.height);
    ctx.lineTo(baseX, canvas.height);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = '#1f2937';
  ctx.fillRect(0, groundY + 10, canvas.width, canvas.height - groundY - 10);

  ctx.strokeStyle = '#f1c40f';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, groundY + 10);
  ctx.lineTo(canvas.width, groundY + 10);
  ctx.stroke();

  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 2;
  const stripeOffset = -((distance * 1.5) % 60);
  for (let x = stripeOffset; x < canvas.width; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, groundY + 18);
    ctx.lineTo(x + 24, groundY + 18);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPotato() {
  ctx.save();
  ctx.translate(player.x, player.y);

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 6, player.w * 0.35, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#b8894a';
  ctx.beginPath();
  ctx.ellipse(0, -player.h / 2, player.w / 2, player.h / 2, 0.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#8a6b3c';
  for (let i = 0; i < 5; i += 1) {
    const ox = -14 + i * 7;
    const oy = -10 + (i % 2) * 8;
    ctx.beginPath();
    ctx.arc(ox, oy, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#1b1b1b';
  ctx.beginPath();
  ctx.arc(-8, -12, 3, 0, Math.PI * 2);
  ctx.arc(8, -12, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#1b1b1b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, -4, 8, 0, Math.PI);
  ctx.stroke();

  ctx.restore();
}

function drawEnemy(enemy) {
  ctx.save();
  ctx.translate(enemy.x, enemy.y);

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(enemy.w / 2, enemy.h + 6, enemy.w * 0.4, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  if (enemy.type.name === 'carrot') {
    ctx.fillStyle = enemy.type.color;
    ctx.beginPath();
    ctx.moveTo(0, enemy.h);
    ctx.lineTo(enemy.w / 2, 0);
    ctx.lineTo(enemy.w, enemy.h);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#27ae60';
    ctx.fillRect(enemy.w / 2 - 6, -10, 12, 12);
  } else if (enemy.type.name === 'broccoli') {
    ctx.fillStyle = '#27ae60';
    ctx.beginPath();
    ctx.arc(enemy.w / 2, enemy.h / 2, enemy.w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(enemy.w / 2 - 6, enemy.h / 2, 12, enemy.h / 2);
  } else if (enemy.type.name === 'eggplant') {
    ctx.fillStyle = enemy.type.color;
    ctx.beginPath();
    ctx.ellipse(enemy.w / 2, enemy.h / 2, enemy.w / 2, enemy.h / 2, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2ecc71';
    ctx.fillRect(enemy.w / 2 - 6, -6, 12, 12);
  } else {
    ctx.fillStyle = enemy.type.color;
    ctx.beginPath();
    ctx.arc(enemy.w / 2, enemy.h / 2, enemy.w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#27ae60';
    ctx.fillRect(enemy.w / 2 - 4, -6, 8, 12);
  }

  ctx.restore();
}

function drawHUD() {
  if (fingerY === null) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Show your hand to keep running!', canvas.width / 2, canvas.height / 2);
    ctx.restore();
  }
}

function drawGameOver() {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ffffff';
  ctx.font = '36px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Veggie Crunch!', canvas.width / 2, canvas.height / 2 - 20);
  ctx.font = '24px Arial';
  ctx.fillText(`Final score: ${score}`, canvas.width / 2, canvas.height / 2 + 18);
  ctx.restore();
}

function update(delta) {
  if (!gameRunning) return;

  drawBackground();
  updatePlayer(delta);
  updateEnemies(delta);
  updateScore(delta);

  enemies.forEach(drawEnemy);
  drawPotato();

  const playerBox = { x: player.x - player.w / 2, y: player.y - player.h, w: player.w, h: player.h };
  for (let i = 0; i < enemies.length; i += 1) {
    if (checkCollision(playerBox, enemies[i])) {
      gameRunning = false;
      drawGameOver();
      maybeAddLeaderboard(score);
      submitGlobalScore(score);
      return;
    }
  }

  drawHUD();
}

function gameLoop(timestamp) {
  if (!gameRunning) return;
  const delta = Math.min(1.6, (timestamp - lastTime) / 16.67);
  lastTime = timestamp;
  update(delta);
  requestAnimationFrame(gameLoop);
}

function startGame() {
  resetGame();
  gameRunning = true;
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

async function initHands() {
  video.setAttribute('autoplay', 'true');
  video.setAttribute('playsinline', 'true');
  video.setAttribute('muted', 'true');
  const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/${file}`
  });
  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 0,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.5
  });
  hands.onResults(onResults);

  const camera = new Camera(video, {
    onFrame: async () => {
      await hands.send({ image: video });
    },
    width: 640,
    height: 480
  });
  try {
    await camera.start();
  } catch (err) {
    setStatus('Camera disconnected. Check permissions and reload.');
    throw err;
  }
}

function onResults(results) {
  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const lm = results.multiHandLandmarks[0];
    const indexTip = lm[8];
    const y = indexTip.y * canvas.height;
    fingerY = clamp(y, 0, canvas.height);
    setStatus('Hand detected. Lift it to jump!');
  } else {
    fingerY = null;
    setStatus('No hand detected. Hold your hand up to jump.');
  }
}

restartBtn.addEventListener('click', () => {
  startGame();
});

async function init() {
  setStatus('Allow camera access to start the run.');
  renderLeaderboard();
  updateLocalBest();
  await loadGlobalLeaderboard();
  await initHands();
  setStatus('Hand detected. Lift it to jump!');
  startGame();
}

init().catch((err) => {
  console.error('Failed to init Potato Run', err);
});
