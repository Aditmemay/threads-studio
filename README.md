# Threads Studio — deployable test build

## Included
- Mobile-first UI served by the Node.js backend.
- Threads OAuth authorization-code flow with CSRF state validation.
- Reads replies/conversation only from posts visible in the authorized account's own `/me/threads` list, using `threads_read_replies`.
- Optional ElevenLabs text-to-speech endpoint using a configured Adam voice ID.
- Browser-based video export with an uploaded background plus MP3 narration. It tries MP4 when the mobile browser supports that recording format; otherwise it exports WebM.

## Deploy as a Render Web Service
1. Push these files to the root of the public GitHub repository.
2. In Render, choose **New → Web Service** and connect the repository `Aditmemay/threads-studio`.
3. Runtime: Node; Build command: `npm install`; Start command: `npm start`; Free plan for testing.
4. Add environment variables in Render (never commit secrets): `SESSION_SECRET`, `THREADS_APP_ID`, `THREADS_APP_SECRET`, `THREADS_REDIRECT_URI`. Optional TTS variables: `ELEVENLABS_API_KEY`, `ADAM_VOICE_ID`.
5. The redirect URI must be exactly `https://YOUR-SERVICE.onrender.com/auth/threads/callback` and must also be registered in the Meta Threads app.
6. In the Meta app, configure the Threads use case and request `threads_basic` + `threads_read_replies`. Complete the required tester/app review steps from Meta.

## Important limitations
- A share link is resolved only if it redirects to the canonical post link, and the canonical link must match a post returned by the authorized account's own `/me/threads` list. This does not scrape arbitrary public users' comments.
- Meta must grant the requested permissions. An API app in development mode may be limited to app roles/testers.
- Free Render web services sleep after 15 minutes of inactivity and can take about a minute to wake. Session storage is in memory; reconnect Threads after server restarts/sleep.
- Adam TTS needs an authorized ElevenLabs API credential and the voice ID from that account. TTS usage consumes account credits. Do not share API keys in chat or put secrets in GitHub. A parent/guardian or authorized adult account holder should manage any service account that requires adult eligibility.
- The browser exporter requests MP4 if the browser advertises support, and falls back to WebM otherwise. Mobile browser codec support and memory vary; the result depends on the device.

## Local test
`npm install && npm start`, then open `http://localhost:3000`.
