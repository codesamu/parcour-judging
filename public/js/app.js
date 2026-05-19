const socket = io();

// --- API Helpers ---
async function fetchAPI(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json'
        }
    };
    if (body) {
        options.body = JSON.stringify(body);
    }
    const res = await fetch(endpoint, options);
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || data.message || 'API request failed');
    }
    return data;
}

// --- Leaderboard Logic ---
function initLeaderboard() {
    const leaderboardListEl = document.getElementById('leaderboard-list');
    const startlistListEl = document.getElementById('startlist-list');
    const noLeaderboardEl = document.getElementById('no-leaderboard-data');
    const noStartlistEl = document.getElementById('no-startlist-data');

    // Tab Switching Logic
    const tabLeaderboard = document.getElementById('tab-leaderboard');
    const tabStartlist = document.getElementById('tab-startlist');
    const tabSplit = document.getElementById('tab-split');
    const contentLeaderboard = document.getElementById('leaderboard-tab-content');
    const contentStartlist = document.getElementById('startlist-tab-content');

    tabLeaderboard.addEventListener('click', () => {
        tabLeaderboard.classList.add('active');
        tabStartlist.classList.remove('active');
        tabSplit.classList.remove('active');
        contentLeaderboard.classList.remove('hidden');
        contentStartlist.classList.add('hidden');
        document.querySelector('main').classList.remove('split-view');
        document.querySelector('.container').classList.remove('split-container');
    });

    tabStartlist.addEventListener('click', () => {
        tabStartlist.classList.add('active');
        tabLeaderboard.classList.remove('active');
        tabSplit.classList.remove('active');
        contentStartlist.classList.remove('hidden');
        contentLeaderboard.classList.add('hidden');
        document.querySelector('main').classList.remove('split-view');
        document.querySelector('.container').classList.remove('split-container');
    });

    tabSplit.addEventListener('click', () => {
        tabSplit.classList.add('active');
        tabLeaderboard.classList.remove('active');
        tabStartlist.classList.remove('active');
        contentLeaderboard.classList.remove('hidden');
        contentStartlist.classList.remove('hidden');
        document.querySelector('main').classList.add('split-view');
        document.querySelector('.container').classList.add('split-container');
    });

    async function loadData() {
        try {
            const data = await fetchAPI('/leaderboard');
            renderLeaderboard(data);
            renderStartlist(data);
        } catch (e) {
            console.error('Failed to load leaderboard data', e);
        }
    }

    function renderLeaderboard(data) {
        leaderboardListEl.innerHTML = '';
        const completed = data.filter(a => a.completed === 1);
        
        if (completed.length === 0) {
            noLeaderboardEl.classList.remove('hidden');
            return;
        }
        noLeaderboardEl.classList.add('hidden');

        completed.forEach((athlete, index) => {
            const item = document.createElement('div');
            item.className = 'leaderboard-item';
            item.innerHTML = `
                <div class="rank">#${index + 1}</div>
                <div class="name">${athlete.name}</div>
                <div class="score">${athlete.total_score} pts</div>
            `;
            leaderboardListEl.appendChild(item);
        });
    }

    function renderStartlist(data) {
        startlistListEl.innerHTML = '';
        if (data.length === 0) {
            noStartlistEl.classList.remove('hidden');
            return;
        }
        noStartlistEl.classList.add('hidden');

        // Sort all athletes by order_index ASC
        const sortedByOrder = [...data].sort((a, b) => a.order_index - b.order_index);

        sortedByOrder.forEach((athlete) => {
            const item = document.createElement('div');
            item.className = 'leaderboard-item';
            
            const statusLabel = athlete.completed 
                ? '<span class="status-badge completed">Finished</span>' 
                : '<span class="status-badge pending">Next Up</span>';

            item.innerHTML = `
                <div class="rank" style="color: var(--accent-color); font-weight: 700; width: 5.5rem;">N° ${athlete.order_index}</div>
                <div class="name">${athlete.name} ${statusLabel}</div>
                <div class="score" style="font-size: 1.1rem; opacity: 0.7;">${athlete.completed ? athlete.total_score + ' pts' : '-'}</div>
            `;
            startlistListEl.appendChild(item);
        });
    }

    loadData();
    socket.on('state-update', loadData);
}

// --- Judge Logic ---
function initJudge() {
    const loginView = document.getElementById('login-view');
    const dashboardView = document.getElementById('dashboard-view');
    
    // Check session
    const judgeStr = sessionStorage.getItem('judge');
    let judge = judgeStr ? JSON.parse(judgeStr) : null;
    let numJudges = 6;

    async function loadConfig() {
        try {
            const cfg = await fetchAPI('/config');
            numJudges = cfg.numJudges;
        } catch(e) {}
    }
    loadConfig();

    if (judge) {
        showDashboard();
    }

    // Login Form
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const pin = document.getElementById('pin').value;
        const errorEl = document.getElementById('login-error');

        try {
            const res = await fetchAPI('/login', 'POST', { username, pin });
            if (res.role === 'judge') {
                judge = { id: res.judgeId, username: res.username };
                sessionStorage.setItem('judge', JSON.stringify(judge));
                showDashboard();
            } else {
                errorEl.textContent = 'Not a judge account';
                errorEl.classList.remove('hidden');
            }
        } catch (e) {
            errorEl.textContent = e.message;
            errorEl.classList.remove('hidden');
        }
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
        sessionStorage.removeItem('judge');
        judge = null;
        dashboardView.classList.add('hidden');
        loginView.classList.remove('hidden');
    });

    function showDashboard() {
        loginView.classList.add('hidden');
        dashboardView.classList.remove('hidden');
        document.getElementById('judge-name-display').textContent = judge.username;
        loadDashboardData();
    }

    async function loadDashboardData() {
        if (!judge) return;

        try {
            const [currentAthlete, allAthletes] = await Promise.all([
                fetchAPI('/current-athlete'),
                fetchAPI('/athletes')
            ]);
            
            renderCurrentAthlete(currentAthlete);
            renderPastAthletes(allAthletes);
        } catch (e) {
            console.error(e);
        }
    }

    async function renderCurrentAthlete(athlete) {
        const nameEl = document.getElementById('athlete-name');
        const inputContainer = document.querySelector('.score-input-container');
        const submitBtn = document.getElementById('submit-score-btn');
        const statusBar = document.getElementById('status-bar');
        const scoreStatus = document.getElementById('score-status');

        if (!athlete) {
            nameEl.textContent = 'No active athlete at the moment.';
            inputContainer.style.display = 'none';
            submitBtn.style.display = 'none';
            statusBar.innerHTML = 'Competition finished or no athletes added.';
            scoreStatus.classList.add('hidden');
            return;
        }

        nameEl.textContent = athlete.name;
        inputContainer.style.display = 'block';
        submitBtn.style.display = 'block';

        const submittedCount = athlete.submittedJudgeIds ? athlete.submittedJudgeIds.length : 0;
        const hasSubmitted = athlete.submittedJudgeIds && athlete.submittedJudgeIds.includes(judge.id);

        statusBar.innerHTML = `Scores submitted: ${submittedCount} / ${numJudges}`;

        if (hasSubmitted) {
            submitBtn.textContent = 'Update Score';
            submitBtn.classList.remove('btn-primary');
            submitBtn.classList.add('btn-secondary');
            submitBtn.disabled = false;
            
            // Try to fetch my current score
            try {
                const myScore = await fetchAPI(`/scores/${athlete.id}/${judge.id}`);
                if (myScore.score !== null && !document.getElementById('score-input').value) {
                    document.getElementById('score-input').value = myScore.score;
                }
            } catch(e) {}
            
            scoreStatus.textContent = 'You have already submitted a score.';
            scoreStatus.classList.remove('hidden');
            scoreStatus.className = 'status-text success';
        } else {
            submitBtn.textContent = 'Submit Score';
            submitBtn.classList.add('btn-primary');
            submitBtn.classList.remove('btn-secondary');
            submitBtn.disabled = false;
            document.getElementById('score-input').value = '';
            scoreStatus.classList.add('hidden');
        }

        submitBtn.onclick = async () => {
            const score = parseInt(document.getElementById('score-input').value, 10);
            if (isNaN(score)) return alert('Please enter a valid score');

            submitBtn.disabled = true;
            try {
                await fetchAPI('/submit-score', 'POST', {
                    athleteId: athlete.id,
                    judgeId: judge.id,
                    score
                });
                document.getElementById('score-input').value = '';
                // The socket update will trigger a reload
            } catch(e) {
                alert(e.message);
                submitBtn.disabled = false;
            }
        };
    }

    async function renderPastAthletes(athletes) {
        const listEl = document.getElementById('athletes-list');
        listEl.innerHTML = '';
        
        // We want to show all athletes so they can edit their scores.
        if (athletes.length === 0) {
            listEl.innerHTML = '<p class="text-sm">No athletes added yet.</p>';
            return;
        }

        // Fetch my scores for all athletes to show what I gave
        // We could make a bulk endpoint, but for simplicity, we'll just show edit buttons and fetch on click.
        for (const athlete of athletes) {
            const item = document.createElement('div');
            item.className = 'athlete-list-item flex-between';
            item.innerHTML = `
                <div>
                    <span class="font-bold">${athlete.name}</span>
                    <span class="status-badge ${athlete.completed ? 'completed' : 'pending'}">${athlete.completed ? 'Completed' : 'Pending'}</span>
                </div>
                <button class="btn-secondary btn-small edit-btn" data-id="${athlete.id}" data-name="${athlete.name}">Edit Score</button>
            `;
            listEl.appendChild(item);
        }

        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const athleteId = e.target.getAttribute('data-id');
                const athleteName = e.target.getAttribute('data-name');
                openEditModal(athleteId, athleteName);
            });
        });
    }

    async function openEditModal(athleteId, athleteName) {
        document.getElementById('edit-athlete-id').value = athleteId;
        document.getElementById('edit-athlete-name').textContent = athleteName;
        document.getElementById('edit-score-input').value = '';
        
        try {
            const myScore = await fetchAPI(`/scores/${athleteId}/${judge.id}`);
            if (myScore.score !== null) {
                document.getElementById('edit-score-input').value = myScore.score;
            }
        } catch(e) {}

        document.getElementById('edit-modal').classList.remove('hidden');
    }

    document.getElementById('cancel-edit-btn').addEventListener('click', () => {
        document.getElementById('edit-modal').classList.add('hidden');
    });

    document.getElementById('save-edit-btn').addEventListener('click', async () => {
        const athleteId = document.getElementById('edit-athlete-id').value;
        const score = parseInt(document.getElementById('edit-score-input').value, 10);
        if (isNaN(score)) return alert('Please enter a valid score');

        try {
            await fetchAPI('/update-score', 'PUT', {
                athleteId,
                judgeId: judge.id,
                score
            });
            document.getElementById('edit-modal').classList.add('hidden');
            // Socket will reload data
        } catch(e) {
            alert(e.message);
        }
    });

    socket.on('state-update', loadDashboardData);
}

// --- Admin Logic ---
function initAdmin() {
    const loginView = document.getElementById('login-view');
    const adminView = document.getElementById('admin-view');

    const adminStr = sessionStorage.getItem('admin');
    if (adminStr === 'true') {
        showAdminView();
    }

    document.getElementById('admin-login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const pin = document.getElementById('admin-pin').value;
        const errorEl = document.getElementById('login-error');

        try {
            const res = await fetchAPI('/login', 'POST', { username: 'admin', pin });
            if (res.role === 'admin') {
                sessionStorage.setItem('admin', 'true');
                showAdminView();
            } else {
                throw new Error('Not admin');
            }
        } catch (e) {
            errorEl.textContent = 'Invalid admin PIN';
            errorEl.classList.remove('hidden');
        }
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
        sessionStorage.removeItem('admin');
        adminView.classList.add('hidden');
        loginView.classList.remove('hidden');
    });

    function showAdminView() {
        loginView.classList.add('hidden');
        adminView.classList.remove('hidden');
        loadDashboardData();
    }

    async function loadDashboardData() {
        await Promise.all([
            loadAthletes(),
            loadJudges()
        ]);
    }

    async function loadAthletes() {
        try {
            const athletes = await fetchAPI('/athletes');
            const listEl = document.getElementById('admin-athletes-list');
            listEl.innerHTML = '';

            if (athletes.length === 0) {
                listEl.innerHTML = '<p class="text-sm">No athletes added yet.</p>';
                return;
            }

            const sortedByOrder = [...athletes].sort((a, b) => a.order_index - b.order_index);

            sortedByOrder.forEach(athlete => {
                const item = document.createElement('div');
                item.className = 'athlete-list-item flex-between';
                item.style.gap = '0.5rem';
                item.innerHTML = `
                    <div class="flex-row flex-grow" style="width: 100%;">
                        <input type="number" class="order-input" value="${athlete.order_index}" style="width: 70px; padding: 0.5rem; text-align: center; border-radius: 10px;" placeholder="No.">
                        <input type="text" class="name-input" value="${athlete.name}" style="padding: 0.5rem; border-radius: 10px;" placeholder="Name" class="flex-grow">
                    </div>
                    <div class="flex-row">
                        <button class="btn-primary btn-small save-athlete-btn" data-id="${athlete.id}">Save</button>
                        <button class="btn-danger btn-small delete-btn" data-id="${athlete.id}">Remove</button>
                    </div>
                `;
                listEl.appendChild(item);
            });

            document.querySelectorAll('.save-athlete-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.target.getAttribute('data-id');
                    const container = e.target.closest('.athlete-list-item');
                    const name = container.querySelector('.name-input').value;
                    const order_index = parseInt(container.querySelector('.order-input').value, 10);
                    if (!name || isNaN(order_index)) return alert('Name and Valid Start Number are required');

                    try {
                        await fetchAPI(`/admin/update-athlete/${id}`, 'PUT', { name, order_index });
                        alert('Athlete updated!');
                    } catch(e) {
                        alert(e.message);
                    }
                });
            });

            document.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.target.getAttribute('data-id');
                    if(confirm('Are you sure you want to remove this athlete?')) {
                        await fetchAPI(`/admin/remove-athlete/${id}`, 'DELETE');
                    }
                });
            });
        } catch(e) {
            console.error(e);
        }
    }

    async function loadJudges() {
        try {
            const judges = await fetchAPI('/admin/judges');
            const listEl = document.getElementById('admin-judges-list');
            listEl.innerHTML = '';

            if (judges.length === 0) {
                listEl.innerHTML = '<p class="text-sm">No judges added yet.</p>';
                return;
            }

            judges.forEach(judge => {
                const item = document.createElement('div');
                item.className = 'athlete-list-item flex-between';
                item.style.gap = '0.5rem';
                item.innerHTML = `
                    <div class="flex-row flex-grow" style="width: 100%;">
                        <input type="text" class="judge-name-input" value="${judge.username}" style="padding: 0.5rem; border-radius: 10px; font-weight: 600;" placeholder="Judge Name" class="flex-grow">
                        <input type="text" class="judge-pin-input" value="${judge.pin}" style="width: 100px; padding: 0.5rem; border-radius: 10px;" placeholder="PIN">
                    </div>
                    <div class="flex-row">
                        <button class="btn-primary btn-small save-judge-btn" data-id="${judge.id}">Save</button>
                        <button class="btn-danger btn-small delete-judge-btn" data-id="${judge.id}">Remove</button>
                    </div>
                `;
                listEl.appendChild(item);
            });

            document.querySelectorAll('.save-judge-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.target.getAttribute('data-id');
                    const container = e.target.closest('.athlete-list-item');
                    const username = container.querySelector('.judge-name-input').value;
                    const pin = container.querySelector('.judge-pin-input').value;
                    if (!username || !pin) return alert('Username and PIN are required');

                    try {
                        await fetchAPI(`/admin/update-judge/${id}`, 'PUT', { username, pin });
                        alert('Judge updated!');
                    } catch(e) {
                        alert(e.message);
                    }
                });
            });

            document.querySelectorAll('.delete-judge-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.target.getAttribute('data-id');
                    if(confirm('Are you sure you want to remove this judge?')) {
                        try {
                            await fetchAPI(`/admin/remove-judge/${id}`, 'DELETE');
                        } catch(e) {
                            alert(e.message);
                        }
                    }
                });
            });
        } catch(e) {
            console.error(e);
        }
    }

    document.getElementById('add-athlete-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('athlete-name-input');
        const name = nameInput.value;
        if (!name) return;

        try {
            await fetchAPI('/admin/add-athlete', 'POST', { name });
            nameInput.value = '';
        } catch(e) {
            alert(e.message);
        }
    });

    document.getElementById('add-judge-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const usernameEl = document.getElementById('judge-username-input');
        const pinEl = document.getElementById('judge-pin-input');
        const username = usernameEl.value;
        const pin = pinEl.value;

        if (!username || !pin) return;

        try {
            await fetchAPI('/admin/add-judge', 'POST', { username, pin });
            usernameEl.value = '';
            pinEl.value = '';
        } catch(e) {
            alert(e.message);
        }
    });

    document.getElementById('reset-competition-btn').addEventListener('click', async () => {
        if(confirm('This will delete all athletes and scores. Are you absolutely sure?')) {
            try {
                await fetchAPI('/admin/reset', 'POST');
            } catch(e) {
                alert(e.message);
            }
        }
    });

    socket.on('state-update', () => {
        if (!adminView.classList.contains('hidden')) {
            loadDashboardData();
        }
    });
}
