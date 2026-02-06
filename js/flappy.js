// flappy.js
// Flappy Bird-inspired AR game controlled by raising both arms using MediaPipe Pose.

const video = document.getElementById('input_video');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const globalEl = document.getElementById('globalBest');
const statusEl = document.getElementById('statusLine');
const leaderboardList = document.getElementById('leaderboardList');
const startBtn = document.getElementById('startBtn');

const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3001'
  : '';

const BEST_KEY = 'flappyBirdBestV1';

const bird = {
  x: 160,
  y: canvas.height / 2,
  r: 16,
  vy: 0
};

let pipes = [];
let score = 0;
let gameState = 'ready';
let lastTime = performance.now();
let timeSinceSpawn = 0;
let flapArmed = true;
let lastFlapAt = 0;
let poseReady = false;

const PIPE_WIDTH = 70;
const GAP_SIZE = 150;
const BASE_SPEED = 2.8;
const GRAVITY = 0.58;
const FLAP_STRENGTH = -9.2;
const FLAP_COOLDOWN = 240;

function setStatus(message) {
  if (statusEl) {
    statusEl.textContent = message;
  }
}

function loadBest() {
  const raw = localStorage.getItem(BEST_KEY);
  const value = parseInt(raw, 10);
  if (!Number.isFinite(value)) return 0;
  return value;
}

function saveBest(value) {
  localStorage.setItem(BEST_KEY, String(value));
}

function updateBestDisplay() {
  const best = loadBest();
  bestEl.textContent = `Best: ${best}`;
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
    const res = await fetch(`${API_BASE}/api/leaderboards/flappy?limit=10`);
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
    const nameInput = window.prompt('Save your score! Enter a name (max 12 chars):', 'Flapper');
    const name = (nameInput || 'Flapper').trim().slice(0, 12) || 'Flapper';
    const res = await fetch(`${API_BASE}/api/leaderboards/flappy`, {
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

function resetGame() {
  bird.y = canvas.height / 2;
  bird.vy = 0;
  pipes = [];
  score = 0;
  timeSinceSpawn = 0;
  flapArmed = true;
  lastFlapAt = 0;
  scoreEl.textContent = 'Score: 0';
}

function startGame() {
  resetGame();
  gameState = 'running';
  startBtn.textContent = 'Play Again';
  setStatus(poseReady
    ? 'Arms down, then raise both wrists to flap.'
    : 'Waiting for camera input...');
}

function gameOver() {
  if (gameState !== 'running') return;
  gameState = 'over';
  const best = loadBest();
  if (score > best) {
    saveBest(score);
    updateBestDisplay();
  }
  setStatus('Flight over. Hit restart and flap to try again.');
  submitScore(score);
}

function spawnPipe() {
  const margin = 70;
  const gapY = margin + Math.random() * (canvas.height - GAP_SIZE - margin * 2);
  pipes.push({
    x: canvas.width + 40,
    gapY,
    gapSize: GAP_SIZE,
    width: PIPE_WIDTH,
    scored: false
  });
}

function updateBird(delta) {
  bird.vy += GRAVITY * delta;
  bird.y += bird.vy * delta;

  if (bird.y - bird.r < 0 || bird.y + bird.r > canvas.height) {
    gameOver();
  }
}

function updatePipes(delta) {
  const speed = BASE_SPEED + Math.min(4, score / 12) * 0.2;
  pipes.forEach((pipe) => {
    pipe.x -= speed * delta;
  });

  if (pipes.length && pipes[0].x + PIPE_WIDTH < -40) {
    pipes.shift();
  }

  for (let i = 0; i < pipes.length; i += 1) {
    const pipe = pipes[i];
    if (!pipe.scored && pipe.x + pipe.width < bird.x - bird.r) {
      pipe.scored = true;
      score += 1;
      scoreEl.textContent = `Score: ${score}`;
    }

    const withinX = bird.x + bird.r > pipe.x && bird.x - bird.r < pipe.x + pipe.width;
    const hitTop = bird.y - bird.r < pipe.gapY;
    const hitBottom = bird.y + bird.r > pipe.gapY + pipe.gapSize;
    if (withinX && (hitTop || hitBottom)) {
      gameOver();
      break;
    }
  }
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

function drawPipes() {
  pipes.forEach((pipe) => {
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(pipe.x, 0, pipe.width, pipe.gapY);
    ctx.fillRect(pipe.x, pipe.gapY + pipe.gapSize, pipe.width, canvas.height - pipe.gapY - pipe.gapSize);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(pipe.x + pipe.width - 8, 0, 8, pipe.gapY);
    ctx.fillRect(pipe.x + pipe.width - 8, pipe.gapY + pipe.gapSize, 8, canvas.height - pipe.gapY - pipe.gapSize);
  });
}

function drawBird() {
  ctx.save();
  ctx.translate(bird.x, bird.y);

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(6, bird.r + 6, bird.r * 0.9, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.arc(0, 0, bird.r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#1f2937';
  ctx.beginPath();
  ctx.arc(6, -4, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#fb923c';
  ctx.beginPath();
  ctx.moveTo(bird.r - 2, 0);
  ctx.lineTo(bird.r + 14, -4);
  ctx.lineTo(bird.r + 14, 4);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawOverlay(title, subtitle) {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ffffff';
  ctx.font = '32px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(title, canvas.width / 2, canvas.height / 2 - 10);
  if (subtitle) {
    ctx.font = '20px Arial';
    ctx.fillText(subtitle, canvas.width / 2, canvas.height / 2 + 24);
  }
  ctx.restore();
}

function update(delta) {
  drawBackground();

  if (gameState === 'running') {
    timeSinceSpawn += delta;
    if (timeSinceSpawn > 90) {
      spawnPipe();
      timeSinceSpawn = 0;
    }
    updateBird(delta);
    if (gameState === 'running') {
      updatePipes(delta);
    }
  }

  drawPipes();
  drawBird();

  if (gameState === 'ready') {
    drawOverlay('Ready to flap?', 'Press Start or lift both arms to begin');
  }

  if (gameState === 'over') {
    drawOverlay('Crash landing!', `Final score: ${score}`);
  }
}

function gameLoop(timestamp) {
  const delta = Math.min(1.8, (timestamp - lastTime) / 16.67);
  lastTime = timestamp;
  update(delta);
  requestAnimationFrame(gameLoop);
}

function flap() {
  bird.vy = FLAP_STRENGTH;
}

function handlePose(results) {
  if (gameState === 'over') {
    return;
  }

  const landmarks = results.poseLandmarks;
  if (!landmarks || landmarks.length === 0) {
    poseReady = false;
    setStatus('No body detected. Step back so shoulders and wrists are visible.');
    return;
  }

  poseReady = true;

  const leftWrist = landmarks[15];
  const rightWrist = landmarks[16];
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];

  if (!leftWrist || !rightWrist || !leftShoulder || !rightShoulder) {
    setStatus('Hold both arms in view to control the bird.');
    return;
  }

  const upThreshold = 0.06;
  const downThreshold = 0.08;
  const leftUp = leftWrist.y < leftShoulder.y - upThreshold;
  const rightUp = rightWrist.y < rightShoulder.y - upThreshold;
  const leftDown = leftWrist.y > leftShoulder.y + downThreshold;
  const rightDown = rightWrist.y > rightShoulder.y + downThreshold;

  if (leftDown && rightDown) {
    flapArmed = true;
  }

  if (leftUp && rightUp) {
    const now = performance.now();
    if (flapArmed && now - lastFlapAt > FLAP_COOLDOWN) {
      if (gameState === 'ready') {
        startGame();
      }
      if (gameState === 'running') {
        flap();
      }
      lastFlapAt = now;
      flapArmed = false;
    }
    setStatus('Arms up! Drop them to re-arm the next flap.');
  } else if (leftDown && rightDown) {
    setStatus('Arms down. Raise both wrists above shoulders to flap.');
  } else {
    setStatus('Raise both arms together to flap.');
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
    setStatus('Camera ready. Raise both arms to flap.');
  } catch (err) {
    setStatus('Camera disconnected. Check permissions and reload.');
    throw err;
  }
}

startBtn.addEventListener('click', () => {
  startGame();
});

async function init() {
  updateBestDisplay();
  await loadLeaderboard();
  await initPose();
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

init().catch((err) => {
  console.error('Failed to init Flappy Bird AR', err);
});
