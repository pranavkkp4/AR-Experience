// cat.js
// This script initializes MediaPipe FaceMesh and listens for results in order
// to map simple facial heuristics to fun cat reaction images. The thresholds
// mirror those used in the original Python implementation from the MeowCV
// project. When the mouth opens wide the tongue cat is shown, when the eyes
// open wide the shocked cat appears, and when the eyes squint the glaring
// cat is displayed. Otherwise Larry the cat is shown by default.

// Grab page elements
const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const catImageEl = document.getElementById('catImage');

// Thresholds for heuristics (tuned for normalized landmark values)
const eyeOpeningThreshold = 0.025;
const mouthOpeningThreshold = 0.03;
const squintingThreshold = 0.018;

// Mapping of result types to asset filenames
const cats = {
  shock: 'cat-shock.jpeg',
  tongue: 'cat-tongue.jpeg',
  glare: 'cat-glare.jpeg',
  neutral: 'larry.jpeg'
};

// The callback fired each time FaceMesh outputs results
function onResults(results) {
  // Draw the video frame to the canvas
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  // Mirror the image horizontally so it feels natural
  canvasCtx.scale(-1, 1);
  canvasCtx.translate(-canvasElement.width, 0);
  canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.restore();

  // Default cat reaction
  let currentCat = cats.neutral;

  if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
    const lm = results.multiFaceLandmarks[0];
    // Access specific landmark indices per MediaPipe FaceMesh
    const lTop = lm[159];
    const lBot = lm[145];
    const rTop = lm[386];
    const rBot = lm[374];
    const topLip = lm[13];
    const bottomLip = lm[14];

    // Compute average eye opening (vertical distance) and mouth opening
    const eyeOpening = (Math.abs(lTop.y - lBot.y) + Math.abs(rTop.y - rBot.y)) / 2.0;
    const mouthOpening = Math.abs(topLip.y - bottomLip.y);
    const eyeSquint = eyeOpening; // reuse for squint detection

    // Determine which expression is active based on thresholds
    if (mouthOpening > mouthOpeningThreshold) {
      currentCat = cats.tongue;
    } else if (eyeOpening > eyeOpeningThreshold) {
      currentCat = cats.shock;
    } else if (eyeSquint < squintingThreshold) {
      currentCat = cats.glare;
    } else {
      currentCat = cats.neutral;
    }

    // Optionally draw landmarks for debugging (commented out to improve performance)
    // drawLandmarks(canvasCtx, lm);
  }

  // Update the displayed cat image if needed
  const newSrc = `assets/${currentCat}`;
  if (!catImageEl.src.includes(currentCat)) {
    catImageEl.src = newSrc;
  }
}

// Setup FaceMesh and camera once the page loads
async function init() {
  // Create a new FaceMesh instance. The locateFile callback tells
  // MediaPipe where to find its wasm files when loaded from a CDN.
  const faceMesh = new FaceMesh({
    locateFile: (file) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/${file}`;
    }
  });
  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });
  faceMesh.onResults(onResults);

  // Initialize the camera. The Camera helper handles requesting
  // webcam access and streaming frames to the onFrame callback.
  const camera = new Camera(videoElement, {
    onFrame: async () => {
      await faceMesh.send({image: videoElement});
    },
    width: 640,
    height: 480
  });
  camera.start();
}

// Kick things off
init().catch((err) => {
  console.error('Failed to initialize Cat Reaction:', err);
});