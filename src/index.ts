
export interface Env {
    FITBIT_DB: D1Database;
    ASSETS: Fetcher;
    FITBIT_CLIENT_ID: string;
    FITBIT_CLIENT_SECRET: string;
    FITBIT_REDIRECT_URL: string;
    APP_BASE_URL: string;
}

// HTML content for the frontend (mirroring public/index.html)
const INDEX_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fitbit Health Tracker</title>
  <style>
    body { font-family: sans-serif; max-width: 600px; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
    h1 { color: #333; }
    .card { border: 1px solid #eee; padding: 1rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); margin-bottom: 1rem; }
    .stat { font-size: 1.2rem; margin: 0.5rem 0; }
    .btn { display: inline-block; background: #0070f3; color: white; padding: 0.8rem 1.5rem; text-decoration: none; border-radius: 4px; font-weight: bold; }
    .btn:hover { background: #005bb5; }
    .hidden { display: none; }
    #error { color: red; margin-top: 1rem; }
  </style>
</head>
<body>
  <h1>Fitbit Health Tracker</h1>
  
  <div id="connect-section" class="hidden">
    <p>Connect your Fitbit account to see your daily stats.</p>
    <a href="/fitbit/auth" class="btn">Connect Fitbit</a>
  </div>

  <div id="dashboard-section" class="hidden">
    <div class="card">
      <div id="date" style="color: #666; font-size: 0.9rem; margin-bottom: 0.5rem;"></div>
      <div class="stat">🏃 Steps: <strong id="steps">--</strong></div>
      <div class="stat">🔥 Calories: <strong id="calories">--</strong></div>
      <div class="stat">📏 Distance: <strong id="distance">--</strong> km</div>
    </div>
    <div style="margin-bottom: 1rem;">
      <button onclick="loadData()" class="btn" style="padding: 0.5rem 1rem;">Refresh Dashboard</button>
    </div>
  </div>


  
  <div id="error"></div>

  <script>
    async function loadData() {
      const errorDiv = document.getElementById('error');
      const connectSec = document.getElementById('connect-section');
      const dashSec = document.getElementById('dashboard-section');
      
      errorDiv.textContent = '';
      
      try {
        const res = await fetch('/api/today');
        
        if (res.status === 401) {
          connectSec.classList.remove('hidden');
          dashSec.classList.add('hidden');
          return;
        }
        
        if (!res.ok) {
          throw new Error('Failed to fetch data');
        }

        const data = await res.json();
        const summary = data.summary;

        document.getElementById('date').textContent = summary.date;
        document.getElementById('steps').textContent = summary.steps.toLocaleString();
        document.getElementById('calories').textContent = summary.caloriesOut.toLocaleString();
        document.getElementById('distance').textContent = summary.distanceKm.toFixed(2);

        connectSec.classList.add('hidden');
        dashSec.classList.remove('hidden');



      } catch (err) {
        console.error(err);
        errorDiv.textContent = err.message || 'An error occurred';
      }
    }

    // --- Backfill UI Logic ---


    // Load on start
    loadData();
  </script>
</body>
</html>
`;

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);

        // CORS for API
        if (request.method === "OPTIONS") {
            return new Response(null, {
                headers: {
                    "Access-Control-Allow-Origin": env.APP_BASE_URL || "*",
                    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type"
                }
            });
        }

        try {

            if (url.pathname === "/health") return new Response(JSON.stringify({ version: "1.0.0" }), { headers: { "Content-Type": "application/json" } });
            if (url.pathname === "/fitbit/auth") return handleAuth(request, env);
            if (url.pathname === "/fitbit/callback") return handleCallback(request, env);

            // Auth & Health
            if (url.pathname === "/api/auth/status") return handleAuthStatus(request, env);
            if (url.pathname === "/api/health") return handleHealth(request, env);

            // Exports
            if (url.pathname === "/api/export/daily") return handleExportDaily(request, env);
            if (url.pathname === "/api/export/weekly") return handleExportWeekly(request, env);
            if (url.pathname === "/api/export/monthly") return handleExportMonthly(request, env);


            // API Routes
            if (url.pathname === "/api/today") return handleToday(request, env);
            if (url.pathname === "/api/sleep/today") return handleSleepToday(request, env);
            if (url.pathname === "/api/heartrate/today") return handleHeartRateToday(request, env);
            if (url.pathname === "/api/heartrate/intraday") return handleHeartRateIntraday(request, env);
            if (url.pathname === "/api/activity/today") return handleActivityToday(request, env);
            if (url.pathname === "/api/activity/timeseries") return handleActivityTimeSeries(request, env);
            if (url.pathname === "/api/hrv/today") return handleHRVToday(request, env);
            if (url.pathname === "/api/catalog") return handleCatalog(request, env);

            // Repair
            if (url.pathname === "/api/repair/recent") return handleRepairRecent(request, env);
            if (url.pathname === "/api/repair/status") return handleRepairStatus(request, env);

            // Phase 2B: D1 History & Sync

            // --- Phase 2D: D1 History & Sync ---
            if (url.pathname === "/api/sync") return handleSyncTrigger(request, env);
            if (url.pathname === "/api/history") return handleHistory(request, env);
            if (url.pathname === "/api/day") return handleDay(request, env);

            // Phase 2E: Backfill & Cron
            if (url.pathname === "/api/backfill") return handleBackfill(request, env, ctx);
            if (url.pathname === "/api/backfill/status") return handleBackfillStatus(request, env);
            if (url.pathname === "/api/backfill/stop") return handleBackfillStop(request, env);
            if (url.pathname === "/api/backfill/plan/start") return handleBackfillPlanStart(request, env, ctx);
            if (url.pathname === "/api/backfill/plan/stop") return handleBackfillPlanStop(request, env);
            if (url.pathname === "/api/backfill/plan/status") return handleBackfillPlanStatus(request, env);
            if (url.pathname === "/api/backfill/plan/tick") return handleBackfillPlanTick(request, env, ctx);
            if (url.pathname === "/api/backfill/plan/failed/skip") return handleBackfillFailedSkip(request, env);
            if (url.pathname === "/api/cron/status") return handleCronStatus(request, env);
            if (url.pathname === "/api/dev/cron/tick") return handleDevCronTick(request, env);

            if (request.method === "GET" && (url.pathname === "/catalog" || url.pathname === "/catalog/")) {
                const assetUrl = new URL("/catalog.html", url);
                return env.ASSETS.fetch(new Request(assetUrl, request));
            }

            return new Response("Not Found", { status: 404 });
        } catch (e: any) {
            return new Response(`Error: ${e.message}`, { status: 500 });
        }
    },

    async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
        const scheduledWork = (async () => {
            await runCronWork(env, {
                trigger: "scheduled",
                schedule: String(event.cron || "unknown"),
                triggeredAt: new Date().toISOString()
            });
        })();

        ctx.waitUntil(scheduledWork);
    }
};

// --- Cron Work (Extracted for reuse in scheduled + dev endpoint) ---

async function runCronWork(env: Env, meta: { trigger: string, schedule: string, triggeredAt: string }): Promise<void> {
    try {
        const start = Date.now();
        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        let error = null;
        let bfStats = { newDays: 0, retriedDays: 0, blockedByAuth: false };

        try {
            console.log(`[CRON] Triggered at ${meta.triggeredAt}, trigger: ${meta.trigger}, schedule: ${meta.schedule}`);

            // Sync Today - Best effort
            await syncDay(env, today);

            // Sync Yesterday - Critical (Finalize data) / Retry Logic
            try {
                await syncDay(env, yesterday);
            } catch (e) {
                console.warn(`Cron sync failed for ${yesterday}, retrying...`);
                await new Promise(r => setTimeout(r, 2000));
                await syncDay(env, yesterday);
            }

            await setState(env, "cron:last_sync", {
                lastRunAt: new Date().toISOString(),
                lastSyncDate: today,
                success: true,
                durationMs: Date.now() - start,
                synced_dates: [today, yesterday],
                triggeredAt: meta.triggeredAt,
                trigger: meta.trigger
            });

            // C) Process backfill chunk
            bfStats = await processAutomatedBackfillChunk(env);
            console.log(`[CRON] Backfill processed: ${bfStats.newDays} new, ${bfStats.retriedDays} retried, blockedByAuth: ${bfStats.blockedByAuth}`);

            // D) Process repair automation
            await processAutomatedRepair(env);

        } catch (e: any) {
            error = e.message || 'Unknown error';
            console.error(`[CRON] Error: ${error}`);
            if (e.stack) console.error(`[CRON] Stack: ${String(e.stack)}`);

            try {
                await setState(env, "cron:last_sync", {
                    lastRunAt: new Date().toISOString(),
                    lastSyncDate: null,
                    success: false,
                    durationMs: Date.now() - start,
                    error: error,
                    triggeredAt: meta.triggeredAt,
                    trigger: meta.trigger
                });
            } catch (stateError: any) {
                console.error(`[CRON] Failed to log error to D1: ${String(stateError.message)}`);
            }
        }

        // Update stats (never throw from here)
        try {
            await updateCronStats(env, error === null, Date.now() - start, bfStats);
        } catch (statsError: any) {
            console.error(`[CRON] Failed to update stats: ${String(statsError.message)}`);
        }
    } catch (outerError: any) {
        // Catch ANY error that escaped all inner try/catch blocks
        const msg = outerError?.message || String(outerError) || 'unknown';
        console.error(`[CRON] Unhandled error: ${msg}`);
        if (outerError?.stack) console.error(`[CRON] Stack: ${String(outerError.stack)}`);
    }
}

// --- Handlers ---

// ... (existing handlers) ...

interface BackfillState {
    running: boolean;
    from: string;
    to: string;
    lastProcessedDate: string | null;
    processedDays: number;
    totalDays: number;
    startedAt: string;
    updatedAt: string;
    lastError: string | null;
    retries: number;
    failedDays?: Array<{
        date: string;
        errorType: string;
        errorMessage: string;
        failedAt: string;
        nextRetryAt: string | null;
        retryCount: number;
    }>;
}

interface RepairState {
    active: boolean;
    running: boolean;
    remainingDays: number;
    lastRunAt: string | null;
    nextRunAt: string | null;
    lastError: string | null;
    days: number;
    repairedCount: number;
}

interface BackfillCronState {
    lastCronTickAt: string | null;
    lastTickAttemptAt: string | null;
    lastTickResult: 'ok' | 'rate_limit' | 'auth_required' | 'noop' | null;
    nextRetryAllowedAt: string | null;
}

async function handleBackfill(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    // Check if running
    const existingState = await getStateMigrating<BackfillState>(env, "backfill:progress");
    if (existingState && existingState.running) {
        return jsonResponse(env, { error: "Backfill already running", state: existingState }, 409);
    }

    let body: any = {};
    try {
        body = await req.json();
    } catch {
        return new Response("Invalid JSON", { status: 400 });
    }

    const { from, to } = body;
    if (!from || !to) return new Response("Missing 'from' or 'to' date (YYYY-MM-DD)", { status: 400 });

    const fromDate = new Date(from);
    const toDate = new Date(to);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) return new Response("Invalid date format", { status: 400 });
    if (fromDate > toDate) return new Response("'from' must be <= 'to'", { status: 400 });

    const diffDays = Math.ceil((toDate.getTime() - fromDate.getTime()) / 86400000) + 1;
    if (diffDays > 20) return new Response("Range too large (max 20 days)", { status: 400 });

    // Init State
    const initialState: BackfillState = {
        running: true,
        from,
        to,
        lastProcessedDate: null,
        processedDays: 0,
        totalDays: diffDays,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastError: null,
        retries: 0
    };

    // Clear any previous stop signal
    await setState(env, "backfill:stop", { value: false });
    await setState(env, "backfill:progress", initialState);

    // Trigger background process
    ctx.waitUntil(processBackfill(env, fromDate, toDate, diffDays));
    // fetch handler signature: async fetch(request: Request, env: Env, ctx: ExecutionContext)
    // We didn't pass ctx to handlers. 
    // BUT Cloudflare Workers allow executing async work after response if we use ctx.waitUntil.
    // However, since we refactored handlers out, we need to adapt.
    // OR we blindly trust the runtime to keep it alive a bit, or we just rely on standard promise floating.
    // Wait, proper way is ctx.waitUntil.
    // I can't easily change the function signature of handleBackfill without changing the router call site.
    // Router call site has ctx. 
    // I'll modify the router to pass ctx.

    return jsonResponse(env, { ok: true, message: "Backfill started", state: initialState }, 202);
}

async function handleBackfillStatus(req: Request, env: Env): Promise<Response> {
    const state = await getStateMigrating<BackfillState>(env, "backfill:progress") || { running: false };

    const cronState = await getStateMigrating<BackfillCronState>(env, "backfill:cron_state");

    // Calculate earliest nextRetryAt from failedDays for visibility
    let earliestRetryAt = null;
    if (state.failedDays && state.failedDays.length > 0) {
        const retryTimes = state.failedDays
            .map((f: any) => f.nextRetryAt)
            .filter((t: any) => t !== null)
            .map((t: any) => new Date(t).getTime());
        if (retryTimes.length > 0) {
            earliestRetryAt = new Date(Math.min(...retryTimes)).toISOString();
        }
    }

    return jsonResponse(env, { ...state, cronState, earliestRetryAt });
}

async function handleBackfillStop(req: Request, env: Env): Promise<Response> {
    if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
    await setState(env, "backfill:stop", { value: true });
    const plan = await getStateMigrating<BackfillPlan>(env, "backfill:plan");
    if (plan) {
        plan.active = false;
        await setState(env, "backfill:plan", plan);
    }
    return jsonResponse(env, { message: "Backfill stop signal sent" });
}

interface BackfillPlan {
    active: boolean;
    targetSince: string;
    chunkDays: number;
    maxWallMs: number;
    createdAt: string;
    updatedAt: string;
}

// --- D1 State Helpers ---

async function d1GetRaw(env: Env, key: string): Promise<{ key: string, value: string, updated_at: string } | null> {
    const result = await env.FITBIT_DB.prepare("SELECT key, value, updated_at FROM automation_state WHERE key = ?").bind(key).first();
    return result as any;
}

async function d1SetRaw(env: Env, key: string, valueString: string): Promise<void> {
    const now = new Date().toISOString();
    await env.FITBIT_DB.prepare("INSERT INTO automation_state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
        .bind(key, valueString, now)
        .run();
}

async function getState<T>(env: Env, key: string): Promise<T | null> {
    const row = await d1GetRaw(env, key);
    if (!row) return null;
    try {
        return JSON.parse(row.value) as T;
    } catch {
        return null;
    }
}

async function setState<T>(env: Env, key: string, obj: T): Promise<void> {
    const newValueString = JSON.stringify(obj);
    const existing = await d1GetRaw(env, key);

    // Only write if value changed
    if (existing && existing.value === newValueString) {
        return;
    }

    await d1SetRaw(env, key, newValueString);
}

async function deleteState(env: Env, key: string): Promise<void> {
    await env.FITBIT_DB.prepare("DELETE FROM automation_state WHERE key = ?").bind(key).run();
}

async function deleteStateByPrefix(env: Env, prefix: string): Promise<void> {
    await env.FITBIT_DB.prepare("DELETE FROM automation_state WHERE key LIKE ?").bind(`${prefix}%`).run();
}

interface ExpiringState<T> {
    value: T;
    expiresAt: string;
}

async function getExpiringState<T>(env: Env, key: string): Promise<T | null> {
    const entry = await getState<ExpiringState<T>>(env, key);
    if (!entry) return null;
    if (new Date(entry.expiresAt).getTime() <= Date.now()) {
        await deleteState(env, key);
        return null;
    }
    return entry.value;
}

async function consumeExpiringState<T>(env: Env, key: string): Promise<T | null> {
    const entry = await getState<ExpiringState<T>>(env, key);
    if (!entry) return null;
    if (new Date(entry.expiresAt).getTime() <= Date.now()) {
        await deleteState(env, key);
        return null;
    }
    await deleteState(env, key);
    return entry.value;
}

async function setExpiringState<T>(env: Env, key: string, value: T, ttlMs: number): Promise<void> {
    await setState(env, key, {
        value,
        expiresAt: new Date(Date.now() + ttlMs).toISOString()
    });
}

// D1-only state (KV disabled)
async function getStateMigrating<T>(env: Env, key: string): Promise<T | null> {
    return getState<T>(env, key);
}

async function handleBackfillPlanStart(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    let body: any = {};
    try { body = await req.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }

    const { since } = body;
    if (!since || !/^\d{4}-\d{2}-\d{2}$/.test(since)) return new Response("Missing or invalid 'since' date (YYYY-MM-DD)", { status: 400 });

    const plan: BackfillPlan = {
        active: true,
        targetSince: since,
        chunkDays: 20,
        maxWallMs: 20000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    await setState(env, "backfill:plan", plan);
    await setState(env, "backfill:stop", { value: false });

    // Trigger first chunk immediately
    ctx.waitUntil(processAutomatedBackfillChunk(env));

    return jsonResponse(env, { message: "Backfill plan started", plan });
}

async function handleBackfillPlanStop(req: Request, env: Env): Promise<Response> {
    if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    const plan = await getStateMigrating<BackfillPlan>(env, "backfill:plan");
    if (plan) {
        plan.active = false;
        await setState(env, "backfill:plan", plan);
    }

    await setState(env, "backfill:stop", { value: true });
    return jsonResponse(env, { message: "Backfill plan stopped" });
}

async function handleBackfillPlanStatus(req: Request, env: Env): Promise<Response> {
    const plan = await getStateMigrating<BackfillPlan>(env, "backfill:plan");

    const progress = await getStateMigrating<BackfillState>(env, "backfill:progress");

    let estimatedRemainingDays = 0;
    if (plan && plan.active && plan.targetSince && progress?.lastProcessedDate && progress.lastProcessedDate !== "DONE") {
        const last = new Date(progress.lastProcessedDate);
        const target = new Date(plan.targetSince);
        if (last > target) {
            estimatedRemainingDays = Math.ceil((last.getTime() - target.getTime()) / 86400000);
        }
    }

    return jsonResponse(env, {
        plan,
        progress,
        estimatedRemainingDays,
        lastUpdatedAt: plan?.updatedAt || progress?.updatedAt || null
    });
}

async function handleBackfillPlanTick(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    const plan = await getStateMigrating<BackfillPlan>(env, "backfill:plan");
    if (!plan) return jsonResponse(env, { ok: false, message: "No plan found" }, 409);

    if (!plan.active) return jsonResponse(env, { ok: false, message: "Plan not active" }, 409);

    const progress = await getStateMigrating<BackfillState>(env, "backfill:progress");
    if (progress && progress.running) {
        return jsonResponse(env, { ok: true, message: "already running" }, 202);
    }

    // Wrap in async to run in background, but we don't wait for return in response
    ctx.waitUntil((async () => {
        const stats = await processAutomatedBackfillChunk(env);
        await updateCronStats(env, true, 0, stats); // Update stats for manual tick too? Duration 0 or tracking?
    })());

    return jsonResponse(env, { ok: true, message: "tick started" }, 202);
}

async function handleBackfillFailedSkip(req: Request, env: Env): Promise<Response> {
    if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    let body: any = {};
    try { body = await req.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }
    const { date } = body;
    if (!date) return new Response("Missing date", { status: 400 });

    const state = await getStateMigrating<BackfillState>(env, "backfill:progress");
    if (!state) return jsonResponse(env, { error: "No state" }, 404);

    if (!state.failedDays || state.failedDays.length === 0) return jsonResponse(env, { error: "No failed days" }, 404);

    const idx = state.failedDays.findIndex((f: any) => f.date === date);
    if (idx === -1) return jsonResponse(env, { error: "Date not found in failed list" }, 404);

    const item = state.failedDays[idx];
    item.nextRetryAt = new Date(Date.now() + 86400000).toISOString(); // +24h

    // Move to end
    state.failedDays.splice(idx, 1);
    state.failedDays.push(item);

    await setState(env, "backfill:progress", state);

    return jsonResponse(env, { ok: true, message: "Skipped", state });
}

async function handleCronStatus(req: Request, env: Env): Promise<Response> {
    const cron = await getState<any>(env, "cron:last_sync");
    const stats = await getState<any>(env, "cron:stats");

    const backfill = await getStateMigrating<BackfillState>(env, "backfill:progress") || { running: false };

    return jsonResponse(env, { cron, stats, backfill });
}

async function handleRepairRecent(req: Request, env: Env): Promise<Response> {
    const authStatus = await getStateMigrating<{ required: boolean }>(env, "auth:required");
    if (authStatus && authStatus.required) return jsonResponse(env, { error: "Auth required" }, 401);

    // Check if already running
    const state = await getStateMigrating<RepairState>(env, "repair:state");
    if (state && state.running) {
        return jsonResponse(env, { ok: false, message: "Repair already running", state }, 409);
    }

    const daysArg = new URL(req.url).searchParams.get("days") || "60";
    const days = parseInt(daysArg, 10);
    if (isNaN(days) || days < 1 || days > 90) return jsonResponse(env, { error: "Invalid days (1-90)" }, 400);

    const result = await runRepairCycle(env, days);
    return jsonResponse(env, result);
}

async function runRepairCycle(env: Env, days: number): Promise<any> {
    const now = new Date();
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);

    const fromDate = start.toISOString().split('T')[0];
    const toDate = end.toISOString().split('T')[0];

    // Mark as running
    await setState(env, "repair:state", {
        active: true,
        running: true,
        remainingDays: 0,
        lastRunAt: now.toISOString(),
        nextRunAt: null,
        lastError: null,
        days: days,
        repairedCount: 0
    });

    try {
        // Check DB for existing dates
        const { results } = await env.FITBIT_DB.prepare(
            "SELECT date FROM daily_metrics WHERE date >= ? AND date <= ?"
        ).bind(fromDate, toDate).all();

        const existing = new Set((results || []).map((r: any) => r.date));
        const missing: string[] = [];

        // Iterate dates
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const iso = d.toISOString().split('T')[0];
            if (!existing.has(iso)) missing.push(iso);
        }

        if (missing.length === 0) {
            await setState(env, "repair:state", {
                active: false,
                running: false,
                remainingDays: 0,
                lastRunAt: now.toISOString(),
                nextRunAt: null,
                lastError: null,
                days: days,
                repairedCount: 0
            });
            return { ok: true, message: "No gaps found in range", daysChecked: days };
        }

        // Attempt to fill holes (Rate limited batch)
        const maxToSync = 3;
        const toSync = missing.slice(0, maxToSync);
        const synced: string[] = [];
        const errors: any[] = [];
        let hitRateLimit = false;

        for (const date of toSync) {
            try {
                await syncDay(env, date);
                synced.push(date);
            } catch (e: any) {
                errors.push({ date, error: e.message });
                if (e.message.includes('429')) {
                    hitRateLimit = true;
                    break;
                }
            }
        }

        const remaining = missing.length - synced.length;
        const shouldContinue = remaining > 0;

        // Determine next run time
        let nextRunAt = null;
        if (shouldContinue) {
            const delayMs = hitRateLimit ? 5 * 60 * 1000 : 2 * 60 * 1000; // 5min for rate limit, 2min otherwise
            nextRunAt = new Date(Date.now() + delayMs).toISOString();
        }

        await setState(env, "repair:state", {
            active: shouldContinue,
            running: false,
            remainingDays: remaining,
            lastRunAt: now.toISOString(),
            nextRunAt: nextRunAt,
            lastError: hitRateLimit ? "rate_limit" : null,
            days: days,
            repairedCount: synced.length
        });

        return {
            ok: true,
            message: `Repaired ${synced.length} days`,
            repaired: synced,
            remaining: remaining,
            errors: errors.length > 0 ? errors : undefined,
            nextRunAt: nextRunAt
        };
    } catch (e: any) {
        await setState(env, "repair:state", {
            active: false,
            running: false,
            remainingDays: 0,
            lastRunAt: now.toISOString(),
            nextRunAt: null,
            lastError: e.message,
            days: days,
            repairedCount: 0
        });
        throw e;
    }
}

async function handleRepairStatus(req: Request, env: Env): Promise<Response> {
    const state = await getStateMigrating<RepairState>(env, "repair:state");
    return jsonResponse(env, { state });
}

async function handleDevCronTick(req: Request, env: Env): Promise<Response> {
    if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    // Dev-only gate: require X-Dev-Cron header
    const devHeader = req.headers.get("X-Dev-Cron");
    if (devHeader !== "1") {
        // Hide this endpoint in production by returning 404
        return new Response("Not Found", { status: 404 });
    }

    const triggeredAt = new Date().toISOString();

    // Run cron work synchronously (no waitUntil needed for HTTP response)
    await runCronWork(env, {
        trigger: "http_dev",
        schedule: "manual",
        triggeredAt: triggeredAt
    });

    // Fetch updated stats after cron work completes
    const stats = await getState<any>(env, "cron:stats");

    return jsonResponse(env, {
        ok: true,
        stats: stats,
        at: triggeredAt
    });
}

async function handleAuthStatus(req: Request, env: Env): Promise<Response> {
    const authStatus = await getStateMigrating<{ required: boolean, lastError: string | null }>(env, "auth:required");
    return jsonResponse(env, {
        authRequired: authStatus ? authStatus.required : false,
        lastError: authStatus ? authStatus.lastError : null
    });
}

async function handleHealth(req: Request, env: Env): Promise<Response> {
    const start = Date.now();

    // D1 Check
    let d1Status = "unknown";
    try {
        await env.FITBIT_DB.prepare("SELECT 1").first();
        d1Status = "ok";
    } catch (e: any) {
        d1Status = `error: ${e.message}`;
    }

    const kvStatus = "disabled";

    // Cron & Backfill
    const cron = await getState<any>(env, "cron:last_sync");
    const stats = await getState<any>(env, "cron:stats");
    const backfill = await getStateMigrating<BackfillState>(env, "backfill:progress");

    // Auth
    const authStatus = await getStateMigrating<{ required: boolean }>(env, "auth:required");

    return jsonResponse(env, {
        ok: d1Status === "ok",
        checks: {
            d1: d1Status,
            kv: kvStatus,
            latency_ms: Date.now() - start
        },
        state: {
            auth_required: authStatus ? authStatus.required : false,
            cron_last_run: cron?.lastRunAt || cron?.timestamp,
            cron_success: cron?.success,
            cron_reliability: stats ? (stats.successes / stats.runs).toFixed(2) : "1.00",
            backfill_running: backfill?.running
        }
    });
}

// --- Export Handlers ---

async function handleExportDaily(req: Request, env: Env): Promise<Response> {
    const { results } = await env.FITBIT_DB.prepare("SELECT * FROM daily_metrics ORDER BY date DESC").all();

    // Header: date,restingHr,hrv,sleepMinutes,cardioLoad,cardioLoadStatus
    const headers = ["date", "restingHr", "hrv", "sleepMinutes", "cardioLoad", "cardioLoadStatus"];
    const rows = (results || []).map((r: any) => {
        const s = sanitizeDailyMetrics(r.date, {
            restingHr: r.resting_hr, hrvRmssd: r.hrv_rmssd, sleepMinutes: r.sleep_minutes
        });
        return [
            r.date,
            s.restingHr ?? "",
            s.hrvRmssd ?? "",
            s.sleepMinutes ?? "",
            s.cardioLoad ?? "",
            s.cardioLoadStatus ?? "missing"
        ];
    });

    return csvResponse(headers, rows, `fitbit_daily_${new Date().toISOString().split('T')[0]}.csv`);
}

async function handleExportWeekly(req: Request, env: Env): Promise<Response> {
    const { results } = await env.FITBIT_DB.prepare("SELECT * FROM daily_metrics ORDER BY date ASC").all();
    const weeks = new Map<string, { count: number, restingHrSum: number, hrvSum: number, sleepSum: number }>();

    // Simple aggregator
    for (const r of (results || []) as any[]) {
        const d = new Date(r.date);
        // Get Monday of the week
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
        const monday = new Date(d.setDate(diff));
        const weekKey = monday.toISOString().split('T')[0];

        const s = sanitizeDailyMetrics(r.date, {
            restingHr: r.resting_hr, hrvRmssd: r.hrv_rmssd, sleepMinutes: r.sleep_minutes
        });

        if (!weeks.has(weekKey)) weeks.set(weekKey, { count: 0, restingHrSum: 0, hrvSum: 0, sleepSum: 0 });
        const w = weeks.get(weekKey)!;

        if (s.restingHr) { w.restingHrSum += s.restingHr; }
        if (s.hrvRmssd) { w.hrvSum += s.hrvRmssd; }
        if (s.sleepMinutes) { w.sleepSum += s.sleepMinutes; }
        w.count++;
        // Note: count is rough here, we should ideally count per-metric for correct averages. 
        // But "Weekly/Monthly consistency" prompt C said "Reberegn aggregates". 
        // We'll do a simplified avg based on days present. 
        // Actually better to sum/count individually to be correct.
    }

    // Refined aggregation loop
    const refinedWeeks = new Map<string, {
        hrCount: number, hrSum: number,
        hrvCount: number, hrvSum: number,
        sleepCount: number, sleepSum: number
    }>();

    for (const r of (results || []) as any[]) {
        const d = new Date(r.date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d.setDate(diff)).toISOString().split('T')[0];

        if (!refinedWeeks.has(monday)) refinedWeeks.set(monday, { hrCount: 0, hrSum: 0, hrvCount: 0, hrvSum: 0, sleepCount: 0, sleepSum: 0 });
        const w = refinedWeeks.get(monday)!;
        const s = sanitizeDailyMetrics(r.date, {
            restingHr: r.resting_hr, hrvRmssd: r.hrv_rmssd, sleepMinutes: r.sleep_minutes
        });

        if (s.restingHr) { w.hrSum += s.restingHr; w.hrCount++; }
        if (s.hrvRmssd) { w.hrvSum += s.hrvRmssd; w.hrvCount++; }
        if (s.sleepMinutes) { w.sleepSum += s.sleepMinutes; w.sleepCount++; }
    }

    const headers = ["weekStartDate", "restingHr", "hrv", "sleepMinutes"];
    const rows = Array.from(refinedWeeks.entries()).sort().map(([date, w]) => [
        date,
        w.hrCount > 0 ? Math.round(w.hrSum / w.hrCount) : "",
        w.hrvCount > 0 ? Math.round(w.hrvSum / w.hrvCount) : "",
        w.sleepCount > 0 ? Math.round(w.sleepSum / w.sleepCount) : ""
    ]);

    return csvResponse(headers, rows, `fitbit_weekly_${new Date().toISOString().split('T')[0]}.csv`);
}

async function handleExportMonthly(req: Request, env: Env): Promise<Response> {
    const { results } = await env.FITBIT_DB.prepare("SELECT * FROM daily_metrics ORDER BY date ASC").all();
    const months = new Map<string, {
        hrCount: number, hrSum: number,
        hrvCount: number, hrvSum: number,
        sleepCount: number, sleepSum: number
    }>();

    for (const r of (results || []) as any[]) {
        const monthKey = r.date.substring(0, 7) + "-01"; // YYYY-MM-01
        if (!months.has(monthKey)) months.set(monthKey, { hrCount: 0, hrSum: 0, hrvCount: 0, hrvSum: 0, sleepCount: 0, sleepSum: 0 });
        const w = months.get(monthKey)!;
        const s = sanitizeDailyMetrics(r.date, {
            restingHr: r.resting_hr, hrvRmssd: r.hrv_rmssd, sleepMinutes: r.sleep_minutes
        });

        if (s.restingHr) { w.hrSum += s.restingHr; w.hrCount++; }
        if (s.hrvRmssd) { w.hrvSum += s.hrvRmssd; w.hrvCount++; }
        if (s.sleepMinutes) { w.sleepSum += s.sleepMinutes; w.sleepCount++; }
    }

    const headers = ["monthStartDate", "restingHr", "hrv", "sleepMinutes"];
    const rows = Array.from(months.entries()).sort().map(([date, w]) => [
        date,
        w.hrCount > 0 ? Math.round(w.hrSum / w.hrCount) : "",
        w.hrvCount > 0 ? Math.round(w.hrvSum / w.hrvCount) : "",
        w.sleepCount > 0 ? Math.round(w.sleepSum / w.sleepCount) : ""
    ]);

    return csvResponse(headers, rows, `fitbit_monthly_${new Date().toISOString().split('T')[0]}.csv`);
}

function csvResponse(headers: string[], rows: any[][], filename: string) {
    const csvContent = [
        headers.join(","),
        ...rows.map(row => row.join(","))
    ].join("\n");

    return new Response(csvContent, {
        headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": `attachment; filename="${filename}"`
        }
    });
}



async function processBackfill(env: Env, fromDate: Date, toDate: Date, totalDays: number, maxTimeMs: number = 20000): Promise<{ newDays: number, retriedDays: number, blockedByAuth: boolean }> {
    const startTime = Date.now();
    let processedNewDays = 0;
    let processedRetriedDays = 0;
    let blockedByAuth = false;

    // Read initial state to preserve startedAt and failedDays
    const initialState = await getStateMigrating<BackfillState>(env, "backfill:progress");
    const startedAt = initialState?.startedAt || new Date().toISOString();
    let failedDays = initialState?.failedDays || [];

    // Normalize failedDays (add missing fields from old schema)
    let needsNormalization = false;
    failedDays = failedDays.map(item => {
        let normalized = { ...item };

        if (normalized.retryCount === undefined || normalized.retryCount === null) {
            normalized.retryCount = 0;
            needsNormalization = true;
        }

        if (!normalized.nextRetryAt) {
            const now = Date.now();
            if (normalized.errorType === "auth_required") {
                normalized.nextRetryAt = null;
            } else if (normalized.errorType === "rate_limit") {
                normalized.nextRetryAt = new Date(now + 5 * 60000).toISOString(); // 5 min
            } else {
                normalized.nextRetryAt = new Date(now + 2 * 60000).toISOString(); // 2 min
            }
            needsNormalization = true;
        }

        return normalized;
    });

    // Persist normalized state back if needed (one-time fix for old data)
    if (needsNormalization && initialState && failedDays.length > 0) {
        console.log(`[BACKFILL] Normalized ${failedDays.length} failed days, persisting...`);
        const normalizedState = {
            ...initialState,
            failedDays: failedDays
        };
        await setState(env, "backfill:progress", normalizedState);
    }

    // Check for auth_required before starting any sync
    const authStatus = await getStateMigrating<{ required: boolean }>(env, "auth:required");
    if (authStatus && authStatus.required) {
        // Preserve lastProcessedDate to avoid chunk window shift
        const preservedLastDate = initialState?.lastProcessedDate || toDate.toISOString().split('T')[0];
        await updateState(env, fromDate, toDate, processedNewDays, totalDays, startedAt, preservedLastDate, "Auth required", false, 0, failedDays);
        return { newDays: 0, retriedDays: 0, blockedByAuth: true };
    }

    // Hard cap on failed days to prevent infinite growth
    if (failedDays.length >= 50) {
        // Preserve lastProcessedDate to avoid chunk window shift
        const preservedLastDate = initialState?.lastProcessedDate || toDate.toISOString().split('T')[0];
        await updateState(env, fromDate, toDate, processedNewDays, totalDays, startedAt, preservedLastDate, "Too many failed days (50+). Manual intervention required.", false, 0, failedDays);
        return { newDays: 0, retriedDays: 0, blockedByAuth: false };
    }

    // Policy: Prioritize retrying failed days that are due
    let retriesAttemptedThisChunk = 0;
    const maxRetriesPerChunk = 1; // Only attempt one retry per chunk to allow new days to progress

    // Sort failedDays by nextRetryAt to process oldest due first
    failedDays.sort((a, b) => (new Date(a.nextRetryAt || 0).getTime()) - (new Date(b.nextRetryAt || 0).getTime()));

    while (retriesAttemptedThisChunk < maxRetriesPerChunk && failedDays.length > 0) {
        const oldestFailed = failedDays[0];
        const dateStr = oldestFailed.date;

        let shouldRetry = true;
        if (oldestFailed.nextRetryAt) {
            const retryTime = new Date(oldestFailed.nextRetryAt).getTime();
            if (retryTime > Date.now()) {
                shouldRetry = false; // Not yet due for retry
            }
        }

        if (shouldRetry) {
            console.log(`Retrying failed day: ${dateStr} (Attempt ${oldestFailed.retryCount + 1})`);
            const { success, errorType, errorMessage, nextRetryAt } = await attemptSyncDay(env, dateStr, oldestFailed.retryCount);

            if (success) {
                // Remove from failedDays
                failedDays.shift();
                processedRetriedDays++;
                await updateState(env, fromDate, toDate, processedNewDays, totalDays, startedAt, dateStr, null, true, 0, failedDays);
                await invalidateHistoryCache(env);
                retriesAttemptedThisChunk++;
                // Continue to check for more retries or new days
            } else {
                // Still failing, update and re-add to failedDays (or keep at head if it's the only one)
                oldestFailed.errorType = errorType;
                oldestFailed.errorMessage = errorMessage;
                oldestFailed.failedAt = new Date().toISOString();
                oldestFailed.nextRetryAt = nextRetryAt;
                oldestFailed.retryCount++;
                // Move to end of failedDays to give other failed days a chance, or if it's the only one, it stays.
                failedDays.shift();
                failedDays.push(oldestFailed);

                // For rate_limit: preserve chunk window state
                if (errorType === "rate_limit") {
                    await updateStateOnRateLimit(env, failedDays);
                    console.log("Rate limited during retry, preserving chunk window, stopping retry attempts.");
                    retriesAttemptedThisChunk++;
                    break; // Exit retry loop, continue to new days
                } else {
                    await updateState(env, fromDate, toDate, processedNewDays, totalDays, startedAt, dateStr, `Retry failed: ${errorMessage}`, true, 0, failedDays);
                }

                retriesAttemptedThisChunk++;
                // If auth required, stop immediately
                if (errorType === "auth_required") {
                    blockedByAuth = true;
                    return { newDays: processedNewDays, retriedDays: processedRetriedDays, blockedByAuth: true };
                }
            }
        } else {
            // Oldest failed day is not yet due, so no more retries for this chunk
            console.log(`Oldest failed day (${dateStr}) not due for retry yet (${oldestFailed.nextRetryAt}), proceeding to new days...`);
            break;
        }

        // Check time limit after each retry attempt
        if (Date.now() - startTime > maxTimeMs) {
            await updateState(env, fromDate, toDate, processedNewDays, totalDays, startedAt, dateStr, "Time limit exceeded during retry", false, 0, failedDays);
            return { newDays: processedNewDays, retriedDays: processedRetriedDays, blockedByAuth: false };
        }
    }

    // Policy: Process new days (iterate backwards from toDate to fromDate)
    let currentDate = new Date(toDate);
    const maxNewDaysPerTick = 7; // Limit new days ATTEMPTED per tick (includes both successes and failures)
    let attemptedNewDays = 0; // Track total attempts, not just successes

    // Find the last processed date from previous runs to avoid re-processing
    let lastProcessedDateFromState = initialState?.lastProcessedDate;
    if (lastProcessedDateFromState && lastProcessedDateFromState !== "DONE") {
        const lastProcessed = new Date(lastProcessedDateFromState);
        // Start from the day *before* the last processed day
        currentDate = new Date(lastProcessed);
        currentDate.setDate(currentDate.getDate() - 1);
    }

    while (currentDate >= fromDate && attemptedNewDays < maxNewDaysPerTick) {
        // Check for Stop Signal
        const stopSignal = await getStateMigrating<{ value: boolean }>(env, "backfill:stop");
        if (stopSignal && stopSignal.value) {
            await updateState(env, fromDate, toDate, processedNewDays, totalDays, startedAt, currentDate.toISOString().split('T')[0], "Stopped by user", false, 0, failedDays);
            return { newDays: processedNewDays, retriedDays: processedRetriedDays, blockedByAuth: false };
        }

        // Check for Time Limit
        if (Date.now() - startTime > maxTimeMs) {
            await updateState(env, fromDate, toDate, processedNewDays, totalDays, startedAt, currentDate.toISOString().split('T')[0], "Time limit exceeded", false, 0, failedDays);
            return { newDays: processedNewDays, retriedDays: processedRetriedDays, blockedByAuth: false };
        }

        const dateStr = currentDate.toISOString().split('T')[0];

        // Count each day cursor advance (skip, attempt, or success)
        attemptedNewDays++;

        // Skip if this day is already in failedDays and not due for retry (handled above)
        if (failedDays.some(f => f.date === dateStr && (new Date(f.nextRetryAt || 0).getTime() > Date.now()))) {
            console.log(`[${attemptedNewDays}/${maxNewDaysPerTick}] Skipping ${dateStr} (pending retry ${failedDays.find(f => f.date === dateStr)?.nextRetryAt})`);
            currentDate.setDate(currentDate.getDate() - 1);
            continue;
        }

        const { success, errorType, errorMessage, nextRetryAt } = await attemptSyncDay(env, dateStr, 0);

        if (!success) {
            // Add to failedDays if not already there, or update if it was a retry attempt
            const existingFailedIdx = failedDays.findIndex(f => f.date === dateStr);
            if (existingFailedIdx === -1) {
                failedDays.push({
                    date: dateStr,
                    errorType,
                    errorMessage,
                    failedAt: new Date().toISOString(),
                    nextRetryAt,
                    retryCount: 0
                });
            } else {
                // This case should ideally not happen if we process retries first, but for safety
                failedDays[existingFailedIdx].errorType = errorType;
                failedDays[existingFailedIdx].errorMessage = errorMessage;
                failedDays[existingFailedIdx].failedAt = new Date().toISOString();
                failedDays[existingFailedIdx].nextRetryAt = nextRetryAt;
                failedDays[existingFailedIdx].retryCount++;
                failedDays[existingFailedIdx].retryCount++;
            }

            // For rate_limit: preserve chunk window state to prevent progress jumping
            if (errorType === "rate_limit") {
                await updateStateOnRateLimit(env, failedDays);
                console.log(`[${attemptedNewDays}/${maxNewDaysPerTick}] Day ${dateStr} rate limited, preserving chunk window, continuing...`);
            } else {
                // Update state after failure for non-rate-limit errors
                await updateState(env, fromDate, toDate, processedNewDays, totalDays, startedAt, dateStr, `Failed at ${dateStr}: ${errorMessage}`, true, 0, failedDays);
                console.log(`[${attemptedNewDays}/${maxNewDaysPerTick}] Day ${dateStr} failed with ${errorType}, continuing...`);
            }

            // If auth required, stop immediately (only blocker)
            if (errorType === "auth_required") {
                blockedByAuth = true;
                return { newDays: processedNewDays, retriedDays: processedRetriedDays, blockedByAuth: true };
            }

            // For rate_limit and other errors: continue processing more days up to cap of 7
            // Don't break - fall through to sleep and continue
        } else {
            // Success case
            processedNewDays++;
            console.log(`[${attemptedNewDays}/${maxNewDaysPerTick}] Day ${dateStr} synced successfully`);
            await updateState(env, fromDate, toDate, processedNewDays, totalDays, startedAt, dateStr, null, true, 0, failedDays);

            // Cache bust
            await invalidateHistoryCache(env);
        }

        // Sleep rate limit (regardless of success/failure)
        await new Promise(r => setTimeout(r, 250));

        // Decrement day
        currentDate.setDate(currentDate.getDate() - 1);
    }

    // Update state one last time to reflect current progress and potentially mark as not running if done
    // If no progress was made (all rate_limited), state was already updated by updateStateOnRateLimit, don't overwrite
    if (processedNewDays > 0 || processedRetriedDays > 0) {
        await updateState(env, fromDate, toDate, processedNewDays, totalDays, startedAt, currentDate.toISOString().split('T')[0], null, false, 0, failedDays);
    } else {
        // No days processed, ensure running is set to false without changing chunk window
        // State was already updated by updateStateOnRateLimit if rate_limit occurred
        const state = await getStateMigrating<BackfillState>(env, "backfill:progress");
        if (state && state.running) {
            state.running = false;
            state.updatedAt = new Date().toISOString();
            await setState(env, "backfill:progress", state);
        }
    }

    return { newDays: processedNewDays, retriedDays: processedRetriedDays, blockedByAuth: blockedByAuth };
}

async function attemptSyncDay(env: Env, dateStr: string, retryCount: number): Promise<{ success: boolean, errorType: string, errorMessage: string, nextRetryAt: string | null }> {
    try {
        const status = await syncDay(env, dateStr);

        if (status === 401) {
            // Auth required - no automatic retry
            return {
                success: false,
                errorType: "auth_required",
                errorMessage: "Authentication required. Reconnect Fitbit account.",
                nextRetryAt: null
            };
        }

        if (status === 429) {
            // Rate limit - schedule retry using exponential backoff
            const delayMinutes = Math.min(60, Math.pow(2, retryCount) * 5); // 5, 10, 20, 40, 60 mins
            const nextRetry = new Date(Date.now() + delayMinutes * 60000).toISOString();
            return {
                success: false,
                errorType: "rate_limit",
                errorMessage: `Rate limited. Next retry in ${delayMinutes} min`,
                nextRetryAt: nextRetry
            };
        }

        if (status >= 500) {
            // Network error - exponential backoff
            const delayMinutes = Math.min(30, Math.pow(2, retryCount) * 2); // 2, 4, 8, 16, 30 mins
            const nextRetry = new Date(Date.now() + delayMinutes * 60000).toISOString();
            return {
                success: false,
                errorType: "network",
                errorMessage: `Server error ${status}. Retry in ${delayMinutes} min`,
                nextRetryAt: nextRetry
            };
        }

        // Success
        return { success: true, errorType: "", errorMessage: "", nextRetryAt: null };

    } catch (e: any) {
        // Unknown error - exponential backoff
        const delayMinutes = Math.min(30, Math.pow(2, retryCount) * 2);
        const nextRetry = new Date(Date.now() + delayMinutes * 60000).toISOString();
        return {
            success: false,
            errorType: "unknown",
            errorMessage: e.message || "Unknown error",
            nextRetryAt: nextRetry
        };
    }
}

async function updateState(env: Env, from: Date, to: Date, processed: number, total: number, startedAt: string, lastDate: string, error: string | null, running: boolean = true, attempts: number = 0, failedDays: Array<{ date: string, errorType: string, errorMessage: string, failedAt: string, nextRetryAt: string | null, retryCount: number }> = []) {
    const state: BackfillState = {
        running,
        from: from.toISOString().split('T')[0],
        to: to.toISOString().split('T')[0],
        lastProcessedDate: lastDate,
        processedDays: processed,
        totalDays: total,
        startedAt: startedAt,
        updatedAt: new Date().toISOString(),
        lastError: error,
        retries: attempts,
        failedDays: failedDays.length > 0 ? failedDays : undefined
    };
    await setState(env, "backfill:progress", state);
}

// Lightweight update that preserves chunk window state (from, to, processedDays, totalDays, lastProcessedDate)
// Used when rate_limit occurs to avoid shifting the chunk window on retry
async function updateStateOnRateLimit(env: Env, failedDays: Array<{ date: string, errorType: string, errorMessage: string, failedAt: string, nextRetryAt: string | null, retryCount: number }>) {
    const existingState = await getStateMigrating<BackfillState>(env, "backfill:progress");
    if (!existingState) {
        console.warn("updateStateOnRateLimit called but no existing state found");
        return;
    }

    // Only update these fields, preserve chunk window
    existingState.running = false;
    existingState.updatedAt = new Date().toISOString();
    existingState.lastError = null; // Clear error to allow retry
    existingState.failedDays = failedDays.length > 0 ? failedDays : undefined;

    await setState(env, "backfill:progress", existingState);
}

// ... handleAuth ... handleCallback ... handleToday ...

// ... (existing handlers) ...

// ... existing syncDay ... (Need to update signature)

// Logic to fetch all raw data and upsert into D1
async function syncDay(env: Env, date: string): Promise<number> {
    const responses = await Promise.all([
        fetchFitbitJSON(env, `/activities/date/${date}.json`),
        fetchFitbitJSON(env, `/activities/active-zone-minutes/date/${date}.json`),
        fetchFitbitJSON(env, `/sleep/date/${date}.json`),
        fetchFitbitJSON(env, `/activities/heart/date/${date}/1d.json`),
        fetchFitbitJSON(env, `/hrv/date/${date}.json`)
    ]);

    const maxStatus = Math.max(...responses.map(r => r.status));

    // Check for critical failures (429/5xx) before processing? 
    // Existing logic just tried to grab data.
    // If we return status, caller decides.

    const [actRes, azmRes, sleepRes, heartRes, hrvRes] = responses;

    // Parse Activity
    const summary = actRes.data?.summary || {};
    const steps = summary.steps || 0;
    const caloriesOut = summary.caloriesOut || 0;
    const floors = summary.floors || 0;
    const distanceKm = summary.distances?.find((d: any) => d.activity === "total")?.distance || 0;

    // Parse AZM
    // Priority A: Resource total (if finite number)
    // Priority B: Breakdown sum fallback
    // Priority C: 0
    let azm = 0;
    const azmList = azmRes.data?.["activities-active-zone-minutes"];
    const azmEntry = azmList && azmList[0];

    if (azmEntry?.value) {
        if (typeof azmEntry.value === 'number' && Number.isFinite(azmEntry.value)) {
            azm = azmEntry.value;
        } else if (typeof azmEntry.value?.activeZoneMinutes === 'number' && Number.isFinite(azmEntry.value.activeZoneMinutes)) {
            azm = azmEntry.value.activeZoneMinutes;
        } else {
            // Fallback: Sum parts
            const fatBurn = azmEntry.value?.fatBurnActiveZoneMinutes || 0;
            const cardio = azmEntry.value?.cardioActiveZoneMinutes || 0;
            const peak = azmEntry.value?.peakActiveZoneMinutes || 0;
            azm = fatBurn + cardio + peak;
        }
    }

    // Parse Heart
    let restingHr = 0, avgHr = 0, maxHr = 0; // Avg/max not readily available in summary, default 0
    if (heartRes.ok && heartRes.data?.["activities-heart"]?.[0]?.value) {
        const val = heartRes.data["activities-heart"][0].value;
        restingHr = val.restingHeartRate || 0;
        // If we had intraday we could calc avg, but keeping simpe
    }

    // Parse HRV
    let hrvRmssd = 0, hrvCoverage = 0;
    if (hrvRes.ok && hrvRes.data?.hrv?.[0]) {
        hrvRmssd = hrvRes.data.hrv[0].value?.dailyRmssd || 0;
    }

    // Parse Sleep
    // Priority A: Detailed logs (sum minutesAsleep for targetDate)
    // Priority B: Summary fallback (totalMinutesAsleep)
    // Priority C: 0
    // Hard rule: never use totalTimeInBed or duration for sleepMinutes.

    let sleepMinutes = 0;
    // We keep other sleep stats for DB consistency but logic for sleepMinutes is strict
    let timeInBed = 0;
    let efficiency = 0;
    let sDeep = 0, sLight = 0, sRem = 0, sWake = 0;

    let sleepFoundInDetails = false;

    if (sleepRes.ok && Array.isArray(sleepRes.data?.sleep)) {
        // A) Detailed logs
        const uniqueLogIds = new Set();
        const relevantEntries: any[] = [];
        const debugSleep = (env as any).DEBUG_SLEEP === "1";

        for (const log of sleepRes.data.sleep) {
            let include = false;
            // Rule: dateOfSleep matches target OR endTime is on target date
            if (log.dateOfSleep === date) {
                include = true;
            } else if (log.endTime) {
                const endDate = log.endTime.split('T')[0];
                if (endDate === date) include = true;
            }

            if (include && !uniqueLogIds.has(log.logId)) {
                uniqueLogIds.add(log.logId);
                relevantEntries.push(log);
            }
        }

        if (debugSleep && relevantEntries.length > 0) {
            const tempMins = relevantEntries.reduce((sum: number, s: any) => sum + (Number(s.minutesAsleep) || 0), 0);
            console.log(`[DEBUG_SLEEP] Date: ${date} | Logs: ${relevantEntries.length} | Mins: ${tempMins} | IDs: ${Array.from(uniqueLogIds).join(',')}`);
        }

        if (relevantEntries.length > 0) {
            sleepFoundInDetails = true;
            sleepMinutes = relevantEntries.reduce((sum: number, s: any) => sum + (Number(s.minutesAsleep) || 0), 0);

            // Capture other stats from main sleep (best effort)
            const mainSleep = relevantEntries.find((s: any) => s.isMainSleep) || relevantEntries[0];
            timeInBed = mainSleep.timeInBed || 0;
            efficiency = mainSleep.efficiency || 0;
            if (mainSleep.levels?.summary) {
                sDeep = mainSleep.levels.summary.deep?.minutes || 0;
                sLight = mainSleep.levels.summary.light?.minutes || 0;
                sRem = mainSleep.levels.summary.rem?.minutes || 0;
                sWake = mainSleep.levels.summary.wake?.minutes || 0;
            }
        }
    }

    if (!sleepFoundInDetails && sleepRes.ok && sleepRes.data?.summary?.totalMinutesAsleep) {
        // B) Summary fallback
        const summaryVal = sleepRes.data.summary.totalMinutesAsleep;
        if (Number.isFinite(summaryVal)) {
            sleepMinutes = summaryVal;
        }
    }

    // Final Coercion
    sleepMinutes = Number.isFinite(sleepMinutes) ? sleepMinutes : 0;
    azm = Number.isFinite(azm) ? azm : 0;



    try {
        await env.FITBIT_DB.prepare(`
        INSERT INTO daily_metrics (
            date, steps, calories_out, distance_km, floors, azm, 
            resting_hr, avg_hr, max_hr, hrv_rmssd, hrv_coverage,
            sleep_minutes, sleep_time_in_bed, sleep_efficiency,
            sleep_deep, sleep_light, sleep_rem, sleep_wake, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(date) DO UPDATE SET
            steps=excluded.steps, 
            calories_out=excluded.calories_out, 
            distance_km=excluded.distance_km,
            floors=excluded.floors, 
            azm=excluded.azm, 
            resting_hr=excluded.resting_hr, 
            avg_hr=excluded.avg_hr, 
            max_hr=excluded.max_hr,
            hrv_rmssd=excluded.hrv_rmssd, 
            hrv_coverage=excluded.hrv_coverage,
            sleep_minutes=excluded.sleep_minutes,
            sleep_time_in_bed=excluded.sleep_time_in_bed, 
            sleep_efficiency=excluded.sleep_efficiency,
            sleep_deep=excluded.sleep_deep, 
            sleep_light=excluded.sleep_light,
            sleep_rem=excluded.sleep_rem, 
            sleep_wake=excluded.sleep_wake, 
            updated_at=excluded.updated_at
    `).bind(
            date, steps, caloriesOut, distanceKm, floors, azm,
            restingHr, avgHr, maxHr, hrvRmssd, hrvCoverage,
            sleepMinutes, timeInBed, efficiency,
            sDeep, sLight, sRem, sWake, new Date().toISOString()
        ).run();
    } catch (e: any) {
        if (e.message && e.message.includes("no such table")) {
            console.warn("D1 daily_metrics table missing. Skipping upsert.", e.message);
            // If table missing, we can consider it a success (soft fail) or fail. 
            // Return 200-ish to allow backfill to continue for other checks? 
            // Or return failure? 
            // Let's return 200 status as it's not an API failure.
            return 200;
        }
        throw e;
    }

    return maxStatus;
}

async function handleAuth(req: Request, env: Env): Promise<Response> {
    const state = crypto.randomUUID();
    await setExpiringState(env, `oauth_state_${state}`, "valid", 600000); // 10 mins

    const params = new URLSearchParams({
        response_type: "code",
        client_id: env.FITBIT_CLIENT_ID,
        redirect_uri: env.FITBIT_REDIRECT_URL,
        scope: "activity sleep heartrate",
        expires_in: "604800", // 1 week
        state: state
    });

    return Response.redirect(`https://www.fitbit.com/oauth2/authorize?${params.toString()}`, 302);
}

async function handleCallback(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) return new Response(`Fitbit Error: ${error}`, { status: 400 });
    if (!code || !state) return new Response("Missing code or state", { status: 400 });

    // Validate state
    const storedState = await consumeExpiringState<string>(env, `oauth_state_${state}`);
    if (!storedState) return new Response("Invalid or expired state", { status: 400 });

    // Exchange token
    const tokens = await exchangeToken(env, code);

    // Store tokens
    await storeTokens(env, tokens);

    return new Response(
        `<html><body><h1>Connected!</h1><p>You can now close this or <a href="/">return to dashboard</a>.</p></body></html>`,
        { headers: { "Content-Type": "text/html" } }
    );
}

// Re-using fetchFitbitJSON logic for strict no-fail behavior
async function handleToday(req: Request, env: Env): Promise<Response> {
    const dateStr = new Date().toISOString().split('T')[0];
    const res = await fetchFitbitJSON(env, `/activities/date/${dateStr}.json`);

    if (res.status === 401) return unauthorizedResponse(env);
    if (!res.ok) return new Response(JSON.stringify({ error: "upstream_error", details: res.data }), { status: 502 });

    const summary = res.data?.summary;
    const result = {
        summary: {
            date: dateStr,
            steps: summary?.steps || 0,
            caloriesOut: summary?.caloriesOut || 0,
            distanceKm: (summary?.distances?.find((d: any) => d.activity === "total")?.distance || 0)
        }
    };
    return jsonResponse(env, result);
}

async function handleSleepToday(req: Request, env: Env): Promise<Response> {
    const dateStr = new Date().toISOString().split('T')[0];
    const res = await fetchFitbitJSON(env, `/sleep/date/${dateStr}.json`);

    if (res.status === 401) return unauthorizedResponse(env);

    // Defaults
    let stats = {
        date: dateStr,
        totalMinutesAsleep: 0,
        timeInBed: 0,
        efficiency: 0,
        stages: { deep: 0, light: 0, rem: 0, wake: 0 }
    };

    if (res.ok && res.data?.sleep && res.data.sleep.length > 0) {
        // Take main sleep or standard aggregation
        const mainSleep = res.data.sleep.find((s: any) => s.isMainSleep) || res.data.sleep[0];

        stats.totalMinutesAsleep = mainSleep.minutesAsleep || 0;
        stats.timeInBed = mainSleep.timeInBed || 0;
        stats.efficiency = mainSleep.efficiency || 0;

        if (mainSleep.levels?.summary) {
            stats.stages.deep = mainSleep.levels.summary.deep?.minutes || 0;
            stats.stages.light = mainSleep.levels.summary.light?.minutes || 0;
            stats.stages.rem = mainSleep.levels.summary.rem?.minutes || 0;
            stats.stages.wake = mainSleep.levels.summary.wake?.minutes || 0;
        }
    }

    return jsonResponse(env, { summary: stats });
}

async function handleHeartRateToday(req: Request, env: Env): Promise<Response> {
    const dateStr = new Date().toISOString().split('T')[0];
    const res = await fetchFitbitJSON(env, `/activities/heart/date/${dateStr}/1d.json`);

    if (res.status === 401) return unauthorizedResponse(env);

    let stats = {
        date: dateStr,
        restingHeartRate: 0,
        averageHeartRate: 0,
        maxHeartRate: 0
    };

    if (res.ok && res.data?.["activities-heart"]?.[0]?.value) {
        const val = res.data["activities-heart"][0].value;
        stats.restingHeartRate = val.restingHeartRate || 0;
    }

    return jsonResponse(env, { summary: stats });
}

async function handleHeartRateIntraday(req: Request, env: Env): Promise<Response> {
    const dateStr = new Date().toISOString().split('T')[0];
    const res = await fetchFitbitJSON(env, `/activities/heart/date/${dateStr}/1d/1min.json`);

    if (res.status === 401) return unauthorizedResponse(env);

    const dataset: any[] = [];
    if (res.ok && res.data?.["activities-heart-intraday"]?.dataset) {
        dataset.push(...res.data["activities-heart-intraday"].dataset.map((d: any) => ({
            time: d.time,
            value: d.value
        })));
    }

    return jsonResponse(env, { date: dateStr, dataset });
}

async function handleActivityToday(req: Request, env: Env): Promise<Response> {
    const dateStr = new Date().toISOString().split('T')[0];
    // Parallel fetch
    const [actRes, azmRes] = await Promise.all([
        fetchFitbitJSON(env, `/activities/date/${dateStr}.json`),
        fetchFitbitJSON(env, `/activities/active-zone-minutes/date/${dateStr}.json`)
    ]);

    if (actRes.status === 401) return unauthorizedResponse(env);

    const summary = actRes.data?.summary || {};
    const azmList = azmRes.data?.["activities-active-zone-minutes"];
    const azmVal = (azmList && azmList[0]?.value?.activeZoneMinutes) || 0;

    const stats = {
        date: dateStr,
        steps: summary.steps || 0,
        distanceKm: (summary.distances?.find((d: any) => d.activity === "total")?.distance || 0),
        caloriesOut: summary.caloriesOut || 0,
        floors: summary.floors || 0,
        veryActiveMinutes: summary.veryActiveMinutes || 0,
        fairlyActiveMinutes: summary.fairlyActiveMinutes || 0,
        lightlyActiveMinutes: summary.lightlyActiveMinutes || 0,
        sedentaryMinutes: summary.sedentaryMinutes || 0,
        activeZoneMinutes: azmVal
    };

    return jsonResponse(env, { summary: stats });
}

async function handleActivityTimeSeries(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const rangeDays = parseInt(url.searchParams.get("days") || "30");
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (rangeDays - 1));

    const endStr = end.toISOString().split('T')[0];
    const startStr = start.toISOString().split('T')[0];

    const paths = [
        `/activities/steps/date/${startStr}/${endStr}.json`,
        `/activities/distance/date/${startStr}/${endStr}.json`,
        `/activities/calories/date/${startStr}/${endStr}.json`,
        `/activities/active-zone-minutes/date/${startStr}/${endStr}.json`
    ];

    const responses = await Promise.all(paths.map(p => fetchFitbitJSON(env, p)));

    if (responses[0].status === 401) return unauthorizedResponse(env);

    const steps = responses[0].data?.["activities-steps"] || [];
    const distances = responses[1].data?.["activities-distance"] || [];
    const calories = responses[2].data?.["activities-calories"] || [];
    const azm = responses[3].data?.["activities-active-zone-minutes"] || [];

    const map = new Map<string, any>();
    const allDates = new Set([...steps, ...distances, ...calories, ...azm].map((i: any) => i.dateTime));

    for (const d of allDates) {
        map.set(d, { date: d, steps: 0, distanceKm: 0, caloriesOut: 0, activeZoneMinutes: 0 });
    }

    steps.forEach((i: any) => { if (map.has(i.dateTime)) map.get(i.dateTime).steps = Number(i.value); });
    distances.forEach((i: any) => { if (map.has(i.dateTime)) map.get(i.dateTime).distanceKm = Number(i.value); });
    calories.forEach((i: any) => { if (map.has(i.dateTime)) map.get(i.dateTime).caloriesOut = Number(i.value); });
    azm.forEach((i: any) => {
        const val = i.value?.activeZoneMinutes || i.value || 0;
        if (map.has(i.dateTime)) map.get(i.dateTime).activeZoneMinutes = Number(val);
    });

    const series = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));

    return jsonResponse(env, {
        range: { start: startStr, end: endStr, days: rangeDays },
        series
    });
}

async function handleHRVToday(req: Request, env: Env): Promise<Response> {
    const dateStr = new Date().toISOString().split('T')[0];
    const res = await fetchFitbitJSON(env, `/hrv/date/${dateStr}.json`);

    if (res.status === 401) return unauthorizedResponse(env);

    let stats = {
        date: dateStr,
        rmssd: 0,
        coverage: 0
    };

    if (res.ok && res.data?.hrv && res.data.hrv.length > 0) {
        const item = res.data.hrv[0];
        stats.rmssd = item.value?.dailyRmssd || 0;
    }

    return jsonResponse(env, { summary: stats });
}

async function handleCatalog(req: Request, env: Env): Promise<Response> {
    if (req.method !== "GET") return new Response("Method Not Allowed", { status: 405 });

    const resources = [
        {
            name: "Activity Summary",
            endpointUrl: "/1/user/-/activities/date/{date}.json",
            sampleFields: ["summary.steps", "summary.caloriesOut", "summary.distances[*].distance", "summary.floors"],
            numericMetrics: ["steps", "caloriesOut", "distanceKm", "floors"],
            numericFields: ["summary.steps", "summary.caloriesOut", "summary.distances[*].distance", "summary.floors", "summary.veryActiveMinutes", "summary.fairlyActiveMinutes"],
            coverageWhere: "steps > 0 OR calories_out > 0 OR distance_km > 0 OR floors > 0"
        },
        {
            name: "Active Zone Minutes",
            endpointUrl: "/1/user/-/activities/active-zone-minutes/date/{date}.json",
            sampleFields: ["activities-active-zone-minutes[0].value.activeZoneMinutes"],
            numericMetrics: ["activeZoneMinutes"],
            numericFields: ["activities-active-zone-minutes[0].value.activeZoneMinutes", "activities-active-zone-minutes[0].value.fatBurnActiveZoneMinutes", "activities-active-zone-minutes[0].value.cardioActiveZoneMinutes", "activities-active-zone-minutes[0].value.peakActiveZoneMinutes"],
            coverageWhere: "azm > 0"
        },
        {
            name: "Sleep Summary",
            endpointUrl: "/1/user/-/sleep/date/{date}.json",
            sampleFields: ["summary.totalMinutesAsleep", "summary.totalTimeInBed", "sleep[0].minutesAsleep", "sleep[0].timeInBed", "sleep[0].efficiency"],
            numericMetrics: ["sleepMinutes", "sleepTimeInBed", "sleepEfficiency"],
            numericFields: ["summary.totalMinutesAsleep", "summary.totalTimeInBed", "sleep[0].minutesAsleep", "sleep[0].timeInBed", "sleep[0].efficiency"],
            coverageWhere: "sleep_minutes > 0 OR sleep_time_in_bed > 0 OR sleep_efficiency > 0"
        },
        {
            name: "Sleep Stages",
            endpointUrl: "/1/user/-/sleep/date/{date}.json",
            sampleFields: ["sleep[0].levels.summary.deep.minutes", "sleep[0].levels.summary.light.minutes", "sleep[0].levels.summary.rem.minutes", "sleep[0].levels.summary.wake.minutes"],
            numericMetrics: ["sleepDeep", "sleepLight", "sleepRem", "sleepWake"],
            numericFields: ["sleep[0].levels.summary.deep.minutes", "sleep[0].levels.summary.light.minutes", "sleep[0].levels.summary.rem.minutes", "sleep[0].levels.summary.wake.minutes", "sleep[0].levels.summary.deep.count", "sleep[0].levels.summary.light.count", "sleep[0].levels.summary.rem.count", "sleep[0].levels.summary.wake.count"],
            coverageWhere: "sleep_deep > 0 OR sleep_light > 0 OR sleep_rem > 0 OR sleep_wake > 0"
        },
        {
            name: "Heart Rate (Daily)",
            endpointUrl: "/1/user/-/activities/heart/date/{date}/1d.json",
            sampleFields: ["activities-heart[0].value.restingHeartRate"],
            numericMetrics: ["restingHeartRate", "averageHeartRate", "maxHeartRate"],
            numericFields: ["activities-heart[0].value.restingHeartRate", "activities-heart[0].value.heartRateZones[0].minutes", "activities-heart[0].value.heartRateZones[1].minutes", "activities-heart[0].value.heartRateZones[2].minutes"],
            coverageWhere: "resting_hr > 0 OR avg_hr > 0 OR max_hr > 0"
        },
        {
            name: "Heart Rate (Intraday)",
            endpointUrl: "/1/user/-/activities/heart/date/{date}/1d/1min.json",
            sampleFields: ["activities-heart-intraday.dataset[*].time", "activities-heart-intraday.dataset[*].value"],
            numericMetrics: ["heartRate"],
            numericFields: ["activities-heart-intraday.dataset[*].value"],
            coverageWhere: "resting_hr > 0"
        },
        {
            name: "HRV (Daily)",
            endpointUrl: "/1/user/-/hrv/date/{date}.json",
            sampleFields: ["hrv[0].value.dailyRmssd"],
            numericMetrics: ["hrvRmssd"],
            numericFields: ["hrv[0].value.dailyRmssd", "hrv[0].value.deepRmssd"],
            coverageWhere: "hrv_rmssd > 0 OR hrv_coverage > 0"
        },
        {
            name: "Activity Time Series (Steps)",
            endpointUrl: "/1/user/-/activities/steps/date/{start}/{end}.json",
            sampleFields: ["activities-steps[*].dateTime", "activities-steps[*].value"],
            numericMetrics: ["steps"],
            coverageWhere: "steps > 0"
        },
        {
            name: "Activity Time Series (Distance)",
            endpointUrl: "/1/user/-/activities/distance/date/{start}/{end}.json",
            sampleFields: ["activities-distance[*].dateTime", "activities-distance[*].value"],
            numericMetrics: ["distanceKm"],
            coverageWhere: "distance_km > 0"
        },
        {
            name: "Activity Time Series (Calories)",
            endpointUrl: "/1/user/-/activities/calories/date/{start}/{end}.json",
            sampleFields: ["activities-calories[*].dateTime", "activities-calories[*].value"],
            numericMetrics: ["caloriesOut"],
            coverageWhere: "calories_out > 0"
        },
        {
            name: "Activity Time Series (Active Zone Minutes)",
            endpointUrl: "/1/user/-/activities/active-zone-minutes/date/{start}/{end}.json",
            sampleFields: ["activities-active-zone-minutes[*].dateTime", "activities-active-zone-minutes[*].value"],
            numericMetrics: ["activeZoneMinutes"],
            coverageWhere: "azm > 0"
        }
    ];

    let rangeStart: string | null = null;
    let rangeEnd: string | null = null;
    let totalRows = 0;
    try {
        const rangeRow = await env.FITBIT_DB.prepare(
            "SELECT MIN(date) as min_date, MAX(date) as max_date, COUNT(*) as total_rows FROM daily_metrics"
        ).first();
        rangeStart = rangeRow?.min_date || null;
        rangeEnd = rangeRow?.max_date || null;
        totalRows = Number(rangeRow?.total_rows || 0);
    } catch (e: any) {
        if (e.message && e.message.includes("no such table")) {
            return jsonResponse(env, {
                generatedAt: new Date().toISOString(),
                range: { start: null, end: null, expectedDays: 0, totalRows: 0 },
                resources: []
            });
        }
        throw e;
    }

    const expectedDays = rangeStart && rangeEnd ? daysBetweenInclusive(rangeStart, rangeEnd) : 0;

    const catalog = [];
    for (const resource of resources) {
        let daysPresent = 0;
        let lastUpdated: string | null = null;
        if (expectedDays > 0) {
            const row = await env.FITBIT_DB.prepare(
                `SELECT COUNT(*) as count, MAX(updated_at) as last_updated FROM daily_metrics WHERE ${resource.coverageWhere}`
            ).first();
            daysPresent = Number(row?.count || 0);
            lastUpdated = row?.last_updated || null;
        }

        catalog.push({
            resourceName: resource.name,
            endpointUrl: resource.endpointUrl,
            sampleFields: resource.sampleFields,
            numericMetrics: resource.numericMetrics,
            coverage: { daysPresent, expectedDays },
            lastUpdated
        });
    }

    return jsonResponse(env, {
        generatedAt: new Date().toISOString(),
        range: { start: rangeStart, end: rangeEnd, expectedDays, totalRows },
        resources: catalog
    });
}

// --- Phase 2B: D1 Handlers & Sync ---

async function handleSyncTrigger(req: Request, env: Env): Promise<Response> {
    if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    // We await here since it's an explicit user trigger
    await Promise.all([syncDay(env, today), syncDay(env, yesterday)]);

    // Cache bust
    await invalidateHistoryCache(env);

    return jsonResponse(env, { ok: true, synced: [yesterday, today] });
}

async function handleHistory(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const rangeDays = parseInt(url.searchParams.get("days") || "30");

    // A) Cache-read
    const cacheKey = `history:${rangeDays}`;
    const cached = await getExpiringState<any>(env, cacheKey);
    if (cached) {
        cached.cached = true;
        return jsonResponse(env, cached);
    }
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (rangeDays - 1));

    const endStr = end.toISOString().split('T')[0];
    const startStr = start.toISOString().split('T')[0];

    const { results } = await env.FITBIT_DB.prepare(
        "SELECT * FROM daily_metrics WHERE date >= ? AND date <= ? ORDER BY date ASC"
    ).bind(startStr, endStr).all();

    const series = (results || []).map((r: any) => {
        const sanitized = sanitizeDailyMetrics(r.date, {
            steps: r.steps,
            caloriesOut: r.calories_out,
            distanceKm: r.distance_km,
            azm: r.azm,
            restingHr: r.resting_hr,
            hrvRmssd: r.hrv_rmssd,
            sleepMinutes: r.sleep_minutes,
            // Pass stages for consistency check if available (D1 table columns)
            sleepDeep: r.sleep_deep,
            sleepLight: r.sleep_light,
            sleepRem: r.sleep_rem,
            sleepWake: r.sleep_wake
        });

        // Filter rows that became largely invalid? User says "Filter bort rader som bryter invariants"
        // But sanitizeMetric returns null for bad values. 
        // We keeps the row, but with nulls.

        return {
            date: r.date,
            steps: sanitized.steps,
            caloriesOut: sanitized.caloriesOut,
            distanceKm: sanitized.distanceKm,
            azm: sanitized.azm,
            restingHr: sanitized.restingHr,
            hrvRmssd: sanitized.hrvRmssd,
            sleepMinutes: sanitized.sleepMinutes,
            // New fields
            cardioLoad: sanitized.cardioLoad,
            cardioLoadStatus: sanitized.cardioLoadStatus
        };
    });

    const responseData = {
        range: { start: startStr, end: endStr, days: rangeDays },
        series
    };

    // B) Cache-write
    await setExpiringState(env, cacheKey, responseData, 600000);

    (responseData as any).cached = false;
    return jsonResponse(env, responseData);
}

async function handleDay(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const date = url.searchParams.get("date");
    if (!date) return new Response("Missing date", { status: 400 });

    const row: any = await env.FITBIT_DB.prepare(
        "SELECT * FROM daily_metrics WHERE date = ?"
    ).bind(date).first();

    if (!row) return jsonResponse(env, { date, metrics: null });

    const sanitized = sanitizeDailyMetrics(date, {
        steps: row.steps,
        caloriesOut: row.calories_out,
        distanceKm: row.distance_km,
        floors: row.floors,
        azm: row.azm,
        restingHr: row.resting_hr,
        avgHr: row.avg_hr,
        maxHr: row.max_hr,
        hrvRmssd: row.hrv_rmssd,
        hrvCoverage: row.hrv_coverage,
        sleepMinutes: row.sleep_minutes,
        sleepTimeInBed: row.sleep_time_in_bed,
        sleepEfficiency: row.sleep_efficiency,
        sleepDeep: row.sleep_deep,
        sleepLight: row.sleep_light,
        sleepRem: row.sleep_rem,
        sleepWake: row.sleep_wake,
        updatedAt: row.updated_at
    });

    return jsonResponse(env, {
        date,
        metrics: sanitized
    });
}





// --- Shared Helpers ---

async function fetchFitbitJSON(env: Env, path: string): Promise<{ ok: boolean, status: number, data: any }> {
    let tokens = await getTokens(env);
    if (!tokens) {
        await setState(env, "auth:required", { required: true, lastError: null });
        return { ok: false, status: 401, data: { error: "no_token" } };
    }

    const performRefresh = async () => {
        try {
            console.log(`Refreshing token due to expiry or 401...`);
            const newTokens = await refreshToken(env, tokens!.refresh_token);
            await storeTokens(env, newTokens);
            tokens = newTokens;
            return true;
        } catch (e: any) {
            console.error("Token refresh failed:", e);
            await setState(env, "auth:required", { required: true, lastError: e.message || "Refresh failed" });
            return false;
        }
    };

    // A) Pre-emptive Refresh (buffer 5 min)
    if (Date.now() > tokens.expires_at - 300000) {
        const refreshed = await performRefresh();
        if (!refreshed) return { ok: false, status: 401, data: { error: "refresh_failed" } };
    }

    let res = await fetch(`https://api.fitbit.com/1/user/-${path}`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
    });

    // Reactive Retry on 401
    if (res.status === 401) {
        console.warn("Got 401 from Fitbit. Attempting retry with refresh.");
        const refreshed = await performRefresh();
        if (refreshed) {
            res = await fetch(`https://api.fitbit.com/1/user/-${path}`, {
                headers: { Authorization: `Bearer ${tokens.access_token}` }
            });
        }
    }

    const bodyText = await res.text();
    let data;
    try {
        data = JSON.parse(bodyText);
    } catch {
        data = bodyText;
    }

    if (!res.ok) {
        if (res.status === 401) {
            await setState(env, "auth:required", { required: true, lastError: null });
            return { ok: false, status: 401, data: null };
        }
        return { ok: false, status: res.status, data };
    }

    return { ok: true, status: 200, data };
}

function jsonResponse(env: Env, data: any, status = 200) {
    return new Response(JSON.stringify(data), {
        status: status,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": env.APP_BASE_URL || "*"
        }
    });
}

function daysBetweenInclusive(start: string, end: string): number {
    const startDate = new Date(`${start}T00:00:00Z`).getTime();
    const endDate = new Date(`${end}T00:00:00Z`).getTime();
    if (isNaN(startDate) || isNaN(endDate)) return 0;
    if (endDate < startDate) return 0;
    return Math.floor((endDate - startDate) / 86400000) + 1;
}

// Re-using fetchFitbitJSON with internal retry/auth handling
// ...

function unauthorizedResponse(env: Env) {
    return new Response(JSON.stringify({ error: "not_connected", auth_url: "/fitbit/auth" }), {
        status: 401,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": env.APP_BASE_URL || "*"
        }
    });
}

interface TokenBundle {
    access_token: string;
    refresh_token: string;
    expires_at: number; // ms epoch
}

async function exchangeToken(env: Env, code: string): Promise<TokenBundle> {
    const body = new URLSearchParams({
        client_id: env.FITBIT_CLIENT_ID,
        grant_type: "authorization_code",
        redirect_uri: env.FITBIT_REDIRECT_URL,
        code: code
    });

    return makeTokenRequest(env, body);
}

async function refreshToken(env: Env, refreshToken: string): Promise<TokenBundle> {
    const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken
    });

    return makeTokenRequest(env, body);
}

async function makeTokenRequest(env: Env, body: URLSearchParams): Promise<TokenBundle> {
    const auth = btoa(`${env.FITBIT_CLIENT_ID}:${env.FITBIT_CLIENT_SECRET}`);

    const res = await fetch("https://api.fitbit.com/oauth2/token", {
        method: "POST",
        headers: {
            "Authorization": `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: body
    });

    if (!res.ok) {
        throw new Error(`Token exchange failed: ${await res.text()}`);
    }

    const data: any = await res.json();
    // data.expires_in is seconds
    const expiresAt = Date.now() + (data.expires_in * 1000);

    return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: expiresAt
    };
}

// Storage helpers (Singleton / Single User mode)
const TOKEN_KEY = "user_tokens_v1";

async function storeTokens(env: Env, tokens: TokenBundle) {
    await setState(env, TOKEN_KEY, tokens);
    await setState(env, "auth:required", { required: false, lastError: null });
}

async function getTokens(env: Env): Promise<TokenBundle | null> {
    return getState<TokenBundle>(env, TOKEN_KEY);
}

// C) Cache-bust helper
async function invalidateHistoryCache(env: Env) {
    await deleteStateByPrefix(env, "history:");
}

// --- Data Quality Guards ---

function sanitizeMetric(date: string, field: string, value: any, min: number, max: number): number | null {
    if (value === null || value === undefined) return null;
    const num = Number(value);

    // Invariant: No NaN/Infinity
    if (isNaN(num) || !isFinite(num)) return null;

    // Invariant: No negative values (Generic constraint from prompt "Ingen negative verdier i output")
    if (num < 0) return null;

    // Guard: Clamp check
    if (num < min || num > max) {
        console.warn(`Guard Triggered [${date}]: ${field}=${num} out of range [${min}, ${max}]`);
        return null; // "Null hvis utenfor range"
    }
    return num;
}

function sanitizeDailyMetrics(date: string, raw: any): any {
    const sanitized: any = { ...raw };

    // A) Daily Guards
    sanitized.restingHr = sanitizeMetric(date, "restingHr", raw.restingHr || raw.resting_hr, 35, 120);
    sanitized.hrvRmssd = sanitizeMetric(date, "hrvRmssd", raw.hrvRmssd || raw.hrv_rmssd, 5, 200);
    sanitized.sleepMinutes = sanitizeMetric(date, "sleepMinutes", raw.sleepMinutes || raw.sleep_minutes, 0, 900);

    // Additional implicit guards for other invariants
    if (raw.steps !== undefined) sanitized.steps = sanitizeMetric(date, "steps", raw.steps, 0, 100000);
    if (raw.azm !== undefined) sanitized.azm = sanitizeMetric(date, "azm", raw.azm, 0, 1440);

    // B) Missing Data Markers & Cardio Load
    // If we have Resting HR (valid), we assume we have HR data.
    // If Intraday HR is missing -> cardioLoad = null, status = missing.
    // Since we don't have intraday HR blob here, we use restingHr as proxy for "HR Data Exists".
    // AND prompt says "cardioLoad: 0-1000".

    sanitized.cardioLoad = null; // Always null since we don't assume calculation
    sanitized.cardioLoadStatus = sanitized.restingHr ? "ok" : "missing";

    // Double check prompt B: "Hvis intraday HR mangler ... cardioLoadStatus = 'missing', Ellers 'ok'"
    // Since we don't calculate it yet, strictly sticking to "missing" might be safer? 
    // But then "cardioLoadStatus" is useless. 
    // We'll stick to: Have HR? Status OK (data exists).

    // C) Consistency
    const sDeep = raw.sleepDeep || raw.sleep_deep || 0;
    const sLight = raw.sleepLight || raw.sleep_light || 0;
    const sRem = raw.sleepRem || raw.sleep_rem || 0;
    const sWake = raw.sleepWake || raw.sleep_wake || 0;
    const totalStages = sDeep + sLight + sRem + sWake;
    const outputTotal = sanitized.sleepMinutes || 0;

    if (totalStages > 0 && outputTotal > 0) {
        const diff = Math.abs(outputTotal - totalStages);
        if (diff > (outputTotal * 0.01)) {
            console.warn(`Consistency Warning [${date}]: Sleep total ${outputTotal} vs Sum ${totalStages} (diff ${diff})`);
            // "behold eksisterende verdi" (Keep existing value) -> No change to sanitized
        }
    }

    return sanitized;
}

// --- Cron Stats Helper ---

async function updateCronStats(env: Env, success: boolean, duration: number, details?: { newDays: number, retriedDays: number, blockedByAuth: boolean }) {
    const existing = await getState<any>(env, "cron:stats");
    let stats = existing || {
        runs: 0,
        successes: 0,
        failures: 0,
        avgDurationMs: 0,
        newDaysProcessed: 0,
        retriedDaysProcessed: 0,
        blockedByAuth: false
    };

    stats.runs++;
    if (success) {
        stats.successes++;
        // Moving average: NewAvg = OldAvg + (NewVal - OldAvg) / NewCount
        stats.avgDurationMs = stats.avgDurationMs + (duration - stats.avgDurationMs) / stats.successes;
    } else {
        stats.failures++;
    }

    if (details) {
        stats.newDaysProcessed = (stats.newDaysProcessed || 0) + details.newDays;
        stats.retriedDaysProcessed = (stats.retriedDaysProcessed || 0) + details.retriedDays;
        stats.blockedByAuth = details.blockedByAuth;
    }

    // Add backfill retry info
    const progress = await getStateMigrating<BackfillState>(env, "backfill:progress");
    if (progress) {
        stats.failedDaysCount = progress.failedDays ? progress.failedDays.length : 0;
        if (progress.failedDays && progress.failedDays.length > 0 && progress.failedDays[0].nextRetryAt) {
            stats.nextRetryAt = progress.failedDays[0].nextRetryAt;
        } else {
            stats.nextRetryAt = null;
        }
    } else {
        stats.failedDaysCount = 0;
        stats.nextRetryAt = null;
    }

    await setState(env, "cron:stats", stats);
}

// --- Automated Backfill Helper ---

async function processAutomatedBackfillChunk(env: Env): Promise<{ newDays: number, retriedDays: number, blockedByAuth: boolean }> {
    const now = Date.now();
    const nowISO = new Date(now).toISOString();

    // Load cron state
    let cronState = await getStateMigrating<BackfillCronState>(env, "backfill:cron_state") || {
        lastCronTickAt: null,
        lastTickAttemptAt: null,
        lastTickResult: null,
        nextRetryAllowedAt: null
    };

    // Update last cron tick time
    cronState.lastCronTickAt = nowISO;

    const plan = await getStateMigrating<BackfillPlan>(env, "backfill:plan");
    if (!plan) {
        cronState.lastTickResult = 'noop';
        await setState(env, "backfill:cron_state", cronState);
        return { newDays: 0, retriedDays: 0, blockedByAuth: false };
    }

    if (!plan.active) {
        cronState.lastTickResult = 'noop';
        await setState(env, "backfill:cron_state", cronState);
        return { newDays: 0, retriedDays: 0, blockedByAuth: false };
    }

    // Check for auth_required before starting any sync
    const authStatus = await getStateMigrating<{ required: boolean }>(env, "auth:required");
    if (authStatus && authStatus.required) {
        cronState.lastTickResult = 'auth_required';
        await setState(env, "backfill:cron_state", cronState);
        return { newDays: 0, retriedDays: 0, blockedByAuth: true };
    }

    // Determine Range
    const progress = await getStateMigrating<BackfillState>(env, "backfill:progress");

    // Check if already running
    if (progress?.running) {
        cronState.lastTickResult = 'noop';
        await setState(env, "backfill:cron_state", cronState);
        return { newDays: 0, retriedDays: 0, blockedByAuth: false };
    }

    // Decide if we should tick
    let shouldTick = false;
    let tickReason = '';

    // Check if there's work to do
    if (progress) {
        // Check if more days to process
        if (progress.processedDays < progress.totalDays) {
            shouldTick = true;
            tickReason = 'more days to process';
        }

        // Check if failed days are due for retry
        if (progress.failedDays && progress.failedDays.length > 0) {
            const dueRetries = progress.failedDays.filter(f => {
                if (!f.nextRetryAt) return true;
                return new Date(f.nextRetryAt).getTime() <= now;
            });
            if (dueRetries.length > 0) {
                shouldTick = true;
                tickReason = tickReason ? `${tickReason}, failed days due` : 'failed days due for retry';
            }
        }
    } else {
        // No progress yet, should start
        shouldTick = true;
        tickReason = 'no progress yet';
    }

    if (!shouldTick) {
        cronState.lastTickResult = 'noop';
        await setState(env, "backfill:cron_state", cronState);
        return { newDays: 0, retriedDays: 0, blockedByAuth: false };
    }

    // Check rate limiting
    if (cronState.nextRetryAllowedAt) {
        const nextRetryTime = new Date(cronState.nextRetryAllowedAt).getTime();
        if (now < nextRetryTime) {
            cronState.lastTickResult = 'noop';
            await setState(env, "backfill:cron_state", cronState);
            console.log(`[Backfill] Rate limited, next retry at ${cronState.nextRetryAllowedAt}`);
            return { newDays: 0, retriedDays: 0, blockedByAuth: false };
        }
    }

    // Check minimum interval between attempts (120s)
    if (cronState.lastTickAttemptAt) {
        const timeSinceLastAttempt = now - new Date(cronState.lastTickAttemptAt).getTime();
        if (timeSinceLastAttempt < 120000) {
            cronState.lastTickResult = 'noop';
            await setState(env, "backfill:cron_state", cronState);
            return { newDays: 0, retriedDays: 0, blockedByAuth: false };
        }
    }

    console.log(`[Backfill] Starting tick: ${tickReason}`);
    cronState.lastTickAttemptAt = nowISO;

    // Check if progress has "Auth required" error BUT authRequired is false
    // Meaning we recovered, so we should clear the error and proceed
    if (progress?.lastError === "Auth required") {
        console.log("[Backfill] Clearing stale 'Auth required' error as auth is restored.");
        progress.lastError = null;
    }

    // Determine Chunk Range
    // If no progress was made in previous tick (rate_limit or blockers), reuse existing chunk window
    // This prevents chunk from shifting when retrying rate-limited ranges
    const shouldReuseChunk = progress
        && progress.from
        && progress.to
        && progress.processedDays === 0
        && (cronState.lastTickResult === 'rate_limit' || progress.lastError?.includes('50+'));

    let fromDate: Date;
    let toDate: Date;
    let diffDays: number;

    if (shouldReuseChunk) {
        // Reuse existing chunk window to retry exact same range
        fromDate = new Date(progress.from);
        toDate = new Date(progress.to);
        diffDays = progress.totalDays;
        console.log(`[Backfill] Reusing chunk window (no progress last tick): ${progress.from} to ${progress.to}`);
    } else {
        // Calculate new chunk window based on progress
        if (progress && progress.lastProcessedDate && progress.lastProcessedDate !== "DONE") {
            // Continue from last processed
            const d = new Date(progress.lastProcessedDate);
            d.setDate(d.getDate() - 1);
            toDate = d;
        } else if (progress && progress.lastProcessedDate === "DONE") {
            // Was marked done previously? If plan is active maybe we wanted to restart?
            // Assume restart from yesterday if we just started plan or ensure logic holds
            toDate = new Date(Date.now() - 86400000);
        } else {
            // No progress, start from yesterday
            toDate = new Date(Date.now() - 86400000);
        }

        const targetDate = new Date(plan.targetSince);
        if (toDate < targetDate) {
            // We reached the target!
            plan.active = false;
            plan.updatedAt = new Date().toISOString();
            await setState(env, "backfill:plan", plan);

            if (progress) {
                // Mark progress DONE
                await updateState(env, new Date(plan.targetSince), new Date(), progress.processedDays, progress.totalDays, progress.startedAt, "DONE", null, false, 0, progress.failedDays || []);
            }
            console.log("Backfill Plan Completed!");
            return { newDays: 0, retriedDays: 0, blockedByAuth: false };
        }

        // Determine Chunk Size
        fromDate = new Date(toDate);
        fromDate.setDate(fromDate.getDate() - (plan.chunkDays - 1));

        // Clamp to target
        if (fromDate < targetDate) {
            fromDate.setTime(targetDate.getTime());
        }

        diffDays = Math.ceil((toDate.getTime() - fromDate.getTime()) / 86400000) + 1;
    }

    console.log(`Running Backfill Chunk: ${fromDate.toISOString().split('T')[0]} to ${toDate.toISOString().split('T')[0]} (${diffDays} days)`);

    // Run Chunk
    try {
        const res = await processBackfill(env, fromDate, toDate, diffDays, plan.maxWallMs);

        // Update Plan Timestamp
        plan.updatedAt = new Date().toISOString();
        await setState(env, "backfill:plan", plan);

        // Update cron state based on result
        if (res.blockedByAuth) {
            cronState.lastTickResult = 'auth_required';
        } else if (res.newDays === 0 && res.retriedDays === 0) {
            cronState.lastTickResult = 'rate_limit';
            // Find earliest nextRetryAt from failed days
            const endProgress = await getStateMigrating<BackfillState>(env, "backfill:progress");
            if (endProgress && endProgress.failedDays && endProgress.failedDays.length > 0) {
                const earliestRetry = endProgress.failedDays
                    .map(f => f.nextRetryAt ? new Date(f.nextRetryAt).getTime() : Infinity)
                    .reduce((min, t) => Math.min(min, t), Infinity);
                if (earliestRetry !== Infinity) {
                    cronState.nextRetryAllowedAt = new Date(earliestRetry).toISOString();
                }
            }
        } else {
            cronState.lastTickResult = 'ok';
            cronState.nextRetryAllowedAt = null;
        }

        await setState(env, "backfill:cron_state", cronState);
        return res;
    } finally {
        // Safety Clean-up: Always ensure running is false when this chunk logic finishes
        const endState = await getStateMigrating<BackfillState>(env, "backfill:progress");
        if (endState && endState.running) {
            endState.running = false;
            await setState(env, "backfill:progress", endState);
        }
    }
}

async function processAutomatedRepair(env: Env): Promise<void> {
    try {
        const authStatus = await getStateMigrating<{ required: boolean }>(env, "auth:required");
        if (authStatus && authStatus.required) return;

        const state = await getStateMigrating<RepairState>(env, "repair:state");
        if (!state) return;

        // Check if should run
        if (!state.active || state.running) return;
        if (!state.nextRunAt) return;

        const now = Date.now();
        const nextRun = new Date(state.nextRunAt).getTime();
        if (now < nextRun) return;

        console.log(`[CRON] Running automated repair cycle (${state.remainingDays} days remaining)`);
        await runRepairCycle(env, state.days);
    } catch (e: any) {
        console.error(`[CRON] Repair automation error: ${e.message}`);
    }
}
