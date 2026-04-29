Deployment & Google Calendar setup

1) Local testing (quick):
- Copy `config.example.js` to `config.js` and replace placeholders with your Google OAuth Client ID and API Key.
- Open `To_Do.html` locally and click "Connect Google Calendar" to authorize.

2) Secure production on Vercel (recommended):
- In your Vercel project settings > Environment Variables, add two variables:
  - `GCAL_CLIENT_ID` = your OAuth client ID
  - `GCAL_API_KEY` = your API key
- In Vercel > Project Settings > Build & Development Settings, set the Build Command to:
  ```sh
  sh build-config.sh || true
  ```
  (This generates `config.js` at build time from environment variables.)
- Deploy to Vercel as usual.

3) Google Cloud Console (OAuth setup):
- Go to https://console.developers.google.com/apis
- Create or select a project, enable the Google Calendar API.
- Under "OAuth consent screen", configure application name and scopes (add `https://www.googleapis.com/auth/calendar`).
- Create OAuth 2.0 Client ID (type: Web application).
  - Add Authorized JavaScript origins: your Vercel domain (e.g. `https://yourproject.vercel.app`) and `http://localhost:3000` if testing locally.
  - Add Authorized redirect URIs: `https://yourproject.vercel.app` (for the google.accounts flow no redirect is needed but adding origin is best).
- Copy the Client ID and API Key into Vercel env vars or locally into `config.js`.

4) Security note:
- Do NOT commit `config.js` with real credentials. Use `config.example.js` for reference and `config.js` only on your local machine or generated during CI/build.

5) If you want, I can:
- Remove `config.js` from the repository history (recommended) and push the cleaned branch.
- Or leave it and you manually rotate the credentials if they are already exposed.
