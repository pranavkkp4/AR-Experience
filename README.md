# AR Experience — EmoTrace & Fruit Catcher (MediaPipe)

This repository contains a lightweight web app with webcam-based demos built on **MediaPipe** plus a simple Node + SQLite leaderboard API:

1. **EmoTrace — Expression Tracker (FaceMesh)**  
   Real-time facial expression classification in the browser using FaceMesh landmarks. Includes **Calibration Mode** (emoji-labeled sampling stored locally) and a **live confidence trace** over time.

2. **Fruit Catcher (Hands)**  
   Catch falling fruit with your hand using real-time hand tracking.

3. **Potato Run (Hands)**  
   An infinite runner platformer where you jump a potato hero over veggie enemies.

4. **Flappy Bird AR (Pose)**  
   Flap your arms to keep the bird airborne and thread the pipe gaps.

5. **Boxing AR (Pose)**  
   Throw punches at glowing targets with two game modes (Combo Rush + Survival).

6. **Global Leaderboards (React)**  
   A small React page that displays the top scores for Fruit Catcher, Flappy Bird AR, Boxing AR, and Potato Run.

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
```

## Leaderboard Backend (Node + SQLite)

This project uses a small Express server with SQLite to store global leaderboards for Fruit Catcher and Potato Run.

### 1) Install dependencies
```bash
cd server
npm install
```

### 2) Start the API
```bash
npm start
```

The API runs on `http://localhost:3001` by default.

### 3) Open the site
Use Live Server or `python -m http.server 8000` and navigate to:
- `leaderboards.html` to view scores
- `fruit.html`, `flappy.html`, `boxing.html`, or `potato.html` to play and submit scores

### Admin reset (optional)
You can clear scores with a simple admin endpoint. Set an `ADMIN_KEY` when starting the server:
```bash
ADMIN_KEY=yourkey npm start
```

Then call:
- `POST /api/admin/reset/fruit?key=yourkey`
- `POST /api/admin/reset/flappy?key=yourkey`
- `POST /api/admin/reset/boxing?key=yourkey`
- `POST /api/admin/reset/potato?key=yourkey`
- `POST /api/admin/reset/all?key=yourkey`
