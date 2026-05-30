const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, 'db');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir);
}
const dbPath = path.join(dbDir, 'database.sqlite');
const db = new Database(dbPath);

// Initialize tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS judges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    pin TEXT
  );
  CREATE TABLE IF NOT EXISTS athletes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    order_index INTEGER,
    completed BOOLEAN DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    athlete_id INTEGER,
    judge_id INTEGER,
    score INTEGER,
    UNIQUE(athlete_id, judge_id)
  );
  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Insert default config if empty
const configCount = db.prepare('SELECT COUNT(*) as count FROM config').get();
if (configCount.count === 0) {
  db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run('tvScrollMode', 'continuous');
  db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run('scoringFormula', 'sum');
  db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run('appName', 'LineScore');
  db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run('appIconUrl', '/favicon.ico');
}
// Ensure scoringFormula config exists (migration for existing databases)
const hasScoringFormula = db.prepare("SELECT COUNT(*) as count FROM config WHERE key = 'scoringFormula'").get();
if (hasScoringFormula.count === 0) {
  db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run('scoringFormula', 'sum');
}
// Ensure appName config exists (migration for existing databases)
const hasAppName = db.prepare("SELECT COUNT(*) as count FROM config WHERE key = 'appName'").get();
if (hasAppName.count === 0) {
  db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run('appName', 'LineScore');
}
// Ensure appIconUrl config exists (migration for existing databases)
const hasAppIconUrl = db.prepare("SELECT COUNT(*) as count FROM config WHERE key = 'appIconUrl'").get();
if (hasAppIconUrl.count === 0) {
  db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run('appIconUrl', '/favicon.ico');
}

// Migrate data from database.json if sqlite is empty and json exists
const jsonPath = path.join(dbDir, 'database.json');
if (fs.existsSync(jsonPath)) {
  const judgesCount = db.prepare('SELECT COUNT(*) as count FROM judges').get().count;
  const athletesCount = db.prepare('SELECT COUNT(*) as count FROM athletes').get().count;
  
  if (judgesCount === 0 && athletesCount === 0) {
    console.log('Migrating data from database.json to database.sqlite...');
    try {
      const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      db.transaction(() => {
        if (data.judges) {
          const insertJudge = db.prepare('INSERT INTO judges (id, username, pin) VALUES (?, ?, ?)');
          data.judges.forEach(j => insertJudge.run(j.id, j.username, j.pin));
        }
        if (data.athletes) {
          const insertAthlete = db.prepare('INSERT INTO athletes (id, name, order_index, completed) VALUES (?, ?, ?, ?)');
          data.athletes.forEach(a => insertAthlete.run(a.id, a.name, a.order_index, a.completed || 0));
        }
        if (data.scores) {
          const insertScore = db.prepare('INSERT INTO scores (id, athlete_id, judge_id, score) VALUES (?, ?, ?, ?)');
          data.scores.forEach(s => insertScore.run(s.id, s.athlete_id, s.judge_id, s.score));
        }
        if (data.config) {
          const insertConfig = db.prepare('INSERT INTO config (key, value) VALUES (?, ?)');
          for (const [key, value] of Object.entries(data.config)) {
            insertConfig.run(key, value);
          }
        }
      })();
      console.log('Migration complete. You can now delete database.json if you wish.');
    } catch (e) {
      console.error('Failed to migrate database.json', e);
    }
  }
}

module.exports = {
  getJudges: () => db.prepare('SELECT * FROM judges').all(),

  getJudge: (id) => db.prepare('SELECT * FROM judges WHERE id = ?').get(parseInt(id, 10)),

  getJudgeByLogin: (username, pin) => db.prepare('SELECT * FROM judges WHERE LOWER(username) = LOWER(?) AND pin = ?').get(username, pin),

  addJudge: (username, pin) => {
    const info = db.prepare('INSERT INTO judges (username, pin) VALUES (?, ?)').run(username, pin);
    return info.lastInsertRowid;
  },

  removeJudge: (id) => {
    const judgeId = parseInt(id, 10);
    db.prepare('DELETE FROM judges WHERE id = ?').run(judgeId);
    db.prepare('DELETE FROM scores WHERE judge_id = ?').run(judgeId);
  },

  updateJudge: (id, username, pin) => {
    db.prepare('UPDATE judges SET username = ?, pin = ? WHERE id = ?').run(username, pin, parseInt(id, 10));
  },

  getAthletes: () => {
    const athletes = db.prepare('SELECT * FROM athletes ORDER BY order_index ASC').all();
    const updateOrder = db.prepare('UPDATE athletes SET order_index = ? WHERE id = ?');
    db.transaction(() => {
      athletes.forEach((athlete, index) => {
        const newOrder = index + 1;
        if (athlete.order_index !== newOrder) {
          updateOrder.run(newOrder, athlete.id);
          athlete.order_index = newOrder;
        }
      });
    })();
    return athletes;
  },

  getAthlete: (id) => db.prepare('SELECT * FROM athletes WHERE id = ?').get(parseInt(id, 10)),

  addAthlete: (name) => {
    const maxOrderRow = db.prepare('SELECT MAX(order_index) as maxOrder FROM athletes').get();
    const nextOrder = (maxOrderRow.maxOrder || 0) + 1;
    const info = db.prepare('INSERT INTO athletes (name, order_index, completed) VALUES (?, ?, 0)').run(name, nextOrder);
    return info.lastInsertRowid;
  },

  removeAthlete: (id) => {
    const athleteId = parseInt(id, 10);
    db.transaction(() => {
      db.prepare('DELETE FROM athletes WHERE id = ?').run(athleteId);
      db.prepare('DELETE FROM scores WHERE athlete_id = ?').run(athleteId);
      
      const athletes = db.prepare('SELECT id FROM athletes ORDER BY order_index ASC').all();
      const updateOrder = db.prepare('UPDATE athletes SET order_index = ? WHERE id = ?');
      athletes.forEach((a, idx) => {
        updateOrder.run(idx + 1, a.id);
      });
    })();
  },

  updateAthlete: (id, name, order_index) => {
    db.prepare('UPDATE athletes SET name = ?, order_index = ? WHERE id = ?').run(name, parseInt(order_index, 10), parseInt(id, 10));
  },

  reorderAthletes: (orders) => {
    db.transaction(() => {
      const updateOrder = db.prepare('UPDATE athletes SET order_index = ? WHERE id = ?');
      orders.forEach(item => {
        updateOrder.run(parseInt(item.order_index, 10), parseInt(item.id, 10));
      });
      
      const athletes = db.prepare('SELECT id FROM athletes ORDER BY order_index ASC').all();
      athletes.forEach((a, idx) => {
        updateOrder.run(idx + 1, a.id);
      });
    })();
  },

  submitScore: (athleteId, judgeId, score) => {
    const aId = parseInt(athleteId, 10);
    const jId = parseInt(judgeId, 10);
    const sVal = parseInt(score, 10);

    if (isNaN(aId) || isNaN(jId) || isNaN(sVal)) {
      throw new Error(`Invalid score submission: athleteId=${athleteId}, judgeId=${judgeId}, score=${score}`);
    }

    db.transaction(() => {
      db.prepare(`
        INSERT INTO scores (athlete_id, judge_id, score) 
        VALUES (?, ?, ?) 
        ON CONFLICT(athlete_id, judge_id) 
        DO UPDATE SET score = excluded.score
      `).run(aId, jId, sVal);

      // Check completion
      const athleteScoresCount = db.prepare('SELECT COUNT(*) as count FROM scores WHERE athlete_id = ?').get(aId).count;
      const judgeCount = db.prepare('SELECT COUNT(*) as count FROM judges').get().count;

      if (athleteScoresCount >= judgeCount && judgeCount > 0) {
        db.prepare('UPDATE athletes SET completed = 1 WHERE id = ?').run(aId);
      }
    })();
  },

  getScore: (athleteId, judgeId) => {
    return db.prepare('SELECT * FROM scores WHERE athlete_id = ? AND judge_id = ?').get(parseInt(athleteId, 10), parseInt(judgeId, 10));
  },

  getScoresForAthlete: (athleteId) => {
    return db.prepare('SELECT * FROM scores WHERE athlete_id = ?').all(parseInt(athleteId, 10));
  },

  getDatabaseSnapshot: () => {
    const athletes = db.prepare('SELECT * FROM athletes ORDER BY order_index ASC, id ASC').all();
    const judges = db.prepare('SELECT * FROM judges ORDER BY id ASC').all();
    const scores = db.prepare(`
      SELECT
        scores.id,
        scores.athlete_id,
        athletes.name AS athlete_name,
        scores.judge_id,
        judges.username AS judge_name,
        scores.score
      FROM scores
      LEFT JOIN athletes ON athletes.id = scores.athlete_id
      LEFT JOIN judges ON judges.id = scores.judge_id
      ORDER BY athletes.order_index ASC, athletes.id ASC, judges.id ASC
    `).all();

    const scoreLookup = new Map(scores.map(score => [`${score.athlete_id}:${score.judge_id}`, score.score]));
    const matrix = athletes.map(athlete => ({
      athlete_id: athlete.id,
      athlete_name: athlete.name,
      order_index: athlete.order_index,
      completed: athlete.completed,
      scores: judges.map(judge => ({
        judge_id: judge.id,
        judge_name: judge.username,
        score: scoreLookup.has(`${athlete.id}:${judge.id}`) ? scoreLookup.get(`${athlete.id}:${judge.id}`) : null
      }))
    }));

    return { athletes, judges, scores, matrix };
  },

  getLeaderboard: () => {
    const config = module.exports.getConfig();
    const formula = config.scoringFormula || 'sum';

    // Get raw data: all athletes with their individual scores
    const athletes = db.prepare('SELECT * FROM athletes ORDER BY order_index ASC').all();
    const allScores = db.prepare('SELECT * FROM scores').all();

    const result = athletes.map(athlete => {
      const scores = allScores.filter(s => s.athlete_id === athlete.id).map(s => s.score);
      let total_score = 0;

      if (scores.length > 0) {
        switch (formula) {
          case 'average': {
            const sum = scores.reduce((a, b) => a + b, 0);
            total_score = Math.round(sum / scores.length);
            break;
          }
          case 'drop-lowest': {
            if (scores.length > 1) {
              const sorted = [...scores].sort((a, b) => a - b);
              sorted.shift(); // remove lowest
              total_score = sorted.reduce((a, b) => a + b, 0);
            } else {
              total_score = scores[0];
            }
            break;
          }
          case 'drop-highest': {
            if (scores.length > 1) {
              const sorted = [...scores].sort((a, b) => a - b);
              sorted.pop(); // remove highest
              total_score = sorted.reduce((a, b) => a + b, 0);
            } else {
              total_score = scores[0];
            }
            break;
          }
          case 'sum':
          default: {
            total_score = scores.reduce((a, b) => a + b, 0);
            break;
          }
        }
      }

      return {
        id: athlete.id,
        name: athlete.name,
        order_index: athlete.order_index,
        completed: athlete.completed,
        total_score,
        score_count: scores.length
      };
    });

    // Sort by total_score descending, then by id ascending
    result.sort((a, b) => b.total_score - a.total_score || a.id - b.id);
    return result;
  },

  resetCompetition: (dummyAthletesList) => {
    db.transaction(() => {
      db.prepare('DELETE FROM athletes').run();
      db.prepare('DELETE FROM scores').run();
      db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('athletes', 'scores')").run();

      if (dummyAthletesList && dummyAthletesList.length > 0) {
        const insertAthlete = db.prepare('INSERT INTO athletes (name, order_index, completed) VALUES (?, ?, ?)');
        const insertScore = db.prepare('INSERT INTO scores (athlete_id, judge_id, score) VALUES (?, ?, ?)');
        const judges = db.prepare('SELECT id FROM judges').all();
        
        dummyAthletesList.forEach(athlete => {
          const info = insertAthlete.run(athlete.name, athlete.order, athlete.completed);
          const aId = info.lastInsertRowid;
          
          if (athlete.completed && athlete.scores && athlete.scores.length > 0) {
            judges.forEach((judge, idx) => {
              const score = athlete.scores[idx % athlete.scores.length];
              insertScore.run(aId, judge.id, parseInt(score, 10));
            });
          }
        });
      }
    })();
  },

  loadPreset: () => {
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
    module.exports.resetCompetition(dummyAthletes);
  },

  getConfig: () => {
    const rows = db.prepare('SELECT key, value FROM config').all();
    const config = {};
    rows.forEach(r => { config[r.key] = r.value; });
    return Object.keys(config).length > 0 ? config : { tvScrollMode: 'continuous', scoringFormula: 'sum', appName: 'LineScore', appIconUrl: '/favicon.ico' };
  },

  updateConfig: (newConfig) => {
    db.transaction(() => {
      const updateStmt = db.prepare('INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
      for (const [key, value] of Object.entries(newConfig)) {
        updateStmt.run(key, value);
      }
    })();
  }
};
