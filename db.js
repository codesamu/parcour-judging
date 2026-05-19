const fs = require('fs');
const path = require('path');

const dbDir = path.join(__dirname, 'db');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir);
}
const dbPath = path.join(dbDir, 'database.json');

let data = {
  judges: [
    { id: 1, username: 'Judge1', pin: '1111' },
    { id: 2, username: 'Judge2', pin: '2222' },
    { id: 3, username: 'Judge3', pin: '3333' },
    { id: 4, username: 'Judge4', pin: '4444' },
    { id: 5, username: 'Judge5', pin: '5555' },
    { id: 6, username: 'Judge6', pin: '6666' }
  ],
  athletes: [],
  scores: [],
  nextJudgeId: 7,
  nextAthleteId: 1,
  nextScoreId: 1
};

function load() {
  if (fs.existsSync(dbPath)) {
    try {
      data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      // Ensure arrays and IDs exist
      data.judges = data.judges || [];
      data.athletes = data.athletes || [];
      data.scores = data.scores || [];
      data.nextJudgeId = data.nextJudgeId || (Math.max(...data.judges.map(j => j.id), 0) + 1);
      data.nextAthleteId = data.nextAthleteId || (Math.max(...data.athletes.map(a => a.id), 0) + 1);
      data.nextScoreId = data.nextScoreId || (Math.max(...data.scores.map(s => s.id), 0) + 1);
    } catch (e) {
      console.error("Failed to load database.json, resetting to default", e);
      save();
    }
  } else {
    // Initial Seed of Dummy Athletes on fresh start
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
    
    dummyAthletes.forEach(athlete => {
      const id = data.nextAthleteId++;
      data.athletes.push({ id, name: athlete.name, order_index: athlete.order, completed: athlete.completed });
      
      if (athlete.completed && athlete.scores && athlete.scores.length > 0) {
        data.judges.forEach((judge, idx) => {
          const score = athlete.scores[idx % athlete.scores.length];
          data.scores.push({
            id: data.nextScoreId++,
            athlete_id: id,
            judge_id: judge.id,
            score: parseInt(score, 10)
          });
        });
      }
    });
    save();
  }
}

function save() {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
}

// Initial Load
load();

module.exports = {
  getJudges: () => data.judges,
  
  getJudge: (id) => data.judges.find(j => j.id === parseInt(id, 10)),
  
  getJudgeByLogin: (username, pin) => data.judges.find(j => j.username.toLowerCase() === username.toLowerCase() && j.pin === pin),
  
  addJudge: (username, pin) => {
    const id = data.nextJudgeId++;
    data.judges.push({ id, username, pin });
    save();
    return id;
  },
  
  removeJudge: (id) => {
    const judgeId = parseInt(id, 10);
    data.judges = data.judges.filter(j => j.id !== judgeId);
    data.scores = data.scores.filter(s => s.judge_id !== judgeId);
    save();
  },
  
  updateJudge: (id, username, pin) => {
    const judgeId = parseInt(id, 10);
    const judge = data.judges.find(j => j.id === judgeId);
    if (judge) {
      judge.username = username;
      judge.pin = pin;
      save();
    }
  },
  
  getAthletes: () => data.athletes,
  
  getAthlete: (id) => data.athletes.find(a => a.id === parseInt(id, 10)),
  
  addAthlete: (name) => {
    const id = data.nextAthleteId++;
    const nextOrder = Math.max(...data.athletes.map(a => a.order_index), 0) + 1;
    data.athletes.push({ id, name, order_index: nextOrder, completed: 0 });
    save();
    return id;
  },
  
  removeAthlete: (id) => {
    const athleteId = parseInt(id, 10);
    data.athletes = data.athletes.filter(a => a.id !== athleteId);
    data.scores = data.scores.filter(s => s.athlete_id !== athleteId);
    save();
  },
  
  updateAthlete: (id, name, order_index) => {
    const athleteId = parseInt(id, 10);
    const athlete = data.athletes.find(a => a.id === athleteId);
    if (athlete) {
      athlete.name = name;
      athlete.order_index = parseInt(order_index, 10);
      save();
    }
  },
  
  submitScore: (athleteId, judgeId, score) => {
    const aId = parseInt(athleteId, 10);
    const jId = parseInt(judgeId, 10);
    const sVal = parseInt(score, 10);
    
    let scoreObj = data.scores.find(s => s.athlete_id === aId && s.judge_id === jId);
    if (scoreObj) {
      scoreObj.score = sVal;
    } else {
      scoreObj = { id: data.nextScoreId++, athlete_id: aId, judge_id: jId, score: sVal };
      data.scores.push(scoreObj);
    }
    
    // Check completion
    const athleteScores = data.scores.filter(s => s.athlete_id === aId);
    const judgeCount = data.judges.length;
    
    const athlete = data.athletes.find(a => a.id === aId);
    if (athlete) {
      if (athleteScores.length >= judgeCount && judgeCount > 0) {
        athlete.completed = 1;
      }
    }
    
    save();
  },
  
  getScore: (athleteId, judgeId) => {
    return data.scores.find(s => s.athlete_id === parseInt(athleteId, 10) && s.judge_id === parseInt(judgeId, 10));
  },
  
  getScoresForAthlete: (athleteId) => {
    return data.scores.filter(s => s.athlete_id === parseInt(athleteId, 10));
  },
  
  getLeaderboard: () => {
    return data.athletes.map(a => {
      const athleteScores = data.scores.filter(s => s.athlete_id === a.id);
      const totalScore = athleteScores.reduce((sum, s) => sum + s.score, 0);
      return {
        id: a.id,
        name: a.name,
        order_index: a.order_index,
        completed: a.completed,
        total_score: totalScore,
        score_count: athleteScores.length
      };
    }).sort((a, b) => b.total_score - a.total_score || a.id - b.id);
  },
  
  resetCompetition: (dummyAthletesList) => {
    data.athletes = [];
    data.scores = [];
    data.nextAthleteId = 1;
    data.nextScoreId = 1;
    
    if (dummyAthletesList && dummyAthletesList.length > 0) {
      dummyAthletesList.forEach(athlete => {
        const id = data.nextAthleteId++;
        data.athletes.push({ id, name: athlete.name, order_index: athlete.order, completed: athlete.completed });
        
        if (athlete.completed && athlete.scores && athlete.scores.length > 0) {
          data.judges.forEach((judge, idx) => {
            const score = athlete.scores[idx % athlete.scores.length];
            data.scores.push({
              id: data.nextScoreId++,
              athlete_id: id,
              judge_id: judge.id,
              score: parseInt(score, 10)
            });
          });
        }
      });
    }
    save();
  }
};
