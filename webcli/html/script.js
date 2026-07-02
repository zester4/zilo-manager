let token = localStorage.getItem('zilmate_token') || '';
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('token')) {
    token = urlParams.get('token');
    localStorage.setItem('zilmate_token', token);
    urlParams.delete('token');
    const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
    window.history.replaceState({}, '', newUrl);
}

const state = {
    activeTab: 'chat',
};

async function apiFetch(path, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    try {
        const res = await fetch(path, { ...options, headers });
        if (res.status === 401) {
            console.error('Unauthorized local access attempt.');
            return { error: 'Unauthorized: Local session token mismatch' };
        }
        return await res.json();
    } catch (err) {
        console.error('API connection failed:', err);
        return { error: `Failed to connect to daemon: ${err.message}` };
    }
}

function init() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => switchTab(item.dataset.tab));
    });
    
    const chatInput = document.getElementById('chat-input');
    chatInput.addEventListener('keypress', e => {
        if (e.key === 'Enter' && e.target.value.trim() && document.getElementById('autocomplete-panel').classList.contains('hidden')) {
            handleChat(e.target.value.trim());
            e.target.value = '';
        }
    });

    // Wire Voice Shortcut
    const voiceBtn = document.getElementById('voice-shortcut-btn');
    if (voiceBtn) {
        voiceBtn.addEventListener('click', () => {
            switchTab('voice');
        });
    }

    // Wire Session Select Dropdown
    const sessionSelect = document.getElementById('session-select');
    if (sessionSelect) {
        sessionSelect.addEventListener('change', handleSessionChange);
    }

    // Wire Clear History Button
    const clearBtn = document.getElementById('clear-session-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', handleClearHistory);
    }

    // Wire Autocomplete events
    chatInput.addEventListener('input', handleInputAutocomplete);
    chatInput.addEventListener('keydown', handleKeyDownAutocomplete);

    // Initial session loads and model loads
    loadSessions();
    loadSessionHistory();
    loadActiveModel();

    // Wire Suggestion Chips
    document.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const cmd = chip.getAttribute('data-cmd');
            if (cmd) {
                handleChat(cmd);
            }
        });
    });

    switchTab('chat');
    setInterval(animateWaveform, 100);
}


function switchTab(tabId) {
    state.activeTab = tabId;
    document.querySelectorAll('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.tab === tabId));
    document.querySelectorAll('.view-container').forEach(v => v.classList.toggle('hidden', v.id !== `view-${tabId}`));

    // Dynamic Active API Renderings
    if (tabId === 'swarm') renderSwarm();
    if (tabId === 'traces') renderTraces();
    if (tabId === 'doctor') renderDoctor();
    if (tabId === 'models') renderModels();
    if (tabId === 'apps') renderApps();
    if (tabId === 'mcp') renderMcp();
    if (tabId === 'skills') renderSkills();
    if (tabId === 'triggers') renderTriggers();
    if (tabId === 'jobs') renderJobs();
    if (tabId === 'memory') renderMemory();
    if (tabId === 'wiki') renderWiki();
    if (tabId === 'camera') renderCamera();
    if (tabId === 'voice') renderVoice();
}

async function handleChat(text) {
    addMessage('user', text);
    
    // Add pulsing typing indicator
    const container = document.getElementById('chat-output');
    const indicator = document.createElement('div');
    indicator.className = 'msg msg-bot typing-indicator';
    indicator.innerHTML = `
        <div class="avatar">Z</div>
        <div class="bubble" style="display: flex; gap: 4px; padding: 12px 20px;">
            <span class="dot" style="width:6px; height:6px; background:var(--primary); border-radius:50%; animation: pulse 1s infinite;"></span>
            <span class="dot" style="width:6px; height:6px; background:var(--primary); border-radius:50%; animation: pulse 1s infinite 0.2s;"></span>
            <span class="dot" style="width:6px; height:6px; background:var(--primary); border-radius:50%; animation: pulse 1s infinite 0.4s;"></span>
        </div>
    `;
    container.appendChild(indicator);
    container.scrollTop = container.scrollHeight;

    try {
        const response = await apiFetch('/api/chat', {
            method: 'POST',
            body: JSON.stringify({ message: text, sessionId: state.currentSession || 'web-session' }),
        });
        
        indicator.remove();
        
        if (response.error) {
            addMessage('bot', `⚠️ **Error**: ${response.error}`);
        } else {
            addMessage('bot', response.result || "No response received.");
        }
    } catch (err) {
        indicator.remove();
        addMessage('bot', `⚠️ **Connection Error**: ${err.message}`);
    }
}

function parseMarkdown(text) {
    if (!text) return '';

    // Escape HTML to prevent XSS
    let escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const lines = escaped.split(/\r?\n/);
    let html = '';
    
    let inCodeBlock = false;
    let codeLanguage = '';
    let codeLines = [];
    
    let inTable = false;
    let tableRows = [];
    
    let inList = false;
    let listType = ''; // 'ul' or 'ol'
    
    let inBlockquote = false;
    let blockquoteLines = [];

    let inParagraph = false;
    let paragraphLines = [];

    function flushBlocks() {
        if (inCodeBlock) {
            const codeContent = codeLines.join('\n');
            const randomId = 'code-' + Math.random().toString(36).substr(2, 9);
            html += `
                <div class="code-block-wrapper">
                    <div class="code-block-header">
                        <span class="code-lang">${codeLanguage || 'code'}</span>
                        <button class="code-copy-btn" onclick="copyToClipboard('${randomId}', this)">
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                            Copy
                        </button>
                    </div>
                    <pre><code id="${randomId}" class="language-${codeLanguage}">${codeContent}</code></pre>
                </div>
            `;
            inCodeBlock = false;
            codeLines = [];
        }
        if (inTable) {
            html += renderTable(tableRows);
            inTable = false;
            tableRows = [];
        }
        if (inList) {
            html += `</${listType}>`;
            inList = false;
            listType = '';
        }
        if (inBlockquote) {
            const bqContent = blockquoteLines.map(l => parseInlineMarkdown(l)).join('<br>');
            html += `<blockquote>${bqContent}</blockquote>`;
            inBlockquote = false;
            blockquoteLines = [];
        }
        if (inParagraph) {
            const pContent = paragraphLines.map(l => parseInlineMarkdown(l)).join(' ');
            html += `<p>${pContent}</p>`;
            inParagraph = false;
            paragraphLines = [];
        }
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // 1. Code Blocks
        if (trimmed.startsWith('```')) {
            if (inCodeBlock) {
                flushBlocks();
            } else {
                flushBlocks();
                inCodeBlock = true;
                codeLanguage = trimmed.substring(3).trim();
            }
            continue;
        }

        if (inCodeBlock) {
            codeLines.push(line);
            continue;
        }

        // 2. Tables (lines starting and ending with |)
        if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
            if (inTable) {
                tableRows.push(trimmed);
            } else {
                flushBlocks();
                inTable = true;
                tableRows.push(trimmed);
            }
            continue;
        } else if (inTable) {
            flushBlocks();
        }

        // 3. Blockquotes
        if (trimmed.startsWith('&gt;') || trimmed.startsWith('>')) {
            if (inBlockquote) {
                const content = trimmed.startsWith('&gt;') ? trimmed.substring(4).trim() : trimmed.substring(1).trim();
                blockquoteLines.push(content);
            } else {
                flushBlocks();
                inBlockquote = true;
                const content = trimmed.startsWith('&gt;') ? trimmed.substring(4).trim() : trimmed.substring(1).trim();
                blockquoteLines.push(content);
            }
            continue;
        } else if (inBlockquote) {
            flushBlocks();
        }

        // 4. Horizontal Rules
        if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
            flushBlocks();
            html += `<hr>`;
            continue;
        }

        // 5. Headings
        const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
        if (headingMatch) {
            flushBlocks();
            const level = headingMatch[1].length;
            const textContent = parseInlineMarkdown(headingMatch[2]);
            html += `<h${level}>${textContent}</h${level}>`;
            continue;
        }

        // 6. Lists
        const ulMatch = trimmed.match(/^([\-\*\+])\s+(.*)$/);
        const olMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);

        if (ulMatch) {
            if (inList && listType !== 'ul') {
                flushBlocks();
            }
            if (!inList) {
                flushBlocks();
                inList = true;
                listType = 'ul';
                html += `<ul>`;
            }
            html += `<li>${parseInlineMarkdown(ulMatch[2])}</li>`;
            continue;
        } else if (olMatch) {
            if (inList && listType !== 'ol') {
                flushBlocks();
            }
            if (!inList) {
                flushBlocks();
                inList = true;
                listType = 'ol';
                html += `<ol>`;
            }
            html += `<li>${parseInlineMarkdown(olMatch[2])}</li>`;
            continue;
        } else if (inList) {
            flushBlocks();
        }

        // 7. Empty line - acts as block separator
        if (trimmed === '') {
            flushBlocks();
            continue;
        }

        // 8. Plain paragraph line
        if (!inParagraph) {
            flushBlocks();
            inParagraph = true;
        }
        paragraphLines.push(line);
    }

    flushBlocks();
    return html;
}

function parseInlineMarkdown(text) {
    if (!text) return '';
    
    let res = text;

    // Bold & Italic (and nested)
    res = res.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
    res = res.replace(/___(.*?)___/g, '<strong><em>$1</em></strong>');
    
    // Bold
    res = res.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    res = res.replace(/__(.*?)__/g, '<strong>$1</strong>');

    // Italic
    res = res.replace(/\*(.*?)\*/g, '<em>$1</em>');
    res = res.replace(/_(.*?)_/g, '<em>$1</em>');

    // Inline code
    res = res.replace(/`(.*?)`/g, '<code>$1</code>');

    // Links: [text](url)
    res = res.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');

    return res;
}

function renderTable(rows) {
    if (rows.length === 0) return '';
    
    let html = `<table>`;
    let isHeader = true;
    let headerLength = 0;

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const cells = row.split('|').slice(1, -1).map(c => c.trim());
        
        // Check if this is a delimiter row
        if (cells.every(cell => /^[\-\s\:]+$/.test(cell))) {
            isHeader = false;
            continue; // Skip delimiter
        }

        if (isHeader && i === 0) {
            headerLength = cells.length;
            html += `<thead><tr>`;
            cells.forEach(cell => {
                html += `<th>${parseInlineMarkdown(cell)}</th>`;
            });
            html += `</tr></thead><tbody>`;
            isHeader = false;
        } else {
            html += `<tr>`;
            const cols = headerLength > 0 ? headerLength : cells.length;
            for (let c = 0; cols > c; c++) {
                const cellVal = cells[c] || '';
                html += `<td>${parseInlineMarkdown(cellVal)}</td>`;
            }
            html += `</tr>`;
        }
    }

    if (headerLength > 0) {
        html += `</tbody>`;
    }
    html += `</table>`;
    return html;
}

function addMessage(role, text) {
    const container = document.getElementById('chat-output');
    const msg = document.createElement('div');
    msg.className = `msg msg-${role}`;

    const html = parseMarkdown(text);

    msg.innerHTML = `
        <div class="avatar">${role === 'bot' ? 'Z' : 'U'}</div>
        <div class="bubble markdown-content">${html}</div>
    `;
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
}

async function renderSwarm() {
    const grid = document.getElementById('swarm-grid');
    grid.innerHTML = '<div style="color: var(--on-surface-variant)">Loading swarm hierarchy...</div>';
    const data = await apiFetch('/api/swarm');
    if (data.error) {
        grid.innerHTML = `<div class="card">Error loading swarm hierarchy: ${data.error}</div>`;
        return;
    }
    const specs = data.specialists || [];
    if (specs.length === 0) {
        grid.innerHTML = '<div class="card">No active specialists found in registry.</div>';
        return;
    }

    const depts = {};
    const icons = { Strategy: '🎯', Engineering: '🏗️', Growth: '📈', Operations: '⚙️', Security: '🛡️', Data: '📊', Revenue: '💰', Default: '🐝' };
    specs.forEach(s => {
        const d = s.department || 'Default';
        if (!depts[d]) depts[d] = [];
        depts[d].push(s);
    });

    grid.innerHTML = Object.entries(depts).map(([name, members]) => `
        <div class="card" style="grid-column: span 2;">
            <div class="card-head">
                <span class="card-title">${icons[name] || '🐝'} ${name} Department</span>
                <span class="card-status bg-ok">${members.length} Agents</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 12px;">
                ${members.map(m => `
                    <div style="padding: 12px; background: rgba(0,0,0,0.015); border-radius: 8px; border-left: 3px solid var(--primary-light);">
                        <div style="font-weight: 700; color: var(--primary); font-size: 13px;">${m.name}</div>
                        <div style="font-size: 11px; color: var(--on-surface-variant); margin-top: 4px;">
                            <strong>Toolkits:</strong> ${(m.composioToolkits || []).join(', ') || 'none'}
                        </div>
                        <div style="font-size: 10px; color: var(--outline); margin-top: 2px; word-break: break-all;">
                            <strong>Tools:</strong> ${(m.tools || []).slice(0, 8).join(', ')}${m.tools.length > 8 ? '...' : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

async function renderTraces() {
    const container = document.getElementById('trace-container');
    container.innerHTML = '<div style="color: var(--on-surface-variant); padding: 24px;">Loading active execution logs...</div>';
    const data = await apiFetch('/api/traces');
    if (data.error) {
        container.innerHTML = `<div style="padding: 24px; color: var(--error);">Error loading traces: ${data.error}</div>`;
        return;
    }
    const list = data.traces || [];
    if (list.length === 0) {
        container.innerHTML = '<div style="padding: 24px; color: var(--outline);">No active execution spans logged yet. Initiate an agent chat to see live traces.</div>';
        return;
    }
    container.innerHTML = list.reverse().slice(0, 30).map(s => `
        <div class="trace-node active" style="margin-bottom: 12px;">
            <div style="font-weight: 700; font-size: 13px; color: var(--primary);">[${s.department || 'Agent'}] ${s.agentName || s.name || 'Specialist'}</div>
            <div style="font-size: 11px; margin: 4px 0 8px; color: var(--on-surface);">${s.task || ''}</div>
            ${(s.events || []).map(e => `
                <div style="font-size: 11px; padding: 6px 10px; margin-top: 4px; background: rgba(0,0,0,0.02); border-radius: 4px; border-left: 3px solid var(--primary-light); word-break: break-all;">
                    <strong style="color: var(--primary);">${e.label || e.type || 'event'}:</strong> ${e.detail || ''}
                </div>
            `).join('')}
            <div style="font-size: 10px; color: var(--outline); margin-top: 6px; text-align: right;">
                ${s.startedAt ? new Date(s.startedAt).toLocaleTimeString() : ''}
            </div>
        </div>
    `).join('');
}

const keyMappings = {
    'AI Gateway': [{ key: 'AI_GATEWAY_API_KEY', label: 'AI Gateway API Key' }],
    'Composio': [
        { key: 'COMPOSIO_API_KEY', label: 'Composio API Key' },
        { key: 'ZILMATE_USER_ID', label: 'ZilMate User ID' }
    ],
    'Tavily': [{ key: 'TAVILY_API_KEY', label: 'Tavily API Key' }],
    'Redis': [
        { key: 'UPSTASH_REDIS_REST_URL', label: 'Upstash Redis Rest URL' },
        { key: 'UPSTASH_REDIS_REST_TOKEN', label: 'Upstash Redis Rest Token' }
    ],
    'QStash': [
        { key: 'UPSTASH_QSTASH_TOKEN', label: 'Upstash QStash Token' },
        { key: 'ZILMATE_PUBLIC_JOB_WEBHOOK_URL', label: 'Public Webhook URL' }
    ],
    'Voice': [{ key: 'DEEPGRAM_API_KEY', label: 'Deepgram API Key' }],
    'Chat Channels': [
        { key: 'SLACK_BOT_TOKEN', label: 'Slack Bot Token' },
        { key: 'TELEGRAM_BOT_TOKEN', label: 'Telegram Bot Token' }
    ],
    'Corporate Wiki': [
        { key: 'SUPERMEMORY_API_KEY', label: 'SuperMemory API Key' },
        { key: 'UPSTASH_VECTOR_REST_URL', label: 'Upstash Vector Rest URL' },
        { key: 'UPSTASH_VECTOR_REST_TOKEN', label: 'Upstash Vector Rest Token' }
    ]
};

async function renderDoctor() {
    const grid = document.getElementById('doctor-grid');
    grid.innerHTML = '<div style="color: var(--on-surface-variant)"><span class="pulsar" style="margin-right: 8px;"></span>Running diagnostics...</div>';
    
    const data = await apiFetch('/api/doctor');
    if (data.error) {
        grid.innerHTML = `<div class="card">Error running diagnostics: ${data.error}</div>`;
        return;
    }
    
    const checks = data.checks || [];
    const installations = data.installations || {};
    
    grid.innerHTML = checks.map((h, i) => {
        const statusClass = h.status === 'pass' ? 'bg-ok' : h.status === 'warn' ? 'bg-warn' : 'bg-error';
        const mappedKeys = keyMappings[h.name];
        
        let actionsHtml = '';
        
        // Handle Key Configurations
        if (mappedKeys) {
            const formId = `config-form-${i}`;
            actionsHtml = `
                <div style="margin-top: 12px; text-align: right;">
                    <button class="btn" style="padding: 4px 10px; font-size: 11px; background: rgba(142, 74, 85, 0.05); color: var(--primary); border: 1px solid rgba(142, 74, 85, 0.15);" onclick="toggleConfigForm('${formId}')">
                        🔧 Configure
                    </button>
                </div>
                <div id="${formId}" class="hidden" style="margin-top: 12px; padding: 12px; background: rgba(0,0,0,0.015); border-radius: 8px; border: 1px solid var(--outline-variant); text-align: left;">
                    ${mappedKeys.map(k => `
                        <div style="margin-bottom: 8px;">
                            <label style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--on-surface-variant); display: block; margin-bottom: 4px;">${k.label}</label>
                            <input type="password" class="cli-input" id="key-input-${k.key}" placeholder="Enter ${k.label}..." style="width: 100%; padding: 6px 10px; background: white; border: 1px solid var(--outline-variant); border-radius: 6px; font-size: 12px;" />
                        </div>
                    `).join('')}
                    <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px;">
                        <button class="btn" style="padding: 4px 10px; font-size: 11px; background: transparent; border: 1px solid var(--outline-variant); color: var(--on-surface-variant);" onclick="toggleConfigForm('${formId}')">Cancel</button>
                        <button class="btn btn-primary" style="padding: 4px 10px; font-size: 11px;" id="save-btn-${formId}" onclick="saveKeys('${formId}', ${JSON.stringify(mappedKeys).replace(/"/g, '&quot;')})">Save Keys</button>
                    </div>
                </div>
            `;
        }
        
        // Handle Installations / Fixes (Dependency Repairs)
        let installerKey = '';
        if (h.name === 'Browser Automation') {
            installerKey = 'playwright';
        } else if (h.name === 'Image Intelligence') {
            installerKey = 'rembg';
        }
        
        if (installerKey) {
            const inst = installations[installerKey] || { status: 'not_started' };
            const statusBoxId = `install-box-${installerKey}`;
            
            if (inst.status === 'running') {
                // Trigger client-side polling immediately if a background job is running
                setTimeout(() => pollInstallStatus(installerKey), 500);
                
                actionsHtml = `
                    <div id="${statusBoxId}" style="margin-top: 12px; padding: 12px; background: rgba(0,0,0,0.02); border-radius: 8px; border: 1px solid var(--outline-variant);">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                            <span style="font-size: 11px; font-weight: 700; color: var(--primary); display: flex; align-items: center; gap: 6px;">
                                <span class="pulsar"></span> Repairing / Installing...
                            </span>
                            <span style="font-size: 10px; font-family: monospace; color: var(--outline);">POLLING</span>
                        </div>
                        <pre id="install-log-${installerKey}" style="margin: 0; background: #141416; color: #8F8FA3; font-family: monospace; font-size: 10px; padding: 8px; border-radius: 6px; max-height: 120px; overflow-y: auto; text-align: left; white-space: pre-wrap; word-break: break-all;">${inst.output || 'Connecting to process...'}</pre>
                    </div>
                `;
            } else {
                actionsHtml = `
                    <div id="${statusBoxId}">
                        <div style="margin-top: 12px; text-align: right;">
                            <button class="btn btn-primary" style="padding: 4px 12px; font-size: 11px;" onclick="triggerRepair('${installerKey}')">
                                ⚡ Auto-Install
                            </button>
                        </div>
                    </div>
                `;
            }
        }
        
        return `
            <div class="card" style="display: flex; flex-direction: column; justify-content: space-between;">
                <div>
                    <div class="card-head">
                        <span class="card-title" style="font-weight: 700; font-size: 13px;">${h.name}</span>
                        <span class="card-status ${statusClass}">${h.status.toUpperCase()}</span>
                    </div>
                    <div style="font-size: 11.5px; color: var(--on-surface-variant); margin-top: 8px; line-height: 1.45; text-align: left;">${h.detail}</div>
                </div>
                <div id="action-area-${i}">
                    ${actionsHtml}
                </div>
            </div>
        `;
    }).join('');
}

window.toggleConfigForm = function(formId) {
    const el = document.getElementById(formId);
    if (el) el.classList.toggle('hidden');
};

window.saveKeys = async function(formId, keys) {
    const saveBtn = document.getElementById(`save-btn-${formId}`);
    const originalText = saveBtn.textContent;
    saveBtn.textContent = 'Saving... ⏳';
    saveBtn.disabled = true;
    
    try {
        for (const k of keys) {
            const input = document.getElementById(`key-input-${k.key}`);
            const val = input ? input.value.trim() : '';
            if (val) {
                const res = await apiFetch('/api/doctor/config', {
                    method: 'POST',
                    body: JSON.stringify({ key: k.key, value: val })
                });
                if (res.error) {
                    alert(`Error saving ${k.key}: ${res.error}`);
                    saveBtn.textContent = originalText;
                    saveBtn.disabled = false;
                    return;
                }
            }
        }
        
        saveBtn.textContent = 'Saved! 🟢';
        setTimeout(() => {
            renderDoctor();
        }, 1000);
    } catch (err) {
        alert(`Failed to save: ${err.message}`);
        saveBtn.textContent = originalText;
        saveBtn.disabled = false;
    }
};

window.triggerRepair = async function(action) {
    const res = await apiFetch('/api/doctor/fix', {
        method: 'POST',
        body: JSON.stringify({ action })
    });
    
    if (res.error) {
        alert(`Failed to start installation: ${res.error}`);
    } else {
        renderDoctor(); // Instantly re-render to display the active terminal logging box!
    }
};

window.pollInstallStatus = async function(action) {
    const logBox = document.getElementById(`install-log-${action}`);
    if (!logBox) return; // Means tab switched or element replaced
    
    const res = await apiFetch(`/api/doctor/fix-status?action=${action}`);
    if (!res || res.error) return;
    
    logBox.textContent = res.output || 'Connecting...';
    logBox.scrollTop = logBox.scrollHeight; // Scroll terminal output automatically!
    
    if (res.status === 'running') {
        setTimeout(() => pollInstallStatus(action), 1000);
    } else {
        // Completed or failed! Re-run diagnostics after 2 seconds so they see the final PASS/FAIL status!
        setTimeout(() => {
            renderDoctor();
        }, 2000);
    }
};

async function renderModels() {
    const list = document.getElementById('models-list');
    list.innerHTML = '<tr><td style="padding: 24px; color: var(--on-surface-variant)">Fetching model availability...</td></tr>';
    const data = await apiFetch('/api/models');
    if (data.error) {
        list.innerHTML = `<tr><td style="padding: 24px; color: var(--error);">Error loading models: ${data.error}</td></tr>`;
        return;
    }
    const selected = data.selected || {};
    const availableIds = data.availableIds || [];
    
    const roles = [
        { role: 'manager', label: 'Primary Coordinator (Manager)', val: selected.manager },
        { role: 'coding', label: 'Software Engineer (Coding)', val: selected.coding },
        { role: 'help', label: 'Quick Help / Support', val: selected.help },
        { role: 'chat', label: 'Interactive Chat', val: selected.chat },
        { role: 'research', label: 'Deep Research Agent', val: selected.research },
        { role: 'imageOpenai', label: 'OpenAI Image Generator', val: selected.imageOpenai },
        { role: 'imageGemini', label: 'Gemini Image Generator', val: selected.imageGemini },
        { role: 'screenshotVision', label: 'Screenshot / Vision Analyzer', val: selected.screenshotVision },
        { role: 'deptStrategy', label: 'Strategy Department (Swarm)', val: selected.deptStrategy },
        { role: 'deptEngineering', label: 'Engineering Department (Swarm)', val: selected.deptEngineering },
        { role: 'deptGrowth', label: 'Growth Department (Swarm)', val: selected.deptGrowth },
        { role: 'deptOperations', label: 'Operations Department (Swarm)', val: selected.deptOperations },
        { role: 'deptData', label: 'Data Department (Swarm)', val: selected.deptData },
        { role: 'deptSecurity', label: 'Security Department (Swarm)', val: selected.deptSecurity },
        { role: 'deptRevenue', label: 'Revenue Department (Swarm)', val: selected.deptRevenue }
    ];

    let html = `
        <thead>
            <tr style="border-bottom: 2px solid var(--outline-variant); text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--on-surface-variant);">
                <th style="padding: 12px 24px; font-weight: 700;">Role / Department</th>
                <th style="padding: 12px 24px; font-weight: 700;">Assigned Model ID</th>
                <th style="padding: 12px 24px; font-weight: 700; width: 120px;">Status</th>
            </tr>
        </thead>
        <tbody>
    `;

    html += roles.map(r => {
        const idList = [...availableIds];
        if (r.val && !idList.includes(r.val)) {
            idList.unshift(r.val);
        }
        
        let optionsHtml = '';
        idList.forEach(id => {
            const isSel = id === r.val ? 'selected' : '';
            optionsHtml += `<option value="${id}" ${isSel}>${id}</option>`;
        });
        optionsHtml += `<option value="__custom__">✍️ Enter Custom Model ID...</option>`;

        const isAvail = availableIds.includes(r.val) || r.val?.includes('gemini') || r.val?.includes('claude') || r.val?.includes('gpt');
        const statusLabel = isAvail ? 'READY' : 'UNAVAILABLE';
        const statusClass = isAvail ? 'bg-ok' : 'bg-error';

        return `
            <tr style="border-bottom: 1px solid var(--outline-variant); font-size: 13px;">
                <td style="padding: 14px 24px; font-weight: 600; color: var(--on-surface);">${r.label}</td>
                <td style="padding: 14px 24px;">
                    <select class="model-select" data-prev="${r.val || ''}" onchange="handleModelChange(this, '${r.role}')">
                        ${optionsHtml}
                    </select>
                </td>
                <td style="padding: 14px 24px;">
                    <span id="status-${r.role}" class="card-status ${statusClass}" style="display: inline-block; width: 100px; text-align: center;">${statusLabel}</span>
                </td>
            </tr>
        `;
    }).join('');

    html += '</tbody>';
    list.innerHTML = html;
}

window.handleModelChange = async function(selectEl, role) {
    let val = selectEl.value;
    if (val === '__custom__') {
        const customVal = prompt(`Enter custom Model ID for ${role}:`);
        if (!customVal || !customVal.trim()) {
            selectEl.value = selectEl.getAttribute('data-prev') || '';
            return;
        }
        val = customVal.trim();
        
        const customOpt = document.createElement('option');
        customOpt.value = val;
        customOpt.textContent = val;
        customOpt.selected = true;
        selectEl.insertBefore(customOpt, selectEl.firstChild);
    }
    
    const prevVal = selectEl.getAttribute('data-prev') || '';
    selectEl.setAttribute('data-prev', val);
    
    const statusSpan = document.getElementById(`status-${role}`);
    statusSpan.textContent = 'SAVING...';
    statusSpan.className = 'card-status bg-warn';
    
    try {
        const res = await apiFetch('/api/models', {
            method: 'POST',
            body: JSON.stringify({ role, modelId: val })
        });
        if (res.error) {
            throw new Error(res.error);
        }
        statusSpan.textContent = 'SAVED ✓';
        statusSpan.className = 'card-status bg-ok';
        
        setTimeout(() => {
            if (statusSpan.textContent === 'SAVED ✓') {
                statusSpan.textContent = 'READY';
                statusSpan.className = 'card-status bg-ok';
            }
        }, 2000);
    } catch (err) {
        alert(`Failed to save model change: ${err.message}`);
        selectEl.value = prevVal;
        selectEl.setAttribute('data-prev', prevVal);
        statusSpan.textContent = 'ERROR';
        statusSpan.className = 'card-status bg-error';
    }
}

async function renderApps() {
    const grid = document.getElementById('apps-grid');
    grid.innerHTML = '<div style="color: var(--on-surface-variant)">Loading connected toolkits...</div>';
    const status = await apiFetch('/api/apps');
    if (status.error) {
        grid.innerHTML = `<div class="card">Error loading apps: ${status.error}</div>`;
        return;
    }
    const toolkits = status.toolkits || [];
    if (toolkits.length === 0) {
        grid.innerHTML = '<div class="card">No integrated apps configured. Run setup in the CLI to connect toolkits.</div>';
        return;
    }
    grid.innerHTML = toolkits.map(t => `
        <div class="card">
            <div class="card-head">
                <span class="card-title" style="font-weight: 700; font-size: 13px;">${t.name}</span>
                <span class="card-status ${t.connected ? 'bg-ok' : 'bg-warn'}">${t.connected ? 'ACTIVE' : 'LINK REQUIRED'}</span>
            </div>
            <div style="font-size: 11px; color: var(--on-surface-variant); margin-top: 8px;">
                <strong>Slug:</strong> <code style="background: rgba(0,0,0,0.03); padding: 2px 4px; border-radius: 4px;">${t.slug}</code>
            </div>
            ${t.status ? `<div style="font-size: 10px; color: var(--outline); margin-top: 4px;">Status: ${t.status}</div>` : ''}
        </div>
    `).join('');
}

async function renderMcp() {
    const grid = document.getElementById('mcp-grid');
    grid.innerHTML = '<div style="color: var(--on-surface-variant)">Loading MCP servers...</div>';
    const mcpConfig = await apiFetch('/api/mcp');
    if (mcpConfig.error) {
        grid.innerHTML = `<div class="card">Error loading MCP servers: ${mcpConfig.error}</div>`;
        return;
    }
    const mcpServers = mcpConfig.mcpServers || {};
    const serversList = Object.entries(mcpServers);
    if (serversList.length === 0) {
        grid.innerHTML = '<div class="card">No MCP servers registered.</div>';
        return;
    }
    grid.innerHTML = serversList.map(([name, cfg]) => `
        <div class="card">
            <div class="card-head">
                <span class="card-title" style="font-weight: 700; font-size: 13px;">${name}</span>
                <span class="card-status bg-ok">ACTIVE</span>
            </div>
            <div style="font-size: 11px; color: var(--on-surface-variant); margin-top: 8px; display: flex; flex-direction: column; gap: 4px;">
                <div><strong>Command:</strong> <code style="background: rgba(0,0,0,0.03); padding: 2px 4px; border-radius: 4px;">${cfg.command || 'mcp server'}</code></div>
                ${cfg.args ? `<div><strong>Args:</strong> <span style="font-size:10px; font-family:monospace; color:var(--outline); word-break: break-all;">${cfg.args.join(' ')}</span></div>` : ''}
            </div>
        </div>
    `).join('');
}

async function renderSkills() {
    const grid = document.getElementById('skills-grid');
    grid.innerHTML = '<div style="color: var(--on-surface-variant)">Discovering agent skills...</div>';
    const data = await apiFetch('/api/skills');
    if (data.error) {
        grid.innerHTML = `<div class="card">Error loading specialized skills: ${data.error}</div>`;
        return;
    }
    const skills = data.skills || [];
    if (skills.length === 0) {
        grid.innerHTML = '<div class="card">No agent skills loaded.</div>';
        return;
    }
    grid.innerHTML = skills.map(s => `
        <div class="card">
            <div class="card-head">
                <span class="card-title" style="font-weight: 700; font-size: 13px;">⚡ ${s.name || s.id}</span>
                <span class="card-status bg-ok">LOADED</span>
            </div>
            <div style="font-size: 11px; color: var(--on-surface-variant); margin-top: 8px; line-height: 1.4;">
                ${s.description || 'Custom agent skill template.'}
            </div>
            <div style="font-size: 10px; color: var(--outline); margin-top: 6px;">
                <strong>ID:</strong> ${s.id}
            </div>
        </div>
    `).join('');
}

async function renderTriggers() {
    const grid = document.getElementById('triggers-grid');
    grid.innerHTML = '<div style="color: var(--on-surface-variant)">Checking active triggers...</div>';
    const data = await apiFetch('/api/triggers');
    if (data.error) {
        grid.innerHTML = `<div class="card">Error loading event triggers: ${data.error}</div>`;
        return;
    }
    const items = data.items || [];
    if (items.length === 0) {
        grid.innerHTML = '<div class="card">No active event triggers currently enabled. Connect toolkit webhooks to list them here.</div>';
        return;
    }
    grid.innerHTML = items.map(item => `
        <div class="card">
            <div class="card-head">
                <span class="card-title" style="font-weight: 700; font-size: 13px;">${item.triggerName || item.name}</span>
                <span class="card-status ${item.disabledAt ? 'bg-warn' : 'bg-ok'}">${item.disabledAt ? 'DISABLED' : 'ENABLED'}</span>
            </div>
            <div style="font-size: 11px; color: var(--on-surface-variant); margin-top: 8px; display: flex; flex-direction: column; gap: 4px;">
                <div><strong>ID:</strong> <code style="font-size: 10px;">${item.id}</code></div>
                <div><strong>Account ID:</strong> ${item.connectedAccountId || '-'}</div>
                <div style="font-size: 10px; color: var(--outline); margin-top: 4px;">Updated: ${item.updatedAt || 'just now'}</div>
            </div>
        </div>
    `).join('');
}

async function renderJobs() {
    const grid = document.getElementById('jobs-grid');
    grid.innerHTML = '<div style="color: var(--on-surface-variant)">Listing background jobs...</div>';
    const data = await apiFetch('/api/jobs');
    if (data.error) {
        grid.innerHTML = `<div class="card">Error loading jobs: ${data.error}</div>`;
        return;
    }
    const jobs = data.jobs || [];
    if (jobs.length === 0) {
        grid.innerHTML = '<div class="card">No background jobs registered yet. Run <code style="background: rgba(0,0,0,0.05); padding: 2px 4px;">zilmate jobs create</code> in the CLI.</div>';
        return;
    }
    grid.innerHTML = jobs.map(j => {
        const statusClass = j.status === 'completed' ? 'bg-ok' : j.status === 'failed' ? 'bg-error' : 'bg-warn';
        return `
            <div class="card">
                <div class="card-head">
                    <span class="card-title" style="font-weight: 700; font-size: 13px;">Job: ${j.id}</span>
                    <span class="card-status ${statusClass}">${j.status.toUpperCase()}</span>
                </div>
                <div style="font-size: 11px; color: var(--on-surface-variant); margin-top: 8px; display: flex; flex-direction: column; gap: 4px;">
                    <div><strong>Task:</strong> ${j.task}</div>
                    ${j.schedule ? `<div><strong>Schedule:</strong> <code style="font-family: monospace;">${j.schedule}</code></div>` : ''}
                    ${j.lastRunAt ? `<div><strong>Last Run:</strong> ${new Date(j.lastRunAt).toLocaleTimeString()}</div>` : ''}
                    ${j.error ? `<div style="color: var(--error); font-size: 10px;"><strong>Error:</strong> ${j.error}</div>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

async function renderMemory() {
    const card = document.querySelector('#view-memory');
    card.innerHTML = '<div class="card">Listing digital memories...</div>';
    const data = await apiFetch('/api/memory');
    if (data.error) {
        card.innerHTML = `<div class="card">Error loading memories: ${data.error}</div>`;
        return;
    }
    const memories = data.memories || [];
    if (memories.length === 0) {
        card.innerHTML = '<div class="card">Digital memory bank is currently empty. Start chatting with ZilMate to build your memory profiles.</div>';
        return;
    }
    card.innerHTML = `
        <div class="card" style="max-height: 80vh; overflow-y: auto; display: flex; flex-direction: column; gap: 16px;">
            <h3 style="font-size: 16px; font-weight: 800; color: var(--primary);">🧠 Long-Term Memories</h3>
            <div style="display: flex; flex-direction: column; gap: 10px;">
                ${memories.map(m => `
                    <div style="padding: 12px; background: rgba(0,0,0,0.015); border-radius: 8px; border-left: 3px solid var(--primary-light);">
                        <div style="font-size: 13px; line-height: 1.5; color: var(--on-surface);">${m.text || m.content}</div>
                        <div style="display: flex; gap: 4px; margin-top: 8px; flex-wrap: wrap;">
                            ${(m.tags || []).map(t => `<span style="font-size: 9px; padding: 2px 6px; background: var(--outline-variant); color: var(--on-surface-variant); border-radius: 4px;">#${t}</span>`).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

let wikiSearchTimeout = null;
window.debounceWikiSearch = function(val) {
    clearTimeout(wikiSearchTimeout);
    wikiSearchTimeout = setTimeout(() => {
        renderWiki(val.trim());
    }, 300);
}

async function renderWiki(searchQuery = '') {
    const viewContainer = document.querySelector('#view-wiki');
    
    // On first load or if header doesn't exist, render structure
    if (!viewContainer.querySelector('.wiki-header')) {
        viewContainer.innerHTML = `
            <div class="wiki-header" style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 20px; width: 100%;">
                <div>
                    <h2 style="font-size: 20px; font-weight: 800; color: var(--primary);">📚 Corporate Intelligence Wiki</h2>
                    <p style="font-size: 12px; color: var(--on-surface-variant); margin-top: 4px;">Strategic deliverables, architectural guidelines, and verified institutional knowledge.</p>
                </div>
                <div style="position: relative; width: 300px; max-width: 100%;">
                    <input type="text" id="wiki-search-input" placeholder="🔍 Search facts..." style="width: 100%; padding: 10px 18px; border: 1px solid var(--outline-variant); border-radius: 99px; font-size: 13px; outline: none; background: white; transition: 0.2s; box-shadow: 0 2px 8px rgba(0,0,0,0.02);" oninput="debounceWikiSearch(this.value)">
                </div>
            </div>
            <div id="wiki-results" style="display: flex; flex-direction: column; gap: 16px; width: 100%; max-height: 80vh; overflow-y: auto; padding-right: 4px;">
                <div style="color: var(--on-surface-variant);">Accessing corporate intelligence wiki...</div>
            </div>
        `;
    }

    const resultsContainer = document.getElementById('wiki-results');
    resultsContainer.innerHTML = `
        <div style="display: flex; justify-content: center; align-items: center; padding: 48px; color: var(--on-surface-variant);">
            <span class="pulsar" style="margin-right: 8px;"></span> Loading facts...
        </div>
    `;

    const path = searchQuery ? `/api/wiki?q=${encodeURIComponent(searchQuery)}` : '/api/wiki';
    const data = await apiFetch(path);
    
    if (data.error) {
        resultsContainer.innerHTML = `<div class="card" style="border-color: var(--error); background: var(--error-bg); color: var(--error); padding: 16px; border-radius: 8px;">Error loading wiki: ${data.error}</div>`;
        return;
    }
    
    const facts = data.facts || [];
    if (facts.length === 0) {
        resultsContainer.innerHTML = `
            <div class="card" style="text-align: center; padding: 48px; color: var(--on-surface-variant);">
                <div style="font-size: 32px; margin-bottom: 12px;">📭</div>
                <div style="font-weight: 600;">No matching facts found.</div>
                <div style="font-size: 12px; margin-top: 4px; color: var(--outline);">Try searching for another keyword or check back later.</div>
            </div>
        `;
        return;
    }

    resultsContainer.innerHTML = facts.map(f => {
        const richContent = parseMarkdown(f.content);
        const relPercent = (f.similarity * 100).toFixed(0);
        
        // Escape content single quotes or backticks to avoid JS string interpolation errors
        const safeRawContent = f.content.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
        
        return `
            <div class="card" style="padding: 24px; background: white; border-radius: 12px; border-left: 4px solid var(--primary); box-shadow: 0 4px 16px rgba(142,74,85,0.02); display: flex; flex-direction: column; gap: 16px; transition: transform 0.2s, box-shadow 0.2s;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 24px rgba(142,74,85,0.06)';" onmouseout="this.style.transform='none'; this.style.boxShadow='0 4px 16px rgba(142,74,85,0.02)';">
                <div class="markdown-content">${richContent}</div>
                <div style="font-size: 11px; color: var(--on-surface-variant); border-top: 1px solid var(--outline-variant); padding-top: 12px; margin-top: 4px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="card-status bg-ok" style="font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 4px;">RELEVANCE: ${relPercent}%</span>
                        <span style="color: var(--outline); font-family: monospace; font-size: 10px;">ID: ${f.id}</span>
                    </div>
                    <button class="btn-clear-chat" style="padding: 4px 10px; font-size: 11px; border-radius: 6px; display: flex; align-items: center; gap: 4px; border: 1px solid var(--outline-variant); background: white;" onclick="navigator.clipboard.writeText(\`${safeRawContent}\`); alert('Copied raw markdown to clipboard!')">
                        📋 Copy Raw
                    </button>
                </div>
            </div>
        `;
    }).join('');
    
    // Ensure the input value remains consistent if searching
    const input = document.getElementById('wiki-search-input');
    if (input && document.activeElement !== input) {
        input.value = searchQuery;
    }
}


async function renderCamera() {
    const view = document.getElementById('view-camera');
    view.innerHTML = '<div class="card">Loading camera tools & checking devices...</div>';
    const data = await apiFetch('/api/camera');
    if (data.error) {
        view.innerHTML = `<div class="card">Error loading camera tools: ${data.error}</div>`;
        return;
    }
    const devices = data.devices || [];
    const checks = data.checks || [];

    view.innerHTML = `
        <div class="card" style="aspect-ratio: 16/9; background: #0b0f19; border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: white; border: 1px solid var(--outline-variant); position: relative; overflow: hidden; padding: 24px;">
            <div style="font-size: 48px; margin-bottom: 12px;">📷</div>
            <div style="font-weight: 700; font-size: 16px; letter-spacing: 0.05em; color: var(--primary-light);">[ READY FOR CAMERA FEED ]</div>
            <div style="font-size: 11px; margin-top: 8px; color: var(--outline);">Connected Devices: ${devices.length}</div>
        </div>
        
        <div class="grid" style="margin-top: 20px; grid-template-columns: repeat(2, 1fr); gap: 20px;">
            <div class="card">
                <div class="card-head"><span class="card-title">Connected Devices</span></div>
                <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">
                    ${devices.length === 0 ? '<div style="font-size: 11px; color: var(--outline);">No cameras detected.</div>' : devices.map(d => `
                        <div style="font-size: 12px; font-weight: 600; padding: 8px 12px; background: rgba(0,0,0,0.02); border-radius: 6px; border: 1px solid var(--outline-variant);">${d.name} (${d.input})</div>
                    `).join('')}
                </div>
            </div>
            
            <div class="card">
                <div class="card-head"><span class="card-title">Camera Doctor Check</span></div>
                <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">
                    ${checks.length === 0 ? '<div style="font-size: 11px; color: var(--outline);">No health checks run.</div>' : checks.map(c => `
                        <div style="display:flex; justify-content:space-between; align-items:center; font-size: 12px;">
                            <span>${c.name}</span>
                            <span class="card-status ${c.status === 'pass' ? 'bg-ok' : 'bg-error'}" style="font-size: 9px; padding: 2px 8px;">${c.status.toUpperCase()}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

function animateWaveform() {
    const wf = document.getElementById('waveform');
    if (!wf) return;
    wf.innerHTML = Array.from({length:15}).map(() => `<div style="width:3px; height:${Math.random()*20+5}px; background:var(--primary-light); border-radius:2px;"></div>`).join('');
}

window.onload = init;

// --- Added Helper Functions ---

window.copyToClipboard = async function(elementId, btn) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const text = el.innerText || el.textContent;
    try {
        await navigator.clipboard.writeText(text);
        const originalHtml = btn.innerHTML;
        btn.innerHTML = `
            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" style="color: var(--success);"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
            Copied!
        `;
        btn.classList.add('copied');
        setTimeout(() => {
            btn.innerHTML = originalHtml;
            btn.classList.remove('copied');
        }, 2000);
    } catch (err) {
        console.error('Failed to copy text:', err);
    }
};

window.loadSessions = function() {
    state.currentSession = 'default';
    localStorage.setItem('zilmate_current_session', 'default');

    const sessionSelect = document.getElementById('session-select');
    if (sessionSelect) {
        sessionSelect.innerHTML = '<option value="default" selected>default</option>';
    }
};

window.handleSessionChange = function(e) {
    const val = e.target.value;
    if (val === 'custom') {
        const newSession = prompt('Enter a new session ID (alphanumeric and dashes):');
        if (!newSession || !newSession.trim()) {
            e.target.value = state.currentSession;
            return;
        }
        const cleanSession = newSession.trim().toLowerCase().replace(/[^a-z0-9\-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        if (!cleanSession) {
            alert('Invalid session name. Must contain alphanumeric characters.');
            e.target.value = state.currentSession;
            return;
        }

        let sessions = [];
        try {
            sessions = JSON.parse(localStorage.getItem('zilmate_sessions') || '[]');
        } catch (err) {}
        if (!sessions.includes(cleanSession)) {
            sessions.push(cleanSession);
            localStorage.setItem('zilmate_sessions', JSON.stringify(sessions));
        }

        state.currentSession = cleanSession;
        localStorage.setItem('zilmate_current_session', cleanSession);
        
        loadSessions(); // Re-render dropdown
        loadSessionHistory();
    } else {
        state.currentSession = val;
        localStorage.setItem('zilmate_current_session', val);
        loadSessionHistory();
    }
};

window.loadSessionHistory = async function() {
    const container = document.getElementById('chat-output');
    if (!container) return;
    container.innerHTML = `
        <div style="display: flex; justify-content: center; align-items: center; padding: 48px; color: var(--on-surface-variant);">
            <span class="pulsar" style="margin-right: 8px;"></span> Loading conversation history...
        </div>
    `;

    const data = await apiFetch('/api/chat/history?sessionId=' + encodeURIComponent(state.currentSession));
    container.innerHTML = '';

    if (data.error) {
        addMessage('bot', `⚠️ **Error loading history**: ${data.error}`);
        return;
    }

    const history = data.turns || [];
    if (history.length === 0) {
        container.innerHTML = `
            <div class="welcome-card" style="text-align: center; padding: 40px 20px; max-width: 600px; margin: 40px auto; border-radius: 16px; background: rgba(142, 74, 85, 0.02); border: 1px dashed var(--outline-variant); animation: fadeIn 0.4s ease;">
                <div style="font-size: 40px; margin-bottom: 16px; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.05));">🐝</div>
                <h3 style="font-size: 18px; font-weight: 800; color: var(--primary); margin-bottom: 8px;">Welcome to ZilMate Swarm Command Center</h3>
                <p style="font-size: 13px; color: var(--on-surface-variant); line-height: 1.6; margin-bottom: 16px;">
                    This is your interactive web console connected directly to the local daemon. 
                    You can manage agents, trigger background tasks, coordinate swarm departments, and run full developer diagnostics.
                </p>
                <p style="font-size: 12px; color: var(--outline); font-weight: 500;">
                    Type <code style="background: rgba(0,0,0,0.04); padding: 2px 6px; border-radius: 4px;">/doctor</code> or select a prompt suggestion chip below to begin.
                </p>
            </div>
        `;
    } else {
        history.forEach(turn => {
            const role = turn.role === 'user' ? 'user' : 'bot';
            addMessage(role, turn.message || turn.content || '');
        });
    }
};

window.handleClearHistory = async function() {
    if (!confirm('Are you sure you want to clear the entire chat history for this session?')) {
        return;
    }
    
    const res = await apiFetch('/api/chat/clear', {
        method: 'POST',
        body: JSON.stringify({ sessionId: state.currentSession || 'web-session' })
    });
    
    if (res.error) {
        alert(`Failed to clear history: ${res.error}`);
    } else {
        const container = document.getElementById('chat-output');
        if (container) container.innerHTML = '';
        await loadSessionHistory();
    }
};

window.loadActiveModel = async function() {
    const activeModelName = document.getElementById('active-model-name');
    if (!activeModelName) return;
    const data = await apiFetch('/api/models');
    if (data && !data.error && data.selected) {
        const activeModel = data.selected.chat || data.selected.manager || 'Zilo-Manager';
        activeModelName.textContent = activeModel;
    } else {
        activeModelName.textContent = 'Zilo-Manager';
    }
};

const COMMANDS = [
    { cmd: '/doctor', desc: 'Run complete system diagnostics and check background health.', icon: '🩺' },
    { cmd: '/skills', desc: 'List all loaded specialized agent capabilities and triggers.', icon: '⚡' },
    { cmd: '/mcp list', desc: 'Show currently connected Model Context Protocol servers.', icon: '🧩' },
    { cmd: '/swarm', desc: 'Invoke the multi-agent specialist swarm to execute tasks.', icon: '🐝' },
    { cmd: '/jobs', desc: 'List, monitor, or create scheduled background corporate tasks.', icon: '📅' },
    { cmd: '/memory', desc: 'View, search, or inspect stored long-term digital memories.', icon: '🧠' },
    { cmd: '/wiki', desc: 'Query and search our Corporate Intelligence blackboard wiki.', icon: '📚' }
];

let autocompleteIndex = -1;
let filteredCommands = [];

function renderAutocomplete() {
    const panel = document.getElementById('autocomplete-panel');
    if (!panel) return;
    
    if (filteredCommands.length === 0) {
        panel.classList.add('hidden');
        return;
    }
    
    panel.classList.remove('hidden');
    panel.innerHTML = '';
    
    filteredCommands.forEach((c, idx) => {
        const item = document.createElement('div');
        item.className = `autocomplete-item ${idx === autocompleteIndex ? 'active' : ''}`;
        item.innerHTML = `
            <span style="font-size: 16px; margin-right: 8px;">${c.icon}</span>
            <strong style="color: var(--primary); font-family: monospace;">${c.cmd}</strong>
            <span style="color: var(--on-surface-variant); font-size: 11px; margin-left: 12px; flex: 1; text-align: right;">${c.desc}</span>
        `;
        
        item.addEventListener('click', () => {
            const input = document.getElementById('chat-input');
            if (input) {
                input.value = c.cmd + ' ';
                input.focus();
            }
            filteredCommands = [];
            autocompleteIndex = -1;
            panel.classList.add('hidden');
        });
        
        panel.appendChild(item);
    });

    // Scroll active item into view
    const activeItem = panel.querySelector('.autocomplete-item.active');
    if (activeItem) {
        activeItem.scrollIntoView({ block: 'nearest' });
    }
}

window.handleInputAutocomplete = function(e) {
    const val = e.target.value;
    if (val.startsWith('/')) {
        filteredCommands = COMMANDS.filter(c => c.cmd.toLowerCase().startsWith(val.toLowerCase()));
        if (filteredCommands.length === 0) {
            filteredCommands = COMMANDS.filter(c => c.cmd.toLowerCase().includes(val.toLowerCase()));
        }
        
        if (autocompleteIndex >= filteredCommands.length) {
            autocompleteIndex = filteredCommands.length - 1;
        } else if (autocompleteIndex < 0 && filteredCommands.length > 0) {
            autocompleteIndex = 0;
        }
        
        renderAutocomplete();
    } else {
        filteredCommands = [];
        autocompleteIndex = -1;
        renderAutocomplete();
    }
};

window.handleKeyDownAutocomplete = function(e) {
    const panel = document.getElementById('autocomplete-panel');
    if (!panel || panel.classList.contains('hidden') || filteredCommands.length === 0) {
        return;
    }
    
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        autocompleteIndex = (autocompleteIndex + 1) % filteredCommands.length;
        renderAutocomplete();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        autocompleteIndex = (autocompleteIndex - 1 + filteredCommands.length) % filteredCommands.length;
        renderAutocomplete();
    } else if (e.key === 'Enter') {
        if (autocompleteIndex >= 0 && autocompleteIndex < filteredCommands.length) {
            e.preventDefault();
            const c = filteredCommands[autocompleteIndex];
            const input = document.getElementById('chat-input');
            if (input) {
                input.value = c.cmd + ' ';
                input.focus();
            }
            filteredCommands = [];
            autocompleteIndex = -1;
            renderAutocomplete();
        }
    } else if (e.key === 'Escape') {
        e.preventDefault();
        filteredCommands = [];
        autocompleteIndex = -1;
        renderAutocomplete();
    }
};


// --- Interactive Realtime Voice Tab Implementation ---

let voiceSessionRunning = false;

window.renderVoice = async function() {
    // Clear any previous interval to prevent duplicate polling
    if (state.voicePollingInterval) {
        clearInterval(state.voicePollingInterval);
        state.voicePollingInterval = null;
    }

    try {
        const data = await apiFetch('/api/voice/status');
        if (data.error) {
            console.error('Error fetching voice status:', data.error);
            return;
        }

        const config = data.config || {};
        const checks = data.checks || [];
        const devices = data.devices || [];
        const activeSession = data.activeSession || { running: false, events: [] };

        // 1. Populate Voice Enabled Switch
        const enabledToggle = document.getElementById('voice-enabled-toggle');
        if (enabledToggle) {
            enabledToggle.checked = config.enabled === true || config.enabled === 'true';
        }

        // 2. Populate Deepgram Key Input (Masked placeholder)
        const dgKeyInput = document.getElementById('voice-deepgram-key');
        if (dgKeyInput) {
            if (config.configured) {
                dgKeyInput.placeholder = 'DEEPGRAM_API_KEY is configured ••••••••';
            } else {
                dgKeyInput.placeholder = 'Configure DEEPGRAM_API_KEY...';
            }
        }

        // 3. Populate Active Microphone Select Dropdown
        const micSelect = document.getElementById('voice-mic-select');
        if (micSelect) {
            const currentSelected = micSelect.value || config.inputDevice || '';
            micSelect.innerHTML = '<option value="">Auto-detect Default Mic</option>';
            devices.forEach(device => {
                const opt = document.createElement('option');
                opt.value = device.input;
                opt.textContent = device.name;
                micSelect.appendChild(opt);
            });
            
            // Apply selected input device
            if (config.inputDevice) {
                micSelect.value = config.inputDevice;
            } else if (currentSelected) {
                micSelect.value = currentSelected;
            }
        }

        // 4. Populate Model Parameters Selects
        const listenSelect = document.getElementById('voice-listen-model');
        if (listenSelect && config.listenModel) {
            listenSelect.value = config.listenModel;
        }

        const ttsSelect = document.getElementById('voice-tts-model');
        if (ttsSelect && config.ttsModel) {
            ttsSelect.value = config.ttsModel;
        }

        // 5. Populate Diagnostics Doctor List
        const checksContainer = document.getElementById('voice-checks-container');
        if (checksContainer) {
            checksContainer.innerHTML = '';
            if (checks.length === 0) {
                checksContainer.innerHTML = '<div style="font-size: 11.5px; color: var(--on-surface-variant);">No active checks recorded.</div>';
            } else {
                checks.forEach(check => {
                    const checkRow = document.createElement('div');
                    checkRow.style.display = 'flex';
                    checkRow.style.alignItems = 'center';
                    checkRow.style.gap = '8px';
                    checkRow.style.fontSize = '12px';

                    const dot = document.createElement('span');
                    dot.style.display = 'inline-block';
                    dot.style.width = '8px';
                    dot.style.height = '8px';
                    dot.style.borderRadius = '50%';
                    dot.style.background = check.ok ? 'var(--success)' : 'var(--error)';
                    if (check.ok) {
                        dot.style.boxShadow = '0 0 6px var(--success)';
                    }

                    const labelSpan = document.createElement('span');
                    labelSpan.style.fontWeight = '500';
                    labelSpan.style.color = 'var(--on-surface)';
                    labelSpan.textContent = check.label;

                    const statusSpan = document.createElement('span');
                    statusSpan.style.color = 'var(--on-surface-variant)';
                    statusSpan.style.fontSize = '10.5px';
                    statusSpan.textContent = check.ok ? '(Ok)' : `(Failed: ${check.error || 'Check runtime environment'})`;

                    checkRow.appendChild(dot);
                    checkRow.appendChild(labelSpan);
                    checkRow.appendChild(statusSpan);
                    checksContainer.appendChild(checkRow);
                });
            }
        }

        // 6. Update Control Panel Pill
        const modePill = document.getElementById('voice-mode-pill');
        if (modePill) {
            if (config.enabled === true || config.enabled === 'true') {
                modePill.textContent = 'Voice Enabled';
                modePill.style.background = 'rgba(16, 185, 129, 0.1)';
                modePill.style.color = '#10B981';
            } else {
                modePill.textContent = 'Voice Disabled';
                modePill.style.background = 'var(--surface-dim)';
                modePill.style.color = 'var(--on-surface-variant)';
            }
        }

        // 7. Update Active Session State & Logging UI
        voiceSessionRunning = activeSession.running;
        updateVoiceSessionUI(activeSession.running, activeSession.events || []);

        // 8. Start polling if session is actively running
        if (activeSession.running) {
            startVoicePolling();
        }

    } catch (err) {
        console.error('Failed to render Voice Dashboard:', err);
    }
};

window.toggleVoiceEnabled = async function() {
    const isEnabled = document.getElementById('voice-enabled-toggle').checked;
    const modePill = document.getElementById('voice-mode-pill');
    if (modePill) {
        modePill.textContent = 'Updating...';
    }
    
    const response = await apiFetch('/api/voice/config', {
        method: 'POST',
        body: JSON.stringify({
            key: 'ZILMATE_VOICE_ENABLED',
            value: isEnabled ? 'true' : 'false'
        })
    });

    if (response.error) {
        alert(`Failed to update voice status: ${response.error}`);
    }
    renderVoice();
};

window.saveVoiceDeepgramKey = async function() {
    const dgKeyInput = document.getElementById('voice-deepgram-key');
    const value = dgKeyInput.value.trim();
    if (!value) {
        alert('Please enter a Deepgram API Key');
        return;
    }

    dgKeyInput.disabled = true;
    const response = await apiFetch('/api/voice/config', {
        method: 'POST',
        body: JSON.stringify({
            key: 'DEEPGRAM_API_KEY',
            value: value
        })
    });
    dgKeyInput.disabled = false;

    if (response.error) {
        alert(`Failed to save Deepgram API key: ${response.error}`);
    } else {
        alert('Deepgram API Key updated successfully!');
        dgKeyInput.value = '';
    }
    renderVoice();
};

window.changeVoiceInputDevice = async function(value) {
    const response = await apiFetch('/api/voice/config', {
        method: 'POST',
        body: JSON.stringify({
            key: 'ZILMATE_VOICE_INPUT_DEVICE',
            value: value
        })
    });

    if (response.error) {
        alert(`Failed to update microphone: ${response.error}`);
    }
    renderVoice();
};

window.saveVoiceParam = async function(key, value) {
    const response = await apiFetch('/api/voice/config', {
        method: 'POST',
        body: JSON.stringify({
            key: key,
            value: value
        })
    });

    if (response.error) {
        alert(`Failed to update voice parameter: ${response.error}`);
    }
    renderVoice();
};

window.toggleVoiceSession = async function() {
    const btn = document.getElementById('voice-mic-main-btn');
    if (!btn) return;

    if (voiceSessionRunning) {
        btn.disabled = true;
        const res = await apiFetch('/api/voice/stop-session', { method: 'POST' });
        btn.disabled = false;
        
        if (res.error) {
            alert(`Failed to stop voice session: ${res.error}`);
        } else {
            voiceSessionRunning = false;
            stopVoicePolling();
            updateVoiceSessionUI(false, []);
        }
    } else {
        btn.disabled = true;
        const res = await apiFetch('/api/voice/start-session', { method: 'POST' });
        btn.disabled = false;

        if (res.error) {
            alert(`Failed to start voice session: ${res.error}`);
        } else {
            voiceSessionRunning = true;
            state.lastVoiceEventIndex = 0;
            const consoleOutput = document.getElementById('voice-console-output');
            if (consoleOutput) {
                consoleOutput.innerHTML = '<div style="color: #34D399; font-family: monospace;">[System] Connecting to host microphone...</div>';
            }
            startVoicePolling();
            updateVoiceSessionUI(true, []);
        }
    }
};

window.triggerVoiceSpeakTest = async function() {
    const input = document.getElementById('voice-speak-test-input');
    const text = input ? input.value.trim() : '';
    if (!text) {
        alert('Please enter some text to test speaker playback.');
        return;
    }

    const speakBtn = document.getElementById('voice-speak-test-btn');
    if (speakBtn) {
        speakBtn.textContent = 'Speaking...';
        speakBtn.disabled = true;
    }

    const response = await apiFetch('/api/voice/speak-test', {
        method: 'POST',
        body: JSON.stringify({ text })
    });

    if (speakBtn) {
        speakBtn.textContent = 'Speak Out Loud 🔊';
        speakBtn.disabled = false;
    }

    if (response.error) {
        alert(`Speaker test failed: ${response.error}`);
    } else {
        if (input) {
            input.value = '';
        }
    }
};

function startVoicePolling() {
    if (state.voicePollingInterval) {
        clearInterval(state.voicePollingInterval);
    }
    
    state.voicePollingInterval = setInterval(async () => {
        if (state.activeTab !== 'voice' && !voiceSessionRunning) {
            stopVoicePolling();
            return;
        }

        try {
            const data = await apiFetch('/api/voice/status');
            if (data.error) {
                console.error('Polling error:', data.error);
                return;
            }

            const activeSession = data.activeSession || { running: false, events: [] };
            voiceSessionRunning = activeSession.running;
            
            updateVoiceSessionUI(activeSession.running, activeSession.events || []);

            if (!activeSession.running && !voiceSessionRunning) {
                stopVoicePolling();
            }
        } catch (err) {
            console.error('Error polling voice session status:', err);
        }
    }, 1000);
}

function stopVoicePolling() {
    if (state.voicePollingInterval) {
        clearInterval(state.voicePollingInterval);
        state.voicePollingInterval = null;
    }
}

function updateVoiceSessionUI(running, events) {
    const btn = document.getElementById('voice-mic-main-btn');
    const pill = document.getElementById('voice-session-pill');
    const waveform = document.getElementById('voice-visual-waveform');
    const statusText = document.getElementById('voice-session-status-text');
    const consoleOutput = document.getElementById('voice-console-output');

    if (btn) {
        if (running) {
            btn.classList.add('active');
            btn.innerHTML = '🛑';
        } else {
            btn.classList.remove('active');
            btn.innerHTML = '🎙️';
        }
    }

    if (pill) {
        if (running) {
            pill.textContent = 'Active Session';
            pill.style.background = 'rgba(16, 185, 129, 0.15)';
            pill.style.color = '#10B981';
        } else {
            pill.textContent = 'Disconnected';
            pill.style.background = 'var(--surface-dim)';
            pill.style.color = 'var(--on-surface-variant)';
        }
    }

    if (waveform) {
        if (running) {
            waveform.classList.remove('silent');
            waveform.classList.add('active');
        } else {
            waveform.classList.add('silent');
            waveform.classList.remove('active');
        }
    }

    if (statusText) {
        if (running) {
            statusText.textContent = 'ZilMate is listening... Talk out loud!';
            statusText.style.color = '#10B981';
        } else {
            statusText.textContent = 'Click microphone to start voice session';
            statusText.style.color = 'var(--on-surface-variant)';
        }
    }

    if (consoleOutput && Array.isArray(events)) {
        if (events.length === 0) {
            if (!running) {
                consoleOutput.innerHTML = '<div style="color: #6B7280; font-style: italic;">No active session logs. Click the microphone above to begin speaking.</div>';
                state.lastVoiceEventIndex = 0;
            }
        } else {
            if (consoleOutput.querySelector('[style*="font-style: italic"]')) {
                consoleOutput.innerHTML = '';
            }

            const newEvents = events.slice(state.lastVoiceEventIndex);
            if (newEvents.length > 0) {
                newEvents.forEach(evt => {
                    const row = document.createElement('div');
                    row.style.marginBottom = '6px';
                    row.style.lineHeight = '1.4';
                    
                    const timestamp = evt.timestamp ? `[${new Date(evt.timestamp).toLocaleTimeString()}] ` : '';
                    let label = evt.label || '';
                    let message = evt.message || '';
                    
                    if (evt.type === 'user' || label.toLowerCase().includes('user') || label.toLowerCase().includes('you')) {
                        row.innerHTML = `<span style="color: #8F8FA3;">${timestamp}</span><span style="color: #F43F5E; font-weight: 700;">[You]</span> <span style="color: #E4E4E7;">${message}</span>`;
                    } else if (evt.type === 'agent' || label.toLowerCase().includes('agent') || label.toLowerCase().includes('zilmate')) {
                        row.innerHTML = `<span style="color: #8F8FA3;">${timestamp}</span><span style="color: #3B82F6; font-weight: 700;">[ZilMate]</span> <span style="color: #E4E4E7;">${message}</span>`;
                    } else if (evt.type === 'system' || label.toLowerCase().includes('system') || label.toLowerCase().includes('connection')) {
                        row.innerHTML = `<span style="color: #8F8FA3;">${timestamp}</span><span style="color: #10B981; font-weight: bold;">[System]</span> <span style="color: #34D399; font-style: italic;">${message}</span>`;
                    } else if (evt.type === 'error' || label.toLowerCase().includes('error') || label.toLowerCase().includes('fail')) {
                        row.innerHTML = `<span style="color: #8F8FA3;">${timestamp}</span><span style="color: #EF4444; font-weight: bold;">[Error]</span> <span style="color: #F87171; font-weight: 500;">${message}</span>`;
                    } else {
                        row.innerHTML = `<span style="color: #8F8FA3;">${timestamp}</span><span style="color: #A1A1AA; font-weight: 700;">[${label || 'Event'}]</span> <span style="color: #E4E4E7;">${message}</span>`;
                    }
                    
                    consoleOutput.appendChild(row);
                });
                
                state.lastVoiceEventIndex = events.length;
                consoleOutput.scrollTop = consoleOutput.scrollHeight;
            }
        }
    }
}

window.clearVoiceLog = function() {
    const consoleOutput = document.getElementById('voice-console-output');
    if (consoleOutput) {
        consoleOutput.innerHTML = '<div style="color: #6B7280; font-style: italic;">Log cleared. No active session logs.</div>';
    }
    state.lastVoiceEventIndex = 0;
};


