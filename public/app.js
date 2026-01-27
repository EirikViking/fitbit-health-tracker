
// State
let charts = {};
let dashboardData = null;
let currentPeriod = "daily";
const $ = (id) => document.getElementById(id);

// Init
document.addEventListener('DOMContentLoaded', () => {
    $('syncBtn').addEventListener('click', handleSync);
    $('closeModal').addEventListener('click', () => $('dayModal').classList.remove('open'));

    // Close modal on outside click
    $('dayModal').addEventListener('click', (e) => {
        if (e.target.id === 'dayModal') $('dayModal').classList.remove('open');
    });

    loadDashboard();
    pollBackfillStatus();
});

// Period toggle function
window.setPeriod = function (period) {
    currentPeriod = period;
    document.querySelectorAll("#periodToggle [data-period]").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.period === period);
    });
    if (dashboardData) {
        renderCharts();
    }

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
};

// Data normalization
function weekKeyToISODate(weekKey) {
    // weekKey format: "2026-W04" -> ISO Monday of that week
    const [year, week] = weekKey.split('-W').map(Number);
    const jan4 = new Date(year, 0, 4);
    const monday = new Date(jan4);
    monday.setDate(jan4.getDate() - (jan4.getDay() || 7) + 1 + (week - 1) * 7);
    return monday.toISOString().split('T')[0];
}

function monthKeyToISODate(monthKey) {
    // monthKey format: "2026-01" -> "2026-01-01"
    return `${monthKey}-01`;
}

function buildWeeklyMapFromSeries(series) {
    if (!Array.isArray(series) || series.length === 0) return {};

    const weekMap = {};

    series.forEach(d => {
        if (!d.date) return;

        // Get ISO week key "YYYY-Www"
        const date = new Date(d.date + 'T00:00:00Z');
        const year = date.getUTCFullYear();

        // ISO week calculation
        const jan4 = new Date(Date.UTC(year, 0, 4));
        const daysSinceJan4 = (date - jan4) / 86400000;
        const weekNum = Math.ceil((daysSinceJan4 + jan4.getUTCDay() + 1) / 7);
        const weekKey = `${year}-W${String(weekNum).padStart(2, '0')}`;

        if (!weekMap[weekKey]) {
            weekMap[weekKey] = {
                restingHrSum: 0,
                restingHrCount: 0,
                hrvSum: 0,
                hrvCount: 0,
                sleepSum: 0,
                sleepCount: 0,
                days: 0
            };
        }

        const w = weekMap[weekKey];
        w.days++;

        if (d.restingHr != null && d.restingHr > 0) {
            w.restingHrSum += Number(d.restingHr);
            w.restingHrCount++;
        }
        if (d.hrvRmssd != null && d.hrvRmssd > 0) {
            w.hrvSum += Number(d.hrvRmssd);
            w.hrvCount++;
        }
        if (d.sleepMinutes != null && d.sleepMinutes > 0) {
            w.sleepSum += Number(d.sleepMinutes);
            w.sleepCount++;
        }
    });

    // Convert to averages
    const result = {};
    Object.keys(weekMap).forEach(key => {
        const w = weekMap[key];
        result[key] = {
            avgRestingHr: w.restingHrCount > 0 ? w.restingHrSum / w.restingHrCount : null,
            avgHrv: w.hrvCount > 0 ? w.hrvSum / w.hrvCount : null,
            avgSleepMinutes: w.sleepCount > 0 ? w.sleepSum / w.sleepCount : null,
            days: w.days
        };
    });

    return result;
}

function buildMonthlyMapFromSeries(series) {
    if (!Array.isArray(series) || series.length === 0) return {};

    const monthMap = {};

    series.forEach(d => {
        if (!d.date) return;

        // Get month key "YYYY-MM"
        const monthKey = d.date.slice(0, 7); // "2026-01"

        if (!monthMap[monthKey]) {
            monthMap[monthKey] = {
                restingHrSum: 0,
                restingHrCount: 0,
                hrvSum: 0,
                hrvCount: 0,
                sleepSum: 0,
                sleepCount: 0,
                days: 0
            };
        }

        const m = monthMap[monthKey];
        m.days++;

        if (d.restingHr != null && d.restingHr > 0) {
            m.restingHrSum += Number(d.restingHr);
            m.restingHrCount++;
        }
        if (d.hrvRmssd != null && d.hrvRmssd > 0) {
            m.hrvSum += Number(d.hrvRmssd);
            m.hrvCount++;
        }
        if (d.sleepMinutes != null && d.sleepMinutes > 0) {
            m.sleepSum += Number(d.sleepMinutes);
            m.sleepCount++;
        }
    });

    // Convert to averages
    const result = {};
    Object.keys(monthMap).forEach(key => {
        const m = monthMap[key];
        result[key] = {
            avgRestingHr: m.restingHrCount > 0 ? m.restingHrSum / m.restingHrCount : null,
            avgHrv: m.hrvCount > 0 ? m.hrvSum / m.hrvCount : null,
            avgSleepMinutes: m.sleepCount > 0 ? m.sleepSum / m.sleepCount : null,
            days: m.days
        };
    });

    return result;
}

function normalizeForPeriod(dashboardData, period) {
    if (!dashboardData) return [];

    if (period === 'daily') {
        const series = Array.isArray(dashboardData.series) ? dashboardData.series : [];
        return series.map(d => ({
            date: d.date,
            restingHr: d.restingHr,
            hrv: d.hrvRmssd,
            sleepMinutes: d.sleepMinutes
        }));
    }

    if (period === 'weekly') {
        const weeklyMap = dashboardData.weekly && Object.keys(dashboardData.weekly).length > 0
            ? dashboardData.weekly
            : buildWeeklyMapFromSeries(dashboardData.series || []);

        return Object.entries(weeklyMap).map(([key, metrics]) => ({
            date: weekKeyToISODate(key),
            restingHr: metrics.avgRestingHr,
            hrv: metrics.avgHrv,
            sleepMinutes: metrics.avgSleepMinutes
        }));
    }

    if (period === 'monthly') {
        const monthlyMap = dashboardData.monthly && Object.keys(dashboardData.monthly).length > 0
            ? dashboardData.monthly
            : buildMonthlyMapFromSeries(dashboardData.series || []);

        return Object.entries(monthlyMap).map(([key, metrics]) => ({
            date: monthKeyToISODate(key),
            restingHr: metrics.avgRestingHr,
            hrv: metrics.avgHrv,
            sleepMinutes: metrics.avgSleepMinutes
        }));
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

    // Logging
    console.log(`[charts] period: ${currentPeriod}, rows: ${rows.length}`);
    console.log(`[charts] labels[0..2]:`, labels.slice(0, 3));
    console.log(`[charts] resting[0..2]:`, resting.slice(0, 3));
    console.log(`[charts] sleep[0..2]:`, sleep.slice(0, 3));
    console.log(`[charts] hrv[0..2]:`, hrv.slice(0, 3));

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
    const displayLabels = labels.map(d => d.slice(5)); // MM-DD

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
            const res = await fetch('/api/backfill/plan/status');
            if (!res.ok) return 60000;
            const data = await res.json();
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
        const { plan, progress, estimatedRemainingDays, lastUpdatedAt } = data;

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

        // Status Text & Badge
        const statusEl = $('bf-status-text');
        let status = "Unknown";
        let statusClass = "badge-neutral";
        let expl = "";

        // Logic Priority:
        // 1. Working (Running=true)
        // 2. Complete (Processing done or reached target)
        // 3. Waiting/Scheduled (Active=true, Running=false)

        // Check "Complete" separately
        // If plan is NOT active, and we have progress, we assume it stopped or finished.
        // If processedDays >= totalDays -> Finished.

        // Check for Auth Required
        const isAuthRequired = progress?.lastError === 'Auth required' || hasFailed && failedDays[0].errorType === 'auth_required';

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
    if (!kpiGrid || !data.series) return;

    const series = Array.isArray(data.series) ? data.series : [];
    if (series.length === 0) {
        kpiGrid.innerHTML = '<p style="grid-column:1/-1;color:var(--text-secondary);">No data available for insights.</p>';
        return;
    }

    // Helper to calc avg
    const calcAvg = (arr, key) => {
        const valid = arr.filter(d => d[key] > 0);
        if (valid.length === 0) return null;
        return valid.reduce((sum, d) => sum + Number(d[key]), 0) / valid.length;
    };

    // Get last 7 days and prior 7 days
    const sorted = [...series].sort((a, b) => new Date(a.date) - new Date(b.date));
    const recent = sorted.slice(-7);
    const prior = sorted.slice(-14, -7);
    const last = sorted[sorted.length - 1];

    // Render Function
    const renderCard = (title, val, unit, key, higherIsBetter = true) => {
        const avgCurr = calcAvg(recent, key);
        const avgPrev = calcAvg(prior, key);

        let trendHtml = '<span style="color:#ccc">&ndash;</span>';
        if (avgCurr && avgPrev) {
            const diff = avgCurr - avgPrev;
            const up = diff > 0;
            const symbol = up ? '↑' : '↓';
            // Determine color
            let good = up === higherIsBetter;
            const colorClass = good ? 'trend-up' : 'trend-down';

            trendHtml = `<span class="${colorClass}">${symbol} ${Math.abs(diff).toFixed(1)} vs prior 7d</span>`;
        }

        // Format value
        let displayVal = '--';
        if (val !== undefined && val !== null) {
            displayVal = Number(val).toLocaleString(undefined, { maximumFractionDigits: 1 });
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
    const earliest = sorted.length > 0 ? sorted[0].date : 'Unknown';
    const coverageHtml = `
        <div style="grid-column: 1 / -1; margin-bottom: 0.5rem; display: flex; justify-content: flex-end;">
            <span class="badge badge-neutral" style="font-weight: 500; font-size: 0.75rem;">Data coverage since: ${earliest}</span>
        </div>
    `;

    // 2. Standard Cards
    const standardCards = [
        renderCard('Resting HR', last.restingHr, 'bpm', 'restingHr', false),
        renderCard('Sleep Duration', last.sleepMinutes ? last.sleepMinutes / 60 : 0, 'hrs', 'sleepMinutes', true),
        renderCard('HRV (RMSSD)', last.hrvRmssd, 'ms', 'hrvRmssd', true)
    ].join('');

    // 3. Recovery Today
    const today = last;
    const avgRhr = calcAvg(recent, 'restingHr') || 0;
    const avgHrv = calcAvg(recent, 'hrvRmssd') || 0;

    let recStatus = 'Neutral';
    let recClass = 'badge-neutral';

    if (today.restingHr > 0 && today.hrvRmssd > 0 && avgRhr > 0 && avgHrv > 0) {
        if (today.hrvRmssd >= avgHrv && today.restingHr <= avgRhr) {
            recStatus = 'Recovered';
            recClass = 'badge-recovered';
        } else if (today.hrvRmssd < avgHrv && today.restingHr > avgRhr) {
            recStatus = 'Strained';
            recClass = 'badge-strained';
        }
    }

    const recHtml = `
            <div class="kpi-card" style="border-left: 4px solid var(--primary-color);">
            <div class="kpi-title">Recovery Today</div>
            <div style="margin-bottom:0.5rem"><span class="badge ${recClass}">${recStatus}</span></div>
            <div class="stat-block">
                <div class="text-sm">RHR: <strong>${today.restingHr || '--'}</strong> <span class="text-xs">bpm</span></div>
                <div class="text-sm">HRV: <strong>${today.hrvRmssd || '--'}</strong> <span class="text-xs">ms</span></div>
            </div>
        </div>
    `;

    // 4. Insights
    const insights = [];

    // a) HRV Trend
    const hrvPrev = calcAvg(prior, 'hrvRmssd');
    const hrvCurr = calcAvg(recent, 'hrvRmssd');
    if (hrvCurr && hrvPrev) {
        if (hrvCurr > hrvPrev * 1.05) insights.push('HRV trending up this week.');
        else if (hrvCurr < hrvPrev * 0.95) insights.push('HRV trending down.');
    }

    // b) RHR Trend
    const rhrPrev = calcAvg(prior, 'restingHr');
    const rhrCurr = calcAvg(recent, 'restingHr');
    if (rhrCurr && rhrPrev) {
        if (rhrCurr < rhrPrev * 0.98) insights.push('Resting heart rate trending down.');
        else if (rhrCurr > rhrPrev * 1.02) insights.push('Resting heart rate trending up.');
    }

    // c) Sleep Consistency
    const validSleep = recent.filter(d => d.sleepMinutes > 0).map(d => d.sleepMinutes);
    if (validSleep.length >= 4) {
        const mean = validSleep.reduce((a, b) => a + b, 0) / validSleep.length;
        const variance = validSleep.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / validSleep.length;
        const stdDev = Math.sqrt(variance);
        if (stdDev > 90) insights.push('Sleep timing was less consistent lately.');
    }

    // d) Steps/Activity
    const stepsSum = recent.reduce((sum, d) => sum + (d.steps || 0), 0);
    if (stepsSum < 10000 && recent.length > 3) insights.push('Activity data is limited this week.');

    // Limit to 3
    const finalInsights = insights.slice(0, 3);
    if (finalInsights.length === 0) finalInsights.push('No notable insights yet.');

    const insightsHtml = `
        <div class="kpi-card">
            <div class="kpi-title">Insights</div>
            <ul style="padding-left:1.2rem; margin-top:0.5rem; font-size:0.85rem; color:var(--text-main);">
                ${finalInsights.map(i => `<li style="margin-bottom:0.25rem">${i}</li>`).join('')}
            </ul>
        </div>
    `;

    // 5. Footer
    const footerHtml = `
        <div style="grid-column: 1 / -1; margin-top: 1rem; text-align: right; font-size: 0.75rem; color: var(--text-secondary);">
            <span id="overviewUpdateTimestamp">Waiting for status...</span>
        </div>
    `;

    kpiGrid.innerHTML = coverageHtml + standardCards + recHtml + insightsHtml + footerHtml;
}

function renderSleepTab(data) {
    const container = $('sleepMetrics');
    if (!container || !data.series) return;
    const series = [...data.series].sort((a, b) => new Date(a.date) - new Date(b.date));
    const recent = series.slice(-7);
    const prior = series.slice(-14, -7);

    // 1. Weekly Averages
    const avgCurr = calculateAvg(recent, 'sleepMinutes');
    const avgPrev = calculateAvg(prior, 'sleepMinutes');

    let trendHtml = '<span class="text-xs">No trend data</span>';
    if (avgCurr !== null && avgPrev !== null) {
        const diff = avgCurr - avgPrev;
        const symbol = diff > 0 ? '↑' : (diff < 0 ? '↓' : '→');
        const color = diff > 0 ? 'trend-up' : 'trend-down';
        trendHtml = `<span class="${color}">${symbol} ${Math.abs(diff / 60).toFixed(1)}h vs last week</span>`;
    }

    // 2. Consistency (Std Dev)
    const validSleep = series.slice(-14).filter(d => d.sleepMinutes > 0).map(d => d.sleepMinutes);
    let consistencyLabel = 'Insufficient data';
    let badgeClass = 'badge-neutral';

    if (validSleep.length >= 5) {
        const mean = validSleep.reduce((a, b) => a + b, 0) / validSleep.length;
        const variance = validSleep.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / validSleep.length;
        const stdDev = Math.sqrt(variance);

        // Thresholds in mins: <45 High, <90 Med, >90 Low
        if (stdDev < 45) { consistencyLabel = 'High Consistency'; badgeClass = 'badge-high'; }
        else if (stdDev < 90) { consistencyLabel = 'Medium Consistency'; badgeClass = 'badge-med'; }
        else { consistencyLabel = 'Low Consistency'; badgeClass = 'badge-low'; }

        consistencyLabel += ` (±${Math.round(stdDev)}m)`;
    }

    // 3. Best/Worst (Last 14 days)
    const last14 = series.slice(-14).filter(d => d.sleepMinutes > 0);
    let bestWorstHtml = '<div class="text-sm">Not enough data</div>';
    if (last14.length > 0) {
        const max = last14.reduce((p, c) => p.sleepMinutes > c.sleepMinutes ? p : c);
        const min = last14.reduce((p, c) => p.sleepMinutes < c.sleepMinutes ? p : c);
        bestWorstHtml = `
            <div class="stat-block">
                <span class="text-sm">Best: <strong>${(max.sleepMinutes / 60).toFixed(1)}h</strong> <span class="text-xs">(${max.date})</span></span>
                <span class="text-sm">Worst: <strong>${(min.sleepMinutes / 60).toFixed(1)}h</strong> <span class="text-xs">(${min.date})</span></span>
            </div>
        `;
    }

    container.innerHTML = `
        <div class="kpi-card">
            <div class="kpi-title">7-Day Avg Sleep</div>
            <div class="kpi-value">${avgCurr ? (avgCurr / 60).toFixed(1) : '--'} <span style="font-size:1rem;color:#666">hrs</span></div>
            <div class="kpi-meta">${trendHtml}</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-title">Sleep Consistency</div>
            <div style="margin-top:0.5rem"><span class="badge ${badgeClass}">${consistencyLabel}</span></div>
            <div class="text-xs" style="margin-top:0.5rem">Based on var. over last 14 days</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-title">Records (14d)</div>
            ${bestWorstHtml}
        </div>
    `;
}

function renderRecoveryTab(data) {
    const container = $('recoveryMetrics');
    if (!container || !data.series) return;
    const series = [...data.series].sort((a, b) => new Date(a.date) - new Date(b.date));
    const recent = series.slice(-7);
    const prior = series.slice(-14, -7);

    const rhrCurr = calculateAvg(recent, 'restingHr');
    const rhrPrev = calculateAvg(prior, 'restingHr');
    const hrvCurr = calculateAvg(recent, 'hrvRmssd');
    const hrvPrev = calculateAvg(prior, 'hrvRmssd');

    if (!rhrCurr || !hrvCurr) {
        container.innerHTML = '<p class="text-sm">Recovery data incomplete.</p>';
        return;
    }

    // Recovery Badge
    // Recovered: HRV Up, RHR Down
    // Strained: HRV Down, RHR Up
    let status = 'Neutral';
    let badgeClass = 'badge-neutral';
    let insight = 'Stable recovery signals.';

    // Simple trends
    const hrvUp = hrvPrev ? hrvCurr > hrvPrev : false;
    const rhrDown = rhrPrev ? rhrCurr < rhrPrev : false;
    const hrvDown = hrvPrev ? hrvCurr < hrvPrev : false;
    const rhrUp = rhrPrev ? rhrCurr > rhrPrev : false;

    if (hrvUp && rhrDown) {
        status = 'Recovered';
        badgeClass = 'badge-recovered';
        insight = 'Great signs! HRV is up and RHR is down.';
    } else if (hrvDown && rhrUp) {
        status = 'Strained';
        badgeClass = 'badge-strained';
        insight = 'Body may be under stress (HRV down, RHR up).';
    } else if (hrvUp) {
        insight = 'HRV is trending positively.';
    } else if (rhrDown) {
        insight = 'Resting heart rate is improving.';
    }

    container.innerHTML = `
        <div class="kpi-card">
            <div class="kpi-title">Weekly Recovery</div>
            <div style="margin-top:0.5rem"><span class="badge ${badgeClass}">${status}</span></div>
            <div class="text-sm" style="margin-top:0.5rem">${insight}</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-title">Avg RHR (7d)</div>
            <div class="kpi-value">${Math.round(rhrCurr)} <span class="text-sm">bpm</span></div>
            <div class="kpi-meta text-xs">vs ${rhrPrev ? Math.round(rhrPrev) : '--'} prev week</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-title">Avg HRV (7d)</div>
            <div class="kpi-value">${Math.round(hrvCurr)} <span class="text-sm">ms</span></div>
            <div class="kpi-meta text-xs">vs ${hrvPrev ? Math.round(hrvPrev) : '--'} prev week</div>
        </div>
    `;
}

function renderActivityTab(data) {
    const container = $('activityMetrics');
    if (!container || !data.series) return;

    // Check if we have activity fields in the most recent valid record
    const valid = data.series.find(d => d.steps > 0 || d.caloriesOut > 0);

    if (!valid) {
        container.innerHTML = `
            <div class="card" style="grid-column:1/-1; text-align:center; padding:3rem;">
                <h3>Activity data is limited</h3>
                <p class="text-sm" style="margin-top:1rem">Connect more Fitbit permissions to unlock steps, calories, and active minutes.</p>
            </div>
        `;
        return;
    }

    const series = [...data.series].sort((a, b) => new Date(a.date) - new Date(b.date));
    const recent = series.slice(-7);

    const totalSteps = recent.reduce((sum, d) => sum + (d.steps || 0), 0);
    const totalCals = recent.reduce((sum, d) => sum + (d.caloriesOut || 0), 0);
    const totalActive = recent.reduce((sum, d) => sum + (d.azm || 0), 0); // Using AZM (Active Zone Mins) or fallback? 
    // If 'azm' is missing, maybe 'activeMinutes'? Let's stick to 'azm' as seen in day details, or check key
    // In day details we saw d.azm. 

    container.innerHTML = `
        <div class="kpi-card">
            <div class="kpi-title">Steps (7d)</div>
            <div class="kpi-value">${(totalSteps / 1000).toFixed(1)}k</div>
            <div class="text-sm">Avg: ${Math.round(totalSteps / 7).toLocaleString()} / day</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-title">Calories (7d)</div>
            <div class="kpi-value">${(totalCals / 1000).toFixed(1)}k</div>
             <div class="text-sm">Avg: ${Math.round(totalCals / 7).toLocaleString()} / day</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-title">Active Zone Mins (7d)</div>
            <div class="kpi-value">${totalActive}</div>
             <div class="text-sm">Avg: ${Math.round(totalActive / 7)} / day</div>
        </div>
    `;
}

function calculateAvg(arr, key) {
    const valid = arr.filter(d => d[key] > 0);
    if (valid.length === 0) return null;
    return valid.reduce((sum, d) => sum + Number(d[key]), 0) / valid.length;
}
