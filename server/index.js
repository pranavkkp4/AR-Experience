import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 3001;
const dbPath = process.env.DB_PATH || join(__dirname, 'leaderboards.db');
const allowedGames = new Set(['fruit', 'flappy', 'potato']);
const adminKey = process.env.ADMIN_KEY || '';

const db = new sqlite3.Database(dbPath);

app.use(cors({ origin: true }));
app.use(express.json({ limit: '10kb' }));

function initDb() {
  db.serialize(() => {
    db.run(
      `CREATE TABLE IF NOT EXISTS leaderboard_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game TEXT NOT NULL,
        name TEXT NOT NULL,
        score INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    );
    db.run('CREATE INDEX IF NOT EXISTS idx_leaderboard_game_score ON leaderboard_entries (game, score DESC)');
  });
}

function sanitizeName(name) {
  if (!name) return 'Player';
  return String(name).trim().slice(0, 12) || 'Player';
}

function parseScore(score) {
  const parsed = Number(score);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.floor(parsed);
}

function getLeaderboard(game, limit = 5, offset = 0) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT name, score, created_at FROM leaderboard_entries WHERE game = ? ORDER BY score DESC, created_at ASC LIMIT ? OFFSET ?;',
      [game, limit, offset],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
}

function getCount(game) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT COUNT(*) AS total FROM leaderboard_entries WHERE game = ?;',
      [game],
      (err, row) => {
        if (err) reject(err);
        else resolve(row?.total || 0);
      }
    );
  });
}

function insertScore(game, name, score) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO leaderboard_entries (game, name, score) VALUES (?, ?, ?);',
      [game, name, score],
      function onRun(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, game, name, score });
      }
    );
  });
}

app.get('/api/leaderboards', async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 5, 1), 20);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  try {
    const [fruitEntries, flappyEntries, potatoEntries, fruitTotal, flappyTotal, potatoTotal] = await Promise.all([
      getLeaderboard('fruit', limit, offset),
      getLeaderboard('flappy', limit, offset),
      getLeaderboard('potato', limit, offset),
      getCount('fruit'),
      getCount('flappy'),
      getCount('potato')
    ]);
    res.json({
      fruit: { entries: fruitEntries, total: fruitTotal, limit, offset },
      flappy: { entries: flappyEntries, total: flappyTotal, limit, offset },
      potato: { entries: potatoEntries, total: potatoTotal, limit, offset }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch leaderboards' });
  }
});

app.get('/api/leaderboards/:game', async (req, res) => {
  const { game } = req.params;
  if (!allowedGames.has(game)) {
    return res.status(400).json({ error: 'Unknown game' });
  }
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 5, 1), 20);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  try {
    const [rows, total] = await Promise.all([
      getLeaderboard(game, limit, offset),
      getCount(game)
    ]);
    return res.json({ game, entries: rows, total, limit, offset });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

app.post('/api/leaderboards/:game', async (req, res) => {
  const { game } = req.params;
  if (!allowedGames.has(game)) {
    return res.status(400).json({ error: 'Unknown game' });
  }
  const name = sanitizeName(req.body?.name);
  const score = parseScore(req.body?.score);
  if (score === null) {
    return res.status(400).json({ error: 'Invalid score' });
  }

  try {
    const entry = await insertScore(game, name, score);
    const [entries, total] = await Promise.all([
      getLeaderboard(game, 5, 0),
      getCount(game)
    ]);
    return res.status(201).json({ entry, entries, total, limit: 5, offset: 0 });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to submit score' });
  }
});

app.post('/api/admin/reset/:game', async (req, res) => {
  const { game } = req.params;
  if (!allowedGames.has(game) && game !== 'all') {
    return res.status(400).json({ error: 'Unknown game' });
  }
  if (adminKey && req.query.key !== adminKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const games = game === 'all' ? Array.from(allowedGames) : [game];
  try {
    await Promise.all(
      games.map((g) => new Promise((resolve, reject) => {
        db.run('DELETE FROM leaderboard_entries WHERE game = ?;', [g], (err) => {
          if (err) reject(err);
          else resolve();
        });
      }))
    );
    return res.json({ ok: true, cleared: games });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reset leaderboard' });
  }
});

initDb();

app.listen(port, () => {
  console.log(`Leaderboard API running on http://localhost:${port}`);
});
