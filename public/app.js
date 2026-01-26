
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
});

// Period toggle function
window.setPeriod = function(period) {
    currentPeriod = period;
    document.querySelectorAll("#periodToggle [data-period]").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.period === period);
    });
    if (dashboardData) {
        renderCharts();
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
