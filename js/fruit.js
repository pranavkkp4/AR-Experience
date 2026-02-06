// fruit.js
// Fruit Ninja game implemented in pure JavaScript using MediaPipe Hands to track
// the user's index finger. Falling fruit images are spawned on the canvas and
// the player slices them by moving their finger through the fruit. The game
// lasts 60 seconds and the score is incremented whenever a fruit is sliced.

// Grab DOM elements
const video = document.getElementById('input_video');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const timerEl = document.getElementById('timer');
const leaderboardList = document.getElementById('leaderboardList');
const restartBtn = document.getElementById('restartBtn');

const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3001'
  : '';

// Game state
let fruits = [];
let spawnCounter = 0;
let score = 0;
let timeLeft = 60; // seconds
let gameRunning = true;
let fingerPos = null; // {x, y} coordinates of the index finger in canvas space
let timerInterval = null;
let animationId = null;

// Preload fruit images
const fruitSources = [
  'Orang1.png', 'Orang2.png', 'Orange3.png',
  'berry1.png', 'berry2.png', 'berry3.png',
  'star1.png',
  'watermelon1.png', 'watermelon2.png', 'watermelon3.png'
];
const fruitImages = fruitSources.map(src => {
  const img = new Image();
  img.src = `assets/${src}`;
  return img;
});

// Utility: get random element from array
function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Spawn a new fruit at a random horizontal position above the top of the canvas
function spawnFruit() {
  const img = randomChoice(fruitImages);
  const scale = 0.4 + Math.random() * 0.2; // random size scaling
  const radius = (img.width * scale) / 2;
  const x = Math.random() * (canvas.width - 2 * radius) + radius;
  const y = -radius; // start above the canvas
  const speed = 2 + Math.random() * 2; // pixels per frame
  fruits.push({ img, x, y, radius, speed, scale });
}

// Initialize MediaPipe Hands
async function initHands() {
  const hands = new Hands({
    locateFile: (file) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/${file}`;
    }
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
  camera.start();
}

// Callback when MediaPipe Hands processes a frame
function onResults(results) {
  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const lm = results.multiHandLandmarks[0];
    const indexFingerTip = lm[8];
    // Map normalized coordinates to canvas space. Because we mirror the video
    // horizontally when drawing, we need to flip the x coordinate.
    const x = (1 - indexFingerTip.x) * canvas.width;
    const y = indexFingerTip.y * canvas.height;
    fingerPos = { x, y };
  } else {
    fingerPos = null;
  }
}

// Update and draw the game each animation frame
function update() {
  if (!gameRunning) return;
  // Draw mirrored webcam frame as background
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Mirror horizontally for natural play
  ctx.scale(-1, 1);
  ctx.translate(-canvas.width, 0);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  ctx.restore();

  // Spawn fruit periodically (approx every 45 frames at 60fps)
  spawnCounter++;
  if (spawnCounter > 45) {
    spawnFruit();
    spawnCounter = 0;
  }
  // Update fruits
  for (let i = fruits.length - 1; i >= 0; i--) {
    const f = fruits[i];
    f.y += f.speed;
    // Draw fruit
    const imgW = f.img.width * f.scale;
    const imgH = f.img.height * f.scale;
    ctx.drawImage(f.img, f.x - imgW / 2, f.y - imgH / 2, imgW, imgH);
    // Remove if falls off bottom
    if (f.y - f.radius > canvas.height) {
      fruits.splice(i, 1);
      continue;
    }
    // Check slicing collision
    if (fingerPos) {
      const dx = fingerPos.x - f.x;
      const dy = fingerPos.y - f.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < f.radius * 0.8) {
        // slice!
        fruits.splice(i, 1);
        score++;
        scoreEl.textContent = `Score: ${score}`;
        continue;
      }
    }
  }

  // Draw finger cursor indicator (optional)
  if (fingerPos) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(fingerPos.x, fingerPos.y, 10, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.restore();
  }

  animationId = requestAnimationFrame(update);
}

// Timer countdown
function startTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
  }
  timerInterval = setInterval(() => {
    timeLeft--;
    timerEl.textContent = `Time: ${timeLeft}s`;
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      endGame();
    }
  }, 1000);
}

function endGame() {
  gameRunning = false;
  timerEl.textContent = 'Time: 0s';
  // Show final score message on canvas
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ffffff';
  ctx.font = '48px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Time\'s up!', canvas.width / 2, canvas.height / 2 - 30);
  ctx.font = '32px Arial';
  ctx.fillText(`Your score: ${score}`, canvas.width / 2, canvas.height / 2 + 20);
  ctx.restore();

  submitScore(score);
}

function resetGame() {
  fruits = [];
  spawnCounter = 0;
  score = 0;
  timeLeft = 60;
  gameRunning = true;
  scoreEl.textContent = 'Score: 0';
  timerEl.textContent = 'Time: 60s';
}

function startGame() {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  resetGame();
  startTimer();
  update();
}

function renderLeaderboard(entries) {
  if (!leaderboardList) return;
  leaderboardList.innerHTML = '';
  if (!entries || entries.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No scores yet. Be the first!';
    leaderboardList.appendChild(li);
    return;
  }
  entries.forEach((entry, index) => {
    const li = document.createElement('li');
    const rank = index + 1;
    const medal = rank === 1 ? 'Gold' : rank === 2 ? 'Silver' : rank === 3 ? 'Bronze' : '';
    const medalTag = medal ? ` (${medal})` : '';
    li.textContent = `${rank}. ${entry.name} — ${entry.score}${medalTag}`;
    leaderboardList.appendChild(li);
  });
}

async function loadLeaderboard() {
  if (!leaderboardList) return;
  try {
    const res = await fetch(`${API_BASE}/api/leaderboards/fruit?limit=10`);
    if (!res.ok) throw new Error('Failed leaderboard fetch');
    const data = await res.json();
    renderLeaderboard(data.entries || []);
  } catch (err) {
    renderLeaderboard([]);
  }
}

async function submitScore(scoreValue) {
  try {
    const nameInput = window.prompt('Save your score! Enter a name (max 12 chars):', 'Fruit Fan');
    const name = (nameInput || 'Fruit Fan').trim().slice(0, 12) || 'Fruit Fan';
    const res = await fetch(`${API_BASE}/api/leaderboards/fruit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, score: scoreValue })
    });
    if (res.ok) {
      await loadLeaderboard();
    } else {
      await loadLeaderboard();
    }
  } catch (err) {
    await loadLeaderboard();
  }
}

// Initialize everything once the page is loaded
async function init() {
  await initHands();
  startGame();
  loadLeaderboard();
}

init().catch((err) => {
  console.error('Error initializing Fruit Ninja game:', err);
});

if (restartBtn) {
  restartBtn.addEventListener('click', () => {
    startGame();
  });
}
