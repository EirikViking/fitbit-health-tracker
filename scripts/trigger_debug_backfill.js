// const fetch = require('node-fetch'); // Using native fetch in Node 18+

const BASE_URL = 'https://fitbit-health-tracker.cromkake.workers.dev';

async function run() {
    console.log('[DebugTrigger] Starting sequence...');

    // 1. Stop existing backfill
    console.log('[DebugTrigger] Stopping any active backfill...');
    try {
        const stopRes = await fetch(`${BASE_URL}/api/backfill/stop`, { method: 'POST' });
        console.log(`[DebugTrigger] Stop status: ${stopRes.status} ${stopRes.statusText}`);
        const stopText = await stopRes.text();
        console.log(`[DebugTrigger] Stop body: ${stopText}`);
    } catch (e) {
        console.error('[DebugTrigger] Failed to stop backfill:', e.message);
    }

    // 2. Start debug backfill
    console.log('[DebugTrigger] Starting backfill for 2026-01-25 to 2026-01-26...');
    try {
        const startRes = await fetch(`${BASE_URL}/api/backfill`, {
            method: 'POST',
            body: JSON.stringify({ from: '2026-01-25', to: '2026-01-26' }),
            headers: { 'Content-Type': 'application/json' }
        });
        console.log(`[DebugTrigger] Start status: ${startRes.status} ${startRes.statusText}`);
        const startText = await startRes.text();
        console.log(`[DebugTrigger] Start body: ${startText}`);
    } catch (e) {
        console.error('[DebugTrigger] Failed to start backfill:', e.message);
    }
}

// Node 18+ has native fetch, older versions need node-fetch.
// If native fetch is missing, this might fail, but let's try.
if (!globalThis.fetch) {
    console.warn('Native fetch not found, proceeding anyway if node-fetch is mocked or available');
}

run().catch(console.error);
