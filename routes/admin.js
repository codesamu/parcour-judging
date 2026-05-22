const express = require('express');
const router = express.Router();
const db = require('../db');
const { validate, asyncHandler } = require('../middlewares/validation');

// Helper to broadcast state update
const broadcastUpdate = (req) => {
  const io = req.app.get('io');
  if (io) {
    io.emit('state-update');
  }
};

// Admin Add Athlete
router.post('/add-athlete', validate({
  body: {
    name: { required: true }
  }
}), asyncHandler((req, res) => {
  const { name } = req.body;
  const id = db.addAthlete(name);
  broadcastUpdate(req);
  res.json({ success: true, id });
}));

// Admin Remove Athlete
router.delete('/remove-athlete/:id', validate({
  params: {
    id: { required: true, type: 'number' }
  }
}), asyncHandler((req, res) => {
  const { id } = req.params;
  db.removeAthlete(id);
  broadcastUpdate(req);
  res.json({ success: true });
}));

// Admin Reorder Athletes Bulk
router.put('/reorder-athletes', validate({
  body: {
    orders: { required: true, type: 'array' }
  }
}), asyncHandler((req, res) => {
  const { orders } = req.body;
  db.reorderAthletes(orders);
  broadcastUpdate(req);
  res.json({ success: true });
}));

// Admin Reset Competition
router.post('/reset', asyncHandler((req, res) => {
  db.resetCompetition(); // Clears completely
  broadcastUpdate(req);
  res.json({ success: true });
}));

// Admin Load Preset
router.post('/load-preset', asyncHandler((req, res) => {
  db.loadPreset();
  broadcastUpdate(req);
  res.json({ success: true });
}));

// Admin Update Config
router.put('/config', asyncHandler((req, res) => {
    const update = {};
    if (req.body.tvScrollMode) {
        const validModes = ['continuous', 'active'];
        if (!validModes.includes(req.body.tvScrollMode)) {
            return res.status(400).json({ error: 'Invalid tvScrollMode' });
        }
        update.tvScrollMode = req.body.tvScrollMode;
    }
    if (req.body.scoringFormula) {
        const validFormulas = ['sum', 'average', 'drop-lowest', 'drop-highest'];
        if (!validFormulas.includes(req.body.scoringFormula)) {
            return res.status(400).json({ error: 'Invalid scoringFormula' });
        }
        update.scoringFormula = req.body.scoringFormula;
    }
    if (Object.keys(update).length === 0) {
        return res.status(400).json({ error: 'No valid config fields provided' });
    }
    db.updateConfig(update);
    broadcastUpdate(req);
    res.json({ success: true });
}));

// Admin Manage Judges Endpoints
router.get('/judges', asyncHandler((req, res) => {
  res.json(db.getJudges());
}));

router.post('/add-judge', validate({
  body: {
    username: { required: true },
    pin: { required: true }
  }
}), asyncHandler((req, res) => {
  const { username, pin } = req.body;
  const id = db.addJudge(username, pin);
  broadcastUpdate(req);
  res.json({ success: true, id });
}));

router.delete('/remove-judge/:id', validate({
  params: {
    id: { required: true, type: 'number' }
  }
}), asyncHandler((req, res) => {
  const { id } = req.params;
  db.removeJudge(id);
  broadcastUpdate(req);
  res.json({ success: true });
}));

// Admin Update Athlete Endpoint (Update name and/or order_index)
router.put('/update-athlete/:id', validate({
  params: {
    id: { required: true, type: 'number' }
  },
  body: {
    name: { required: true },
    order_index: { required: true, type: 'number' }
  }
}), asyncHandler((req, res) => {
  const { id } = req.params;
  const { name, order_index } = req.body;
  db.updateAthlete(id, name, order_index);
  broadcastUpdate(req);
  res.json({ success: true });
}));

// Admin Update Judge Endpoint (Update name and pin)
router.put('/update-judge/:id', validate({
  params: {
    id: { required: true, type: 'number' }
  },
  body: {
    username: { required: true },
    pin: { required: true }
  }
}), asyncHandler((req, res) => {
  const { id } = req.params;
  const { username, pin } = req.body;
  db.updateJudge(id, username, pin);
  broadcastUpdate(req);
  res.json({ success: true });
}));

module.exports = router;
