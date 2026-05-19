const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const db = require('./db');

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

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

  const judge = db.getJudgeByLogin(username, pin);
  if (judge) {
    return res.json({ success: true, role: 'judge', id: judge.id, username: judge.username });
  }

  res.status(401).json({ error: 'Invalid username or PIN' });
});

// Get Current Athlete (Pending / Active)
app.get('/current-athlete', (req, res) => {
  const athletes = db.getAthletes();
  const active = athletes.find(a => a.completed === 0);
  
  if (!active) {
    return res.json({ message: 'No active athletes' });
  }

  // Get submitted judge IDs for this athlete
  const scores = db.getScoresForAthlete(active.id);
  const submittedJudgeIds = scores.map(s => s.judge_id);
  res.json({ ...active, submittedJudgeIds });
});

// Submit/Update Score
const handleScoreSubmit = (req, res) => {
  const { athleteId, judgeId, score } = req.body;
  
  if (score === undefined || score === null || isNaN(score)) {
    return res.status(400).json({ error: 'Invalid score' });
  }

  db.submitScore(athleteId, judgeId, score);
  broadcastUpdate();
  res.json({ success: true });
};

app.post('/submit-score', handleScoreSubmit);
app.put('/update-score', handleScoreSubmit);

// Get My Score for specific athlete
app.get('/scores/:athleteId/:judgeId', (req, res) => {
    const { athleteId, judgeId } = req.params;
    const scoreObj = db.getScore(athleteId, judgeId);
    res.json(scoreObj || { score: null });
});

// Get Leaderboard (calculated dynamically)
app.get('/leaderboard', (req, res) => {
  const leaderboard = db.getLeaderboard();
  res.json(leaderboard);
});

// Get all athletes (for admin and judge past athletes view)
app.get('/athletes', (req, res) => {
  const athletes = db.getAthletes();
  const sorted = [...athletes].sort((a,b) => a.order_index - b.order_index);
  res.json(sorted);
});

// Admin Add Athlete
app.post('/admin/add-athlete', (req, res) => {
  const { name } = req.body;
  if (!name || name.trim() === '') return res.status(400).json({ error: 'Name required' });

  const id = db.addAthlete(name);
  broadcastUpdate();
  res.json({ success: true, id });
});

// Admin Remove Athlete
app.delete('/admin/remove-athlete/:id', (req, res) => {
  const { id } = req.params;
  db.removeAthlete(id);
  broadcastUpdate();
  res.json({ success: true });
});

// Admin Reset Competition
app.post('/admin/reset', (req, res) => {
  const dummyAthletes = [
    { name: 'Sarah Maier', order: 1, completed: 1, scores: [95, 92, 94, 96, 93, 95] },
    { name: 'Johannes Brandl', order: 2, completed: 1, scores: [85, 90, 88, 92, 89, 87] },
    { name: 'Maximilian Fuchs', order: 3, completed: 1, scores: [78, 82, 80, 85, 79, 81] },
    { name: 'Elena Wagner', order: 4, completed: 1, scores: [88, 86, 89, 90, 87, 85] },
    { name: 'Lukas Pichler', order: 5, completed: 1, scores: [72, 75, 74, 76, 73, 71] },
    { name: 'Anna Steiner', order: 6, completed: 1, scores: [91, 89, 93, 92, 90, 94] },
    { name: 'David Hofer', order: 7, completed: 0, scores: [] },
    { name: 'Julia Gruber', order: 8, completed: 0, scores: [] },
    { name: 'Felix Berger', order: 9, completed: 0, scores: [] },
    { name: 'Lisa Moser', order: 10, completed: 0, scores: [] }
  ];

  db.resetCompetition(dummyAthletes);
  broadcastUpdate();
  res.json({ success: true });
});

// Config Settings
app.get('/config', (req, res) => {
    const judges = db.getJudges();
    res.json({ numJudges: judges.length });
});

// Admin Manage Judges Endpoints
app.get('/admin/judges', (req, res) => {
  res.json(db.getJudges());
});

app.post('/admin/add-judge', (req, res) => {
  const { username, pin } = req.body;
  if (!username || !pin) return res.status(400).json({ error: 'Username and PIN required' });
  const id = db.addJudge(username, pin);
  broadcastUpdate();
  res.json({ success: true, id });
});

app.delete('/admin/remove-judge/:id', (req, res) => {
  const { id } = req.params;
  db.removeJudge(id);
  broadcastUpdate();
  res.json({ success: true });
});

// Admin Update Athlete Endpoint (Update name and/or order_index)
app.put('/admin/update-athlete/:id', (req, res) => {
  const { id } = req.params;
  const { name, order_index } = req.body;
  db.updateAthlete(id, name, order_index);
  broadcastUpdate();
  res.json({ success: true });
});

// Admin Update Judge Endpoint (Update name and pin)
app.put('/admin/update-judge/:id', (req, res) => {
  const { id } = req.params;
  const { username, pin } = req.body;
  db.updateJudge(id, username, pin);
  broadcastUpdate();
  res.json({ success: true });
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
