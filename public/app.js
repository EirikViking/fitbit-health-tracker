
// State
let charts = {};
let dashboardData = null;
let currentPeriod = localStorage.getItem('fitbit_period') || "daily";
let viewMode = 'calendar';
let repairState = null;
let currentRange = localStorage.getItem('fitbit_range') || 'all'; // 7d, 30d, 90d, ytd, all
let rangeStartDate = null;
let rangeEndDate = null;
let compareMode = localStorage.getItem('fitbit_compare') === 'true'; // Compare current vs previous period
const $ = (id) => document.getElementById(id);

// Tooltip Database
const METRIC_TOOLTIPS = {
    'restingHr': {
        title: 'Resting Heart Rate',
        description: 'Your heart rate when at complete rest. Lower values typically indicate better cardiovascular fitness and recovery.',
        ideal: 'Ideal: 60-100 bpm (athletes: 40-60 bpm)'
    },
    'hrv': {
        title: 'Heart Rate Variability',
        description: 'Measures variation in time between heartbeats. Higher HRV indicates better recovery, stress management, and overall resilience.',
        ideal: 'Ideal: >50 ms (varies by age and fitness)'
    },
    'sleep': {
        title: 'Sleep Duration',
        description: 'Total hours of sleep per night. Quality sleep is essential for recovery, cognitive function, and overall health.',
        ideal: 'Ideal: 7-9 hours for adults'
    },
    'sleepEfficiency': {
        title: 'Sleep Efficiency',
        description: 'Percentage of time in bed actually spent asleep. Higher efficiency means better sleep quality with less time awake.',
        ideal: 'Ideal: >85%'
    },
    'steps': {
        title: 'Daily Steps',
        description: 'Total steps taken throughout the day. A key indicator of daily activity level and general movement patterns.',
        ideal: 'Ideal: 8,000-10,000 steps/day'
    },
    'calories': {
        title: 'Calories Burned',
        description: 'Total energy expenditure including basal metabolic rate and physical activity. Helps track energy balance.',
        ideal: 'Varies by body composition and activity'
    },
    'azm': {
        title: 'Active Zone Minutes',
        description: 'Time spent in fat burn, cardio, or peak heart rate zones. Measures cardiovascular exercise intensity.',
        ideal: 'Ideal: 150+ minutes/week (WHO guideline)'
    },
    'distance': {
        title: 'Distance Traveled',
        description: 'Total distance covered through walking, running, and other activities throughout the day.',
        ideal: 'Varies by activity goals'
    },
    'recovery': {
        title: 'Recovery Trend',
        description: 'Composite view of HRV and resting heart rate trends. Improving = higher HRV + lower RHR. Helps guide training intensity.',
        ideal: 'Look for consistent improvement over time'
    },
    'consistency': {
        title: 'Sleep Consistency',
        description: 'Measures variation in sleep duration across multiple nights. Lower variation indicates more stable sleep patterns.',
        ideal: 'Low variation (±30-45 min) is optimal'
    },
    'insight': {
        title: 'AI Insights',
        description: 'Automated analysis of your trends and patterns. Highlights notable changes in key metrics over your selected period.',
        ideal: 'Use insights to adjust habits and routines'
    }
};

// Tooltip Helper Function
function createTooltip(metricKey) {
    const tooltip = METRIC_TOOLTIPS[metricKey];
    if (!tooltip) return '';

    return `
        <div class="kpi-tooltip">
            <div class="tooltip-title">${tooltip.title}</div>
            <div class="tooltip-content">${tooltip.description}</div>
            <div class="tooltip-ideal">${tooltip.ideal}</div>
        </div>
    `;
}

// Range Picker Functions
function calculateDateRange(rangeType) {
    const today = new Date();
    const endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate()); // Today at midnight
    let startDate;

    switch (rangeType) {
        case '7d':
            startDate = new Date(endDate);
            startDate.setDate(endDate.getDate() - 6); // Last 7 days including today
            break;
        case '30d':
            startDate = new Date(endDate);
            startDate.setDate(endDate.getDate() - 29); // Last 30 days including today
            break;
        case '90d':
            startDate = new Date(endDate);
            startDate.setDate(endDate.getDate() - 89); // Last 90 days including today
            break;
        case 'ytd':
            startDate = new Date(endDate.getFullYear(), 0, 1); // Jan 1 of current year
            break;
        case 'all':
        default:
            return { startDate: null, endDate: null }; // No filtering
    }

    return {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
    };
}

function filterDataByRange(data, startDate, endDate) {
    if (!data || !Array.isArray(data.series)) return data;
    if (!startDate || !endDate) return data; // No filtering

    const filtered = {
        ...data,
        series: data.series.filter(d => {
            return d.date >= startDate && d.date <= endDate;
        })
    };

    return filtered;
}

function setRange(rangeType, shouldRender = true) {
    currentRange = rangeType;
    localStorage.setItem('fitbit_range', rangeType);

    // Calculate date range
    const { startDate, endDate } = calculateDateRange(rangeType);
    rangeStartDate = startDate;
    rangeEndDate = endDate;

    // Update UI
    document.querySelectorAll('.range-btn').forEach(btn => {
        if (btn.dataset.range === rangeType) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Update range display
    const rangeDisplay = document.getElementById('rangeDisplay');
    if (rangeDisplay) {
        if (startDate && endDate) {
            const start = new Date(startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            const end = new Date(endDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
            rangeDisplay.textContent = `${start} - ${end}`;
        } else {
            rangeDisplay.textContent = 'All available data';
        }
    }

    // Re-render with filtered data
    if (shouldRender && dashboardData) {
        renderAll();
    }
}

// Get filtered dashboard data based on current range
function getFilteredDashboardData() {
    if (!dashboardData) return null;
    if (currentRange === 'all' || !rangeStartDate || !rangeEndDate) {
        return dashboardData;
    }
    return filterDataByRange(dashboardData, rangeStartDate, rangeEndDate);
}

// Compare Mode Functions
function toggleCompareMode() {
    compareMode = !compareMode;
    localStorage.setItem('fitbit_compare', compareMode);

    // Update toggle UI
    const toggleSwitch = document.getElementById('compareToggle');
    if (toggleSwitch) {
        toggleSwitch.classList.toggle('active', compareMode);
    }

    // Re-render with compare mode
    if (dashboardData) {
        renderAll();
    }
}

function getComparisonData(data, period) {
    if (!data || !Array.isArray(data.series)) return null;

    const rows = normalizeForPeriod(data, period);
    if (rows.length < 2) return null; // Need at least 2 periods to compare

    const current = rows[rows.length - 1];
    const previous = rows[rows.length - 2];

    return { current, previous };
}

// Highlight (Best/Worst) Functions
function findBestWorst(data, metricKey, higherIsBetter = true) {
    if (!data || !Array.isArray(data.series)) return null;

    const validRows = data.series.filter(d => {
        const val = safeNumber(d[metricKey]);
        return val !== null && val > 0;
    });

    if (validRows.length === 0) return null;

    // Sort by metric
    const sorted = [...validRows].sort((a, b) => {
        const aVal = safeNumber(a[metricKey]);
        const bVal = safeNumber(b[metricKey]);
        return higherIsBetter ? bVal - aVal : aVal - bVal;
    });

    return {
        best: sorted[0],
        worst: sorted[sorted.length - 1]
    };
}

function renderHighlightCard(type, date, value, unit, metricName) {
    const formattedDate = new Date(date).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    });

    const emoji = type === 'best' ? '🏆' : '📉';
    const label = type === 'best' ? 'Best Day' : 'Worst Day';

    return `
        <div class="highlight-card ${type}">
            <div class="highlight-metric">${metricName}</div>
            <div class="highlight-badge ${type}">${emoji} ${label}</div>
            <div class="highlight-value">${value} <span style="font-size:0.9rem;font-weight:400;color:#666">${unit}</span></div>
            <div class="highlight-date">📅 ${formattedDate}</div>
        </div>
    `;
}

// Personal Records (PR) Functions
function calculatePersonalRecords(data) {
    if (!data || !Array.isArray(data.series) || data.series.length === 0) return null;

    const records = {};

    // Track metrics: higher is better
    const higherBetterMetrics = ['steps', 'sleepMinutes', 'hrvRmssd', 'azm', 'distanceKm'];
    // Track metrics: lower is better
    const lowerBetterMetrics = ['restingHr'];

    higherBetterMetrics.forEach(metric => {
        const validDays = data.series.filter(d => safeNumber(d[metric]) > 0);
        if (validDays.length > 0) {
            const best = validDays.reduce((max, d) =>
                safeNumber(d[metric]) > safeNumber(max[metric]) ? d : max
            );
            records[metric] = {
                value: safeNumber(best[metric]),
                date: best.date,
                higherIsBetter: true
            };
        }
    });

    lowerBetterMetrics.forEach(metric => {
        const validDays = data.series.filter(d => safeNumber(d[metric]) > 0);
        if (validDays.length > 0) {
            const best = validDays.reduce((min, d) =>
                safeNumber(d[metric]) < safeNumber(min[metric]) ? d : min
            );
            records[metric] = {
                value: safeNumber(best[metric]),
                date: best.date,
                higherIsBetter: false
            };
        }
    });

    return records;
}

function isPR(currentValue, metricKey, records) {
    if (!records || !records[metricKey] || currentValue === null) return false;

    const record = records[metricKey];
    if (record.higherIsBetter) {
        return currentValue >= record.value;
    } else {
        return currentValue <= record.value;
    }
}

function createPRBadge() {
    return `<span class="pr-badge"><span class="pr-badge-icon">🏆</span> PR</span>`;
}

function renderPRSection(data) {
    const records = calculatePersonalRecords(data);
    if (!records) return '';

    const prItems = [];

    if (records.steps) {
        prItems.push(`
            <div class="pr-item">
                <div class="pr-item-label">Steps</div>
                <div class="pr-item-value">${Math.round(records.steps.value).toLocaleString()}</div>
                <div class="pr-item-date">${new Date(records.steps.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
            </div>
        `);
    }

    if (records.sleepMinutes) {
        prItems.push(`
            <div class="pr-item">
                <div class="pr-item-label">Sleep</div>
                <div class="pr-item-value">${(records.sleepMinutes.value / 60).toFixed(1)}h</div>
                <div class="pr-item-date">${new Date(records.sleepMinutes.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
            </div>
        `);
    }

    if (records.hrvRmssd) {
        prItems.push(`
            <div class="pr-item">
                <div class="pr-item-label">HRV</div>
                <div class="pr-item-value">${Math.round(records.hrvRmssd.value)} ms</div>
                <div class="pr-item-date">${new Date(records.hrvRmssd.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
            </div>
        `);
    }

    if (records.restingHr) {
        prItems.push(`
            <div class="pr-item">
                <div class="pr-item-label">Resting HR</div>
                <div class="pr-item-value">${Math.round(records.restingHr.value)} bpm</div>
                <div class="pr-item-date">${new Date(records.restingHr.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
            </div>
        `);
    }

    if (records.azm) {
        prItems.push(`
            <div class="pr-item">
                <div class="pr-item-label">Active Zones</div>
                <div class="pr-item-value">${Math.round(records.azm.value)} min</div>
                <div class="pr-item-date">${new Date(records.azm.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
            </div>
        `);
    }

    if (prItems.length === 0) return '';

    return `
        <div class="pr-section">
            <div class="pr-section-title">
                <span>🏆 Personal Records</span>
            </div>
            <div class="pr-grid">
                ${prItems.join('')}
            </div>
        </div>
    `;
}

// Streak Counter Functions
function calculateStreak(data, metricKey, threshold, checkFn = null) {
    if (!data || !Array.isArray(data.series) || data.series.length === 0) return { current: 0, longest: 0, isActive: false };

    // Sort by date ascending
    const sorted = [...data.series].sort((a, b) => a.date.localeCompare(b.date));

    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    let lastDate = null;
    let isActive = false;

    // Default check function: value >= threshold
    const check = checkFn || ((val) => val >= threshold);

    for (let i = 0; i < sorted.length; i++) {
        const day = sorted[i];
        const val = safeNumber(day[metricKey]);

        if (val !== null && check(val)) {
            // Check if consecutive day
            if (lastDate) {
                const prevDate = new Date(lastDate);
                const currDate = new Date(day.date);
                const diffDays = Math.round((currDate - prevDate) / (1000 * 60 * 60 * 24));

                if (diffDays === 1) {
                    tempStreak++;
                } else {
                    // Streak broken
                    longestStreak = Math.max(longestStreak, tempStreak);
                    tempStreak = 1;
                }
            } else {
                tempStreak = 1;
            }

            lastDate = day.date;

            // Check if this is the last day (most recent) to determine if streak is active
            if (i === sorted.length - 1) {
                currentStreak = tempStreak;
                isActive = true;
            }
        } else {
            // Streak broken
            longestStreak = Math.max(longestStreak, tempStreak);
            tempStreak = 0;
            lastDate = null;

            // If this is the last day, streak is not active
            if (i === sorted.length - 1) {
                currentStreak = 0;
                isActive = false;
            }
        }
    }

    longestStreak = Math.max(longestStreak, tempStreak);
    if (isActive) {
        currentStreak = tempStreak;
    }

    return { current: currentStreak, longest: longestStreak, isActive };
}

function renderStreakCard(emoji, count, label, isActive, longest = null) {
    const activeClass = isActive ? 'active' : 'streak-inactive';
    const badgeHtml = isActive ? '<div class="streak-badge">🔥 Active</div>' : '';
    const longestHtml = longest ? `<div class="text-xs" style="margin-top:0.5rem;color:var(--text-tertiary);">Longest: ${longest} days</div>` : '';

    return `
        <div class="streak-card ${activeClass}">
            <span class="streak-emoji">${emoji}</span>
            <div class="streak-count">${count}</div>
            <div class="streak-label">${label}</div>
            ${badgeHtml}
            ${longestHtml}
        </div>
    `;
}

function renderStreakSection(data) {
    if (!data || !Array.isArray(data.series)) return '';

    // Calculate streaks
    const stepsStreak = calculateStreak(data, 'steps', 8000); // 8k steps/day
    const sleepStreak = calculateStreak(data, 'sleepMinutes', 420); // 7 hours (420 min)
    const azmStreak = calculateStreak(data, 'azm', 30); // 30 active minutes

    // Only show if at least one streak exists
    if (stepsStreak.longest === 0 && sleepStreak.longest === 0 && azmStreak.longest === 0) return '';

    const streakCards = [];

    if (stepsStreak.longest > 0) {
        streakCards.push(renderStreakCard('👟', stepsStreak.current, 'Step Streak', stepsStreak.isActive, stepsStreak.longest));
    }

    if (sleepStreak.longest > 0) {
        streakCards.push(renderStreakCard('😴', sleepStreak.current, 'Sleep Streak', sleepStreak.isActive, sleepStreak.longest));
    }

    if (azmStreak.longest > 0) {
        streakCards.push(renderStreakCard('💪', azmStreak.current, 'Active Streak', azmStreak.isActive, azmStreak.longest));
    }

    if (streakCards.length === 0) return '';

    return `
        <div class="streak-section">
            <div class="streak-section-title">
                <span>🔥 Current Streaks</span>
            </div>
            <div class="streak-grid">
                ${streakCards.join('')}
            </div>
        </div>
    `;
}

// Achievement System
const ACHIEVEMENTS = [
    { id: 'first_sync', emoji: '🎯', name: 'Getting Started', desc: 'First data sync', checkFn: (data) => data.series.length > 0 },
    { id: 'week_warrior', emoji: '📅', name: 'Week Warrior', desc: '7+ days of data', checkFn: (data) => data.series.length >= 7 },
    { id: 'month_master', emoji: '🗓️', name: 'Month Master', desc: '30+ days tracked', checkFn: (data) => data.series.length >= 30 },
    { id: 'step_hero', emoji: '👟', name: 'Step Hero', desc: '10k+ steps in a day', checkFn: (data) => data.series.some(d => d.steps >= 10000) },
    { id: 'marathon', emoji: '🏃', name: 'Marathon', desc: '20k+ steps in a day', checkFn: (data) => data.series.some(d => d.steps >= 20000) },
    { id: 'sleep_champion', emoji: '😴', name: 'Sleep Champion', desc: '8+ hours sleep', checkFn: (data) => data.series.some(d => d.sleepMinutes >= 480) },
    { id: 'early_bird', emoji: '🌅', name: 'Early Bird', desc: '3-day sleep streak', checkFn: (data) => calculateStreak(data, 'sleepMinutes', 420).longest >= 3 },
    { id: 'consistency', emoji: '🔥', name: 'Consistency', desc: '7-day step streak', checkFn: (data) => calculateStreak(data, 'steps', 8000).longest >= 7 },
    { id: 'active_lifestyle', emoji: '💪', name: 'Active Lifestyle', desc: '150+ AZM in a week', checkFn: (data) => data.series.some(d => d.azm >= 150) },
    { id: 'recovery_pro', emoji: '❤️', name: 'Recovery Pro', desc: 'RHR below 60', checkFn: (data) => data.series.some(d => d.restingHr > 0 && d.restingHr < 60) },
    { id: 'hrv_master', emoji: '📈', name: 'HRV Master', desc: 'HRV above 60ms', checkFn: (data) => data.series.some(d => d.hrvRmssd >= 60) },
    { id: 'data_hoarder', emoji: '📊', name: 'Data Hoarder', desc: '60+ days tracked', checkFn: (data) => data.series.length >= 60 }
];

function checkAchievements(data) {
    if (!data || !Array.isArray(data.series)) return [];

    return ACHIEVEMENTS.map(achievement => {
        const unlocked = achievement.checkFn(data);
        return {
            ...achievement,
            unlocked,
            unlockedDate: unlocked ? (data.series[data.series.length - 1]?.date || null) : null
        };
    });
}

function renderAchievementSection(data) {
    if (!data || !Array.isArray(data.series) || data.series.length === 0) return '';

    const achievements = checkAchievements(data);
    const unlockedCount = achievements.filter(a => a.unlocked).length;
    const totalCount = achievements.length;

    const achievementCards = achievements.map(achievement => {
        const lockedClass = achievement.unlocked ? 'unlocked' : 'locked';
        const dateHtml = achievement.unlocked && achievement.unlockedDate
            ? `<div class="achievement-date">Unlocked!</div>`
            : '';

        return `
            <div class="achievement-card ${lockedClass}" title="${achievement.desc}">
                <span class="achievement-emoji">${achievement.emoji}</span>
                <div class="achievement-name">${achievement.name}</div>
                ${dateHtml}
            </div>
        `;
    }).join('');

    return `
        <div class="achievement-section">
            <div class="achievement-section-title">
                <span>🏅 Achievements</span>
                <span class="achievement-progress">${unlockedCount}/${totalCount}</span>
            </div>
            <div class="achievement-grid">
                ${achievementCards}
            </div>
        </div>
    `;
}

// Theme Management
function initTheme() {
    const savedTheme = localStorage.getItem('fitbit_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('fitbit_theme', newTheme);
    updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
    const icon = document.querySelector('#themeToggle .theme-icon');
    if (icon) {
        icon.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
}

// Personalized Greeting
function updateGreeting() {
    const hour = new Date().getHours();
    const greetingEl = $('heroGreeting');

    let greeting = '';
    let emoji = '';

    if (hour < 5) {
        greeting = "Burning the midnight oil";
        emoji = "🌙";
    } else if (hour < 12) {
        greeting = "Good morning, Eirik";
        emoji = "🌅";
    } else if (hour < 17) {
        greeting = "Good afternoon, Eirik";
        emoji = "☀️";
    } else if (hour < 21) {
        greeting = "Good evening, Eirik";
        emoji = "🌆";
    } else {
        greeting = "Good night, Eirik";
        emoji = "🌃";
    }

    if (greetingEl) {
        greetingEl.textContent = `${greeting} ${emoji}`;
    }
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    // Theme Toggle
    initTheme();
    $('themeToggle').addEventListener('click', toggleTheme);

    // Personalized Greeting
    updateGreeting();

    $('syncBtn').addEventListener('click', handleSync);
    $('closeModal').addEventListener('click', () => $('dayModal').classList.remove('open'));

    // Init granular buttons state
    setPeriod(currentPeriod, false);

    // Inject Range Picker
    const periodToggle = $('periodToggle');
    if (periodToggle) {
        const rangePicker = document.createElement('div');
        rangePicker.className = 'range-picker';
        rangePicker.innerHTML = `
            <span class="range-picker-label">Date Range:</span>
            <button class="range-btn" data-range="7d">7 Days</button>
            <button class="range-btn" data-range="30d">30 Days</button>
            <button class="range-btn" data-range="90d">90 Days</button>
            <button class="range-btn" data-range="ytd">YTD</button>
            <button class="range-btn" data-range="all">All Time</button>
            <span id="rangeDisplay" class="range-display">All available data</span>
        `;
        periodToggle.insertAdjacentElement('afterend', rangePicker);

        // Bind range button clicks
        document.querySelectorAll('.range-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                setRange(btn.dataset.range, true);
            });
        });

        // Initialize range
        setRange(currentRange, false);
    }

    // Inject Compare Mode Toggle
    if (periodToggle) {
        const compareToggle = document.createElement('div');
        compareToggle.className = 'compare-toggle-container';
        compareToggle.innerHTML = `
            <span class="compare-toggle-label">Compare Mode:</span>
            <div id="compareToggle" class="toggle-switch ${compareMode ? 'active' : ''}" title="Toggle comparison view"></div>
            <span class="text-xs text-secondary">Compare current vs previous period</span>
        `;

        // Insert after range picker
        const rangePicker = document.querySelector('.range-picker');
        if (rangePicker) {
            rangePicker.insertAdjacentElement('afterend', compareToggle);
        }

        // Bind toggle click
        const toggle = document.getElementById('compareToggle');
        if (toggle) {
            toggle.addEventListener('click', toggleCompareMode);
        }
    }

    // Inject View Mode Toggle
    if (periodToggle) {
        const div = document.createElement('div');
        div.className = 'view-mode-toggle';
        div.style.marginTop = '0.5rem';
        div.style.textAlign = 'center';
        div.innerHTML = `
            <label style="font-size:0.8rem; margin-right:0.5rem; color:var(--text-secondary)">View Mode:</label>
            <select id="viewModeSelect" style="padding:0.2rem; border-radius:4px; border:1px solid #ccc; font-size:0.8rem; background:white;">
                <option value="calendar">Calendar Period</option>
                <option value="rolling">Rolling Window</option>
            </select>
         `;
        // Insert after the period toggle
        periodToggle.insertAdjacentElement('afterend', div);

        const sel = $('viewModeSelect');
        sel.value = viewMode;
        sel.onchange = (e) => {
            viewMode = e.target.value;
            // Re-render
            renderAll();
        };
    }

    // Close modal on outside click
    $('dayModal').addEventListener('click', (e) => {
        if (e.target.id === 'dayModal') $('dayModal').classList.remove('open');
    });

    loadDashboard();
    pollBackfillStatus();

    // Drilldown handler - click KPI to view details
    document.addEventListener('click', (e) => {
        const kpiCard = e.target.closest('.kpi-card[data-drilldown]');

        if (kpiCard) {
            const targetTab = kpiCard.dataset.drilldown;

            // On mobile with touch, check if tooltip was clicked
            if ('ontouchstart' in window && !kpiCard.classList.contains('tooltip-active')) {
                // First tap shows tooltip
                document.querySelectorAll('.kpi-card.tooltip-active').forEach(card => {
                    card.classList.remove('tooltip-active');
                });
                kpiCard.classList.add('tooltip-active');
                return;
            }

            // Desktop or second tap on mobile - perform drilldown
            if (targetTab) {
                // Switch to target tab
                switchTab(targetTab);

                // Smooth scroll to top of page to see the content
                window.scrollTo({ top: 0, behavior: 'smooth' });

                // Add pulse animation to target section
                const targetPane = document.getElementById(`tab-${targetTab}`);
                if (targetPane) {
                    targetPane.style.animation = 'none';
                    setTimeout(() => {
                        targetPane.style.animation = 'pulse 0.6s ease-out';
                    }, 10);
                }
            }
        } else if ('ontouchstart' in window) {
            // Mobile: click outside - close all tooltips
            document.querySelectorAll('.kpi-card.tooltip-active').forEach(card => {
                card.classList.remove('tooltip-active');
            });
        }
    });

    initDayInspector();
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
    console.log('[App] Rendering all with period:', currentPeriod, 'range:', currentRange);
    const filteredData = getFilteredDashboardData();
    renderCharts();
    renderKPIs(filteredData);
    renderSleepTab(filteredData);
    renderRecoveryTab(filteredData);
    renderActivityTab(filteredData);
    renderExportTab(filteredData); // Ensure exports updated
};

window.switchTab = function (tabName) {
    document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
    const target = document.getElementById(`tab-${tabName}`);
    if (target) target.classList.add('active');

    // Update desktop nav
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update mobile nav
    document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
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
// --- Helpers ---
function safeNumber(val) {
    if (val === null || val === undefined || isNaN(val)) return null;
    return Number(val);
}

function fmtKPI(val, unit, digits = 1) {
    if (val === null || val === undefined) return '—';
    return Number(val).toLocaleString(undefined, { maximumFractionDigits: digits });
}

function pctChange(curr, prev) {
    const c = safeNumber(curr);
    const p = safeNumber(prev);
    if (c === null || p === null || p === 0) return null;
    return ((c - p) / p) * 100;
}

function calcCoverage(bucket) {
    if (!bucket) return 0;
    // If daily, it's 100% if exists
    if (currentPeriod === 'daily') return 100;

    // For weekly/monthly, ratio of contributed vs expected
    const expected = bucket.expectedDays || 1;
    const actual = bucket.days || 0;
    return Math.min(100, Math.round((actual / expected) * 100));
}

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

function getDaysInMonth(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0).getDate();
}

function aggregateMetrics(series, keyFn, type) {
    if (!Array.isArray(series) || series.length === 0) return {};
    const map = {};

    series.forEach(d => {
        if (!d.date) return;
        const key = keyFn(d.date);

        if (!map[key]) {
            // Calculate expected days
            let expected = 1;
            if (type === 'weekly') expected = 7;
            if (type === 'monthly') {
                const [y, m] = key.split('-').map(Number); // YYYY-MM
                expected = getDaysInMonth(y, m - 1);
            }

            map[key] = {
                count: 0,
                expectedDays: expected,
                restingHrSum: 0, restingHrCount: 0,
                hrvSum: 0, hrvCount: 0,
                sleepSum: 0, sleepCount: 0,
                steps: 0,
                caloriesOut: 0,
                distanceKm: 0,
                azm: 0,
                startDate: d.date,
                endDate: d.date
            };
        }

        const m = map[key];
        m.count++;
        if (d.date < m.startDate) m.startDate = d.date;
        if (d.date > m.endDate) m.endDate = d.date;

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
            sleepMinutes: m.sleepCount > 0 ? m.sleepSum / m.sleepCount : null,
            totalSleepMinutes: m.sleepSum,
            steps: m.steps,
            caloriesOut: m.caloriesOut,
            distanceKm: m.distanceKm,
            azm: m.azm,
            days: m.count,
            expectedDays: m.expectedDays,
            startDate: m.startDate,
            endDate: m.endDate,

            // Coverage stats per metric
            coverage: {
                hr: m.restingHrCount,
                hrv: m.hrvCount,
                sleep: m.sleepCount
            }
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
            azm: d.azm,
            days: 1,
            expectedDays: 1
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
        }, 'weekly');
        return Object.entries(map).map(([key, m]) => ({
            date: weekKeyToISODate(key),
            ...m
        })).sort((a, b) => a.date.localeCompare(b.date));
    }

    if (period === 'monthly') {
        map = aggregateMetrics(series, (dateStr) => dateStr.slice(0, 7), 'monthly');
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
            const cs = $('connectSection');
            const ds = $('dashboardSection');
            if (cs) cs.classList.remove('hidden');
            if (ds) ds.classList.add('hidden');
            return;
        }

        const cs = $('connectSection');
        const ds = $('dashboardSection');
        if (cs) cs.classList.add('hidden');
        if (ds) ds.classList.remove('hidden');

        // 2. Fetch History (60 days)
        const histRes = await fetch('/api/history?days=60');
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
    const filteredData = getFilteredDashboardData();
    if (!filteredData) return;

    // Normalize data for current period
    const rows = normalizeForPeriod(filteredData, currentPeriod) || [];

    // Clean up if empty
    if (rows.length === 0) {
        // if we have chart instances, clear data but don't crash
        if (charts.hr) { charts.hr.data.datasets[0].data = []; charts.hr.update(); }
        if (charts.sleep) { charts.sleep.data.datasets[0].data = []; charts.sleep.update(); }
        if (charts.hrv) { charts.hrv.data.datasets[0].data = []; charts.hrv.update(); }
        return;
    }

    // Build labels and numeric arrays
    const labels = rows.map(r => r.date);
    const resting = rows.map(r => safeNumber(r.restingHr));
    const sleep = rows.map(r => safeNumber(r.sleepMinutes));
    const hrv = rows.map(r => safeNumber(r.hrv));

    // Config
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.color = '#666';

    const ctxHR = $('chartHR').getContext('2d');
    const ctxSleep = $('chartSleep').getContext('2d');
    const ctxHRV = $('chartHRV').getContext('2d');

    // Destroy existing if needed to resize or full reset
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
                    label: (ctx) => {
                        const val = ctx.raw;
                        if (val === null || val === undefined) return null;
                        return `${ctx.dataset.label}: ${Number(val).toFixed(1)} ${unit}`;
                    }
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
            // Fetch status, auth state, and repair state in parallel
            const [bfRes, authRes, repairRes] = await Promise.all([
                fetch('/api/backfill/plan/status'),
                fetch('/api/auth/status'),
                fetch('/api/repair/status')
            ]);

            if (!bfRes.ok) return 60000;
            const data = await bfRes.json();

            // Merge auth status if available
            if (authRes.ok) {
                const authData = await authRes.json();
                data.authStatus = authData;
            }

            // Update global repair state
            if (repairRes.ok) {
                const repairData = await repairRes.json();
                repairState = repairData.state;
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

        // Last Date - show DONE if complete, otherwise show actual date
        const lastDate = (done || status === "Complete") && progress?.lastProcessedDate === progress?.to
            ? "DONE"
            : (progress?.lastProcessedDate || "--");
        $('bf-last-date').textContent = lastDate;

        $('bf-processed').textContent = progress?.processedDays ?? 0;
        $('bf-total').textContent = progress?.totalDays ?? 0;
        $('bf-remaining').textContent = estimatedRemainingDays ?? "--";

        $('bf-updated-at').textContent = fmtLocalWithAge(lastUpdatedAt || progress?.updatedAt);

        // Cron State Display
        const cronState = data.cronState;
        let cronEl = document.getElementById('bf-cron-status');
        if (!cronEl) {
            cronEl = document.createElement('div');
            cronEl.id = 'bf-cron-status';
            cronEl.style.fontSize = '0.75rem';
            cronEl.style.color = 'var(--text-secondary)';
            cronEl.style.marginTop = '0.5rem';
            cronEl.style.padding = '0.5rem';
            cronEl.style.background = 'rgba(0,0,0,0.02)';
            cronEl.style.borderRadius = '4px';
            $('bf-updated-at').parentElement.appendChild(cronEl);
        }

        if (cronState) {
            const lastResult = cronState.lastTickResult || 'unknown';
            const lastAttempt = cronState.lastTickAttemptAt ? fmtAge(cronState.lastTickAttemptAt) : 'never';
            const nextRetry = cronState.nextRetryAllowedAt ? `next retry ${fmtLocalWithAge(cronState.nextRetryAllowedAt)}` : '';
            cronEl.textContent = `Automation: ${lastResult}, last attempt ${lastAttempt}${nextRetry ? ', ' + nextRetry : ''}`;
        } else if (done || status === "Complete") {
            cronEl.textContent = 'Automation: ready (backfill complete)';
        } else {
            cronEl.textContent = 'Automation: initializing';
        }

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
                if (retryRow) retryRow.classList.remove('hidden');
                const nextRetryEl = $('bf-next-retry');
                if (nextRetryEl) nextRetryEl.textContent = fmtLocalWithAge(progress?.failedDays?.[0]?.nextRetryAt);
            } else {
                if (retryRow) retryRow.classList.add('hidden');
            }
        } else {
            if (errSec) errSec.classList.add('hidden');
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

// Repair Button Helper
function getRepairBtnHtml(repairState) {
    if (!repairState) {
        return `
        <div style="margin-top:1.5rem; text-align:center;">
            <button class="btn-secondary repair-btn-action" style="font-size:0.75rem; color:var(--text-secondary); border:1px solid #eee;">
                Repair recent gaps (last 60d)
            </button>
        </div>
        `;
    }

    // Show status if repair is active
    if (repairState.active) {
        const nextRunStr = repairState.nextRunAt ? new Date(repairState.nextRunAt).toLocaleTimeString() : 'soon';
        return `
        <div style="margin-top:1.5rem; text-align:center;">
            <div style="font-size:0.75rem; color:var(--text-secondary); margin-bottom:0.5rem;">
                Repair: ${repairState.remainingDays} days remaining. Next run: ${nextRunStr}
            </div>
            <button class="btn-secondary repair-btn-action" disabled style="font-size:0.75rem; color:var(--text-secondary); border:1px solid #eee;">
                Automation running...
            </button>
        </div>
        `;
    }

    return `
    <div style="margin-top:1.5rem; text-align:center;">
        <button class="btn-secondary repair-btn-action" style="font-size:0.75rem; color:var(--text-secondary); border:1px solid #eee;">
            Repair recent gaps (last 60d)
        </button>
    </div>
    `;
}

function bindRepairBtn() {
    document.querySelectorAll('.repair-btn-action').forEach(btn => {
        if (btn.dataset.bound) return;
        btn.dataset.bound = "true";

        btn.onclick = async () => {
            btn.disabled = true;
            const originalText = btn.textContent;
            btn.textContent = 'Starting repair...';
            try {
                const res = await fetch('/api/repair/recent?days=60');
                const j = await res.json();

                if (!j.ok) {
                    showToast(j.error || 'Failed', 'error');
                    btn.disabled = false;
                    btn.textContent = originalText;
                } else {
                    if (j.remaining > 0) {
                        showToast(`Repaired ${j.repaired.length}. Automation will continue (${j.remaining} days remaining).`, 'success');
                    } else {
                        showToast(j.message || 'Repair complete', 'success');
                        btn.disabled = false;
                        btn.textContent = originalText;
                    }

                    if (j.repaired && j.repaired.length > 0) loadDashboard();
                }
            } catch (e) {
                console.error(e);
                showToast(e.message, 'error');
                btn.disabled = false;
                btn.textContent = originalText;
            }
        };
    });
}

function renderKPIs(data) {
    const kpiGrid = $('overviewKPIs');
    if (!kpiGrid || !data) return;

    const rows = normalizeForPeriod(data, currentPeriod) || [];
    if (rows.length === 0) {
        kpiGrid.innerHTML = '<p style="grid-column:1/-1;color:var(--text-secondary);">No data available for insights.</p>';
        return;
    }

    const last = rows[rows.length - 1];
    const prev = rows.length > 1 ? rows[rows.length - 2] : null;

    // Calculate PRs for badge display
    const personalRecords = calculatePersonalRecords(data);

    // Helper for rendering cards
    const renderCard = (title, unit, key, higherIsBetter = true, tooltipKey = null, drilldownTarget = null, prKey = null) => {
        const val = safeNumber(last[key]);
        const prevVal = prev ? safeNumber(prev[key]) : null;

        // Format values
        const formatValue = (v) => {
            if (v === null) return '—';
            if (key === 'sleepMinutes') return (v / 60).toFixed(1);
            return v.toLocaleString(undefined, { maximumFractionDigits: 1 });
        };

        // Compare mode: side-by-side display
        if (compareMode && prevVal !== null && val !== null) {
            const diff = val - prevVal;
            const pctChange = ((diff / prevVal) * 100).toFixed(1);
            const changeClass = diff > 0 ? (higherIsBetter ? 'positive' : 'negative') :
                diff < 0 ? (higherIsBetter ? 'negative' : 'positive') : 'neutral';
            const changeSymbol = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';

            const tooltip = tooltipKey ? createTooltip(tooltipKey) : '';
            const drilldownAttr = drilldownTarget ? `data-drilldown="${drilldownTarget}"` : '';
            const drilldownHint = drilldownTarget ? '<div class="drilldown-hint">Click to view details →</div>' : '';

            return `
            <div class="kpi-card compare-mode" ${drilldownAttr}>
                <div class="kpi-title">${title}</div>
                <div class="compare-data">
                    <div class="compare-column">
                        <div class="compare-column-header">Previous</div>
                        <div class="compare-value">${formatValue(prevVal)} <span style="font-size:0.7rem">${unit}</span></div>
                    </div>
                    <div class="compare-column">
                        <div class="compare-column-header">Current</div>
                        <div class="compare-value">${formatValue(val)} <span style="font-size:0.7rem">${unit}</span></div>
                        <div class="compare-change ${changeClass}">${changeSymbol} ${Math.abs(pctChange)}%</div>
                    </div>
                </div>
                ${drilldownHint}
                ${tooltip}
            </div>
            `;
        }

        // Normal mode: single value with trend
        let trendHtml = '<span style="color:#ccc; font-size:0.8rem">Not enough data</span>';

        if (val !== null && prevVal !== null) {
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

        let displayVal = formatValue(val);

        // Check if this is a PR (only for daily period)
        let prBadgeHtml = '';
        if (currentPeriod === 'daily' && prKey && personalRecords && isPR(val, prKey, personalRecords)) {
            prBadgeHtml = createPRBadge();
        }

        // Add tooltip if key provided
        const tooltip = tooltipKey ? createTooltip(tooltipKey) : '';

        // Add drilldown data attribute
        const drilldownAttr = drilldownTarget ? `data-drilldown="${drilldownTarget}"` : '';
        const drilldownHint = drilldownTarget ? '<div class="drilldown-hint">Click to view details →</div>' : '';

        return `
        <div class="kpi-card" ${drilldownAttr}>
            <div class="kpi-title">${title}</div>
            <div class="kpi-value-with-pr">
                <div class="kpi-value">${displayVal} <span style="font-size:1rem;font-weight:400;color:#666">${unit}</span></div>
                ${prBadgeHtml}
            </div>
            <div class="kpi-meta">${trendHtml}</div>
            ${drilldownHint}
            ${tooltip}
        </div>
        `;
    };

    // 1. Data Coverage & Header
    let dateRangeStr = last.date;
    if (currentPeriod !== 'daily' && last.startDate && last.endDate) {
        dateRangeStr = `${new Date(last.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${new Date(last.endDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
    }

    const coverageVal = calcCoverage(last);
    const headerHtml = `
        <div style="grid-column: 1 / -1; margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items:center;">
             <span style="font-size:0.85rem; font-weight:600; color:var(--text-main);">${dateRangeStr}</span>
             <span class="badge ${coverageVal < 50 ? 'badge-strained' : 'badge-neutral'}" style="font-weight: 500; font-size: 0.75rem;">
                Coverage: ${coverageVal}%
            </span>
        </div>
    `;

    // 2. Standard Cards
    const standardCards = [
        renderCard('Resting HR', 'bpm', 'restingHr', false, 'restingHr', 'recovery', 'restingHr'),
        renderCard('Sleep Duration', 'hrs', 'sleepMinutes', true, 'sleep', 'sleep', 'sleepMinutes'),
        renderCard('HRV (RMSSD)', 'ms', 'hrv', true, 'hrv', 'recovery', 'hrvRmssd')
    ].join('');

    // 3. Recovery Today (Using aggregated/safe data)
    let recStatus = 'Neutral';
    let recClass = 'badge-neutral';

    // Check safety
    const curR = safeNumber(last.restingHr);
    const curH = safeNumber(last.hrv);
    const preR = prev ? safeNumber(prev.restingHr) : null;
    const preH = prev ? safeNumber(prev.hrv) : null;

    if (curR && curH && preR && preH) {
        if (curH >= preH && curR <= preR) {
            recStatus = 'Recovering';
            recClass = 'badge-recovered';
        } else if (curH < preH && curR > preR) {
            recStatus = 'Straining';
            recClass = 'badge-strained';
        }
    }

    const recHtml = `
        <div class="kpi-card" data-drilldown="recovery" style="border-left: 4px solid var(--primary-color); cursor: pointer;">
            <div class="kpi-title">Recovery Trend</div>
            <div style="margin-bottom:0.5rem"><span class="badge ${recClass}">${recStatus}</span></div>
            <div class="stat-block">
                <div class="text-sm">RHR: <strong>${fmtKPI(curR, '')}</strong></div>
                <div class="text-sm">HRV: <strong>${fmtKPI(curH, '')}</strong></div>
            </div>
            <div class="drilldown-hint">Click to view details →</div>
            ${createTooltip('recovery')}
        </div>
    `;

    // 4. Insights (Period Aware, Safe)
    const relevantRows = rows.slice(-5);
    const insights = [];

    // Simple slope check
    if (relevantRows.length >= 3) {
        const hrvTrend = relevantRows.map(r => safeNumber(r.hrv)).filter(v => v !== null);
        if (hrvTrend.length >= 3) {
            const start = hrvTrend[0];
            const end = hrvTrend[hrvTrend.length - 1];
            if (end > start * 1.05) insights.push(`HRV trending up over last ${relevantRows.length} periods.`);
            if (end < start * 0.95) insights.push(`HRV trending down over last ${relevantRows.length} periods.`);
        }
    }

    // Activity Check
    const steps = safeNumber(last.steps);
    if (steps !== null) {
        if (steps < 5000 && currentPeriod === 'daily') insights.push("Low activity today.");
        if (steps > 10000 && currentPeriod === 'daily') insights.push("Good activity levels!");
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
            ${createTooltip('insight')}
        </div>
    `;

    // Footer
    const repairHtml = getRepairBtnHtml(repairState);
    const prSectionHtml = renderPRSection(data);
    const streakSectionHtml = renderStreakSection(data);
    const achievementSectionHtml = renderAchievementSection(data);
    const footerHtml = `
        <div style="grid-column: 1 / -1; margin-top: 1rem; text-align: right; font-size: 0.75rem; color: var(--text-secondary);">
            <span id="overviewUpdateTimestamp">Granularity applied: ${currentPeriod}</span>
        </div>
    `;

    kpiGrid.innerHTML = headerHtml + standardCards + recHtml + insightsHtml + prSectionHtml + streakSectionHtml + achievementSectionHtml + repairHtml + footerHtml;
    bindRepairBtn();
}

function renderSleepTab(data) {
    const container = $('sleepMetrics');
    if (!container || !data) return;
    const rows = normalizeForPeriod(data, currentPeriod) || [];
    if (rows.length === 0) return;

    // Calculate average sleep and data days
    let currSleep = null;
    let sleepDays = 0;

    if (currentPeriod === 'daily') {
        // For daily view, calculate average across the period
        let totalSleep = 0;
        rows.forEach(row => {
            const s = safeNumber(row.sleepMinutes);
            if (s !== null && s > 0) {
                totalSleep += s;
                sleepDays++;
            }
        });
        currSleep = sleepDays > 0 ? totalSleep / sleepDays : null;
    } else {
        // For weekly/monthly, use the aggregated value
        const last = rows[rows.length - 1];
        currSleep = safeNumber(last.sleepMinutes);
        sleepDays = last.days || 1;
    }

    // Trend (compare current period avg with previous period avg)
    let trendHtml = '<span class="text-xs">No trend data</span>';
    if (currentPeriod === 'daily' && rows.length >= 2) {
        // Calculate previous half of the period for comparison
        const midpoint = Math.floor(rows.length / 2);
        const currentHalf = rows.slice(midpoint);
        const previousHalf = rows.slice(0, midpoint);

        const currAvg = currentHalf.reduce((sum, r) => sum + (safeNumber(r.sleepMinutes) || 0), 0) / Math.max(currentHalf.length, 1);
        const prevAvg = previousHalf.reduce((sum, r) => sum + (safeNumber(r.sleepMinutes) || 0), 0) / Math.max(previousHalf.length, 1);

        if (currAvg > 0 && prevAvg > 0) {
            const diff = currAvg - prevAvg;
            const symbol = diff > 0 ? '↑' : (diff < 0 ? '↓' : '→');
            const color = diff > 0 ? 'trend-up' : 'trend-down';
            trendHtml = `<span class="${color}">${symbol} ${Math.abs(diff / 60).toFixed(1)}h vs prev half</span>`;
        }
    } else if (currentPeriod !== 'daily' && rows.length > 1) {
        const last = rows[rows.length - 1];
        const prev = rows[rows.length - 2];
        const currS = safeNumber(last.sleepMinutes);
        const prevS = safeNumber(prev.sleepMinutes);
        if (currS !== null && prevS !== null) {
            const diff = currS - prevS;
            const symbol = diff > 0 ? '↑' : (diff < 0 ? '↓' : '→');
            const color = diff > 0 ? 'trend-up' : 'trend-down';
            trendHtml = `<span class="${color}">${symbol} ${Math.abs(diff / 60).toFixed(1)}h vs prev</span>`;
        }
    }

    // 2. Consistency
    const periodsToCheck = rows.slice(-10).map(r => safeNumber(r.sleepMinutes)).filter(v => v !== null && v > 0);
    let consistencyLabel = 'Insufficient data';
    let badgeClass = 'badge-neutral';

    let stdDev = 0;
    if (periodsToCheck.length >= 3) {
        const mean = periodsToCheck.reduce((a, b) => a + b, 0) / periodsToCheck.length;
        const variance = periodsToCheck.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / periodsToCheck.length;
        stdDev = Math.sqrt(variance);

        if (stdDev < 45) { consistencyLabel = 'High Consistency'; badgeClass = 'badge-high'; }
        else if (stdDev < 90) { consistencyLabel = 'Medium Consistency'; badgeClass = 'badge-med'; }
        else { consistencyLabel = 'Low Consistency'; badgeClass = 'badge-low'; }

        consistencyLabel += ` (±${Math.round(stdDev)}m)`;
    }

    // 3. Best/Worst
    const validRows = rows.filter(r => safeNumber(r.sleepMinutes) !== null && r.sleepMinutes > 0);
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

    // Coverage
    const dayLabel = currentPeriod === 'daily' ? `${sleepDays}d` : `${rows[rows.length - 1].days || 0} of ${rows[rows.length - 1].expectedDays || 1}`;

    // Find best/worst sleep days (only for daily view)
    let highlightsHtml = '';
    if (currentPeriod === 'daily') {
        const highlights = findBestWorst(data, 'sleepMinutes', true);
        if (highlights) {
            const bestVal = (highlights.best.sleepMinutes / 60).toFixed(1);
            const worstVal = (highlights.worst.sleepMinutes / 60).toFixed(1);
            highlightsHtml = `
                <div style="grid-column: 1 / -1; margin-top: 1rem;">
                    <div style="font-size: 0.85rem; font-weight: 600; margin-bottom: 0.75rem; color: var(--text-secondary);">HIGHLIGHTS</div>
                    <div class="highlights-container">
                        ${renderHighlightCard('best', highlights.best.date, bestVal, 'hrs', 'Sleep')}
                        ${renderHighlightCard('worst', highlights.worst.date, worstVal, 'hrs', 'Sleep')}
                    </div>
                </div>
            `;
        }
    }

    container.innerHTML = `
        <div class="kpi-card">
            <div style="display:flex;justify-content:space-between;">
                <div class="kpi-title">Avg Sleep / Night</div>
                 <div class="text-xs text-secondary">Data days: ${dayLabel}</div>
            </div>
            <div class="kpi-value">${currSleep ? (currSleep / 60).toFixed(1) : '--'} <span style="font-size:1rem;color:#666">hrs</span></div>
            <div class="kpi-meta">${trendHtml}</div>
            ${createTooltip('sleep')}
        </div>
        <div class="kpi-card">
            <div class="kpi-title">Period Consistency</div>
            <div style="margin-top:0.5rem"><span class="badge ${badgeClass}">${consistencyLabel}</span></div>
            <div class="text-xs" style="margin-top:0.5rem">Var across visible ${currentPeriod}s</div>
            ${createTooltip('consistency')}
        </div>
        <div class="kpi-card">
            <div class="kpi-title">Range</div>
            ${bestWorstHtml}
            ${createTooltip('sleep')}
        </div>
        ${highlightsHtml}
    `;
}

function renderRecoveryTab(data) {
    const container = $('recoveryMetrics');
    if (!container || !data) return;
    const rows = normalizeForPeriod(data, currentPeriod) || [];
    if (rows.length === 0) return;

    // Calculate average RHR and HRV across the period
    let rhrCurr = null;
    let hrvCurr = null;
    let rhrDays = 0;
    let hrvDays = 0;

    if (currentPeriod === 'daily') {
        // For daily view, calculate average across all days
        let totalRhr = 0;
        let totalHrv = 0;
        rows.forEach(row => {
            const rhr = safeNumber(row.restingHr);
            const hrv = safeNumber(row.hrv);
            if (rhr !== null && rhr > 0) { totalRhr += rhr; rhrDays++; }
            if (hrv !== null && hrv > 0) { totalHrv += hrv; hrvDays++; }
        });
        rhrCurr = rhrDays > 0 ? totalRhr / rhrDays : null;
        hrvCurr = hrvDays > 0 ? totalHrv / hrvDays : null;
    } else {
        // For weekly/monthly, use aggregated values
        const last = rows[rows.length - 1];
        rhrCurr = safeNumber(last.restingHr);
        hrvCurr = safeNumber(last.hrv);
        rhrDays = last.days || 1;
        hrvDays = last.days || 1;
    }

    // Calculate previous period averages for comparison
    let rhrPrev = null;
    let hrvPrev = null;

    if (currentPeriod === 'daily' && rows.length >= 2) {
        const midpoint = Math.floor(rows.length / 2);
        const previousHalf = rows.slice(0, midpoint);

        let prevRhrSum = 0, prevRhrCount = 0;
        let prevHrvSum = 0, prevHrvCount = 0;
        previousHalf.forEach(row => {
            const rhr = safeNumber(row.restingHr);
            const hrv = safeNumber(row.hrv);
            if (rhr !== null && rhr > 0) { prevRhrSum += rhr; prevRhrCount++; }
            if (hrv !== null && hrv > 0) { prevHrvSum += hrv; prevHrvCount++; }
        });

        rhrPrev = prevRhrCount > 0 ? prevRhrSum / prevRhrCount : null;
        hrvPrev = prevHrvCount > 0 ? prevHrvSum / prevHrvCount : null;
    } else if (currentPeriod !== 'daily' && rows.length > 1) {
        const prev = rows[rows.length - 2];
        rhrPrev = safeNumber(prev.restingHr);
        hrvPrev = safeNumber(prev.hrv);
    }

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

    // Coverage
    const dayLabel = currentPeriod === 'daily' ? `${Math.max(rhrDays, hrvDays)}d` : `${rows[rows.length - 1].days || 0} of ${rows[rows.length - 1].expectedDays || 1}`;

    // Find best/worst days for RHR and HRV (only for daily view)
    let highlightsHtml = '';
    if (currentPeriod === 'daily') {
        const rhrHighlights = findBestWorst(data, 'restingHr', false); // Lower is better
        const hrvHighlights = findBestWorst(data, 'hrvRmssd', true); // Higher is better

        if (rhrHighlights || hrvHighlights) {
            highlightsHtml = '<div style="grid-column: 1 / -1; margin-top: 1rem;"><div style="font-size: 0.85rem; font-weight: 600; margin-bottom: 0.75rem; color: var(--text-secondary);">HIGHLIGHTS</div><div class="highlights-container">';

            if (rhrHighlights) {
                highlightsHtml += renderHighlightCard('best', rhrHighlights.best.date, Math.round(rhrHighlights.best.restingHr), 'bpm', 'Resting HR');
                highlightsHtml += renderHighlightCard('worst', rhrHighlights.worst.date, Math.round(rhrHighlights.worst.restingHr), 'bpm', 'Resting HR');
            }

            if (hrvHighlights) {
                highlightsHtml += renderHighlightCard('best', hrvHighlights.best.date, Math.round(hrvHighlights.best.hrvRmssd), 'ms', 'HRV');
                highlightsHtml += renderHighlightCard('worst', hrvHighlights.worst.date, Math.round(hrvHighlights.worst.hrvRmssd), 'ms', 'HRV');
            }

            highlightsHtml += '</div></div>';
        }
    }

    container.innerHTML = `
        <div class="kpi-card">
            <div style="display:flex;justify-content:space-between;">
                <div class="kpi-title">Recovery Trend</div>
                <div class="text-xs text-secondary">Data days: ${dayLabel}</div>
            </div>
            <div style="margin-top:0.5rem"><span class="badge ${badgeClass}">${status}</span></div>
            <div class="text-sm" style="margin-top:0.5rem">${insight}</div>
            ${createTooltip('recovery')}
        </div>
        <div class="kpi-card">
            <div class="kpi-title">Avg RHR</div>
            <div class="kpi-value">${fmtKPI(rhrCurr, '', 0)} <span class="text-sm">bpm</span></div>
            <div class="kpi-meta text-xs">vs ${fmtKPI(rhrPrev, '', 0)} prev</div>
            ${createTooltip('restingHr')}
        </div>
        <div class="kpi-card">
            <div class="kpi-title">Avg HRV</div>
            <div class="kpi-value">${fmtKPI(hrvCurr, '', 0)} <span class="text-sm">ms</span></div>
            <div class="kpi-meta text-xs">vs ${fmtKPI(hrvPrev, '', 0)} prev</div>
            ${createTooltip('hrv')}
        </div>
        ${highlightsHtml}
    `;
}

function renderActivityTab(data) {
    const container = $('activityMetrics');
    if (!container || !data) return;
    const rows = normalizeForPeriod(data, currentPeriod) || [];
    if (rows.length === 0) return;

    // Aggregate metrics across all rows in the period
    let steps = 0;
    let cals = 0;
    let azm = 0;
    let stepsDays = 0;
    let calsDays = 0;
    let azmDays = 0;

    if (currentPeriod === 'daily') {
        // For daily view, sum across all days in the range
        rows.forEach(row => {
            const s = safeNumber(row.steps);
            const c = safeNumber(row.caloriesOut);
            const a = safeNumber(row.azm);
            if (s !== null && s > 0) { steps += s; stepsDays++; }
            if (c !== null && c > 0) { cals += c; calsDays++; }
            if (a !== null && a >= 0) { azm += a; azmDays++; } // AZM can be 0
        });
    } else {
        // For weekly/monthly, use the aggregated values from last period
        const last = rows[rows.length - 1];
        steps = safeNumber(last.steps) || 0;
        cals = safeNumber(last.caloriesOut) || 0;
        azm = safeNumber(last.azm) || 0;
        stepsDays = last.days || 1;
        calsDays = last.days || 1;
        azmDays = last.days || 1;
    }

    const count = currentPeriod === 'daily' ? Math.max(stepsDays, calsDays, azmDays) : (rows[rows.length - 1].days || 1);

    // Coverage label
    const dayLabel = currentPeriod === 'daily' ? `${stepsDays}d` : `${rows[rows.length - 1].days || 0} of ${rows[rows.length - 1].expectedDays || 1}`;
    const repairHtml = getRepairBtnHtml(repairState);

    // Find best/worst activity days (only for daily view)
    let highlightsHtml = '';
    if (currentPeriod === 'daily') {
        const stepsHighlights = findBestWorst(data, 'steps', true);
        const azmHighlights = findBestWorst(data, 'azm', true);

        if (stepsHighlights || azmHighlights) {
            highlightsHtml = '<div style="grid-column: 1 / -1; margin-top: 1rem;"><div style="font-size: 0.85rem; font-weight: 600; margin-bottom: 0.75rem; color: var(--text-secondary);">HIGHLIGHTS</div><div class="highlights-container">';

            if (stepsHighlights) {
                highlightsHtml += renderHighlightCard('best', stepsHighlights.best.date, Math.round(stepsHighlights.best.steps).toLocaleString(), 'steps', 'Steps');
                highlightsHtml += renderHighlightCard('worst', stepsHighlights.worst.date, Math.round(stepsHighlights.worst.steps).toLocaleString(), 'steps', 'Steps');
            }

            if (azmHighlights && azmHighlights.best.azm > 0) {
                highlightsHtml += renderHighlightCard('best', azmHighlights.best.date, Math.round(azmHighlights.best.azm), 'min', 'Active Zones');
            }

            highlightsHtml += '</div></div>';
        }
    }

    container.innerHTML = `
        <div class="kpi-card">
            <div style="display:flex;justify-content:space-between;">
                 <div class="kpi-title">Steps</div>
                 <div class="text-xs text-secondary">Data days: ${dayLabel}</div>
            </div>
            <div class="kpi-value">${(steps / 1000).toFixed(1)}k</div>
            <div class="text-sm">Period Total (${count}d)</div>
            ${count > 1 ? `<div class="text-xs text-secondary">Avg: ${Math.round(steps / count).toLocaleString()}/day</div>` : ''}
            ${createTooltip('steps')}
        </div>
        <div class="kpi-card">
            <div class="kpi-title">Calories</div>
            <div class="kpi-value">${(cals / 1000).toFixed(1)}k</div>
            <div class="text-sm">Period Total</div>
            ${count > 1 ? `<div class="text-xs text-secondary">Avg: ${Math.round(cals / count).toLocaleString()}/day</div>` : ''}
            ${createTooltip('calories')}
        </div>
        <div class="kpi-card">
            <div class="kpi-title">Active Mins</div>
            <div class="kpi-value">${azmDays > 0 && azm > 0 ? azm : '--'}</div>
            <div class="text-sm">${azmDays > 0 && azm > 0 ? 'Period Total (AZM)' : 'Not available'}</div>
            ${(azmDays > 0 && azm > 0 && count > 1) ? `<div class="text-xs text-secondary">Avg: ${Math.round(azm / count)}/day</div>` : ''}
            ${createTooltip('azm')}
        </div>
        ${highlightsHtml}
        <div style="grid-column:1/-1">
           ${repairHtml}
        </div>
    `;
    bindRepairBtn();
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
    }
}

// --- Day Inspector ---
function initDayInspector() {
    const input = $('inspectDate');
    const btn = $('inspectBtn');

    if (!input || !btn) return;

    // Default to today
    const now = new Date();
    // Format YYYY-MM-DD local
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    input.value = `${yyyy}-${mm}-${dd}`;

    btn.addEventListener('click', () => loadDayInspect(input.value));
}

async function loadDayInspect(date) {
    if (!date) return;

    const resultDiv = $('inspectResult');
    const loadingDiv = $('inspectLoading');
    const errorDiv = $('inspectError');

    resultDiv.classList.add('hidden');
    errorDiv.classList.add('hidden');
    loadingDiv.classList.remove('hidden');
    resultDiv.innerHTML = '';

    try {
        const res = await fetch(`/api/day?date=${date}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        loadingDiv.classList.add('hidden');

        if (!data || !data.metrics) {
            errorDiv.textContent = 'No data found for this date.';
            errorDiv.classList.remove('hidden');
            return;
        }

        const m = data.metrics;
        // Render simple cards
        // metrics: steps, caloriesOut, distanceKm, azm, sleepMinutes, restingHr, hrvRmssd etc.
        const items = [
            { label: 'Steps', val: m.steps?.toLocaleString() },
            { label: 'Sleep', val: m.sleepMinutes ? `${Math.floor(m.sleepMinutes / 60)}h ${m.sleepMinutes % 60}m` : '0h 0m' },
            { label: 'AZM', val: m.azm + ' min' },
            { label: 'Resting HR', val: m.restingHr ? m.restingHr + ' bpm' : '--' },
            { label: 'HRV', val: m.hrvRmssd ? Math.round(m.hrvRmssd) + ' ms' : '--' },
            { label: 'Calories', val: m.caloriesOut?.toLocaleString() },
            { label: 'Distance', val: m.distanceKm?.toFixed(2) + ' km' }
        ];

        resultDiv.innerHTML = items.map(item => `
            <div style="background: var(--bg-body); padding: 0.75rem; border-radius: 6px; text-align: center;">
                <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem;">${item.label}</div>
                <div style="font-size: 1.1rem; font-weight: 600;">${item.val}</div>
            </div>
        `).join('');

        resultDiv.classList.remove('hidden');

    } catch (e) {
        console.error(e);
        loadingDiv.classList.add('hidden');
        errorDiv.textContent = 'Failed to load data: ' + e.message;
        errorDiv.classList.remove('hidden');
    }
}
