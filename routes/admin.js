const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { validate, asyncHandler } = require('../middlewares/validation');
const { validateLicenseKey } = require('../utils/license');

const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
const iconTypes = {
  'image/png': { ext: 'png', magic: (buf) => buf.length >= 8 && buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG' },
  'image/jpeg': { ext: 'jpg', magic: (buf) => buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff },
  'image/gif': { ext: 'gif', magic: (buf) => buf.length >= 6 && (buf.toString('ascii', 0, 6) === 'GIF87a' || buf.toString('ascii', 0, 6) === 'GIF89a') },
  'image/webp': { ext: 'webp', magic: (buf) => buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP' },
  'image/x-icon': { ext: 'ico', magic: (buf) => buf.length >= 4 && buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01 && buf[3] === 0x00 },
  'image/vnd.microsoft.icon': { ext: 'ico', magic: (buf) => buf.length >= 4 && buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01 && buf[3] === 0x00 }
};

// Helper to broadcast state update
const broadcastUpdate = (req) => {
  const io = req.app.get('io');
  if (io) {
    io.emit('state-update');
  }
};

// Global license lockdown middleware for all admin endpoints
const requireLicense = (req, res, next) => {
  // Always allow the license-related flows so admins can activate the app:
  //  - PUT /config with licenseKey/appName/appIconUrl: submit a license key or customize display
  //  - POST /icon: upload a custom page icon
  //  - GET /config: load the admin panel and see license status
  //  - GET /judges: needed by the admin dashboard to render
  if (req.method === 'PUT' && req.path === '/config' && (req.body.hasOwnProperty('licenseKey') || req.body.hasOwnProperty('appName') || req.body.hasOwnProperty('appIconUrl'))) {
    return next();
  }
  if (req.method === 'POST' && req.path === '/icon') {
    return next();
  }
  if (req.method === 'GET' && (req.path === '/config' || req.path === '/judges')) {
    return next();
  }

  const config = db.getConfig();
  const licenseInfo = validateLicenseKey(config.licenseKey);
  if (!licenseInfo.isLicensed) {
    return res.status(402).json({ error: 'License Required. Please activate in the Admin Panel.' });
  }
  next();
};

router.use(requireLicense);

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

// Admin Upload Page Icon
router.post('/icon', asyncHandler((req, res) => {
    const { imageData } = req.body;
    if (!imageData || typeof imageData !== 'string') {
        return res.status(400).json({ error: 'No icon image provided' });
    }

    const match = imageData.match(/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) {
        return res.status(400).json({ error: 'Icon must be uploaded as a base64 data URL' });
    }

    const mimeType = match[1].toLowerCase();
    const type = iconTypes[mimeType];
    if (!type) {
        return res.status(400).json({ error: 'Icon must be a PNG, JPG, GIF, WebP, or ICO image' });
    }

    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > 512 * 1024) {
        return res.status(400).json({ error: 'Icon image must be 512 KB or smaller' });
    }
    if (!type.magic(buffer)) {
        return res.status(400).json({ error: 'Icon image data does not match the selected file type' });
    }

    fs.mkdirSync(uploadsDir, { recursive: true });
    const filename = `page-icon.${type.ext}`;
    const filePath = path.join(uploadsDir, filename);

    for (const ext of ['png', 'jpg', 'gif', 'webp', 'ico']) {
        const oldPath = path.join(uploadsDir, `page-icon.${ext}`);
        if (oldPath !== filePath && fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath);
        }
    }

    fs.writeFileSync(filePath, buffer);
    const appIconUrl = `/uploads/${filename}?v=${Date.now()}`;
    db.updateConfig({ appIconUrl });
    broadcastUpdate(req);
    res.json({ success: true, appIconUrl });
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
    if (req.body.hasOwnProperty('appName')) {
        const appName = String(req.body.appName || '').trim();
        if (!appName) {
            return res.status(400).json({ error: 'App name cannot be empty' });
        }
        if (appName.length > 80) {
            return res.status(400).json({ error: 'App name must be 80 characters or less' });
        }
        update.appName = appName;
    }
    if (req.body.hasOwnProperty('appIconUrl')) {
        const appIconUrl = String(req.body.appIconUrl || '').trim();
        if (appIconUrl && appIconUrl !== '/favicon.ico' && !appIconUrl.startsWith('/uploads/page-icon.')) {
            return res.status(400).json({ error: 'Invalid app icon URL' });
        }
        update.appIconUrl = appIconUrl || '/favicon.ico';
    }
    if (req.body.hasOwnProperty('licenseKey')) {
        const key = req.body.licenseKey;
        if (key && key.trim() !== '') {
            const licenseInfo = validateLicenseKey(key);
            if (!licenseInfo.isLicensed) {
                return res.status(400).json({ error: licenseInfo.error || 'Invalid license key' });
            }
        }
        update.licenseKey = key;
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

router.get('/database', asyncHandler((req, res) => {
  res.json(db.getDatabaseSnapshot());
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
