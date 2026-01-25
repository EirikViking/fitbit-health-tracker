# Fitbit Health Tracker (Minimal)

A minimal Cloudflare Worker app to track Fitbit daily stats using OAuth 2.0.

## Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Secrets**
   Do not commit secrets. Set them via Wrangler secrets or `.dev.vars` (for local dev).
   
   **Local Development:**
   Create a `.dev.vars` file (ignored by git):
   ```
   FITBIT_CLIENT_ID="your_client_id"
   FITBIT_CLIENT_SECRET="your_client_secret"
   FITBIT_REDIRECT_URL="http://localhost:8787/fitbit/callback"
   APP_BASE_URL="http://localhost:8787"
   ```

   **Production:**
   ```bash
   npx wrangler secret put FITBIT_CLIENT_ID
   npx wrangler secret put FITBIT_CLIENT_SECRET
   ```

3. **Fitbit Portal Setup**
   - Go to [dev.fitbit.com](https://dev.fitbit.com) -> Manage -> Register an App.
   - **OAuth 2.0 Application Type**: Server (or Client if purely client-side, but we are Server here).
   - **Callback URL**: `http://localhost:8787/fitbit/callback` (add your production URL later).
   - **Default Access Type**: Read & Write.
   - **Scopes**: `activity`, `heartrate`, `sleep`.

4. **Run Locally**
   ```bash
   npx wrangler dev
   ```
   Visit http://localhost:8787/

## Routes

- `GET /`: Dashboard
- `GET /fitbit/auth`: Starts OAuth flow
- `GET /fitbit/callback`: OAuth callback
- `GET /api/today`: Returns JSON stats for today
- `GET /health`: Health check

## Deployment

1. **Deploy to Cloudflare**
   ```bash
   npm run deploy
   ```
2. **Update Fitbit Redirect URL**
   Update your Fitbit app settings to include your deployed Worker URL:
   `https://fitbit-health-tracker.<your-subdomain>.workers.dev/fitbit/callback`

## Notes
- Tokens are stored in Cloudflare KV (`FITBIT_KV`).
- This is a single-user demo (tokens stored under generic key).
