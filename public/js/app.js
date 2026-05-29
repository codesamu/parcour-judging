const socket = io({
    transports: ['websocket', 'polling'],
    upgrade: true
});

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
    let data;
    try {
        data = await res.json();
    } catch(e) {
        throw new Error(`Server returned an invalid response (${res.status}). Please try restarting your server process (e.g., node server.js) to apply backend updates!`);
    }
    if (!res.ok) {
        throw new Error(data.error || data.message || 'API request failed');
    }
    return data;
}

// --- Global Branding Visibility ---
function applyBrandingVisibility(isLicensed) {
    document.querySelectorAll('.made-by-branding').forEach(el => {
        if (isLicensed) {
            el.classList.add('hidden');
        } else {
            el.classList.remove('hidden');
        }
    });
}

function applyAppName(appName) {
    const name = (appName || 'LineScore').trim() || 'LineScore';
    document.querySelectorAll('[data-app-name]').forEach(el => {
        el.textContent = name;
    });

    if (document.body.classList.contains('leaderboard-page')) {
        document.title = name;
    }
}

function applyAppIcon(appIconUrl) {
    const iconUrl = (appIconUrl || '/favicon.ico').trim() || '/favicon.ico';
    let iconLink = document.querySelector('link[rel="icon"]');
    if (!iconLink) {
        iconLink = document.createElement('link');
        iconLink.rel = 'icon';
        document.head.appendChild(iconLink);
    }

    const urlWithoutQuery = iconUrl.split('?')[0];
    const isIco = urlWithoutQuery.endsWith('.ico');
    iconLink.type = isIco ? 'image/x-icon' : '';
    iconLink.href = iconUrl;

    const preview = document.getElementById('app-icon-preview');
    if (preview) {
        preview.src = iconUrl;
    }
}

function showLicenseLockOverlay() {
    if (document.getElementById('license-lock-overlay')) return;
    
    const overlay = document.createElement('div');
    overlay.id = 'license-lock-overlay';
    overlay.className = 'license-lock-overlay';
    overlay.innerHTML = `
        <div class="lock-card card">
            <span class="lock-icon">🔒</span>
            <h2>Commercial License Required</h2>
            <p style="margin-bottom: 1.5rem; color: var(--text-secondary); font-size: 0.95rem; line-height: 1.6;">
                An active commercial license is required to run this application. The system has been locked.
            </p>
            <div class="flex-row" style="justify-content: center; gap: 1rem; flex-wrap: wrap;">
                <a href="/admin" class="btn-primary btn-small">Admin Panel</a>
                <a href="mailto:[Email Address]" class="btn-secondary btn-small">Request License</a>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

async function checkBranding() {
    try {
        const cfg = await fetchAPI('/config');
        applyBrandingVisibility(cfg.isLicensed);
        applyAppName(cfg.appName);
        applyAppIcon(cfg.appIconUrl);
        return cfg;
    } catch(e) {
        console.error('Failed to check branding', e);
    }
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

    // TV Mode Controller & Dynamic State
    const tvModeBtn = document.getElementById('tv-mode-btn');
    const exitTvBtn = document.getElementById('exit-tv-btn');
    const tabContainer = document.querySelector('.tabs');
    const footer = document.querySelector('footer');
    let tvButtonTimeout = null;

    let completedAthletesCache = new Map();
    let firstLoadCompleted = false;
    let tvScrollRAF = null;
    let currentScrollY = 0;
    let scrollDirection = 1; // 1 = down, -1 = up
    let isScrollPaused = false;
    let lastFrameTime = 0;

    function animateTVScroll(timestamp) {
        if (!tvScrollRAF) return;

        const startlistContainer = document.getElementById('startlist-tab-content');
        const startlistList = document.getElementById('startlist-list');

        if (startlistContainer && startlistList && !isScrollPaused) {
            const maxScroll = startlistList.offsetHeight - startlistContainer.clientHeight;
            
            if (maxScroll > 0) {
                if (!lastFrameTime) lastFrameTime = timestamp;
                const delta = Math.min(timestamp - lastFrameTime, 100);
                lastFrameTime = timestamp;

                const speed = 0.025; // 25 subpixels per second, extremely smooth
                currentScrollY += scrollDirection * speed * delta;

                if (currentScrollY > maxScroll) currentScrollY = maxScroll;
                if (currentScrollY < 0) currentScrollY = 0;

                startlistList.style.transform = `translate3d(0, ${-currentScrollY}px, 0)`;
                startlistList.style.transition = 'transform 0.08s linear';

                if (scrollDirection === 1 && currentScrollY >= maxScroll) {
                    isScrollPaused = true;
                    setTimeout(() => {
                        scrollDirection = -1;
                        isScrollPaused = false;
                    }, 2000); // 2 sec pause at bottom
                } else if (scrollDirection === -1 && currentScrollY <= 0) {
                    isScrollPaused = true;
                    setTimeout(() => {
                        scrollDirection = 1;
                        isScrollPaused = false;
                    }, 2000); // 2 sec pause at top
                }
            } else {
                startlistList.style.transform = '';
            }
        } else {
            lastFrameTime = timestamp;
        }

        tvScrollRAF = requestAnimationFrame(animateTVScroll);
    }

    function startTVScrolling() {
        stopTVScrolling();
        const startlistList = document.getElementById('startlist-list');
        if (startlistList) {
            startlistList.style.transform = 'translate3d(0, 0, 0)';
        }
        currentScrollY = 0;
        scrollDirection = 1;
        isScrollPaused = false;
        lastFrameTime = 0;
        tvScrollRAF = requestAnimationFrame(animateTVScroll);
    }

    function stopTVScrolling() {
        if (tvScrollRAF) {
            cancelAnimationFrame(tvScrollRAF);
            tvScrollRAF = null;
        }
        const startlistList = document.getElementById('startlist-list');
        if (startlistList) {
            startlistList.style.transform = '';
            startlistList.style.transition = '';
        }
    }

    function triggerTVAnnouncement(name, score, rank, titleText = "Run Completed!") {
        let popup = document.getElementById('tv-announcement-popup');
        if (!popup) {
            popup = document.createElement('div');
            popup.id = 'tv-announcement-popup';
            popup.className = 'tv-popup';
            document.body.appendChild(popup);
        }

        let rankBadge = '';
        if (rank === 1) rankBadge = '<div class="badge" style="background: #fbbf24; color: #78350f;">🏆 1st PLACE</div>';
        else if (rank === 2) rankBadge = '<div class="badge" style="background: #d1d5db; color: #374151;">🥈 2nd PLACE</div>';
        else if (rank === 3) rankBadge = '<div class="badge" style="background: #f59e0b; color: #78350f;">🥉 3rd PLACE</div>';
        else rankBadge = `<div class="badge" style="background: rgba(255,255,255,0.2); color: white;">Rank #${rank}</div>`;

        popup.innerHTML = `
            <h2>${titleText}</h2>
            <div class="athlete-name">${name}</div>
            <div class="stats">${score} pts</div>
            ${rankBadge}
        `;

        popup.classList.add('show');

        // Scroll to the athlete in the leaderboard container
        setTimeout(() => {
            const leaderboardItems = document.querySelectorAll('#leaderboard-list .leaderboard-item');
            if (leaderboardItems[rank - 1]) {
                leaderboardItems[rank - 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
                leaderboardItems[rank - 1].style.boxShadow = '0 0 35px var(--accent-color)';
                leaderboardItems[rank - 1].style.borderColor = 'var(--accent-color)';
            }
        }, 600);

        // Timeline:
        // 1. Hide popup after 8 seconds (lasts longer)
        setTimeout(() => {
            popup.classList.remove('show');
        }, 8000);

        // 2. Stay 5 seconds after popup hides (total 13s), then scroll smoothly back to the top of the leaderboard
        setTimeout(() => {
            const leaderboardContainer = document.getElementById('leaderboard-tab-content');
            if (leaderboardContainer) {
                leaderboardContainer.scrollTo({ top: 0, behavior: 'smooth' });
            }
            
            // Remove highlight glow
            const leaderboardItems = document.querySelectorAll('#leaderboard-list .leaderboard-item');
            if (leaderboardItems[rank - 1]) {
                leaderboardItems[rank - 1].style.boxShadow = '';
                leaderboardItems[rank - 1].style.borderColor = '';
            }
        }, 13000);
    }

    function showExitButton() {
        if (!document.body.classList.contains('tv-active')) return;
        exitTvBtn.style.opacity = '1';
        exitTvBtn.style.pointerEvents = 'auto';
        document.body.style.cursor = '';
        
        clearTimeout(tvButtonTimeout);
        tvButtonTimeout = setTimeout(hideExitButton, 3000);
    }

    function hideExitButton() {
        if (!document.body.classList.contains('tv-active')) return;
        exitTvBtn.style.opacity = '0';
        exitTvBtn.style.pointerEvents = 'none';
        document.body.style.cursor = 'none';
    }

    function handleTVActivity() {
        if (document.body.classList.contains('tv-active')) {
            showExitButton();
        }
    }

    function handleTVScrollingMode(mode) {
        if (!document.body.classList.contains('tv-active')) return;

        if (mode === 'active') {
            stopTVScrolling();
            
            setTimeout(() => {
                const startlistContainer = document.getElementById('startlist-tab-content');
                const startlistList = document.getElementById('startlist-list');
                if (!startlistContainer || !startlistList) return;
                
                const nextUpElement = startlistList.querySelector('.leaderboard-item .status-badge.pending')?.closest('.leaderboard-item');
                let targetScrollY = 0;
                
                if (nextUpElement) {
                    targetScrollY = (nextUpElement.offsetTop + nextUpElement.offsetHeight / 2) - startlistContainer.clientHeight / 2;
                    const maxScroll = startlistList.offsetHeight - startlistContainer.clientHeight;
                    if (targetScrollY < 0) targetScrollY = 0;
                    if (targetScrollY > maxScroll) targetScrollY = maxScroll;
                }
                
                startlistList.style.transition = 'transform 1s cubic-bezier(0.16, 1, 0.3, 1)';
                startlistList.style.transform = `translate3d(0, ${-targetScrollY}px, 0)`;
            }, 100);
        } else {
            if (!tvScrollRAF) {
                startTVScrolling();
            }
        }
    }

    function enterTVMode() {
        const docEl = document.documentElement;
        if (docEl.requestFullscreen) {
            docEl.requestFullscreen().catch(() => {});
        } else if (docEl.webkitRequestFullscreen) {
            docEl.webkitRequestFullscreen();
        } else if (docEl.msRequestFullscreen) {
            docEl.msRequestFullscreen();
        }

        document.body.classList.add('tv-active');
        tabContainer.classList.add('hidden');
        footer.classList.add('hidden');
        tabSplit.click();
        exitTvBtn.classList.remove('hidden');
        exitTvBtn.style.opacity = '1';
        exitTvBtn.style.pointerEvents = 'auto';
        document.body.style.cursor = '';
        showExitButton();
        setTimeout(loadData, 1000); // Wait for split animation and settle
    }

    function exitTVMode() {
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }

        document.body.classList.remove('tv-active');
        tabContainer.classList.remove('hidden');
        footer.classList.remove('hidden');
        exitTvBtn.classList.add('hidden');
        exitTvBtn.style.opacity = '';
        exitTvBtn.style.pointerEvents = '';
        document.body.style.cursor = '';
        clearTimeout(tvButtonTimeout);
        stopTVScrolling();
    }

    if (tvModeBtn) {
        tvModeBtn.addEventListener('click', enterTVMode);
    }
    if (exitTvBtn) {
        exitTvBtn.addEventListener('click', exitTVMode);
    }

    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement) {
            document.body.classList.remove('tv-active');
            tabContainer.classList.remove('hidden');
            footer.classList.remove('hidden');
            exitTvBtn.classList.add('hidden');
            exitTvBtn.style.opacity = '';
            exitTvBtn.style.pointerEvents = '';
            document.body.style.cursor = '';
            clearTimeout(tvButtonTimeout);
            stopTVScrolling();
        }
    });

    if (exitTvBtn) {
        document.addEventListener('mousemove', handleTVActivity);
        document.addEventListener('mousedown', handleTVActivity);
        document.addEventListener('touchstart', handleTVActivity);
        document.addEventListener('keydown', handleTVActivity);
    }

    async function loadData() {
        try {
            const [data, cfg] = await Promise.all([
                fetchAPI('/leaderboard'),
                fetchAPI('/config')
            ]);
            applyBrandingVisibility(cfg.isLicensed);
            applyAppName(cfg.appName);
            applyAppIcon(cfg.appIconUrl);
            
            if (!cfg.isLicensed) {
                showLicenseLockOverlay();
                return;
            } else {
                const overlay = document.getElementById('license-lock-overlay');
                if (overlay) overlay.remove();
            }

            renderLeaderboard(data);
            renderStartlist(data);

            if (document.body.classList.contains('tv-active')) {
                handleTVScrollingMode(cfg.tvScrollMode);
            }

            const completed = data.filter(a => a.completed === 1);
            if (!firstLoadCompleted) {
                firstLoadCompleted = true;
                completed.forEach((athlete, index) => {
                    completedAthletesCache.set(athlete.id, {
                        name: athlete.name,
                        score: athlete.total_score,
                        rank: index + 1
                    });
                });
            } else {
                let newlyCompleted = [];
                let updatedScores = [];

                completed.forEach((athlete, index) => {
                    const rank = index + 1;
                    const cached = completedAthletesCache.get(athlete.id);

                    if (!cached) {
                        newlyCompleted.push({ athlete, rank });
                    } else if (cached.score !== athlete.total_score) {
                        updatedScores.push({ athlete, rank });
                    }

                    // Update local cache
                    completedAthletesCache.set(athlete.id, {
                        name: athlete.name,
                        score: athlete.total_score,
                        rank: rank
                    });
                });

                // Trigger announcements if TV Mode is active
                if (document.body.classList.contains('tv-active')) {
                    if (newlyCompleted.length > 0) {
                        const { athlete, rank } = newlyCompleted[0];
                        triggerTVAnnouncement(athlete.name, athlete.total_score, rank, 'Run Completed!');
                    } else if (updatedScores.length > 0) {
                        const { athlete, rank } = updatedScores[0];
                        triggerTVAnnouncement(athlete.name, athlete.total_score, rank, 'Score Updated!');
                    }
                }
            }
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
            applyBrandingVisibility(cfg.isLicensed);
            applyAppName(cfg.appName);
            applyAppIcon(cfg.appIconUrl);
            
            if (!cfg.isLicensed) {
                showLicenseLockOverlay();
                dashboardView.classList.add('hidden');
                loginView.classList.add('hidden');
                return;
            } else {
                const overlay = document.getElementById('license-lock-overlay');
                if (overlay) overlay.remove();
                
                if (judge) {
                    showDashboard();
                } else {
                    loginView.classList.remove('hidden');
                }
            }
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
                judge = { id: res.id, username: res.username };
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

    checkBranding();

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
            loadJudges(),
            loadTVConfig()
        ]);
    }

    async function loadTVConfig() {
        try {
            const cfg = await fetchAPI('/config');
            applyBrandingVisibility(cfg.isLicensed);
            applyAppName(cfg.appName);
            applyAppIcon(cfg.appIconUrl);
            updateLicenseUI(cfg);
            const appNameEl = document.getElementById('app-name-input');
            if (appNameEl && cfg.appName) {
                appNameEl.value = cfg.appName;
            }
            const selectEl = document.getElementById('tv-scroll-mode-select');
            if (selectEl && cfg.tvScrollMode) {
                selectEl.value = cfg.tvScrollMode;
            }
            const formulaEl = document.getElementById('scoring-formula-select');
            if (formulaEl && cfg.scoringFormula) {
                formulaEl.value = cfg.scoringFormula;
            }
        } catch(e) {
            console.error('Failed to load config', e);
        }
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
                item.setAttribute('draggable', 'true');
                item.setAttribute('data-id', athlete.id);
                item.style.cursor = 'grab';
                item.style.gap = '1rem';
                item.style.padding = '0.75rem 1rem';
                item.style.marginBottom = '0.5rem';
                item.style.background = 'rgba(255, 255, 255, 0.03)';
                item.style.border = '1px solid rgba(255, 255, 255, 0.1)';
                item.style.borderRadius = '12px';
                
                item.innerHTML = `
                    <div class="flex-row flex-grow" style="align-items: center; gap: 0.5rem;">
                        <span style="color: rgba(255, 255, 255, 0.3); font-size: 1.25rem; cursor: grab; user-select: none;">☰</span>
                        <div class="rank" style="color: var(--accent-color); font-weight: 700; width: 4.5rem; text-align: center;">N° ${athlete.order_index}</div>
                        <span class="athlete-name-display" style="font-weight: 600;">${athlete.name}</span>
                    </div>
                    <div class="flex-row" style="gap: 0.5rem;">
                        <button class="btn-secondary btn-small edit-athlete-btn" data-id="${athlete.id}" data-name="${athlete.name}" data-order="${athlete.order_index}">Edit Name</button>
                        <button class="btn-danger btn-small delete-btn" data-id="${athlete.id}">Remove</button>
                    </div>
                `;
                listEl.appendChild(item);
            });

            // HTML5 Drag and Drop listeners
            listEl.addEventListener('dragstart', (e) => {
                const item = e.target.closest('.athlete-list-item');
                if (item) {
                    item.classList.add('dragging');
                }
            });

            listEl.addEventListener('dragend', async (e) => {
                const item = e.target.closest('.athlete-list-item');
                if (item) {
                    item.classList.remove('dragging');
                    
                    const items = Array.from(listEl.querySelectorAll('.athlete-list-item'));
                    const orders = items.map((el, index) => {
                        return {
                            id: el.getAttribute('data-id'),
                            order_index: index + 1
                        };
                    });

                    try {
                        await fetchAPI('/admin/reorder-athletes', 'PUT', { orders });
                        await loadAthletes();
                    } catch (e) {
                        alert('Failed to save sequence: ' + e.message);
                    }
                }
            });

            listEl.addEventListener('dragover', (e) => {
                e.preventDefault();
                const draggingItem = listEl.querySelector('.dragging');
                if (!draggingItem) return;
                const afterElement = getDragAfterElement(listEl, e.clientY);
                if (afterElement == null) {
                    listEl.appendChild(draggingItem);
                } else {
                    listEl.insertBefore(draggingItem, afterElement);
                }
            });

            function getDragAfterElement(container, y) {
                const draggableElements = Array.from(container.querySelectorAll('.athlete-list-item:not(.dragging)'));
                return draggableElements.reduce((closest, child) => {
                    const box = child.getBoundingClientRect();
                    const offset = y - box.top - box.height / 2;
                    if (offset < 0 && offset > closest.offset) {
                        return { offset: offset, element: child };
                    } else {
                        return closest;
                    }
                }, { offset: Number.NEGATIVE_INFINITY }).element;
            }

            document.querySelectorAll('.edit-athlete-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.target.getAttribute('data-id');
                    const currentName = e.target.getAttribute('data-name');
                    const currentOrder = e.target.getAttribute('data-order');
                    
                    const name = prompt('Change Athlete Name:', currentName);
                    if (name === null) return;
                    if (name.trim() === '') return alert('Name cannot be empty');

                    try {
                        await fetchAPI(`/admin/update-athlete/${id}`, 'PUT', { name, order_index: currentOrder });
                        await loadAthletes();
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
                        await loadAthletes();
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

    document.getElementById('load-preset-btn').addEventListener('click', async () => {
        if(confirm('This will replace the current startlist and scores with the 10 demo athletes. Continue?')) {
            try {
                await fetchAPI('/admin/load-preset', 'POST');
            } catch(e) {
                alert(e.message);
            }
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

    const tvSelectEl = document.getElementById('tv-scroll-mode-select');
    if (tvSelectEl) {
        tvSelectEl.addEventListener('change', async (e) => {
            const tvScrollMode = e.target.value;
            try {
                await fetchAPI('/admin/config', 'PUT', { tvScrollMode });
            } catch(e) {
                alert('Failed to update TV config: ' + e.message);
            }
        });
    }

    const formulaSelectEl = document.getElementById('scoring-formula-select');
    if (formulaSelectEl) {
        formulaSelectEl.addEventListener('change', async (e) => {
            const scoringFormula = e.target.value;
            try {
                await fetchAPI('/admin/config', 'PUT', { scoringFormula });
            } catch(e) {
                alert('Failed to update scoring formula: ' + e.message);
            }
        });
    }

    const appNameForm = document.getElementById('app-name-form');
    if (appNameForm) {
        appNameForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const appNameInput = document.getElementById('app-name-input');
            const appName = appNameInput.value.trim();
            if (!appName) return alert('App name cannot be empty');

            try {
                await fetchAPI('/admin/config', 'PUT', { appName });
                applyAppName(appName);
            } catch(e) {
                alert('Failed to update app name: ' + e.message);
            }
        });
    }

    const appIconForm = document.getElementById('app-icon-form');
    if (appIconForm) {
        const appIconInput = document.getElementById('app-icon-input');
        const appIconStatus = document.getElementById('app-icon-status');
        const resetAppIconBtn = document.getElementById('reset-app-icon-btn');

        appIconInput.addEventListener('change', () => {
            const file = appIconInput.files && appIconInput.files[0];
            if (!file) return;

            const previewUrl = URL.createObjectURL(file);
            const preview = document.getElementById('app-icon-preview');
            if (preview) {
                preview.onload = () => URL.revokeObjectURL(previewUrl);
                preview.src = previewUrl;
            }
        });

        appIconForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const file = appIconInput.files && appIconInput.files[0];
            if (!file) return alert('Choose an icon image first');
            if (file.size > 512 * 1024) return alert('Icon image must be 512 KB or smaller');

            try {
                const imageData = normalizeIconDataURL(await readFileAsDataURL(file), file);
                const result = await fetchAPI('/admin/icon', 'POST', { imageData });
                applyAppIcon(result.appIconUrl);
                appIconInput.value = '';
                showAppIconStatus('Icon updated.', false);
            } catch(e) {
                showAppIconStatus('Failed to update icon: ' + e.message, true);
            }
        });

        resetAppIconBtn.addEventListener('click', async () => {
            try {
                await fetchAPI('/admin/config', 'PUT', { appIconUrl: '/favicon.ico' });
                applyAppIcon('/favicon.ico');
                appIconInput.value = '';
                showAppIconStatus('Icon reset to the default favicon.', false);
            } catch(e) {
                showAppIconStatus('Failed to reset icon: ' + e.message, true);
            }
        });

        function showAppIconStatus(message, isError) {
            appIconStatus.textContent = message;
            appIconStatus.style.color = isError ? 'var(--danger-color)' : 'var(--success-color)';
            appIconStatus.classList.remove('hidden');
        }
    }

    function readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Could not read selected file'));
            reader.readAsDataURL(file);
        });
    }

    function normalizeIconDataURL(dataUrl, file) {
        if (dataUrl.startsWith('data:;base64,') && file.name.toLowerCase().endsWith('.ico')) {
            return dataUrl.replace('data:;base64,', 'data:image/x-icon;base64,');
        }
        return dataUrl;
    }

    // License Key settings form handling
    const licenseKeyForm = document.getElementById('license-key-form');
    if (licenseKeyForm) {
        licenseKeyForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const licenseKeyInput = document.getElementById('license-key-input');
            const licenseKey = licenseKeyInput.value;
            const statusMessage = document.getElementById('license-status-message');

            try {
                // Call admin/config API to update the licenseKey in DB config
                await fetchAPI('/admin/config', 'PUT', { licenseKey });
                
                // Fetch the new config status
                const cfg = await fetchAPI('/config');
                applyBrandingVisibility(cfg.isLicensed);
                updateLicenseUI(cfg);
            } catch (e) {
                statusMessage.className = 'error';
                statusMessage.textContent = 'Error: ' + e.message;
                statusMessage.classList.remove('hidden');
            }
        });
    }

    function updateLicenseUI(cfg) {
        const statusMessage = document.getElementById('license-status-message');
        const licenseKeyInput = document.getElementById('license-key-input');
        if (!statusMessage) return;

        if (cfg.licenseKey) {
            licenseKeyInput.value = cfg.licenseKey;
        } else {
            licenseKeyInput.value = '';
        }

        if (!cfg.licenseKey) {
            statusMessage.style.background = 'rgba(0, 0, 0, 0.03)';
            statusMessage.style.color = 'var(--text-secondary)';
            statusMessage.style.border = '1px solid rgba(0, 0, 0, 0.05)';
            statusMessage.textContent = '⚪ No active license key loaded. The "Made by Samuel Fronthaler" branding footer is visible.';
            statusMessage.classList.remove('hidden');
        } else if (cfg.isLicensed) {
            statusMessage.style.background = 'rgba(52, 199, 89, 0.1)';
            statusMessage.style.color = '#248a3d';
            statusMessage.style.border = '1px solid rgba(52, 199, 89, 0.15)';
            statusMessage.textContent = `🎉 License Active: Registered to "${cfg.licensee}" (Expires: ${cfg.expiresAt}). Branding footer successfully hidden!`;
            statusMessage.classList.remove('hidden');
        } else {
            statusMessage.style.background = 'rgba(255, 59, 48, 0.08)';
            statusMessage.style.color = '#ff3b30';
            statusMessage.style.border = '1px solid rgba(255, 59, 48, 0.12)';
            statusMessage.textContent = `❌ License Invalid: ${cfg.licenseError || 'Verification failed'}. Branding footer remains visible.`;
            statusMessage.classList.remove('hidden');
        }

        // Lock down all other administrative cards if unlicensed
        const cards = document.querySelectorAll('#admin-view .card');
        cards.forEach(card => {
            const isLicenseCard = card.querySelector('#license-key-form');
            const isDisplaySettingsCard = card.querySelector('#app-name-form');
            if (!isLicenseCard && !isDisplaySettingsCard) {
                if (cfg.isLicensed) {
                    card.classList.remove('unlicensed-disabled');
                } else {
                    card.classList.add('unlicensed-disabled');
                }
            }
        });
    }

    socket.on('state-update', () => {
        if (!adminView.classList.contains('hidden')) {
            loadDashboardData();
        }
    });
}
