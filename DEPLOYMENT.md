# OILCOM SUPER APP — Deployment & Mobile Packaging Guide

## 1. Environment Variables
Configure the following variables in your hosting environment (see `.env.example`):

- `APP_URL`: Public URL of the deployed Cloud Run / Node.js service.
- `OILCOM_HMAC_SECRET`: Long random secret (`openssl rand -hex 32`) used by `server.ts` for HMAC-SHA256 loyalty QR signing and Sandbox payment callback verification.
- `VITE_GOOGLE_MAPS_API_KEY` (or `GOOGLE_MAPS_API_KEY`): Restricted Google Maps JavaScript API key for **Vituo Karibu (Nearby Stations)**.
- `GEMINI_API_KEY`: Optional server-side key if future AI features are enabled.

## 2. Production Build & Full-Stack Node.js Server
The application compiles the React SPA via Vite (`dist/`) and serves both `/api/*` security endpoints and static assets from `server.ts` on port `3000` (or `process.env.PORT`):

```bash
npm install
npm run build
NODE_ENV=production npm run start
```

### Health Check
- `GET /api/health` returns `{ "status": "ok", "service": "oilcom-super-app" }`.

## 2B. Hosting on Render.com
This repository includes `render.yaml` and `.node-version` (`Node 22`) ready for Render.com.

### Option A: Blueprint Deploy (Recommended)
1. Push this project to GitHub/GitLab.
2. In Render Dashboard, click **New + -> Blueprint** and select your repository.
3. Render automatically reads `render.yaml`, generates `OILCOM_HMAC_SECRET`, and installs Node 22.
4. Enter `VITE_GOOGLE_MAPS_API_KEY` and `APP_URL` (your `https://<service>.onrender.com` URL) when prompted.

### Option B: Manual Web Service
- **Runtime:** Node (uses `.node-version` = `22`)
- **Build Command:** `npm install --include=dev && npm run build`
- **Start Command:** `npm run start`
- **Health Check Path:** `/api/health`
- **Environment Variables:**
  - `NODE_ENV=production`
  - `NODE_VERSION=22`
  - `OILCOM_HMAC_SECRET=<random-64-char-hex>`
  - `VITE_GOOGLE_MAPS_API_KEY=<your-google-maps-key>`
  - `APP_URL=https://<your-service>.onrender.com`

### Post-Deploy Domain Allowlist (Required for Login & Maps)
1. **Firebase Auth:** In Firebase Console -> **Authentication -> Settings -> Authorized domains**, add `<your-service>.onrender.com` so Google Sign-In works.
2. **Google Maps API Key:** If using HTTP referrer restrictions in Google Cloud Console, allow `https://<your-service>.onrender.com/*`.

## 3. Firebase Security Rules Deployment
Firestore security rules (`firestore.rules`) are validated with `@firebase/eslint-plugin-security-rules`:

```bash
npx eslint firestore.rules
firebase deploy --only firestore:rules
```

## 4. Packaging for Android & iOS (Capacitor)
The React + TypeScript codebase is structured cleanly for native mobile wrappers using Capacitor:

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
npx cap init "OILCOM SUPER APP" "tz.co.oilcom.superapp" --web-dir=dist
npm run build
npx cap add android
npx cap add ios
npx cap sync
```

For production mobile builds:
1. Point API calls in `src/lib/api.ts` to your deployed HTTPS backend URL (`APP_URL`).
2. Add your Android package name / SHA-1 and iOS Bundle ID to Firebase Console OAuth settings and Google Cloud API key restrictions.
