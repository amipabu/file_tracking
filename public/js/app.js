/* ==============================================
   Procurement File Tracker — Frontend App
   ============================================== */

const API = '';

// ─── State ────────────────────────────────────
let currentPage = 'dashboard';
let authToken = localStorage.getItem('authToken');
let currentUser = null;

// ─── DOM Refs ─────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ─── Auth Fetch Wrapper ───────────────────────
async function authFetch(url, options = {}) {
    if (!options.headers) options.headers = {};
    if (authToken) {
        options.headers['Authorization'] = `Bearer ${authToken}`;
    }
    const res = await fetch(url, options);
    if (res.status === 401) {
        // Token expired or invalid — force logout
        logout();
        throw new Error('Session expired. Please sign in again.');
    }
    return res;
}

// ─── Init ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    initNavigation();
    initModals();
    initForms();
    initActions();
    initUserMenu();
});

// ─── Navigation ───────────────────────────────
function initNavigation() {
    $$('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const page = item.dataset.page;
            loadPage(page);
        });
    });

    $('#btnHamburger').addEventListener('click', () => {
        $('#sidebar').classList.toggle('open');
    });

    $('#btnHeaderNotif').addEventListener('click', () => {
        loadPage('notifications');
    });
}

function loadPage(page) {
    currentPage = page;

    $$('.nav-item').forEach(n => n.classList.remove('active'));
    $(`.nav-item[data-page="${page}"]`).classList.add('active');

    $$('.page').forEach(p => p.classList.remove('active'));

    const pageMap = {
        dashboard: 'pageDashboard',
        files: 'pageFiles',
        officers: 'pageOfficers',
        notifications: 'pageNotifications'
    };

    const titles = {
        dashboard: 'Dashboard',
        files: 'Procurement Files',
        officers: 'Contracting Officers',
        notifications: 'Notifications'
    };

    $(`#${pageMap[page]}`).classList.add('active');
    $('#pageTitle').textContent = titles[page];

    // Load data
    switch (page) {
        case 'dashboard': loadDashboard(); break;
        case 'files': loadFiles(); break;
        case 'officers': loadOfficers(); break;
        case 'notifications': loadNotifications(); break;
    }

    // Close sidebar on mobile
    $('#sidebar').classList.remove('open');
}

// ─── Dashboard ────────────────────────────────
async function loadDashboard() {
    try {
        const res = await authFetch(`${API}/api/files/stats/summary`);
        const stats = await res.json();

        const total = parseInt(stats.total_files) || 0;
        const active = parseInt(stats.active_files) || 0;
        const overdue = parseInt(stats.overdue_files) || 0;
        const completed = parseInt(stats.completed_files) || 0;

        // Animated stat values
        animateValue('statTotal', total);
        animateValue('statActive', active);
        animateValue('statOverdue', overdue);
        animateValue('statCompleted', completed);

        // Stat percentage subtexts
        setStatPercent('statTotal', null);
        setStatPercent('statActive', total > 0 ? Math.round((active / total) * 100) + '% of total' : null);
        setStatPercent('statOverdue', overdue > 0 ? 'Needs attention' : 'All on track');
        setStatPercent('statCompleted', total > 0 ? Math.round((completed / total) * 100) + '% completion rate' : null);

        // ── Officer workload chart ──
        const chartEl = $('#officerChart');
        if (stats.by_officer && stats.by_officer.length > 0) {
            const maxCount = Math.max(...stats.by_officer.map(o => parseInt(o.file_count) || 1), 1);
            chartEl.innerHTML = stats.by_officer.map(o => {
                const ac = parseInt(o.active_count) || 0;
                const tot = parseInt(o.file_count) || 0;
                return `
                <div class="officer-bar">
                    <div class="officer-bar-info">
                        <span class="officer-bar-avatar">${initials(o.name)}</span>
                        <span class="officer-bar-name" title="${escHtml(o.name)}">${escHtml(o.name)}</span>
                    </div>
                    <div class="officer-bar-track">
                        <div class="officer-bar-fill" style="width: ${(tot / maxCount) * 100}%">
                            <span class="officer-bar-inner-label">${tot}</span>
                        </div>
                    </div>
                    <span class="officer-bar-detail">${ac} active</span>
                </div>
            `;
            }).join('');
        } else {
            chartEl.innerHTML = '<p class="empty-state-text">No officers assigned yet.</p>';
        }

        // ── Process distribution chart ──
        const processEl = $('#processChart');
        const processColors = {
            'Sole Source': { bg: 'rgba(245,158,11,0.15)', fg: '#fbbf24', bar: 'linear-gradient(90deg, #f59e0b, #fbbf24)' },
            'Two Phase Solic': { bg: 'rgba(139,92,246,0.15)', fg: '#a78bfa', bar: 'linear-gradient(90deg, #7c3aed, #a78bfa)' },
            'One Phase Solic': { bg: 'rgba(59,130,246,0.15)', fg: '#60a5fa', bar: 'linear-gradient(90deg, #3b82f6, #60a5fa)' },
            'Service Solic Above TA': { bg: 'rgba(236,72,153,0.15)', fg: '#f472b6', bar: 'linear-gradient(90deg, #ec4899, #f472b6)' },
            'Service Solic Under TA': { bg: 'rgba(16,185,129,0.15)', fg: '#34d399', bar: 'linear-gradient(90deg, #10b981, #34d399)' },
        };
        if (stats.by_process && stats.by_process.length > 0) {
            const maxP = Math.max(...stats.by_process.map(p => parseInt(p.file_count) || 1), 1);
            processEl.innerHTML = stats.by_process.map(p => {
                const c = processColors[p.process_name] || { bg: 'var(--accent-glow)', fg: 'var(--accent-light)', bar: 'linear-gradient(90deg, var(--accent), var(--accent-light))' };
                const ac = parseInt(p.active_count) || 0;
                const tot = parseInt(p.file_count) || 0;
                const pct = total > 0 ? Math.round((tot / total) * 100) : 0;
                return `
                <div class="process-bar">
                    <div class="process-bar-header">
                        <span class="process-bar-badge" style="background:${c.bg};color:${c.fg}">${escHtml(p.process_name)}</span>
                        <span class="process-bar-pct">${pct}%</span>
                    </div>
                    <div class="process-bar-track">
                        <div class="process-bar-fill" style="width:${(tot / maxP) * 100}%;background:${c.bar}"></div>
                    </div>
                    <div class="process-bar-footer">
                        <span>${tot} file${tot !== 1 ? 's' : ''}</span>
                        <span>${ac} active</span>
                    </div>
                </div>
            `;
            }).join('');
        } else {
            processEl.innerHTML = '<p class="empty-state-text">No files yet.</p>';
        }

        // ── Upcoming deadlines ──
        const deadlineEl = $('#upcomingDeadlines');
        if (stats.upcoming_deadlines && stats.upcoming_deadlines.length > 0) {
            deadlineEl.innerHTML = stats.upcoming_deadlines.map(d => {
                const daysLeft = Math.floor(parseFloat(d.days_remaining));
                let urgencyClass = 'deadline-safe';
                let urgencyLabel = `${daysLeft} days left`;
                if (daysLeft < 0) { urgencyClass = 'deadline-overdue'; urgencyLabel = `${Math.abs(daysLeft)} days overdue`; }
                else if (daysLeft <= 2) { urgencyClass = 'deadline-critical'; urgencyLabel = daysLeft === 0 ? 'Due today' : `${daysLeft} day${daysLeft > 1 ? 's' : ''} left`; }
                else if (daysLeft <= 5) { urgencyClass = 'deadline-warning'; }
                return `
                <div class="deadline-item ${urgencyClass}">
                    <div class="deadline-left">
                        <div class="deadline-urgency">
                            <span class="deadline-dot"></span>
                            <span class="deadline-days">${urgencyLabel}</span>
                        </div>
                        <div class="deadline-pr">${escHtml(d.pr_number)}</div>
                        <div class="deadline-meta">${escHtml(d.step_name)} · ${escHtml(d.officer_name)}</div>
                    </div>
                    <div class="deadline-right">
                        <div class="deadline-date">${formatDate(d.deadline)}</div>
                    </div>
                </div>
            `;
            }).join('');
        } else {
            deadlineEl.innerHTML = '<p class="empty-state-text">No upcoming deadlines.</p>';
        }

        // ── Recent files ──
        const filesRes = await authFetch(`${API}/api/files`);
        const files = await filesRes.json();
        const recentEl = $('#recentFiles');
        if (files.length > 0) {
            recentEl.innerHTML = files.slice(0, 5).map(f => `
                <div class="recent-file-item" onclick="loadPage('files'); setTimeout(() => viewFileDetail(${f.id}), 300);" style="cursor:pointer">
                    <div class="recent-file-left">
                        <span class="recent-file-avatar">${initials(f.officer_name)}</span>
                        <div class="recent-file-info">
                            <div class="recent-file-pr">${escHtml(f.pr_number)}</div>
                            <div class="recent-file-title">${escHtml(f.title)}</div>
                        </div>
                    </div>
                    <div class="recent-file-right">
                        <span class="process-tag process-${(f.process_name || '').toLowerCase()}" style="font-size:0.65rem;padding:2px 7px">${formatProcess(f.process_name)}</span>
                        ${statusChip(f)}
                    </div>
                </div>
            `).join('');
        } else {
            recentEl.innerHTML = '<p class="empty-state-text">No files yet.</p>';
        }
    } catch (err) {
        console.error('Dashboard load error:', err);
    }
}

function animateValue(elementId, targetValue) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const duration = 600;
    const start = performance.now();
    const initial = parseInt(el.textContent) || 0;
    function tick(now) {
        const progress = Math.min((now - start) / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(initial + (targetValue - initial) * ease);
        if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

function setStatPercent(elementId, text) {
    const el = document.getElementById(elementId);
    if (!el) return;
    let sub = el.parentElement.querySelector('.stat-sub');
    if (!text) { if (sub) sub.remove(); return; }
    if (!sub) {
        sub = document.createElement('span');
        sub.className = 'stat-sub';
        el.parentElement.appendChild(sub);
    }
    sub.textContent = text;
}

// ─── Files ────────────────────────────────────
async function loadFiles() {
    try {
        const params = new URLSearchParams();
        const officer = $('#filterOfficer').value;
        const process = $('#filterProcess').value;
        const status = $('#filterStatus').value;
        if (officer) params.set('officer_id', officer);
        if (process) params.set('process_name', process);
        if (status) params.set('status', status);

        const res = await authFetch(`${API}/api/files?${params}`);
        const files = await res.json();

        const tbody = $('#filesBody');
        const empty = $('#filesEmpty');

        if (files.length === 0) {
            tbody.innerHTML = '';
            empty.style.display = 'block';
            return;
        }

        empty.style.display = 'none';
        tbody.innerHTML = files.map(f => {
            const stepNum = parseInt(f.step_order) || 1;
            const totalSteps = parseInt(f.total_steps) || 1;
            const stepPct = Math.round((stepNum / totalSteps) * 100);
            const isOverdue = f.is_overdue;
            const daysAgo = Math.floor((Date.now() - new Date(f.created_at).getTime()) / (1000 * 60 * 60 * 24));
            const agoText = daysAgo === 0 ? 'Today' : daysAgo === 1 ? '1 day ago' : `${daysAgo} days ago`;

            return `
            <tr class="${isOverdue ? 'row-overdue' : ''} ${f.status === 'Completed' ? 'row-completed' : ''}">
                <td><span class="pr-number">${escHtml(f.pr_number)}</span></td>
                <td><span class="file-title-cell">${escHtml(f.title)}</span></td>
                <td><span class="process-tag process-${(f.process_name || '').toLowerCase()}">${formatProcess(f.process_name)}</span></td>
                <td>
                    <div class="officer-cell">
                        <span class="officer-cell-avatar">${initials(f.officer_name)}</span>
                        <span>${escHtml(f.officer_name)}</span>
                    </div>
                </td>
                <td>
                    <div class="date-cell">
                        <span class="date-cell-main">${formatDateLong(f.created_at)}</span>
                        <span class="date-cell-ago">${agoText}</span>
                    </div>
                </td>
                <td>
                    <div class="step-cell">
                        <span class="step-cell-name">${escHtml(f.current_step_name || '—')}</span>
                        <div class="step-progress-wrap">
                            <div class="step-progress-bar">
                                <div class="step-progress-fill ${isOverdue ? 'overdue' : f.status === 'Completed' ? 'completed' : ''}" style="width:${stepPct}%"></div>
                            </div>
                            <span class="step-progress-label">${stepNum}/${totalSteps}</span>
                        </div>
                    </div>
                </td>
                <td>${statusChip(f)}</td>
                <td>
                    <div class="actions-cell">
                        <button class="btn btn-sm btn-secondary btn-icon-text" onclick="viewFileDetail(${f.id})" title="View Details">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                            View
                        </button>
                        ${f.status === 'Active' ? `<button class="btn btn-sm btn-success btn-icon-text" onclick="advanceFile(${f.id})" title="Advance Step">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            Advance
                        </button>` : ''}
                    </div>
                </td>
            </tr>
        `;
        }).join('');

        // Populate filters
        await populateFilters();
    } catch (err) {
        console.error('Files load error:', err);
    }
}

async function populateFilters() {
    // Officers filter
    const officerSel = $('#filterOfficer');
    if (officerSel.options.length <= 1) {
        const res = await authFetch(`${API}/api/officers`);
        const officers = await res.json();
        officers.forEach(o => {
            const opt = document.createElement('option');
            opt.value = o.id;
            opt.textContent = o.name;
            officerSel.appendChild(opt);
        });
    }

    // Process filter
    const procSel = $('#filterProcess');
    if (procSel.options.length <= 1) {
        const res = await authFetch(`${API}/api/processes`);
        const procs = await res.json();
        procs.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.name;
            opt.textContent = formatProcess(p.name);
            procSel.appendChild(opt);
        });
    }
}

// Filter event listeners
document.addEventListener('DOMContentLoaded', () => {
    ['filterOfficer', 'filterProcess', 'filterStatus'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', () => loadFiles());
    });
});

// ─── File Detail ──────────────────────────────
async function viewFileDetail(id) {
    try {
        const res = await authFetch(`${API}/api/files/${id}`);
        const file = await res.json();

        $('#detailTitle').textContent = `${file.pr_number} — ${file.title}`;

        const body = $('#detailBody');
        body.innerHTML = `
            <div class="detail-header">
                <div class="detail-field">
                    <span class="detail-field-label">PR Number</span>
                    <span class="detail-field-value">${escHtml(file.pr_number)}</span>
                </div>
                <div class="detail-field">
                    <span class="detail-field-label">Process</span>
                    <span class="detail-field-value">${formatProcess(file.process_name)}</span>
                </div>
                <div class="detail-field">
                    <span class="detail-field-label">Officer</span>
                    <span class="detail-field-value">${escHtml(file.officer_name)}</span>
                </div>
                <div class="detail-field">
                    <span class="detail-field-label">Status</span>
                    <span class="detail-field-value">${statusChip(file)}</span>
                </div>
                <div class="detail-field">
                    <span class="detail-field-label">Created</span>
                    <span class="detail-field-value">${formatDate(file.created_at)}</span>
                </div>
                <div class="detail-field">
                    <span class="detail-field-label">Current Step</span>
                    <span class="detail-field-value">${escHtml(file.current_step_name || '—')}</span>
                </div>
            </div>

            <h3 style="font-size:0.95rem;margin-bottom:16px;">Step Timeline</h3>
            <div class="timeline">
                ${file.steps.map(step => {
            const log = file.step_log.find(l => l.step_id === step.id);
            const isCurrent = step.id === file.current_step_id;
            const isCompleted = log && log.completed_at;
            const isOverdue = isCurrent && file.is_overdue;

            let statusClass = '';
            if (isCompleted) statusClass = 'completed';
            else if (isOverdue) statusClass = 'overdue';
            else if (isCurrent) statusClass = 'current';

            let slaHtml = '';
            if (step.sla_days > 0) {
                if (isCompleted) {
                    slaHtml = log.sla_met
                        ? `<span class="timeline-step-sla sla-met">SLA Met</span>`
                        : `<span class="timeline-step-sla sla-overdue">SLA Missed</span>`;
                } else if (isCurrent) {
                    slaHtml = isOverdue
                        ? `<span class="timeline-step-sla sla-overdue">Overdue</span>`
                        : `<span class="timeline-step-sla sla-pending">In Progress</span>`;
                }
            }

            // Comment section for steps that have a log entry
            let commentHtml = '';
            if (log) {
                const existingComment = log.comment || '';
                commentHtml = `
                    <div class="step-comment-section">
                        <div class="step-comment-header">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                            <span>Comment</span>
                        </div>
                        <textarea class="step-comment-input" 
                            id="comment-${log.id}" 
                            placeholder="Add a comment about SLA status..."
                            data-file-id="${file.id}" 
                            data-log-id="${log.id}">${escHtml(existingComment)}</textarea>
                        <button class="btn btn-sm btn-secondary step-comment-save" 
                            onclick="saveStepComment(${file.id}, ${log.id})">Save Comment</button>
                    </div>
                `;
            }

            return `
                        <div class="timeline-step ${statusClass}">
                            <div class="timeline-dot"></div>
                            <div class="timeline-step-name">${escHtml(step.step_name)}</div>
                            <div class="timeline-step-meta">
                                <span>SLA: ${step.sla_days} day${step.sla_days !== 1 ? 's' : ''}</span>
                                <span>Cumulative: ${step.cum_days} days</span>
                                ${log && log.started_at ? `<span>Started: ${formatDate(log.started_at)}</span>` : ''}
                                ${isCompleted ? `<span>Done: ${formatDate(log.completed_at)}</span>` : ''}
                                ${slaHtml}
                            </div>
                            ${commentHtml}
                        </div>
                    `;
        }).join('')}
            </div>

            ${file.status === 'Active' ? `
                <div class="advance-section">
                    <div class="form-group">
                        <label for="advanceComment">Comment (optional)</label>
                        <textarea id="advanceComment" class="text-input" rows="2" placeholder="Add a comment about this step before advancing..."></textarea>
                    </div>
                    <button class="btn btn-success" onclick="advanceFileWithComment(${file.id})">
                        Advance to Next Step
                    </button>
                </div>
            ` : ''}
        `;

        openModal('modalFileDetail');
    } catch (err) {
        showToast('Failed to load file details', 'error');
    }
}

async function advanceFile(id) {
    try {
        const res = await authFetch(`${API}/api/files/${id}/advance`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error);
        }
        showToast('File advanced to next step', 'success');
        if (currentPage === 'files') loadFiles();
        else if (currentPage === 'dashboard') loadDashboard();
    } catch (err) {
        showToast(err.message || 'Failed to advance', 'error');
    }
}

async function advanceFileWithComment(id) {
    const commentEl = document.getElementById('advanceComment');
    const comment = commentEl ? commentEl.value.trim() : '';
    try {
        const res = await authFetch(`${API}/api/files/${id}/advance`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ comment: comment || null })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error);
        }
        showToast('File advanced to next step', 'success');
        closeModal();
        if (currentPage === 'files') loadFiles();
        else if (currentPage === 'dashboard') loadDashboard();
    } catch (err) {
        showToast(err.message || 'Failed to advance', 'error');
    }
}

async function saveStepComment(fileId, logId) {
    const textarea = document.getElementById(`comment-${logId}`);
    if (!textarea) return;
    const comment = textarea.value.trim();
    try {
        const res = await authFetch(`${API}/api/files/${fileId}/steps/${logId}/comment`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ comment })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error);
        }
        showToast('Comment saved', 'success');
    } catch (err) {
        showToast(err.message || 'Failed to save comment', 'error');
    }
}

// ─── Officers ─────────────────────────────────
async function loadOfficers() {
    try {
        const res = await authFetch(`${API}/api/officers`);
        const officers = await res.json();

        const grid = $('#officersGrid');
        const empty = $('#officersEmpty');

        if (officers.length === 0) {
            grid.innerHTML = '';
            empty.style.display = 'block';
            return;
        }

        empty.style.display = 'none';
        grid.innerHTML = officers.map(o => {
            const hasFiles = parseInt(o.file_count) > 0;
            const ac = parseInt(o.active_count) || 0;
            const comp = parseInt(o.completed_count) || 0;
            const total = parseInt(o.file_count) || 0;
            const workloadPct = total > 0 ? Math.round((ac / total) * 100) : 0;
            return `
            <div class="officer-card ${hasFiles ? 'officer-card-active' : ''}">
                <div class="officer-card-top">
                    <div class="officer-card-identity">
                        <div class="officer-avatar-lg">
                            ${initials(o.name)}
                            ${ac > 0 ? '<span class="officer-status-dot"></span>' : ''}
                        </div>
                        <div>
                            <div class="officer-name">${escHtml(o.name)}</div>
                            <div class="officer-email">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                                ${escHtml(o.email)}
                            </div>
                        </div>
                    </div>
                    <div class="officer-card-actions">
                        ${hasFiles ? `
                            <button class="btn btn-sm btn-transfer btn-icon-text" onclick="openTransferModal(${o.id}, '${escHtml(o.name)}', ${o.file_count})">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                                Transfer
                            </button>
                        ` : `
                            <button class="btn btn-sm btn-danger btn-icon-text" onclick="deleteOfficer(${o.id}, '${escHtml(o.name)}')">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                Remove
                            </button>
                        `}
                    </div>
                </div>
                ${total > 0 ? `
                <div class="officer-workload">
                    <div class="officer-workload-bar">
                        <div class="officer-workload-fill" style="width:${workloadPct}%"></div>
                    </div>
                    <span class="officer-workload-label">${workloadPct}% active</span>
                </div>
                ` : ''}
                <div class="officer-stats">
                    <div class="officer-stat">
                        <span class="officer-stat-val officer-stat-total">${total}</span>
                        <span class="officer-stat-lbl">Total</span>
                    </div>
                    <div class="officer-stat">
                        <span class="officer-stat-val officer-stat-active">${ac}</span>
                        <span class="officer-stat-lbl">Active</span>
                    </div>
                    <div class="officer-stat">
                        <span class="officer-stat-val officer-stat-completed">${comp}</span>
                        <span class="officer-stat-lbl">Completed</span>
                    </div>
                </div>
            </div>
        `;
        }).join('');
    } catch (err) {
        console.error('Officers load error:', err);
    }
}

async function deleteOfficer(id, name) {
    if (!confirm(`Remove officer "${name}"?`)) return;
    try {
        const res = await authFetch(`${API}/api/officers/${id}`, { method: 'DELETE' });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error);
        }
        showToast('Officer removed', 'success');
        loadOfficers();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ─── File Transfer ────────────────────────────
let transferFromId = null;

async function openTransferModal(fromId, fromName, fileCount) {
    transferFromId = fromId;

    // Load other officers for the dropdowns
    const offRes = await authFetch(`${API}/api/officers`);
    const officers = await offRes.json();
    const otherOfficers = officers.filter(o => o.id !== fromId);

    if (otherOfficers.length === 0) {
        showToast('No other officers available to transfer to. Add a new officer first.', 'error');
        return;
    }

    // Load active files for this officer
    const filesRes = await authFetch(`${API}/api/files?officer_id=${fromId}&status=Active`);
    const files = await filesRes.json();

    // Build officer options HTML (reused per-file)
    const optionsHtml = '<option value="">— Keep —</option>' +
        otherOfficers.map(o => `<option value="${o.id}">${escHtml(o.name)}</option>`).join('');

    // Populate transfer info
    $('#transferInfo').innerHTML = `
        Transferring files from <strong>${escHtml(fromName)}</strong>. 
        Select a target officer for each file, or leave as <em>— Keep —</em> to skip.
    `;

    // Show file list with per-file dropdowns
    const listEl = $('#transferFileList');
    if (files.length > 0) {
        listEl.innerHTML = files.map(f => `
            <div class="transfer-file-item">
                <div class="transfer-file-info">
                    <span class="transfer-file-pr">${escHtml(f.pr_number)}</span>
                    <span class="transfer-file-title">${escHtml(f.title)}</span>
                    <span class="transfer-file-process">${formatProcess(f.process_name)}</span>
                </div>
                <select class="select-input transfer-file-select" data-file-id="${f.id}">
                    ${optionsHtml}
                </select>
            </div>
        `).join('');
    } else {
        listEl.innerHTML = '<div class="transfer-empty">No active files to transfer.</div>';
    }

    // Show the transfer overlay
    $('#transferOverlay').classList.add('active');
}

function closeTransferModal() {
    $('#transferOverlay').classList.remove('active');
    transferFromId = null;
}

function setAllTransferDropdowns() {
    // Helper: set all file dropdowns to the same officer
    const selects = $$('.transfer-file-select');
    const firstVal = selects.length > 0 ? selects[0].value : '';
    selects.forEach(s => s.value = firstVal);
}

async function confirmTransfer() {
    // Collect per-file assignments
    const selects = $$('.transfer-file-select');
    const transfers = [];
    selects.forEach(sel => {
        const fileId = parseInt(sel.dataset.fileId);
        const toOfficerId = sel.value ? parseInt(sel.value) : null;
        if (toOfficerId) {
            transfers.push({ file_id: fileId, to_officer_id: toOfficerId });
        }
    });

    if (transfers.length === 0) {
        showToast('Select at least one target officer for a file', 'error');
        return;
    }

    try {
        const res = await authFetch(`${API}/api/officers/${transferFromId}/transfer`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transfers })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error);
        }

        const data = await res.json();
        const count = data.transferred_count;

        showToast(`${count} file${count !== 1 ? 's' : ''} transferred successfully`, 'success');

        // Send email notification per target officer
        for (const group of data.grouped_transfers) {
            if (group.to_officer && group.to_officer.email && group.files.length > 0) {
                sendFileTransferEmail(
                    group.to_officer.name,
                    group.to_officer.email,
                    data.from_officer.name,
                    group.files
                );
            }
        }

        closeTransferModal();
        loadOfficers();
        if (currentPage === 'files') loadFiles();
        if (currentPage === 'dashboard') loadDashboard();
    } catch (err) {
        showToast(err.message || 'Transfer failed', 'error');
    }
}

function sendFileTransferEmail(toName, toEmail, fromName, files) {
    const fileList = files.map(f => `  • ${f.pr_number} — ${f.title} (${f.process_name.replace(/_/g, ' ')})`).join('\n');

    const subject = `Procurement Files Transferred to You from ${fromName}`;
    const body = `Dear ${toName},

${files.length} procurement file${files.length !== 1 ? 's have' : ' has'} been transferred to you from ${fromName}. Please find the details below:

─────────────────────────────
${fileList}
─────────────────────────────

Please log in to the FileTracker system to review and continue processing these files.

Thank you,
Procurement File Tracking System`;

    sendEmail({ to: toEmail, subject, body });
}

// ─── Notifications ────────────────────────────
async function loadNotifications() {
    try {
        const res = await authFetch(`${API}/api/notifications`);
        const notifs = await res.json();

        const list = $('#notificationsList');
        const empty = $('#notifsEmpty');

        if (notifs.length === 0) {
            list.innerHTML = '';
            empty.style.display = 'block';
            return;
        }

        empty.style.display = 'none';
        list.innerHTML = notifs.map(n => `
            <div class="notif-card ${n.is_read ? 'read' : 'unread'}">
                <div class="notif-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                </div>
                <div class="notif-content">
                    <div class="notif-message">${escHtml(n.message)}</div>
                    <div class="notif-meta">
                        <span>${escHtml(n.officer_name)}</span>
                        <span>${formatDate(n.created_at)}</span>
                    </div>
                </div>
                <div class="notif-actions">
                    ${!n.is_read ? `<button class="btn btn-sm btn-secondary" onclick="markRead(${n.id})">Mark Read</button>` : ''}
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('Notifications load error:', err);
    }
}

async function markRead(id) {
    try {
        await authFetch(`${API}/api/notifications/${id}/read`, { method: 'PUT' });
        loadNotifications();
        pollNotifications();
    } catch (err) {
        showToast('Failed to mark read', 'error');
    }
}

async function pollNotifications() {
    try {
        const res = await authFetch(`${API}/api/notifications/count`);
        const { count } = await res.json();
        const badge = $('#headerNotifBadge');
        const navBadge = $('#navNotifBadge');
        if (count > 0) {
            badge.textContent = count;
            badge.style.display = 'flex';
            navBadge.textContent = count;
            navBadge.style.display = 'inline-flex';
        } else {
            badge.style.display = 'none';
            navBadge.style.display = 'none';
        }
    } catch (err) { /* silent */ }
}

// ─── Modals ───────────────────────────────────
function initModals() {
    const overlay = $('#modalOverlay');
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });

    $$('[data-close]').forEach(btn => {
        btn.addEventListener('click', closeModal);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });
}

function openModal(modalId) {
    $$('.modal').forEach(m => m.style.display = 'none');
    $(`#${modalId}`).style.display = 'block';
    $('#modalOverlay').classList.add('active');
}

function closeModal() {
    // If locked, do not close
    if ($('#modalOverlay').classList.contains('locked')) return;

    $('#modalOverlay').classList.remove('active');
    $$('.modal').forEach(m => m.style.display = 'none');
}

// ─── Forms ────────────────────────────────────
function initForms() {
    // New File form
    $('#formNewFile').addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
            pr_number: $('#inputPR').value.trim(),
            title: $('#inputTitle').value.trim(),
            process_name: $('#inputProcess').value,
            officer_id: parseInt($('#inputOfficer').value)
        };

        // Optional backdate fields
        const assignedDate = $('#inputAssignedDate').value;
        if (assignedDate) data.assigned_date = assignedDate;

        const currentStep = $('#inputCurrentStep').value;
        if (currentStep) data.current_step_order = parseInt(currentStep);

        try {
            const res = await authFetch(`${API}/api/files`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error);
            }
            showToast('Procurement file created!', 'success');

            // Send assignment email via mailto:
            const officerSelect = $('#inputOfficer');
            const selectedOption = officerSelect.options[officerSelect.selectedIndex];
            const officerName = selectedOption.textContent;
            const officerEmail = selectedOption.dataset.email || '';
            const processName = $('#inputProcess').value;
            sendFileAssignmentEmail(
                officerName,
                officerEmail,
                data.title,
                data.pr_number,
                processName
            );

            closeModal();
            e.target.reset();
            loadFiles();
        } catch (err) {
            showToast(err.message || 'Failed to create file', 'error');
        }
    });

    // New Officer form
    $('#formNewOfficer').addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
            name: $('#inputOfficerName').value.trim(),
            email: $('#inputOfficerEmail').value.trim()
        };

        try {
            const res = await authFetch(`${API}/api/officers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error);
            }
            showToast('Officer added!', 'success');
            closeModal();
            e.target.reset();
            loadOfficers();
        } catch (err) {
            showToast(err.message || 'Failed to add officer', 'error');
        }
    });
}

// ─── Actions ──────────────────────────────────
function initActions() {
    $('#btnNewFile').addEventListener('click', async () => {
        // Populate dropdowns
        const [procsRes, offRes] = await Promise.all([
            authFetch(`${API}/api/processes`),
            authFetch(`${API}/api/officers`)
        ]);
        const procs = await procsRes.json();
        const officers = await offRes.json();

        const procSel = $('#inputProcess');
        procSel.innerHTML = '<option value="">Select process...</option>' +
            procs.map(p => `<option value="${p.name}">${formatProcess(p.name)}</option>`).join('');

        const offSel = $('#inputOfficer');
        offSel.innerHTML = '<option value="">Select officer...</option>' +
            officers.map(o => `<option value="${o.id}" data-email="${escHtml(o.email)}">${escHtml(o.name)}</option>`).join('');

        // Reset optional fields
        $('#inputAssignedDate').value = '';
        $('#inputCurrentStep').innerHTML = '<option value="">Step 1 (start from beginning)</option>';

        // When process changes, load steps for the step dropdown
        procSel.onchange = async () => {
            const stepSel = $('#inputCurrentStep');
            const processName = procSel.value;
            if (!processName) {
                stepSel.innerHTML = '<option value="">Step 1 (start from beginning)</option>';
                return;
            }
            try {
                const stepsRes = await authFetch(`${API}/api/processes/${processName}/steps`);
                const steps = await stepsRes.json();
                stepSel.innerHTML = '<option value="">Step 1 — ' + escHtml(steps[0]?.step_name || 'Start') + ' (beginning)</option>' +
                    steps.slice(1).map(s => `<option value="${s.step_order}">Step ${s.step_order} — ${escHtml(s.step_name)}</option>`).join('');
            } catch (err) {
                stepSel.innerHTML = '<option value="">Step 1 (start from beginning)</option>';
            }
        };

        openModal('modalNewFile');
    });

    $('#btnNewOfficer').addEventListener('click', () => {
        openModal('modalNewOfficer');
    });

    $('#btnReadAll').addEventListener('click', async () => {
        try {
            await authFetch(`${API}/api/notifications/read-all`, { method: 'PUT' });
            showToast('All notifications marked as read', 'success');
            loadNotifications();
            pollNotifications();
        } catch (err) {
            showToast('Failed', 'error');
        }
    });

    $('#btnCheckSLA').addEventListener('click', async () => {
        try {
            showToast('Running SLA check...', 'info');
            const res = await authFetch(`${API}/api/sla-check`, { method: 'POST' });
            if (res.ok) {
                showToast('SLA check completed', 'success');
                pollNotifications();
                if (currentPage === 'notifications') loadNotifications();
                if (currentPage === 'dashboard') loadDashboard();
            }
        } catch (err) {
            showToast('SLA check failed', 'error');
        }
    });

    // Transfer modal buttons
    $('#btnCloseTransfer').addEventListener('click', closeTransferModal);
    $('#btnCancelTransfer').addEventListener('click', closeTransferModal);
    $('#btnConfirmTransfer').addEventListener('click', confirmTransfer);
    $('#transferOverlay').addEventListener('click', (e) => {
        if (e.target === $('#transferOverlay')) closeTransferModal();
    });
}

// ─── Helpers ──────────────────────────────────
function escHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatProcess(name) {
    if (!name) return '';
    return name.replace(/_/g, ' ');
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateLong(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
}

function statusChip(file) {
    if (file.status === 'Completed') {
        return '<span class="status-chip status-completed"><span class="status-dot"></span>Completed</span>';
    }
    if (file.is_overdue) {
        return '<span class="status-chip status-overdue"><span class="status-dot"></span>Overdue</span>';
    }
    return '<span class="status-chip status-active"><span class="status-dot"></span>Active</span>';
}

function initials(name) {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// ─── Email (mailto:) ──────────────────────────
function sendEmail({ to, subject, body }) {
    const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoUrl, '_blank');
}

function sendFileAssignmentEmail(officerName, officerEmail, fileName, fileId, processType) {
    if (!officerEmail) {
        showToast('Officer email not available — email skipped', 'info');
        return;
    }

    const subject = `New Procurement File Assigned: ${fileName}`;
    const body = `Dear ${officerName},

You have been assigned a new procurement file. Please find the details below:

─────────────────────────────
File Name: ${fileName}
PR Number: ${fileId}
Process Type: ${processType.replace(/_/g, ' ')}
─────────────────────────────

Please log in to the FileTracker system to review and begin processing this file.

Thank you,
Procurement File Tracking System`;

    sendEmail({ to: officerEmail, subject, body });
}

function showToast(message, type = 'info') {
    const container = $('#toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        toast.style.transition = '0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// ─── Authentication ───────────────────────────
function initAuth() {
    // Login form
    $('#formLogin').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = $('#loginUsername').value.trim();
        const password = $('#loginPassword').value;
        const errorEl = $('#loginError');
        const btn = $('#loginBtn');

        errorEl.style.display = 'none';
        btn.textContent = 'Signing in...';
        btn.disabled = true;

        try {
            const res = await fetch(`${API}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Login failed');
            }

            // Store token and user data
            authToken = data.token;
            currentUser = data.user;
            localStorage.setItem('authToken', authToken);

            // Update UI
            updateUserUI(currentUser);
            showApp();
            loadPage('dashboard');
            pollNotifications();
            setInterval(pollNotifications, 60000);
            showToast(`Welcome, ${currentUser.displayName}!`, 'success');

            // Check if password change is required
            if (currentUser.passwordChanged === false) {
                forcePasswordChange();
            }
        } catch (err) {
            errorEl.textContent = err.message;
            errorEl.style.display = 'block';
        } finally {
            btn.textContent = 'Sign In';
            btn.disabled = false;
        }
    });

    // Change Password form
    $('#formChangePassword').addEventListener('submit', async (e) => {
        e.preventDefault();
        const currentPassword = $('#inputCurrentPassword').value;
        const newPassword = $('#inputNewPassword').value;
        const confirmPassword = $('#inputConfirmPassword').value;

        if (newPassword !== confirmPassword) {
            showToast('New passwords do not match', 'error');
            return;
        }

        if (newPassword.length < 6) {
            showToast('Password must be at least 6 characters', 'error');
            return;
        }

        try {
            const res = await authFetch(`${API}/api/auth/password`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword, newPassword })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to change password');
            }

            showToast('Password updated successfully!', 'success');
            closeModal();
            showToast('Password updated successfully!', 'success');
            closeModal();
            e.target.reset();

            // If we were in forced mode, reload to reset state/buttons
            if ($('#modalChangePassword .btn-close').style.display === 'none') {
                window.location.reload();
            }
        } catch (err) {
            showToast(err.message || 'Failed to change password', 'error');
        }
    });

    // Check if already logged in
    if (authToken) {
        verifyToken();
    } else {
        hideApp();
    }
}

async function verifyToken() {
    try {
        const res = await fetch(`${API}/api/auth/me`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!res.ok) throw new Error('Invalid token');

        currentUser = await res.json();
        updateUserUI(currentUser);
        showApp();
        loadPage('dashboard');
        pollNotifications();
        pollNotifications();
        setInterval(pollNotifications, 60000);

        // Check if password change is required
        if (currentUser.passwordChanged === false) {
            forcePasswordChange();
        }
    } catch (err) {
        // Token invalid — show login
        authToken = null;
        localStorage.removeItem('authToken');
        hideApp();
    }
}

function logout() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('authToken');
    hideApp();
    $('#loginUsername').value = '';
    $('#loginPassword').value = '';
    $('#loginError').style.display = 'none';
}

function showApp() {
    $('#loginScreen').classList.add('hidden');
    $('#sidebar').classList.remove('app-hidden');
    document.querySelector('.main-content').classList.remove('app-hidden');
}

function hideApp() {
    $('#loginScreen').classList.remove('hidden');
    $('#sidebar').classList.add('app-hidden');
    document.querySelector('.main-content').classList.add('app-hidden');
}

function updateUserUI(user) {
    if (!user) return;
    const init = initials(user.displayName);
    const name = user.displayName;

    // Header avatar & dropdown
    $('#headerAvatar').textContent = init;
    $('#dropdownName').textContent = name;

    // Sidebar user
    $('#sidebarAvatar').textContent = init;
    $('#sidebarUserName').textContent = name;
}

function initUserMenu() {
    const trigger = $('#btnUserMenu');
    const dropdown = $('#userDropdown');

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('active');
    });

    // Close dropdown on outside click
    document.addEventListener('click', () => {
        dropdown.classList.remove('active');
    });

    // Change Password button
    $('#btnChangePassword').addEventListener('click', () => {
        dropdown.classList.remove('active');
        openModal('modalChangePassword');
    });

    // Logout button
    $('#btnLogout').addEventListener('click', () => {
        dropdown.classList.remove('active');
        logout();
        showToast('Signed out successfully', 'info');
    });
}

function forcePasswordChange() {
    openModal('modalChangePassword');

    const modal = $('#modalChangePassword');

    // Hide Close button in header
    const headerClose = modal.querySelector('.btn-close');
    if (headerClose) headerClose.style.display = 'none';

    // Hide Cancel button in footer
    const cancelBtn = modal.querySelector('.modal-footer .btn-secondary');
    if (cancelBtn) cancelBtn.style.display = 'none';

    // Add explanation message if not present
    let msg = modal.querySelector('.force-msg');
    if (!msg) {
        msg = document.createElement('div');
        msg.className = 'force-msg';
        msg.textContent = 'For security, you must change your password before continuing.';
        msg.style.cssText = 'background:rgba(245, 158, 11, 0.15); color:var(--text-primary); border:1px solid rgba(245, 158, 11, 0.4); border-radius:6px; padding:10px 14px; margin-bottom:16px; font-size:0.9rem;';

        // Prepend to form
        const form = $('#formChangePassword');
        if (form) form.insertBefore(msg, form.firstChild);
    }

    // Lock the overlay
    $('#modalOverlay').classList.add('locked');
}
