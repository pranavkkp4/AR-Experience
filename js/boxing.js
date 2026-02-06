// boxing.js
// Boxing AR game controlled by MediaPipe Pose arm punches.

const video = document.getElementById('input_video');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const globalEl = document.getElementById('globalBest');
const modeEl = document.getElementById('mode');
const timerEl = document.getElementById('timer');
const statusEl = document.getElementById('statusLine');
const leaderboardList = document.getElementById('leaderboardList');
const comboBtn = document.getElementById('comboBtn');
const survivalBtn = document.getElementById('survivalBtn');
const playAgainBtn = document.getElementById('playAgainBtn');

const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3001'
  : '';

const BEST_KEYS = {
  combo: 'boxingBest_combo_v1',
  survival: 'boxingBest_survival_v1'
};

const opponent = {
  x: canvas.width * 0.72,
  y: canvas.height * 0.52
};

const targetConfig = {
  headY: canvas.height * 0.28,
  bodyY: canvas.height * 0.5,
  spreadX: 50,
  spreadY: 40,
  radius: 28
};

const punchState = {
  left: { prev: null, lastPunchAt: 0 },
  right: { prev: null, lastPunchAt: 0 }
};

const PUNCH_COOLDOWN = 230;
const PUNCH_SPEED = 0.035;
const PUNCH_EXTENSION = 0.25;
const PUNCH_Z_DELTA = -0.015;

let gameState = 'ready';
let mode = 'combo';
let score = 0;
let combo = 0;
let timeLeft = 60;
let timerInterval = null;
let lastTime = performance.now();
let target = null;
let targetTimer = 0;
let poseReady = false;
let lastStatus = '';

function setStatus(message) {
  if (statusEl && message !== lastStatus) {
    statusEl.textContent = message;
    lastStatus = message;
  }
}

function loadBest(currentMode) {
  const raw = localStorage.getItem(BEST_KEYS[currentMode]);
  const value = parseInt(raw, 10);
  return Number.isFinite(value) ? value : 0;
}

function saveBest(currentMode, value) {
  localStorage.setItem(BEST_KEYS[currentMode], String(value));
}

function updateBestDisplay() {
  const best = loadBest(mode);
  bestEl.textContent = `Best: ${best}`;
}

function updateModeDisplay() {
  modeEl.textContent = mode === 'combo' ? 'Mode: Combo' : 'Mode: Survival';
}

function updateTimerDisplay() {
  if (mode === 'combo') {
    timerEl.textContent = `Time: ${timeLeft}s`;
  } else {
    timerEl.textContent = `Streak: ${combo}`;
  }
}

function resetPunchState() {
  punchState.left.prev = null;
  punchState.right.prev = null;
  punchState.left.lastPunchAt = 0;
  punchState.right.lastPunchAt = 0;
}

function resetGame() {
  score = 0;
  combo = 0;
  timeLeft = 60;
  target = spawnTarget();
  targetTimer = 0;
  resetPunchState();
  scoreEl.textContent = 'Score: 0';
  updateTimerDisplay();
}

function startTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
  }
  timerInterval = setInterval(() => {
    timeLeft -= 1;
    updateTimerDisplay();
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      endGame('Time!');
    }
  }, 1000);
}

function startGame(nextMode) {
  if (nextMode) {
    mode = nextMode;
    updateModeDisplay();
    updateBestDisplay();
  }
  resetGame();
  gameState = 'running';
  if (mode === 'combo') {
    startTimer();
  } else {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }
  setStatus('Punch the glowing targets!');
}

function endGame(label) {
  if (gameState !== 'running') return;
  gameState = 'over';
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  const best = loadBest(mode);
  if (score > best) {
    saveBest(mode, score);
    updateBestDisplay();
  }
  setStatus(`${label} Hit Play Again to retry.`);
  submitScore(score);
}

function spawnTarget() {
  const isHead = Math.random() > 0.4;
  const baseY = isHead ? targetConfig.headY : targetConfig.bodyY;
  const x = opponent.x + (Math.random() * 2 - 1) * targetConfig.spreadX;
  const y = baseY + (Math.random() * 2 - 1) * targetConfig.spreadY;
  return { x, y, r: targetConfig.radius, isHead };
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

  ctx.fillStyle = 'rgba(8, 12, 24, 0.45)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawOpponent() {
  const headRadius = 34;
  const bodyWidth = 110;
  const bodyHeight = 160;

  ctx.save();
  ctx.translate(opponent.x, opponent.y);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.ellipse(0, bodyHeight / 2 + 25, bodyWidth * 0.4, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#111827';
  ctx.beginPath();
  ctx.arc(0, -bodyHeight / 2 - headRadius * 0.2, headRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#1f2937';
  ctx.fillRect(-bodyWidth / 2, -bodyHeight / 2, bodyWidth, bodyHeight);

  ctx.strokeStyle = '#374151';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(-bodyWidth / 2, -bodyHeight / 3);
  ctx.lineTo(-bodyWidth / 2 - 40, -bodyHeight / 6);
  ctx.moveTo(bodyWidth / 2, -bodyHeight / 3);
  ctx.lineTo(bodyWidth / 2 + 40, -bodyHeight / 6);
  ctx.stroke();

  ctx.restore();
}

function drawTarget() {
  if (!target) return;
  const pulse = 1 + Math.sin(performance.now() / 220) * 0.08;
  ctx.save();
  ctx.beginPath();
  ctx.arc(target.x, target.y, target.r * pulse, 0, Math.PI * 2);
  ctx.fillStyle = target.isHead ? 'rgba(248, 113, 113, 0.7)' : 'rgba(251, 191, 36, 0.7)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.stroke();
  ctx.restore();
}

function drawOverlay(title, subtitle) {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ffffff';
  ctx.font = '30px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(title, canvas.width / 2, canvas.height / 2 - 10);
  if (subtitle) {
    ctx.font = '18px Arial';
    ctx.fillText(subtitle, canvas.width / 2, canvas.height / 2 + 22);
  }
  ctx.restore();
}

function update(delta) {
  drawBackground();
  drawOpponent();
  drawTarget();

  if (gameState === 'running') {
    targetTimer += delta;
    if (targetTimer > 150) {
      target = spawnTarget();
      targetTimer = 0;
    }
  }

  if (gameState === 'ready') {
    drawOverlay('Pick a mode to start', 'Combo Rush or Survival');
  } else if (gameState === 'over') {
    drawOverlay('Match over!', `Final score: ${score}`);
  }
}

function gameLoop(timestamp) {
  const delta = Math.min(1.8, (timestamp - lastTime) / 16.67);
  lastTime = timestamp;
  update(delta);
  requestAnimationFrame(gameLoop);
}

function distance2D(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function isPunch(state, wrist, shoulder, now) {
  if (!wrist || !shoulder) {
    state.prev = null;
    return false;
  }

  let punched = false;
  if (state.prev) {
    const speed = distance2D(wrist, state.prev);
    const extension = distance2D(wrist, shoulder);
    const zDelta = wrist.z - state.prev.z;
    if (now - state.lastPunchAt > PUNCH_COOLDOWN &&
      speed > PUNCH_SPEED &&
      extension > PUNCH_EXTENSION &&
      zDelta < PUNCH_Z_DELTA) {
      state.lastPunchAt = now;
      punched = true;
    }
  }

  state.prev = { x: wrist.x, y: wrist.y, z: wrist.z };
  return punched;
}

function checkHit(wrist) {
  if (!target || !wrist) return false;
  const canvasX = (1 - wrist.x) * canvas.width;
  const canvasY = wrist.y * canvas.height;
  const dx = canvasX - target.x;
  const dy = canvasY - target.y;
  return Math.sqrt(dx * dx + dy * dy) < target.r + 24;
}

function handlePunch(hit) {
  if (hit) {
    score += 1;
    combo += 1;
    scoreEl.textContent = `Score: ${score}`;
    updateTimerDisplay();
    target = spawnTarget();
    targetTimer = 0;
  } else if (gameState === 'running') {
    if (mode === 'survival') {
      endGame('Miss!');
    } else {
      combo = 0;
      updateTimerDisplay();
    }
  }
}

function handlePose(results) {
  const landmarks = results.poseLandmarks;
  if (!landmarks || landmarks.length === 0) {
    poseReady = false;
    resetPunchState();
    setStatus('No body detected. Step back so shoulders and wrists are visible.');
    return;
  }

  poseReady = true;
  if (gameState === 'ready') {
    setStatus('Pick a mode to start, then punch the targets.');
  }

  const leftWrist = landmarks[15];
  const rightWrist = landmarks[16];
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];

  if (!leftWrist || !rightWrist || !leftShoulder || !rightShoulder) {
    resetPunchState();
    setStatus('Keep both shoulders and wrists in view.');
    return;
  }

  const now = performance.now();
  const leftPunch = isPunch(punchState.left, leftWrist, leftShoulder, now);
  const rightPunch = isPunch(punchState.right, rightWrist, rightShoulder, now);

  if (gameState !== 'running') return;

  if (leftPunch || rightPunch) {
    const hitLeft = leftPunch ? checkHit(leftWrist) : false;
    const hitRight = rightPunch ? checkHit(rightWrist) : false;
    handlePunch(hitLeft || hitRight);
  }
}

function renderLeaderboard(entries) {
  if (!leaderboardList) return;
  leaderboardList.innerHTML = '';
  if (!entries || entries.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No scores yet. Be the first!';
    leaderboardList.appendChild(li);
    globalEl.textContent = 'Global: --';
    return;
  }
  globalEl.textContent = `Global: ${entries[0].score}`;
  entries.slice(0, 10).forEach((entry, index) => {
    const li = document.createElement('li');
    const rank = index + 1;
    const medal = rank === 1 ? 'Gold' : rank === 2 ? 'Silver' : rank === 3 ? 'Bronze' : '';
    const medalTag = medal ? ` (${medal})` : '';
    li.textContent = `${rank}. ${entry.name} — ${entry.score}${medalTag}`;
    leaderboardList.appendChild(li);
  });
}

async function loadLeaderboard() {
  try {
    const res = await fetch(`${API_BASE}/api/leaderboards/boxing?limit=10`);
    if (!res.ok) throw new Error('Leaderboard fetch failed');
    const data = await res.json();
    renderLeaderboard(data.entries || []);
  } catch (err) {
    renderLeaderboard([]);
  }
}

async function submitScore(scoreValue) {
  if (scoreValue <= 0) {
    await loadLeaderboard();
    return;
  }
  try {
    const label = mode === 'combo' ? 'C' : 'S';
    const nameInput = window.prompt('Save your score! Enter a name (max 10 chars):', 'Boxer');
    const baseName = (nameInput || 'Boxer').trim().slice(0, 10) || 'Boxer';
    const name = `${baseName} ${label}`;
    const res = await fetch(`${API_BASE}/api/leaderboards/boxing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, score: scoreValue })
    });
    if (!res.ok) throw new Error('Submit failed');
    await loadLeaderboard();
  } catch (err) {
    await loadLeaderboard();
  }
}

async function initPose() {
  video.setAttribute('autoplay', 'true');
  video.setAttribute('playsinline', 'true');
  video.setAttribute('muted', 'true');

  const pose = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/${file}`
  });

  pose.setOptions({
    modelComplexity: 0,
    smoothLandmarks: true,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.5
  });

  pose.onResults(handlePose);

  const camera = new Camera(video, {
    onFrame: async () => {
      await pose.send({ image: video });
    },
    width: 640,
    height: 480
  });

  try {
    await camera.start();
    setStatus('Camera ready. Pick a mode to start boxing.');
  } catch (err) {
    setStatus('Camera disconnected. Check permissions and reload.');
    throw err;
  }
}

comboBtn.addEventListener('click', () => {
  startGame('combo');
});

survivalBtn.addEventListener('click', () => {
  startGame('survival');
});

playAgainBtn.addEventListener('click', () => {
  startGame(mode);
});

async function init() {
  updateModeDisplay();
  updateBestDisplay();
  updateTimerDisplay();
  await loadLeaderboard();
  await initPose();
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

init().catch((err) => {
  console.error('Failed to init Boxing AR', err);
});
