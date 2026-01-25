// emotions.js
// EmoTrace — Real-time facial expression classification in the browser
// using confirmed MediaPipe FaceMesh landmark heuristics (Path 1) plus
// an optional per-user calibration mode (centroid matching).
//
// Disclaimer: This is a facial expression classifier (surface cues), not a
// definitive measure of a person's internal emotional state.

const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');

const statusLine = document.getElementById('statusLine');
const currentEmojiEl = document.getElementById('currentEmoji');
const currentLabelEl = document.getElementById('currentLabel');
const confidenceEl = document.getElementById('confidence');

const traceCanvas = document.getElementById('traceCanvas');
const traceCtx = traceCanvas.getContext('2d');

const progressInner = document.getElementById('progressInner');
const btnUseHeuristics = document.getElementById('btnUseHeuristics');
const btnReset = document.getElementById('btnReset');

const buttons = {
  happy: document.getElementById('btnHappy'),
  sad: document.getElementById('btnSad'),
  angry: document.getElementById('btnAngry'),
  surprised: document.getElementById('btnSurprised'),
  neutral: document.getElementById('btnNeutral'),
};

const LABELS = ['happy', 'sad', 'angry', 'surprised', 'neutral'];
const EMOJI = {
  happy: '🙂',
  sad: '😢',
  angry: '😠',
  surprised: '😮',
  neutral: '😐',
};
const DISPLAY = {
  happy: 'Happy',
  sad: 'Sad',
  angry: 'Angry',
  surprised: 'Surprised',
  neutral: 'Neutral',
};

// Trace styling (kept simple; focus is on signal, not aesthetics)
const TRACE_COLORS = {
  happy: '#4ade80',
  sad: '#60a5fa',
  angry: '#f87171',
  surprised: '#fbbf24',
  neutral: '#e5e7eb',
};

// ---- Calibration storage ----
const STORAGE_KEY = 'emotrace_calibration_v1';

function loadCalibration() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    // Expect a map of label -> centroid array (length 4)
    const out = {};
    for (const k of Object.keys(parsed)) {
      const v = parsed[k];
      if (LABELS.includes(k) && Array.isArray(v) && v.length === 4 && v.every(Number.isFinite)) {
        out[k] = v;
      }
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

function saveCalibration(calib) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(calib));
  } catch {
    // ignore storage errors
  }
}

function clearCalibration() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// ---- Maths helpers ----
function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function softmax(scores) {
  const max = Math.max(...scores);
  const exps = scores.map(s => Math.exp(s - max));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map(e => e / sum);
}

function euclidean(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}

// ---- Feature extraction from landmarks ----
// We build a lightweight, scale-normalized feature vector from FaceMesh landmarks.
// Indices are from MediaPipe FaceMesh (468 landmarks).
//
// Features (normalized by inter-ocular distance):
// 0) mouthOpen: vertical distance between inner lips (13,14)
// 1) smile: mouth center y - average corner y (61,291) (positive when corners are higher)
// 2) browRaise: average (eyeTop.y - brow.y) (70,300 vs 159,386) (positive when brows are higher)
// 3) eyeOpen: average vertical eye opening (159-145, 386-374)
function getFeatures(lm) {
  const leftEyeOuter = lm[33];
  const rightEyeOuter = lm[263];
  const scale = Math.hypot(leftEyeOuter.x - rightEyeOuter.x, leftEyeOuter.y - rightEyeOuter.y) || 1e-6;

  const topLip = lm[13];
  const bottomLip = lm[14];
  const mouthOpen = Math.abs(topLip.y - bottomLip.y) / scale;

  const mouthCornerL = lm[61];
  const mouthCornerR = lm[291];
  const mouthCenterY = (topLip.y + bottomLip.y) / 2.0;
  const cornersY = (mouthCornerL.y + mouthCornerR.y) / 2.0;
  const smile = (mouthCenterY - cornersY) / scale;

  const lEyeTop = lm[159];
  const lEyeBot = lm[145];
  const rEyeTop = lm[386];
  const rEyeBot = lm[374];
  const eyeOpen = ((Math.abs(lEyeTop.y - lEyeBot.y) + Math.abs(rEyeTop.y - rEyeBot.y)) / 2.0) / scale;

  const lBrow = lm[70];
  const rBrow = lm[300];
  const browRaise = (((lEyeTop.y - lBrow.y) + (rEyeTop.y - rBrow.y)) / 2.0) / scale;

  // Return a stable vector
  return [mouthOpen, smile, browRaise, eyeOpen];
}

// ---- Heuristic (Path 1) scoring ----
// Produces per-class scores that we later softmax into probabilities.
// Tuned for normalized features. Calibration is preferred when available.
function heuristicScores(features) {
  const [mouthOpen, smile, browRaise, eyeOpen] = features;

  // Typical feature magnitudes:
  // mouthOpen: 0.00 - 0.25
  // smile:     -0.10 - 0.10
  // browRaise: -0.05 - 0.20
  // eyeOpen:   0.02 - 0.18

  // Build raw scores with simple, interpretable combinations.
  // Happy: strong smile, modest mouth open, slightly open eyes
  const happy = (smile * 6.0) + (clamp01(0.12 - Math.abs(mouthOpen - 0.06)) * 1.5) + (eyeOpen * 2.0);

  // Sad: corners down (negative smile), low mouth open, lower brow raise
  const sad = (-smile * 5.5) + (clamp01(0.10 - mouthOpen) * 2.0) + (clamp01(0.10 - browRaise) * 1.0);

  // Angry: low brow raise (brows down), squint (lower eyeOpen), mouth relatively closed
  const angry = (clamp01(0.08 - browRaise) * 3.2) + (clamp01(0.06 - eyeOpen) * 2.8) + (clamp01(0.09 - mouthOpen) * 1.0);

  // Surprised: open mouth + open eyes + raised brows
  const surprised = (mouthOpen * 5.0) + (eyeOpen * 4.0) + (browRaise * 3.5);

  // Neutral: discourage extremes
  const neutral = (clamp01(0.10 - Math.abs(smile)) * 2.0)
                + (clamp01(0.12 - mouthOpen) * 1.5)
                + (clamp01(0.10 - Math.abs(browRaise - 0.08)) * 1.0);

  return [happy, sad, angry, surprised, neutral];
}

// ---- Calibration capture ----
let calibration = loadCalibration(); // label -> centroid features
let useCalibration = !!calibration;

let capture = null; // {label, samples: [], targetFrames, framesCaptured}

function setCapture(label) {
  capture = {
    label,
    samples: [],
    targetFrames: 60, // ~2 seconds at ~30fps
    framesCaptured: 0
  };
  progressInner.style.width = '0%';
  statusLine.textContent = `Calibration: hold a “${DISPLAY[label]}” expression…`;
  // disable buttons during capture
  for (const k of Object.keys(buttons)) buttons[k].disabled = true;
  btnUseHeuristics.disabled = true;
  btnReset.disabled = true;
}

function finishCapture() {
  if (!capture) return;
  const { label, samples } = capture;

  if (samples.length < 10) {
    statusLine.textContent = 'Calibration failed: not enough stable samples. Try again with better lighting.';
  } else {
    const centroid = [0, 0, 0, 0];
    for (const s of samples) {
      for (let i = 0; i < 4; i += 1) centroid[i] += s[i];
    }
    for (let i = 0; i < 4; i += 1) centroid[i] /= samples.length;

    calibration = calibration || {};
    calibration[label] = centroid;
    saveCalibration(calibration);
    useCalibration = true;

    const calibratedLabels = Object.keys(calibration).filter(k => LABELS.includes(k));
    statusLine.textContent = `Saved calibration for ${DISPLAY[label]}. Calibrated classes: ${calibratedLabels.map(k => DISPLAY[k]).join(', ')}`;
  }

  capture = null;
  progressInner.style.width = '0%';
  for (const k of Object.keys(buttons)) buttons[k].disabled = false;
  btnUseHeuristics.disabled = false;
  btnReset.disabled = false;
}

function updateCapture(features) {
  if (!capture) return;
  capture.samples.push(features);
  capture.framesCaptured += 1;
  const pct = Math.round((capture.framesCaptured / capture.targetFrames) * 100);
  progressInner.style.width = `${Math.min(100, pct)}%`;
  if (capture.framesCaptured >= capture.targetFrames) {
    finishCapture();
  }
}

// ---- Classification ----
function classify(features) {
  // If user has calibration for >= 2 classes and wants to use it, classify by centroid distance.
  if (useCalibration && calibration) {
    const available = LABELS.filter(k => calibration[k]);
    if (available.length >= 2) {
      const dists = available.map(k => euclidean(features, calibration[k]));
      // Convert to scores: closer is higher score
      const scores = dists.map(d => -d * 12.0);
      const probs = softmax(scores);

      // Convert into full map for all labels
      const out = {};
      for (const k of LABELS) out[k] = 0;
      for (let i = 0; i < available.length; i += 1) {
        out[available[i]] = probs[i];
      }
      // For missing classes, keep 0 and then re-normalize slightly so UI doesn't break
      const sum = Object.values(out).reduce((a, b) => a + b, 0) || 1;
      for (const k of LABELS) out[k] = out[k] / sum;
      return out;
    }
  }

  // Fallback: heuristics
  const scores = heuristicScores(features);
  const probs = softmax(scores);
  const out = {};
  for (let i = 0; i < LABELS.length; i += 1) out[LABELS[i]] = probs[i];
  return out;
}

function argmax(map) {
  let bestK = null;
  let bestV = -Infinity;
  for (const k of Object.keys(map)) {
    const v = map[k];
    if (v > bestV) {
      bestV = v;
      bestK = k;
    }
  }
  return [bestK, bestV];
}

// ---- Trace ----
const TRACE_WINDOW_MS = 30_000; // last 30s
const trace = []; // {t, probs}

function pushTrace(probs) {
  const t = performance.now();
  trace.push({ t, probs });
  const cutoff = t - TRACE_WINDOW_MS;
  while (trace.length && trace[0].t < cutoff) trace.shift();
}

function drawTrace() {
  const w = traceCanvas.width;
  const h = traceCanvas.height;

  traceCtx.clearRect(0, 0, w, h);

  // background grid
  traceCtx.globalAlpha = 0.35;
  traceCtx.strokeStyle = 'rgba(255,255,255,0.18)';
  traceCtx.lineWidth = 1;
  for (let i = 1; i <= 4; i += 1) {
    const y = (h * i) / 5;
    traceCtx.beginPath();
    traceCtx.moveTo(0, y);
    traceCtx.lineTo(w, y);
    traceCtx.stroke();
  }
  traceCtx.globalAlpha = 1;

  if (trace.length < 2) return;

  const tMax = trace[trace.length - 1].t;
  const tMin = tMax - TRACE_WINDOW_MS;

  for (const label of LABELS) {
    traceCtx.strokeStyle = TRACE_COLORS[label];
    traceCtx.lineWidth = 2;
    traceCtx.beginPath();

    for (let i = 0; i < trace.length; i += 1) {
      const p = trace[i].probs[label] ?? 0;
      const x = ((trace[i].t - tMin) / (tMax - tMin)) * w;
      const y = h - (p * (h - 6)) - 3;
      if (i === 0) traceCtx.moveTo(x, y);
      else traceCtx.lineTo(x, y);
    }

    traceCtx.stroke();
  }
}

// ---- Rendering (overlay) ----
function drawOverlay(label, conf) {
  canvasCtx.save();
  canvasCtx.fillStyle = 'rgba(0,0,0,0.45)';
  canvasCtx.fillRect(10, 10, 320, 64);

  canvasCtx.fillStyle = '#ffffff';
  canvasCtx.font = '20px Arial';
  canvasCtx.fillText(`${EMOJI[label]}  ${DISPLAY[label]}`, 18, 38);

  canvasCtx.fillStyle = 'rgba(255,255,255,0.85)';
  canvasCtx.font = '14px Arial';
  canvasCtx.fillText(`Confidence: ${(conf * 100).toFixed(0)}%${useCalibration && calibration ? ' (calibrated)' : ''}`, 18, 58);
  canvasCtx.restore();
}

// ---- MediaPipe results handler ----
let faceVisible = false;

function onResults(results) {
  // Draw mirrored webcam frame
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.scale(-1, 1);
  canvasCtx.translate(-canvasElement.width, 0);
  canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.restore();

  let probs = null;

  if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
    faceVisible = true;
    const lm = results.multiFaceLandmarks[0];
    const features = getFeatures(lm);

    // calibration capture
    updateCapture(features);

    probs = classify(features);
    const [label, conf] = argmax(probs);

    currentEmojiEl.textContent = EMOJI[label];
    currentLabelEl.textContent = DISPLAY[label];
    confidenceEl.textContent = `Confidence: ${(conf * 100).toFixed(0)}%${useCalibration && calibration ? ' (calibrated)' : ''}`;

    drawOverlay(label, conf);

    pushTrace(probs);
    drawTrace();

    // helpful status
    if (!capture) {
      statusLine.textContent = useCalibration && calibration
        ? 'Live (calibrated). Tip: you can calibrate more expressions to improve stability.'
        : 'Live (heuristics). Tip: calibrate each emoji for better stability.';
    }
  } else {
    if (faceVisible) {
      statusLine.textContent = 'No face detected. Center your face and ensure good lighting.';
    } else {
      statusLine.textContent = 'Looking for a face…';
    }
    faceVisible = false;

    // Still keep trace moving (flat neutral)
    const neutralOnly = { happy: 0, sad: 0, angry: 0, surprised: 0, neutral: 1 };
    pushTrace(neutralOnly);
    drawTrace();
  }
}

// ---- Init ----
async function init() {
  statusLine.textContent = 'Initializing…';

  const faceMesh = new FaceMesh({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/${file}`
  });

  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  faceMesh.onResults(onResults);

  const camera = new Camera(videoElement, {
    onFrame: async () => {
      await faceMesh.send({ image: videoElement });
    },
    width: 960,
    height: 720,
  });

  try {
    await camera.start();
    statusLine.textContent = 'Camera started. Looking for a face…';
  } catch (e) {
    statusLine.textContent = 'Camera error: please allow camera access and reload the page.';
    console.error(e);
  }

  // Trace draw loop (in case of missed frames)
  setInterval(drawTrace, 250);
}

function wireUI() {
  // Calibration buttons
  for (const label of LABELS) {
    buttons[label].addEventListener('click', () => {
      setCapture(label);
    });
  }

  btnUseHeuristics.addEventListener('click', () => {
    useCalibration = false;
    statusLine.textContent = 'Using heuristics (ignoring calibration).';
  });

  btnReset.addEventListener('click', () => {
    clearCalibration();
    calibration = null;
    useCalibration = false;
    statusLine.textContent = 'Calibration cleared.';
  });

  // If we have saved calibration, inform the user
  if (calibration) {
    const calibratedLabels = Object.keys(calibration).filter(k => LABELS.includes(k));
    statusLine.textContent = `Loaded calibration for: ${calibratedLabels.map(k => DISPLAY[k]).join(', ')}.`;
  }
}

wireUI();
init();
