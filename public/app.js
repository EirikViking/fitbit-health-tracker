
// State
let charts = {};
let dashboardData = null;
let currentPeriod = localStorage.getItem('fitbit_period') || "daily";
const $ = (id) => document.getElementById(id);

// Init
document.addEventListener('DOMContentLoaded', () => {
    $('syncBtn').addEventListener('click', handleSync);
    $('closeModal').addEventListener('click', () => $('dayModal').classList.remove('open'));

    // Init granular buttons state
    setPeriod(currentPeriod, false); // false = don't render yet, just UI state

    // Close modal on outside click
    $('dayModal').addEventListener('click', (e) => {
        if (e.target.id === 'dayModal') $('dayModal').classList.remove('open');
    });

    loadDashboard();
    pollBackfillStatus();
});

// Period toggle function
window.setPeriod = function (period, shouldRender = true) {
    currentPeriod = period;
    localStorage.setItem('fitbit_period', period);

    // Update all period switchers (if multiple exist)
    document.querySelectorAll("[data-period]").forEach(btn => {
        if (btn.dataset.period === period) {
            btn.classList.add("active");
            btn.setAttribute("aria-pressed", "true");
        } else {
            btn.classList.remove("active");
            btn.setAttribute("aria-pressed", "false");
        }
    });

    if (shouldRender && dashboardData) {
        renderAll();
    }
};

window.renderAll = function () {
    console.log('[App] Rendering all with period:', currentPeriod);
    renderCharts();
    renderKPIs(dashboardData);
    renderSleepTab(dashboardData);
    renderRecoveryTab(dashboardData);
    renderActivityTab(dashboardData);
    renderExportTab(dashboardData); // Ensure exports updated
};

window.switchTab = function (tabName) {
    document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
    const target = document.getElementById(`tab-${tabName}`);
    if (target) target.classList.add('active');

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Resize charts if they are in the visible tab
    if (tabName === 'sleep' && charts.sleep) charts.sleep.resize();
    if (tabName === 'recovery') {
        if (charts.hr) charts.hr.resize();
        if (charts.hrv) charts.hrv.resize();
    }
    // Activity charts handling if added later
};

// Data normalization
function weekKeyToISODate(weekKey) {
    const [year, week] = weekKey.split('-W').map(Number);
    const jan4 = new Date(year, 0, 4);
    const monday = new Date(jan4);
    monday.setDate(jan4.getDate() - (jan4.getDay() || 7) + 1 + (week - 1) * 7);
    return monday.toISOString().split('T')[0];
}

function monthKeyToISODate(monthKey) {
    return `${monthKey}-01`;
}

function aggregateMetrics(series, keyFn) {
    if (!Array.isArray(series) || series.length === 0) return {};
    const map = {};

    series.forEach(d => {
        if (!d.date) return;
        const key = keyFn(d.date);

        if (!map[key]) {
            map[key] = {
                count: 0,
                restingHrSum: 0, restingHrCount: 0,
                hrvSum: 0, hrvCount: 0,
                sleepSum: 0, sleepCount: 0,
                steps: 0,
                caloriesOut: 0,
                distanceKm: 0,
                azm: 0
            };
        }

        const m = map[key];
        m.count++;

        // Averages
        if (d.restingHr > 0) { m.restingHrSum += Number(d.restingHr); m.restingHrCount++; }
        if (d.hrvRmssd > 0) { m.hrvSum += Number(d.hrvRmssd); m.hrvCount++; }
        if (d.sleepMinutes > 0) { m.sleepSum += Number(d.sleepMinutes); m.sleepCount++; }

        // Sums
        m.steps += Number(d.steps || 0);
        m.caloriesOut += Number(d.caloriesOut || 0);
        m.distanceKm += Number(d.distanceKm || 0);
        m.azm += Number(d.azm || 0);
    });

    const result = {};
    Object.keys(map).forEach(k => {
        const m = map[k];
        result[k] = {
            restingHr: m.restingHrCount > 0 ? m.restingHrSum / m.restingHrCount : null,
            hrv: m.hrvCount > 0 ? m.hrvSum / m.hrvCount : null,
            sleepMinutes: m.sleepCount > 0 ? m.sleepSum / m.sleepCount : null, // keep total mins? No, avg sleep duration per night is better for weekly/monthly bars.
            totalSleepMinutes: m.sleepSum, // Keep total for consistency check if needed
            steps: m.steps, // Sum
            caloriesOut: m.caloriesOut, // Sum
            distanceKm: m.distanceKm, // Sum
            azm: m.azm, // Sum
            days: m.count
        };
    });
    return result;
}

function normalizeForPeriod(dashboardData, period) {
    if (!dashboardData) return [];
    const series = Array.isArray(dashboardData.series) ? dashboardData.series : [];

    if (period === 'daily') {
        return series.map(d => ({
            date: d.date,
            restingHr: d.restingHr,
            hrv: d.hrvRmssd,
            sleepMinutes: d.sleepMinutes,
            steps: d.steps,
            caloriesOut: d.caloriesOut,
            distanceKm: d.distanceKm,
            azm: d.azm
        }));
    }

    let map = {};
    if (period === 'weekly') {
        map = aggregateMetrics(series, (dateStr) => {
            const date = new Date(dateStr + 'T00:00:00Z');
            const year = date.getUTCFullYear();
            const jan4 = new Date(Date.UTC(year, 0, 4));
            const daysSinceJan4 = (date - jan4) / 86400000;
            const weekNum = Math.ceil((daysSinceJan4 + jan4.getUTCDay() + 1) / 7);
            return `${year}-W${String(weekNum).padStart(2, '0')}`;
        });
        return Object.entries(map).map(([key, m]) => ({
            date: weekKeyToISODate(key),
            ...m
        })).sort((a, b) => a.date.localeCompare(b.date));
    }

    if (period === 'monthly') {
        map = aggregateMetrics(series, (dateStr) => dateStr.slice(0, 7));
        return Object.entries(map).map(([key, m]) => ({
            date: monthKeyToISODate(key),
            ...m
        })).sort((a, b) => a.date.localeCompare(b.date));
    }

    return [];
}

async function loadDashboard() {
    try {
        // 1. Check if we are connected by fetching today (fastest check)
        // If today returns 401, show connect screen
        // Note: Use /api/today just for auth check fallback
        const authRes = await fetch('/api/today');
        if (authRes.status === 401) {
            $('connectSection').classList.remove('hidden');
            $('dashboardSection').classList.add('hidden');
            return;
        }

        $('connectSection').classList.add('hidden');
        $('dashboardSection').classList.remove('hidden');

        // 2. Fetch History (30 days)
        const histRes = await fetch('/api/history?days=30');
        if (!histRes.ok) throw new Error('Failed to fetch history');
        const data = await histRes.json();

        // Store dashboard data globally
        dashboardData = data;

        // Log counts
        const seriesLen = Array.isArray(data.series) ? data.series.length : 0;
        const weeklyKeyCount = data.weekly ? Object.keys(data.weekly).length : 0;
        const monthlyKeyCount = data.monthly ? Object.keys(data.monthly).length : 0;
        console.log(`[history] series ${seriesLen}, weeklyKeys ${weeklyKeyCount}, monthlyKeys ${monthlyKeyCount}`);

        // Safety check for array
        const series = Array.isArray(data.series) ? data.series : [];

        if (series.length > 0) {
            console.log('Sample Data Key check:', Object.keys(series[0]));
        }

        renderCharts();
        renderKPIs(data);
        renderSleepTab(data);
        renderRecoveryTab(data);
        renderActivityTab(data);

        // Update status
        if (series.length > 0) {
            const last = series[series.length - 1];
            $('syncStatus').textContent = `Last data: ${last.date}`;
        } else {
            $('syncStatus').textContent = 'No data found. Try syncing.';
        }

    } catch (err) {
        console.error(err);
        showToast(err.message || 'Error loading dashboard', 'error');
    }
}

function renderCharts() {
    if (!dashboardData) return;

    // Normalize data for current period
    const rows = normalizeForPeriod(dashboardData, currentPeriod);

    // Defensive empty case
    if (rows.length === 0) {
        console.warn(`[charts] no rows for period ${currentPeriod}`);
        // Clear existing charts
        if (charts.hr) charts.hr.destroy();
        if (charts.sleep) charts.sleep.destroy();
        if (charts.hrv) charts.hrv.destroy();
        return;
    }

    // Build labels and numeric arrays
    const labels = rows.map(r => r.date);
    const resting = rows.map(r => Number(r.restingHr) || null);
    const sleep = rows.map(r => Number(r.sleepMinutes) || null);
    const hrv = rows.map(r => Number(r.hrv) || null);

    // Config
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.color = '#666';

    const ctxHR = $('chartHR').getContext('2d');
    const ctxSleep = $('chartSleep').getContext('2d');
    const ctxHRV = $('chartHRV').getContext('2d');

    // Destroy existing
    if (charts.hr) charts.hr.destroy();
    if (charts.sleep) charts.sleep.destroy();
    if (charts.hrv) charts.hrv.destroy();

    // Single point handling
    const isSinglePoint = labels.length === 1;
    // Format labels based on granularity
    const displayLabels = labels.map(d => {
        if (currentPeriod === 'monthly') return d.slice(0, 7); // YYYY-MM
        return d.slice(5); // MM-DD
    });

    // 1. Resting HR
    charts.hr = new Chart(ctxHR, {
        type: 'line',
        data: {
            labels: displayLabels,
            datasets: [{
                label: 'Resting HR',
                data: resting,
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                tension: 0.3,
                fill: true,
                pointRadius: isSinglePoint ? 6 : 4,
                pointHoverRadius: 6,
                showLine: !isSinglePoint
            }]
        },
        options: createChartOptions('bpm', rows)
    });

    // 2. Sleep
    charts.sleep = new Chart(ctxSleep, {
        type: 'bar',
        data: {
            labels: displayLabels,
            datasets: [{
                label: 'Sleep Hours',
                data: sleep.map(mins => mins ? (mins / 60).toFixed(1) : 0),
                backgroundColor: '#3b82f6',
                borderRadius: 4
            }]
        },
        options: createChartOptions('hrs', rows)
    });

    // 3. HRV
    charts.hrv = new Chart(ctxHRV, {
        type: 'line',
        data: {
            labels: displayLabels,
            datasets: [{
                label: 'HRV (RMSSD)',
                data: hrv,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                tension: 0.3,
                fill: true,
                pointRadius: isSinglePoint ? 6 : 4,
                pointHoverRadius: 6,
                showLine: !isSinglePoint
            }]
        },
        options: createChartOptions('ms', rows)
    });
}

function createChartOptions(unit, fullData) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                mode: 'index',
                intersect: false,
                callbacks: {
                    label: (ctx) => `${ctx.dataset.label}: ${ctx.raw} ${unit}`
                }
            }
        },
        scales: {
            y: { beginAtZero: false, grid: { color: 'rgba(0,0,0,0.05)' } },
            x: { grid: { display: false } }
        },
        onClick: (e, activeEls) => {
            if (activeEls.length > 0) {
                const index = activeEls[0].index;
                const record = fullData[index];
                if (record) showDayDetails(record.date);
            }
        }
    };
}

// Fetch single day details
async function showDayDetails(date) {
    try {
        $('modalDate').textContent = new Date(date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const container = $('modalMetrics');
        container.innerHTML = '<div class="metric-box">Loading...</div>';

        $('dayModal').classList.add('open');

        const res = await fetch(`/api/day?date=${date}`);
        if (!res.ok) throw new Error('Could not fetch details');
        const json = await res.json();
        const d = json.metrics;

        if (!d) {
            container.innerHTML = '<p>No details available for this date.</p>';
            return;
        }

        container.innerHTML = '';

        const metrics = [
            { label: 'Steps', val: d.steps?.toLocaleString() },
            { label: 'Calories', val: d.caloriesOut?.toLocaleString() },
            { label: 'Distance', val: `${d.distanceKm} km` },
            { label: 'Zone Mins', val: d.azm },
            { label: 'Resting HR', val: `${d.restingHr} bpm` },
            { label: 'HRV', val: `${d.hrvRmssd} ms` },
            { label: 'Sleep', val: `${Math.floor(d.sleepMinutes / 60)}h ${d.sleepMinutes % 60}m` },
            { label: 'Efficiency', val: `${d.sleepEfficiency}%` }
        ];

        metrics.forEach(m => {
            if (m.val !== undefined && m.val !== null && m.val !== 'undefined' && m.val !== 'null') {
                const div = document.createElement('div');
                div.className = 'metric-box';
                div.innerHTML = `<div class="metric-label">${m.label}</div><div class="metric-value">${m.val}</div>`;
                container.appendChild(div);
            }
        });

    } catch (err) {
        console.error(err);
        $('modalMetrics').innerHTML = '<p class="text-error">Failed to load details.</p>';
    }
}

async function handleSync() {
    const btn = $('syncBtn');
    const txt = btn.querySelector('.icon');

    try {
        btn.disabled = true;
        txt.classList.add('spin'); // simplistic animation class if we added it, or just text
        btn.textContent = 'Syncing...';

        const res = await fetch('/api/sync', { method: 'POST' });
        if (!res.ok) throw new Error('Sync failed');
        const json = await res.json();

        showToast(`Synced! ${json.synced.join(', ')}`, 'success');
        await loadDashboard();

    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="icon">🔄</span> Sync Now';
    }
}

function showToast(msg, type = 'info') {
    const div = document.createElement('div');
    div.className = 'toast';
    div.style.borderLeft = `4px solid ${type === 'error' ? 'var(--error-color)' : 'var(--success-color)'}`;
    div.textContent = msg;
    $('toastBucket').appendChild(div);
    setTimeout(() => div.remove(), 4000);
}


// --- Backfill Polling ---
async function pollBackfillStatus() {

    const fetchStatus = async () => {
        try {
            // Fetch both status and auth state in parallel
            const [bfRes, authRes] = await Promise.all([
                fetch('/api/backfill/plan/status'),
                fetch('/api/auth/status')
            ]);

            if (!bfRes.ok) return 60000;
            const data = await bfRes.json();

            // Merge auth status if available
            if (authRes.ok) {
                const authData = await authRes.json();
                data.authStatus = authData;
            }

            renderBackfillCard(data);

            // Determine next poll interval
            if (data.progress?.running) return 5000;
            if (data.plan?.active || (data.progress?.failedDays && data.progress.failedDays.length > 0)) return 15000;
            return 60000;
        } catch (e) {
            console.error("Backfill poll error", e);
            return 60000;
        }
    };

    const run = async () => {
        const interval = await fetchStatus();
        setTimeout(run, interval);
    };

    run();
}

function fmtLocalDateTime(ts) {
    if (!ts) return "—";
    return new Date(ts).toLocaleString(undefined, {
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric'
    });
}

function fmtAge(ts) {
    if (!ts) return "";
    const diff = Date.now() - new Date(ts).getTime();
    if (isNaN(diff) || diff < 0) return "";
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 172800000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
}

function fmtLocalWithAge(ts) {
    if (!ts) return "—";
    const age = fmtAge(ts);
    const local = fmtLocalDateTime(ts);
    return age ? `${local} (${age})` : local;
}

function renderBackfillCard(data) {
    try {
        const card = $('backfillCard');
        if (!card) return;
        const { plan, progress, estimatedRemainingDays, lastUpdatedAt, authStatus } = data;

        if (!plan && !progress) {
            card.classList.add('hidden');
            return;
        }
        card.classList.remove('hidden');

        // Mappings
        const isRunning = progress?.running;
        const isActive = plan?.active;
        const failedDays = progress?.failedDays || [];
        const hasFailed = failedDays.length > 0;
        const done = progress?.processedDays >= progress?.totalDays && progress?.totalDays > 0;

        // --- Auth Logic Refinement ---
        const sysAuthRequired = authStatus?.authRequired === true;
        const staleAuthError = progress?.lastError === 'Auth required' || (hasFailed && failedDays[0].errorType === 'auth_required');

        // Effective Auth Required: Only if system confirms it OR we don't know status but see error.
        // If system says NOT required, we override any stale error.
        let isAuthRequired = false;
        if (authStatus) {
            isAuthRequired = sysAuthRequired;
        } else {
            isAuthRequired = staleAuthError;
        }

        // Status Text & Badge
        const statusEl = $('bf-status-text');
        let status = "Unknown";
        let statusClass = "badge-neutral";
        let expl = "";

        if (isRunning) {
            status = "Working";
            statusClass = "badge-high"; // Blueish
            expl = "Processing data chunks...";
        } else if (done || (!isActive && progress?.lastProcessedDate === 'DONE')) {
            status = "Complete";
            statusClass = "badge-recovered"; // Green
            expl = "All historical data processed.";
        } else if (isActive && !isRunning) {
            // Active checks
            if (isAuthRequired) {
                status = "Auth Required";
                statusClass = "badge-strained";
                expl = "Authentication required to continue.";
            } else if (staleAuthError && !sysAuthRequired) {
                // Recovered state
                status = "Resuming...";
                statusClass = "badge-med";
                expl = "Auth restored. Clearing previous status...";
            } else if (progress?.processedDays > 0) {
                status = "Waiting for next tick";
                statusClass = "badge-med"; // Yellow/Orange
                expl = "Next tick will be triggered automatically.";
            } else {
                status = "Scheduled";
                statusClass = "badge-neutral";
                expl = "Backfill plan created, waiting to start.";
            }
        } else if (hasFailed) {
            status = "Error";
            statusClass = "badge-strained"; // Red
            expl = "Encountered errors, checking retry policy.";
        } else {
            status = "Idle";
            statusClass = "badge-neutral";
            expl = "No active backfill plan.";
        }

        // Apply
        statusEl.className = `badge ${statusClass}`;
        statusEl.textContent = status;

        // One-line explanation
        let explEl = document.getElementById('bf-expl');
        if (!explEl) {
            explEl = document.createElement('div');
            explEl.id = 'bf-expl';
            explEl.className = 'text-sm';
            explEl.style.marginBottom = '1rem';
            explEl.style.color = 'var(--text-secondary)';
            // Insert after targetMsg or info
            let titleEl = card.querySelector('.card-title');
            titleEl.after(explEl);
        }
        explEl.textContent = expl;

        // --- Action Buttons (Auth or Resume) ---
        let actionContainer = document.getElementById('bf-action-row');
        if (!actionContainer) {
            actionContainer = document.createElement('div');
            actionContainer.id = 'bf-action-row';
            actionContainer.style.marginBottom = '1rem';
            explEl.after(actionContainer);
        }

        // Clear previous buttons
        actionContainer.innerHTML = '';

        if (isAuthRequired) {
            // Show Connect Fitbit Button
            const btn = document.createElement('a');
            btn.className = 'btn';
            btn.href = '/fitbit/auth'; // Reuse existing auth route
            btn.textContent = 'Connect Fitbit';
            btn.style.backgroundColor = 'var(--primary-color)';
            btn.style.color = '#fff';
            btn.style.display = 'inline-block';
            actionContainer.appendChild(btn);
        }

        // Show Resume Button if Active & Not Running & Not Auth/Error
        else if (isActive && !isRunning && !isAuthRequired) {
            const btn = document.createElement('button');
            btn.className = 'btn';
            btn.textContent = 'Resume Backfill';
            btn.onclick = async () => {
                btn.disabled = true;
                btn.textContent = 'Resuming...';
                try {
                    const API_BASE = window.location.origin; // robust base
                    await fetch(`${API_BASE}/api/backfill/plan/tick`, { method: 'POST' });
                    // We rely on polling to update UI, but let's encourage a faster refresh
                    setTimeout(() => loadDashboard(), 1000);
                } catch (e) {
                    console.error("Resume failed", e);
                    btn.textContent = 'Failed';
                }
            };
            // Style distinct from main connect?
            btn.style.backgroundColor = '#666';
            btn.style.fontSize = '0.85rem';
            btn.style.padding = '0.4rem 0.8rem';

            actionContainer.appendChild(btn);
        }


        // Stats
        $('bf-target-since').textContent = plan?.targetSince || "--";
        $('bf-from').textContent = progress?.from || "--";
        $('bf-to').textContent = progress?.to || "--";
        $('bf-last-date').textContent = progress?.lastProcessedDate || "--";
        $('bf-processed').textContent = progress?.processedDays ?? 0;
        $('bf-total').textContent = progress?.totalDays ?? 0;
        $('bf-remaining').textContent = estimatedRemainingDays ?? "--";

        $('bf-updated-at').textContent = fmtLocalWithAge(lastUpdatedAt || progress?.updatedAt);

        // Progress Bar
        if (progress && progress.totalDays > 0) {
            const pct = Math.min(100, Math.round((progress.processedDays / progress.totalDays) * 100));
            $('bf-progress-bar').style.width = pct + "%";
        } else {
            $('bf-progress-bar').style.width = '0%';
        }

        // Error Section
        const errSec = $('bf-error-section');
        if (hasFailed) {
            errSec.classList.remove('hidden');
            const err = failedDays[0];
            $('bf-error-type').textContent = err.errorType || "unknown";
            $('bf-error-msg').textContent = err.errorMessage || "--";
            $('bf-error-date').textContent = fmtLocalWithAge(progress?.failedDays?.[0]?.failedAt);
            const retryRow = $('bf-next-retry-row');

            // Explicit Rate Limit / Retry Status Line
            if (err.nextRetryAt && new Date(err.nextRetryAt) > new Date()) {
                retryRow.classList.remove('hidden');
                $('bf-next-retry').textContent = fmtLocalWithAge(progress?.failedDays?.[0]?.nextRetryAt);
            } else {
                retryRow.classList.add('hidden');
            }
        } else {
            errSec.classList.add('hidden');
        }

        // Raw Debug
        const rawEl = $('rawBackfill');
        if (rawEl) rawEl.textContent = JSON.stringify(data, null, 2);

        // Sync Overview Footer if exists
        const ovFooter = $('overviewUpdateTimestamp');
        if (ovFooter) {
            ovFooter.textContent = `System updated: ${fmtLocalWithAge(lastUpdatedAt || progress?.updatedAt)}`;
        }

    } catch (e) { console.warn("Backfill UI Error", e); }
}

function renderKPIs(data) {
    const kpiGrid = $('overviewKPIs');
    if (!kpiGrid || !data) return;

    const rows = normalizeForPeriod(data, currentPeriod);
    if (rows.length === 0) {
        kpiGrid.innerHTML = '<p style="grid-column:1/-1;color:var(--text-secondary);">No data available for insights.</p>';
        return;
    }

    const last = rows[rows.length - 1];
    const prev = rows.length > 1 ? rows[rows.length - 2] : null;

    // Helper for rendering cards
    const renderCard = (title, unit, key, higherIsBetter = true) => {
        const val = last[key];
        const prevVal = prev ? prev[key] : null;

        let trendHtml = '<span style="color:#ccc">&ndash;</span>';
        if (val != null && prevVal != null) {
            const diff = val - prevVal;
            const up = diff > 0;
            const symbol = up ? '↑' : '↓';
            const good = up === higherIsBetter;
            const colorClass = good ? 'trend-up' : 'trend-down';

            // Format diff
            let diffFmt = Math.abs(diff).toFixed(1);
            if (key === 'sleepMinutes') diffFmt = (Math.abs(diff) / 60).toFixed(1) + 'h';

            trendHtml = `<span class="${colorClass}">${symbol} ${diffFmt} vs prev</span>`;
        }

        let displayVal = '--';
        if (val != null) {
            if (key === 'sleepMinutes') displayVal = (val / 60).toFixed(1);
            else displayVal = Number(val).toLocaleString(undefined, { maximumFractionDigits: 1 });
        }

        return `
        <div class="kpi-card">
            <div class="kpi-title">${title}</div>
            <div class="kpi-value">${displayVal} <span style="font-size:1rem;font-weight:400;color:#666">${unit}</span></div>
            <div class="kpi-meta">${trendHtml}</div>
        </div>
        `;
    };

    // 1. Data Coverage Chip
    const coverageHtml = `
        <div style="grid-column: 1 / -1; margin-bottom: 0.5rem; display: flex; justify-content: flex-end;">
            <span class="badge badge-neutral" style="font-weight: 500; font-size: 0.75rem;">
                Granularity: ${currentPeriod.charAt(0).toUpperCase() + currentPeriod.slice(1)}
            </span>
        </div>
    `;

    // 2. Standard Cards
    const standardCards = [
        renderCard('Resting HR', 'bpm', 'restingHr', false),
        renderCard('Sleep Duration', 'hrs', 'sleepMinutes', true),
        renderCard('HRV (RMSSD)', 'ms', 'hrv', true)
    ].join('');

    // 3. Recovery Today (Using aggregated data)
    let recStatus = 'Neutral';
    let recClass = 'badge-neutral';

    // Aggregated Recovery Logic
    if (last.restingHr && last.hrv && prev && prev.restingHr && prev.hrv) {
        if (last.hrv >= prev.hrv && last.restingHr <= prev.restingHr) {
            recStatus = 'Recovering';
            recClass = 'badge-recovered';
        } else if (last.hrv < prev.hrv && last.restingHr > prev.restingHr) {
            recStatus = 'Straining';
            recClass = 'badge-strained';
        }
    }

    const recHtml = `
        <div class="kpi-card" style="border-left: 4px solid var(--primary-color);">
            <div class="kpi-title">Recovery Trend</div>
            <div style="margin-bottom:0.5rem"><span class="badge ${recClass}">${recStatus}</span></div>
            <div class="stat-block">
                <div class="text-sm">RHR: <strong>${last.restingHr ? Math.round(last.restingHr) : '--'}</strong></div>
                <div class="text-sm">HRV: <strong>${last.hrv ? Math.round(last.hrv) : '--'}</strong></div>
            </div>
        </div>
    `;

    // 4. Insights (Period Aware)
    // Check variation in the *rows* displayed (last 5 periods)
    const relevantRows = rows.slice(-5);
    const insights = [];

    // Simple slope check
    if (relevantRows.length >= 3) {
        const hrvTrend = relevantRows.map(r => r.hrv).filter(v => v > 0);
        if (hrvTrend.length >= 3) {
            const start = hrvTrend[0];
            const end = hrvTrend[hrvTrend.length - 1];
            if (end > start * 1.05) insights.push(`HRV trending up over last ${relevantRows.length} periods.`);
            if (end < start * 0.95) insights.push(`HRV trending down over last ${relevantRows.length} periods.`);
        }
    }

    // Activity Check
    if (last.steps > 0) {
        if (last.steps < 5000 && currentPeriod === 'daily') insights.push("Low activity today.");
        if (last.steps > 10000 && currentPeriod === 'daily') insights.push("Good activity levels!");
    } else {
        insights.push("No activity data for this period.");
    }

    if (insights.length === 0) insights.push('Stable trends.');

    const insightsHtml = `
        <div class="kpi-card">
            <div class="kpi-title">Insights (${currentPeriod})</div>
            <ul style="padding-left:1.2rem; margin-top:0.5rem; font-size:0.85rem; color:var(--text-main);">
                ${insights.slice(0, 3).map(i => `<li style="margin-bottom:0.25rem">${i}</li>`).join('')}
            </ul>
        </div>
    `;

    // Footer
    const footerHtml = `
        <div style="grid-column: 1 / -1; margin-top: 1rem; text-align: right; font-size: 0.75rem; color: var(--text-secondary);">
            <span id="overviewUpdateTimestamp">Granularity applied: ${currentPeriod}</span>
        </div>
    `;

    kpiGrid.innerHTML = coverageHtml + standardCards + recHtml + insightsHtml + footerHtml;
}

function renderSleepTab(data) {
    const container = $('sleepMetrics');
    if (!container || !data) return;
    const rows = normalizeForPeriod(data, currentPeriod);
    if (rows.length === 0) return;

    const last = rows[rows.length - 1];
    const prev = rows.length > 1 ? rows[rows.length - 2] : null;

    // 1. Avg Sleep (for this period)
    const currSleep = last.sleepMinutes;
    const prevSleep = prev ? prev.sleepMinutes : null;

    let trendHtml = '<span class="text-xs">No trend data</span>';
    if (currSleep && prevSleep) {
        const diff = currSleep - prevSleep;
        const symbol = diff > 0 ? '↑' : (diff < 0 ? '↓' : '→');
        const color = diff > 0 ? 'trend-up' : 'trend-down';
        trendHtml = `<span class="${color}">${symbol} ${Math.abs(diff / 60).toFixed(1)}h vs prev</span>`;
    }

    // 2. Consistency (Std Dev)
    // Calculate StdDev of the *periods* shown (variation between weeks/days)
    const periodsToCheck = rows.slice(-10).map(r => r.sleepMinutes).filter(v => v > 0);
    let consistencyLabel = 'Insufficient data';
    let badgeClass = 'badge-neutral';

    if (periodsToCheck.length >= 3) {
        const mean = periodsToCheck.reduce((a, b) => a + b, 0) / periodsToCheck.length;
        const variance = periodsToCheck.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / periodsToCheck.length;
        const stdDev = Math.sqrt(variance);

        // Thresholds in mins: <45 High, <90 Med, >90 Low
        if (stdDev < 45) { consistencyLabel = 'High Consistency'; badgeClass = 'badge-high'; }
        else if (stdDev < 90) { consistencyLabel = 'Medium Consistency'; badgeClass = 'badge-med'; }
        else { consistencyLabel = 'Low Consistency'; badgeClass = 'badge-low'; }

        consistencyLabel += ` (±${Math.round(stdDev)}m)`;
    }

    // 3. Best/Worst of shown periods
    const validRows = rows.filter(r => r.sleepMinutes > 0);
    let bestWorstHtml = '<div class="text-sm">Not enough data</div>';
    if (validRows.length > 0) {
        const max = validRows.reduce((p, c) => p.sleepMinutes > c.sleepMinutes ? p : c);
        const min = validRows.reduce((p, c) => p.sleepMinutes < c.sleepMinutes ? p : c);
        bestWorstHtml = `
            <div class="stat-block">
                <span class="text-sm">Max: <strong>${(max.sleepMinutes / 60).toFixed(1)}h</strong> <span class="text-xs">(${max.date})</span></span>
                <span class="text-sm">Min: <strong>${(min.sleepMinutes / 60).toFixed(1)}h</strong> <span class="text-xs">(${min.date})</span></span>
            </div>
        `;
    }

    container.innerHTML = `
        <div class="kpi-card">
            <div class="kpi-title">${currentPeriod === 'daily' ? 'Sleep Duration' : 'Avg Sleep / Night'}</div>
            <div class="kpi-value">${currSleep ? (currSleep / 60).toFixed(1) : '--'} <span style="font-size:1rem;color:#666">hrs</span></div>
            <div class="kpi-meta">${trendHtml}</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-title">Period Consistency</div>
            <div style="margin-top:0.5rem"><span class="badge ${badgeClass}">${consistencyLabel}</span></div>
            <div class="text-xs" style="margin-top:0.5rem">Var across visible ${currentPeriod}s</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-title">Range</div>
            ${bestWorstHtml}
        </div>
    `;
}

function renderRecoveryTab(data) {
    const container = $('recoveryMetrics');
    if (!container || !data) return;
    const rows = normalizeForPeriod(data, currentPeriod);
    if (rows.length === 0) return;

    const last = rows[rows.length - 1];
    const prev = rows.length > 1 ? rows[rows.length - 2] : null;

    const rhrCurr = last.restingHr;
    const rhrPrev = prev ? prev.restingHr : null;
    const hrvCurr = last.hrv;
    const hrvPrev = prev ? prev.hrv : null;

    let status = 'Neutral';
    let badgeClass = 'badge-neutral';
    let insight = `Steady ${currentPeriod} trends.`;

    if (rhrCurr && hrvCurr && rhrPrev && hrvPrev) {
        if (hrvCurr >= hrvPrev && rhrCurr <= rhrPrev) {
            status = 'Improving';
            badgeClass = 'badge-recovered';
            insight = 'Metrics improving vs prev period.';
        } else if (hrvCurr < hrvPrev && rhrCurr > rhrPrev) {
            status = 'Declining';
            badgeClass = 'badge-strained';
            insight = 'Metrics worsening vs prev period.';
        }
    }

    container.innerHTML = `
        <div class="kpi-card">
            <div class="kpi-title">Recovery Trend</div>
            <div style="margin-top:0.5rem"><span class="badge ${badgeClass}">${status}</span></div>
            <div class="text-sm" style="margin-top:0.5rem">${insight}</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-title">Avg RHR</div>
            <div class="kpi-value">${rhrCurr ? Math.round(rhrCurr) : '--'} <span class="text-sm">bpm</span></div>
            <div class="kpi-meta text-xs">vs ${rhrPrev ? Math.round(rhrPrev) : '--'} prev</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-title">Avg HRV</div>
            <div class="kpi-value">${hrvCurr ? Math.round(hrvCurr) : '--'} <span class="text-sm">ms</span></div>
            <div class="kpi-meta text-xs">vs ${hrvPrev ? Math.round(hrvPrev) : '--'} prev</div>
        </div>
    `;
}

function renderActivityTab(data) {
    const container = $('activityMetrics');
    if (!container || !data) return;
    const rows = normalizeForPeriod(data, currentPeriod);
    if (rows.length === 0) return;

    const last = rows[rows.length - 1];

    // Aggregation Logic handled by normalizeForPeriod: steps/cals/etc are SUMs for the period if aggregated,
    // For Daily, they are daily totals.
    // We also want "Avg / Day" which is useful for Weekly/Monthly views.

    const count = last.days || 1;

    const steps = last.steps || 0;
    const cals = last.caloriesOut || 0;
    const azm = last.azm || 0;

    container.innerHTML = `
        <div class="kpi-card">
            <div class="kpi-title">Steps</div>
            <div class="kpi-value">${(steps / 1000).toFixed(1)}k</div>
            <div class="text-sm">Period Total (${count}d)</div>
            ${count > 1 ? `<div class="text-xs text-secondary">Avg: ${Math.round(steps / count).toLocaleString()}/day</div>` : ''}
        </div>
        <div class="kpi-card">
            <div class="kpi-title">Calories</div>
            <div class="kpi-value">${(cals / 1000).toFixed(1)}k</div>
            <div class="text-sm">Period Total</div>
            ${count > 1 ? `<div class="text-xs text-secondary">Avg: ${Math.round(cals / count).toLocaleString()}/day</div>` : ''}
        </div>
        <div class="kpi-card">
            <div class="kpi-title">Active Mins</div>
            <div class="kpi-value">${azm}</div>
            <div class="text-sm">Period Total (AZM)</div>
            ${count > 1 ? `<div class="text-xs text-secondary">Avg: ${Math.round(azm / count)}/day</div>` : ''}
        </div>
    `;
}

function calculateAvg(arr, key) {
    const valid = arr.filter(d => d[key] > 0);
    if (valid.length === 0) return null;
    return valid.reduce((sum, d) => sum + Number(d[key]), 0) / valid.length;
}

function renderExportTab(data) {
    const container = $('tab-exports'); // Helper to target the content div if possible, OR just modify the container directly?
    // The HTML has id="tab-exports" for the tab-pane. Inside is a .card.
    // Let's target the card inside, or replace the innerHTML of tab-exports if we want full control.
    // Let's try to maintain structure.

    if (!container) return;

    // Check if we already have the dynamic section, if not, rebuild structure.
    // Actually, simpler to just wipe and rebuild cleanly to ensure state matches.

    const rows = normalizeForPeriod(data, currentPeriod);
    const count = rows.length;

    container.innerHTML = `
        <div class="card">
            <div class="card-title">Data Exports</div>
            <p style="color:var(--text-secondary); margin-bottom:1.5rem;">
                Download your synchronized Fitbit data in CSV format.
            </p>
            
            <div style="margin-bottom: 2rem;">
                <h4 style="margin-bottom: 0.5rem; font-size: 0.9rem; color: #333;">Current View (${currentPeriod})</h4>
                <p style="font-size: 0.8rem; color: #666; margin-bottom: 1rem;">
                    Export the ${count} record${count !== 1 ? 's' : ''} currently displayed in the dashboard (aggregated by ${currentPeriod}).
                </p>
                <button id="btn-export-view" class="btn">
                    Export ${currentPeriod.charAt(0).toUpperCase() + currentPeriod.slice(1)} Data (CSV)
                </button>
            </div>

            <hr style="border: 0; border-top: 1px solid #eee; margin: 1.5rem 0;">

            <div>
                <h4 style="margin-bottom: 0.5rem; font-size: 0.9rem; color: #333;">Raw Data & Server Exports</h4>
                <div style="display:flex; gap:1rem; flex-wrap:wrap;">
                    <a href="/api/export/daily" class="btn-secondary" download>Raw Daily Metrics (CSV)</a>
                    <a href="/api/export/weekly" class="btn-secondary" download>Weekly Aggregates (CSV)</a>
                    <a href="/api/export/monthly" class="btn-secondary" download>Monthly Aggregates (CSV)</a>
                </div>
            </div>
        </div>
    `;

    // Bind event
    const btn = document.getElementById('btn-export-view');
    if (btn) {
        btn.onclick = () => {
            if (rows.length === 0) {
                showToast("No data to export", "error");
                return;
            }
            downloadCSV(rows, `fitbit_export_${currentPeriod}_${new Date().toISOString().slice(0, 10)}.csv`);
        };
    }
}

function downloadCSV(data, filename) {
    if (!data || !data.length) return;

    // Get headers from first row
    const headers = Object.keys(data[0]);

    const csvContent = [
        headers.join(','), // Header row
        ...data.map(row => headers.map(fieldName => {
            let val = row[fieldName];
            // Handle null/undefined
            if (val === null || val === undefined) return '';
            // Escape quotes if needed
            const str = String(val);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
}
