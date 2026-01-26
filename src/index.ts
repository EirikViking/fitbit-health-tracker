
export interface Env {
    FITBIT_KV: KVNamespace;
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
                    "Access-Control-Allow-Methods": "GET, OPTIONS",
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

            return new Response("Not Found", { status: 404 });
        } catch (e: any) {
            return new Response(`Error: ${e.message}`, { status: 500 });
        }
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

    if (!res.ok) {
        if (res.status === 401) return { ok: false, status: 401, data: null };
        try {
            return { ok: false, status: res.status, data: await res.json() };
        } catch {
            return { ok: false, status: res.status, data: await res.text() };
        }
    }

    const data = await res.json();
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
