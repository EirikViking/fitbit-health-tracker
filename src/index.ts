
export interface Env {
    FITBIT_KV: KVNamespace;
    FITBIT_DB: D1Database;
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
    <button onclick="loadData()" style="padding: 0.5rem 1rem;">Refresh</button>
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
            if (url.pathname === "/") return new Response(INDEX_HTML, { headers: { "Content-Type": "text/html" } });
            if (url.pathname === "/health") return new Response(JSON.stringify({ version: "1.0.0" }), { headers: { "Content-Type": "application/json" } });
            if (url.pathname === "/fitbit/auth") return handleAuth(request, env);
            if (url.pathname === "/fitbit/callback") return handleCallback(request, env);

            // API Routes
            if (url.pathname === "/api/today") return handleToday(request, env);
            if (url.pathname === "/api/sleep/today") return handleSleepToday(request, env);
            if (url.pathname === "/api/heartrate/today") return handleHeartRateToday(request, env);
            if (url.pathname === "/api/heartrate/intraday") return handleHeartRateIntraday(request, env);
            if (url.pathname === "/api/activity/today") return handleActivityToday(request, env);
            if (url.pathname === "/api/activity/timeseries") return handleActivityTimeSeries(request, env);
            if (url.pathname === "/api/hrv/today") return handleHRVToday(request, env);

            // Phase 2B: D1 History & Sync
            if (url.pathname === "/api/sync") return handleSyncTrigger(request, env);
            if (url.pathname === "/api/history") return handleHistory(request, env);
            if (url.pathname === "/api/day") return handleDay(request, env);

            return new Response("Not Found", { status: 404 });
        } catch (e: any) {
            return new Response(`Error: ${e.message}`, { status: 500 });
        }
    },

    async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
        // Sync today and yesterday to capture late data updates
        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

        ctx.waitUntil(Promise.all([syncDay(env, today), syncDay(env, yesterday)]));
    }
};

// --- Handlers ---

async function handleAuth(req: Request, env: Env): Promise<Response> {
    const state = crypto.randomUUID();
    await env.FITBIT_KV.put(`oauth_state_${state}`, "valid", { expirationTtl: 600 }); // 10 mins

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
    const storedState = await env.FITBIT_KV.get(`oauth_state_${state}`);
    if (!storedState) return new Response("Invalid or expired state", { status: 400 });

    // Cleanup state
    await env.FITBIT_KV.delete(`oauth_state_${state}`);

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

// --- Phase 2B: D1 Handlers & Sync ---

async function handleSyncTrigger(req: Request, env: Env): Promise<Response> {
    if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    // We await here since it's an explicit user trigger
    await Promise.all([syncDay(env, today), syncDay(env, yesterday)]);

    return jsonResponse(env, { ok: true, synced: [yesterday, today] });
}

async function handleHistory(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const rangeDays = parseInt(url.searchParams.get("days") || "30");
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (rangeDays - 1));

    const endStr = end.toISOString().split('T')[0];
    const startStr = start.toISOString().split('T')[0];

    const { results } = await env.FITBIT_DB.prepare(
        "SELECT * FROM daily_metrics WHERE date >= ? AND date <= ? ORDER BY date ASC"
    ).bind(startStr, endStr).all();

    const series = (results || []).map((r: any) => ({
        date: r.date,
        steps: r.steps,
        caloriesOut: r.calories_out,
        distanceKm: r.distance_km,
        azm: r.azm,
        restingHr: r.resting_hr,
        hrvRmssd: r.hrv_rmssd,
        sleepMinutes: r.sleep_minutes
    }));

    return jsonResponse(env, {
        range: { start: startStr, end: endStr, days: rangeDays },
        series
    });
}

async function handleDay(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const date = url.searchParams.get("date");
    if (!date) return new Response("Missing date", { status: 400 });

    const row: any = await env.FITBIT_DB.prepare(
        "SELECT * FROM daily_metrics WHERE date = ?"
    ).bind(date).first();

    if (!row) return jsonResponse(env, { date, metrics: null });

    return jsonResponse(env, {
        date,
        metrics: {
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
        }
    });
}

// Logic to fetch all raw data and upsert into D1
async function syncDay(env: Env, date: string) {
    const [actRes, azmRes, sleepRes, heartRes, hrvRes] = await Promise.all([
        fetchFitbitJSON(env, `/activities/date/${date}.json`),
        fetchFitbitJSON(env, `/activities/active-zone-minutes/date/${date}.json`),
        fetchFitbitJSON(env, `/sleep/date/${date}.json`),
        fetchFitbitJSON(env, `/activities/heart/date/${date}/1d.json`),
        fetchFitbitJSON(env, `/hrv/date/${date}.json`)
    ]);

    // Parse Activity
    const summary = actRes.data?.summary || {};
    const steps = summary.steps || 0;
    const caloriesOut = summary.caloriesOut || 0;
    const floors = summary.floors || 0;
    const distanceKm = summary.distances?.find((d: any) => d.activity === "total")?.distance || 0;

    // Parse AZM
    const azmList = azmRes.data?.["activities-active-zone-minutes"];
    const azm = (azmList && azmList[0]?.value?.activeZoneMinutes) || 0;

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
    let sleepMinutes = 0, timeInBed = 0, efficiency = 0;
    let sDeep = 0, sLight = 0, sRem = 0, sWake = 0;
    if (sleepRes.ok && sleepRes.data?.sleep?.length > 0) {
        const s = sleepRes.data.sleep.find((x: any) => x.isMainSleep) || sleepRes.data.sleep[0];
        sleepMinutes = s.minutesAsleep || 0;
        timeInBed = s.timeInBed || 0;
        efficiency = s.efficiency || 0;
        if (s.levels?.summary) {
            sDeep = s.levels.summary.deep?.minutes || 0;
            sLight = s.levels.summary.light?.minutes || 0;
            sRem = s.levels.summary.rem?.minutes || 0;
            sWake = s.levels.summary.wake?.minutes || 0;
        }
    }

    await env.FITBIT_DB.prepare(`
        INSERT INTO daily_metrics (
            date, steps, calories_out, distance_km, floors, azm, 
            resting_hr, avg_hr, max_hr, hrv_rmssd, hrv_coverage,
            sleep_minutes, sleep_time_in_bed, sleep_efficiency,
            sleep_deep, sleep_light, sleep_rem, sleep_wake, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(date) DO UPDATE SET
            steps=excluded.steps, calories_out=excluded.calories_out, distance_km=excluded.distance_km,
            floors=excluded.floors, azm=excluded.azm, resting_hr=excluded.resting_hr,
            hrv_rmssd=excluded.hrv_rmssd, sleep_minutes=excluded.sleep_minutes,
            sleep_time_in_bed=excluded.sleep_time_in_bed, sleep_efficiency=excluded.sleep_efficiency,
            sleep_deep=excluded.sleep_deep, sleep_light=excluded.sleep_light,
            sleep_rem=excluded.sleep_rem, sleep_wake=excluded.sleep_wake, updated_at=excluded.updated_at
    `).bind(
        date, steps, caloriesOut, distanceKm, floors, azm,
        restingHr, avgHr, maxHr, hrvRmssd, hrvCoverage,
        sleepMinutes, timeInBed, efficiency,
        sDeep, sLight, sRem, sWake, new Date().toISOString()
    ).run();
}



// --- Shared Helpers ---

async function fetchFitbitJSON(env: Env, path: string): Promise<{ ok: boolean, status: number, data: any }> {
    let tokens = await getTokens(env);
    if (!tokens) return { ok: false, status: 401, data: null };

    if (Date.now() > tokens.expires_at - 300000) {
        try {
            tokens = await refreshToken(env, tokens.refresh_token);
            await storeTokens(env, tokens);
        } catch {
            return { ok: false, status: 401, data: null };
        }
    }

    const res = await fetch(`https://api.fitbit.com/1/user/-${path}`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
    });

    const bodyText = await res.text();
    let data;
    try {
        data = JSON.parse(bodyText);
    } catch {
        data = bodyText;
    }

    if (!res.ok) {
        // If 401, we might just return the status, or the parsed error
        if (res.status === 401) return { ok: false, status: 401, data: null };
        return { ok: false, status: res.status, data };
    }

    return { ok: true, status: 200, data };
}

function jsonResponse(env: Env, data: any) {
    return new Response(JSON.stringify(data), {
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": env.APP_BASE_URL || "*"
        }
    });
}

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
    await env.FITBIT_KV.put(TOKEN_KEY, JSON.stringify(tokens));
}

async function getTokens(env: Env): Promise<TokenBundle | null> {
    const raw = await env.FITBIT_KV.get(TOKEN_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TokenBundle;
}
