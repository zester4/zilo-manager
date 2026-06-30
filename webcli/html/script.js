const state = {
    activeTab: 'chat',
    traces: [],
    config: {
        github: false,
        slack: false,
        stripe: false
    }
};

const specialists = [
    { name: 'CTO', dept: 'Engineering', head: true },
    { name: 'QA Specialist', dept: 'Engineering' },
    { name: 'CMO', dept: 'Growth', head: true },
    { name: 'SEO Strategist', dept: 'Growth' },
    { name: 'CISO', dept: 'Security', head: true }
];

function init() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => switchTab(item.dataset.tab));
    });
    document.getElementById('chat-input').addEventListener('keypress', e => {
        if (e.key === 'Enter' && e.target.value.trim()) {
            handleInput(e.target.value.trim());
            e.target.value = '';
        }
    });
    switchTab('chat');

    // Check if everything is configured
    setTimeout(() => {
        if (!state.config.github && !state.config.slack) {
            showSetupModal();
        }
    }, 1500);
}

function switchTab(tabId) {
    state.activeTab = tabId;
    document.querySelectorAll('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.tab === tabId));
    document.querySelectorAll('.view-container').forEach(v => v.classList.toggle('hidden', v.id !== `view-${tabId}`));

    if (tabId === 'swarm') renderSwarm();
    if (tabId === 'doctor') renderDoctor();
}

function handleInput(text) {
    addMessage('user', text);
    const cmd = text.toLowerCase().trim();

    if (cmd === '/doctor') {
        addMessage('bot', "## System Health Check\n\n| Module | Status | Detail |\n| :--- | :--- | :--- |\n| AI Gateway | 🟢 PASS | Connected |\n| Browser | 🟢 PASS | Playwright 1.44 |\n| Memory | 🟡 WARN | Redis not configured |");
        return;
    }

    if (cmd === '/setup') {
        showSetupModal();
        return;
    }

    addMessage('bot', "Processing your request with the Digital Corporation swarm...");
}

function addMessage(role, text) {
    const container = document.getElementById('chat-output');
    const msg = document.createElement('div');
    msg.className = `msg msg-${role}`;

    // Simple Markdown Parser
    let html = text
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\| (.*?) \|/g, (match) => {
            if (match.includes('---')) return '';
            const cells = match.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('');
            return `<table><tr>${cells}</tr></table>`;
        });

    msg.innerHTML = `
        <div class="avatar">${role === 'bot' ? 'Z' : 'U'}</div>
        <div class="bubble">${html}</div>
    `;
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
}

function showSetupModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal">
            <h2 class="modal-title">Complete Your Setup</h2>
            <p style="font-size: 14px; color: var(--on-surface-variant); margin-bottom: 24px;">ZilMate works best when connected to your business stack. Choose a provider to configure:</p>
            <div class="modal-options">
                <div class="opt-btn" onclick="this.parentElement.parentElement.parentElement.remove()">
                    <strong>🐙 GitHub</strong>
                    <div style="font-size: 12px; color: var(--on-surface-variant);">Enable codebase intelligence and PR automation.</div>
                </div>
                <div class="opt-btn" onclick="this.parentElement.parentElement.parentElement.remove()">
                    <strong>💬 Slack / Telegram</strong>
                    <div style="font-size: 12px; color: var(--on-surface-variant);">Deploy agents to your communication channels.</div>
                </div>
                <div class="opt-btn" onclick="this.parentElement.parentElement.parentElement.remove()">
                    <strong>💳 Stripe</strong>
                    <div style="font-size: 12px; color: var(--on-surface-variant);">Access revenue metrics and billing automation.</div>
                </div>
            </div>
            <button class="btn btn-primary" style="margin-top: 24px; width: 100%;" onclick="this.parentElement.parentElement.remove()">Skip for now</button>
        </div>
    `;
    document.body.appendChild(overlay);
}

function renderSwarm() {
    const grid = document.getElementById('swarm-grid');
    grid.innerHTML = '';
    const depts = [...new Set(specialists.map(s => s.dept))];
    depts.forEach(d => {
        const card = document.createElement('div');
        card.className = 'card';
        const dSpecs = specialists.filter(s => s.dept === d);
        card.innerHTML = `
            <div class="card-head"><span class="card-title">${d}</span> <span class="card-status bg-ok">ACTIVE</span></div>
            <div style="font-size: 12px; color: var(--on-surface-variant);">
                ${dSpecs.map(s => `<div>${s.head ? '👑 ' : '👤 '}${s.name}</div>`).join('')}
            </div>
        `;
        grid.appendChild(card);
    });
}

function renderDoctor() {
    const grid = document.getElementById('doctor-grid');
    grid.innerHTML = `
        <div class="card"><div class="card-head"><span class="card-title">Slack</span> <span class="card-status bg-warn">NOT LINKED</span></div></div>
        <div class="card"><div class="card-head"><span class="card-title">Telegram</span> <span class="card-status bg-error">DISABLED</span></div></div>
        <div class="card"><div class="card-head"><span class="card-title">iMessage</span> <span class="card-status bg-ok">ACTIVE (LOCAL)</span></div></div>
    `;
}

window.onload = init;
