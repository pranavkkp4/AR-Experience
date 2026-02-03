# AR Experience — EmoTrace & Fruit Catcher (MediaPipe)

This repository contains a lightweight, **GitHub Pages–friendly** web app with webcam-based demos built on **MediaPipe**:

1. **EmoTrace — Expression Tracker (FaceMesh)**  
   Real-time facial expression classification in the browser using FaceMesh landmarks. Includes **Calibration Mode** (emoji-labeled sampling stored locally) and a **live confidence trace** over time.

2. **Fruit Ninja (Hands)**  
   Slice falling fruit with your hand using real-time hand tracking.

3. **Potato Run (Hands)**  
   An infinite runner platformer where you jump a potato hero over veggie enemies.

---

## Live Demo

- Open `index.html` and choose a mode.
- Both demos require webcam access.

---

## EmoTrace — What it Does

EmoTrace classifies **facial expressions** into:

- Happy 🙂  
- Sad 😢  
- Angry 😠  
- Surprised 😮  
- Neutral 😐  

### How it Works (Path 1 + Calibration)

- **Path 1 (Heuristics):** Uses simple, interpretable geometry features derived from FaceMesh landmarks:
  - mouth openness
  - smile intensity (mouth corner lift)
  - eyebrow raise
  - eye openness

- **Calibration Mode:** Click an emoji and hold that expression for ~2 seconds. EmoTrace captures multiple frames and stores a per-expression **centroid** (feature mean) in your browser.  
  During live inference, it can classify by **nearest centroid** for improved stability on different faces/lighting.

> Note: This is a facial expression classifier (surface cues), not a definitive measure of internal emotion.

---

## Run Locally

You can run this locally with any static server.

### Option A: VS Code Live Server
1. Install the “Live Server” extension.
2. Right-click `index.html` → “Open with Live Server”.

### Option B: Python
```bash
python -m http.server 8000
