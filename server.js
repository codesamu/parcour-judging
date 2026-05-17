const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = 'admin'; // Hardcoded admin password

// Customize Judges Here: Add/Remove objects to change the number of judges.
const JUDGES_CONFIG = [
  { name: 'Judge1', pin: '1111' },
  { name: 'Judge2', pin: '2222' },
  { name: 'Judge3', pin: '3333' },
  { name: 'Judge4', pin: '4444' },
  { name: 'Judge5', pin: '5555' },
  { name: 'Judge6', pin: '6666' }
];
const NUM_JUDGES = JUDGES_CONFIG.length;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database Setup
const dbDir = path.join(__dirname, 'db');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir);
}
const dbPath = path.join(dbDir, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS judges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    pin TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS athletes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    order_index INTEGER,
    completed BOOLEAN DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    athlete_id INTEGER,
    judge_id INTEGER,
    score INTEGER,
    UNIQUE(athlete_id, judge_id)
  )`);

  // Initialize Judges
  db.get("SELECT COUNT(*) AS count FROM judges", (err, row) => {
    if (row && row.count === 0) {
      const stmt = db.prepare("INSERT INTO judges (username, pin) VALUES (?, ?)");
      for (const judge of JUDGES_CONFIG) {
        stmt.run(judge.name, judge.pin);
      }
      stmt.finalize();
    }
  });
});

// Helper to broadcast updates
const broadcastUpdate = () => {
  io.emit('state-update');
};

// --- Endpoints ---

// Login Judge or Admin
app.post('/login', (req, res) => {
  const { username, pin } = req.body;
  
  if (username && username.toLowerCase() === 'admin' && pin === ADMIN_PASSWORD) {
    return res.json({ success: true, role: 'admin' });
  }

  db.get("SELECT * FROM judges WHERE LOWER(username) = LOWER(?) AND pin = ?", [username, pin], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row) {
      res.json({ success: true, role: 'judge', judgeId: row.id, username: row.username });
    } else {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
  });
});

// Get Current Athlete
app.get('/current-athlete', (req, res) => {
  db.get("SELECT * FROM athletes WHERE completed = 0 ORDER BY order_index ASC LIMIT 1", (err, athlete) => {
    if (err) return res.status(500).json({ error: err.message });
    
    if (!athlete) return res.json(null); // No active athlete

    // Also get who has submitted scores for this athlete
    db.all("SELECT judge_id FROM scores WHERE athlete_id = ?", [athlete.id], (err, scores) => {
      if (err) return res.status(500).json({ error: err.message });
      const submittedJudgeIds = scores.map(s => s.judge_id);
      res.json({ ...athlete, submittedJudgeIds });
    });
  });
});

// Submit/Update Score
const handleScoreSubmit = (req, res) => {
  const { athleteId, judgeId, score } = req.body;
  
  if (score === undefined || score === null || isNaN(score)) {
    return res.status(400).json({ error: 'Invalid score' });
  }

  db.run("INSERT INTO scores (athlete_id, judge_id, score) VALUES (?, ?, ?) ON CONFLICT(athlete_id, judge_id) DO UPDATE SET score = ?", 
    [athleteId, judgeId, score, score], 
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      
      // Check if all judges submitted for this athlete
      db.get("SELECT COUNT(*) AS count FROM scores WHERE athlete_id = ?", [athleteId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (row.count >= NUM_JUDGES) {
          db.run("UPDATE athletes SET completed = 1 WHERE id = ?", [athleteId], (err) => {
             if (err) console.error(err);
             broadcastUpdate();
          });
        } else {
          broadcastUpdate();
        }
      });
      res.json({ success: true });
    }
  );
};

app.post('/submit-score', handleScoreSubmit);
app.put('/update-score', handleScoreSubmit);

// Get My Score for specific athlete
app.get('/scores/:athleteId/:judgeId', (req, res) => {
    const { athleteId, judgeId } = req.params;
    db.get("SELECT score FROM scores WHERE athlete_id = ? AND judge_id = ?", [athleteId, judgeId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row || { score: null });
    });
});

// Get Leaderboard (calculated dynamically)
app.get('/leaderboard', (req, res) => {
  const query = `
    SELECT a.id, a.name, a.completed, IFNULL(SUM(s.score), 0) as total_score, COUNT(s.id) as score_count
    FROM athletes a
    LEFT JOIN scores s ON a.id = s.athlete_id
    GROUP BY a.id
    ORDER BY total_score DESC, a.id ASC
  `;
  db.all(query, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Get all athletes (for admin and judge past athletes view)
app.get('/athletes', (req, res) => {
  db.all("SELECT * FROM athletes ORDER BY order_index ASC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Admin Add Athlete
app.post('/admin/add-athlete', (req, res) => {
  const { name } = req.body;
  if (!name || name.trim() === '') return res.status(400).json({ error: 'Name required' });

  db.get("SELECT IFNULL(MAX(order_index), 0) + 1 as next_order FROM athletes", (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    db.run("INSERT INTO athletes (name, order_index) VALUES (?, ?)", [name, row.next_order], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      broadcastUpdate();
      res.json({ success: true, id: this.lastID });
    });
  });
});

// Admin Remove Athlete
app.delete('/admin/remove-athlete/:id', (req, res) => {
  const { id } = req.params;
  db.run("DELETE FROM athletes WHERE id = ?", [id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    db.run("DELETE FROM scores WHERE athlete_id = ?", [id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      broadcastUpdate();
      res.json({ success: true });
    });
  });
});

// Admin Reset Competition
app.post('/admin/reset', (req, res) => {
  db.run("DELETE FROM athletes", (err) => {
    if (err) return res.status(500).json({ error: err.message });
    db.run("DELETE FROM scores", (err) => {
      if (err) return res.status(500).json({ error: err.message });
      // sqlite_sequence is used by AUTOINCREMENT
      db.run("DELETE FROM sqlite_sequence WHERE name='athletes' OR name='scores'", (err) => {
        broadcastUpdate();
        res.json({ success: true });
      });
    });
  });
});

// Config Settings
app.get('/config', (req, res) => {
    res.json({ numJudges: NUM_JUDGES });
});

// Default to index.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve frontend pages for nice URLs
app.get('/judge', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'judge.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

io.on('connection', (socket) => {
  console.log('A client connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
