# Folio — Buddy Reading App

## Local development

```bash
# 1. Clone / extract
npm install

# 2. Create .env
cat > .env << 'DOTENV'
MONGODB_URI=mongodb+srv://leenagoyal2403_db_user:uzhc5LS2F2bB5YSn@cluster0.ctenzf0.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
MONGODB_DB_NAME=buddy-read-db
DOTENV

# 3. Start both servers
npm run dev:all
# Frontend: http://localhost:5173
# API:      http://localhost:4000
```

## Deploy to Vercel

### 1. Push to GitHub
```bash
git init && git add . && git commit -m "Folio"
git remote add origin https://github.com/YOUR_USERNAME/folio.git
git push -u origin main
```

### 2. Import on Vercel
- Go to vercel.com → New Project → import your repo
- Framework: **Vite** (auto-detected)
- Build command: `npm run build`
- Output dir: `dist`

### 3. Add environment variables in Vercel dashboard
Settings → Environment Variables:

| Name | Value |
|------|-------|
| `MONGODB_URI` | `mongodb+srv://leenagoyal2403_db_user:uzhc5LS2F2bB5YSn@cluster0.ctenzf0.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0` |
| `MONGODB_DB_NAME` | `buddy-read-db` |

### 4. Deploy
Click Deploy. Every `git push` auto-deploys.

## Debug checklist

If rooms aren't loading on Vercel, check these in order:

**1. Test the debug endpoint**
Open: `https://your-app.vercel.app/api/debug`

Expected response:
```json
{
  "db": "connected",
  "collections": ["rooms","highlights","notes","messages","members"],
  "hasUri": true
}
```

If `"db": "failed"` → env var is missing or wrong.
If `"hasUri": false` → MONGODB_URI not set in Vercel dashboard.

**2. Check MongoDB Atlas network access**
Atlas → Network Access → must include `0.0.0.0/0` (allow all IPs)
Vercel functions run from different IPs each time — you can't whitelist specific IPs.

**3. Check Vercel function logs**
Vercel dashboard → your project → Functions tab → click any route to see logs.

**4. Test individual API routes**
- `GET /api/rooms` → should return array
- `GET /api/debug` → shows DB status

## Architecture

```
/
├── api/                  ← Vercel serverless functions
│   ├── _mongo.js         ← Shared MongoDB connection
│   ├── rooms.js          ← GET/POST/PATCH/DELETE
│   ├── highlights.js     ← GET/POST/DELETE
│   ├── notes.js          ← GET/POST/DELETE
│   ├── messages.js       ← GET/POST
│   ├── members.js        ← GET/POST
│   ├── pdf-proxy.js      ← Proxies PDF URLs server-side
│   └── debug.js          ← Health check
├── src/                  ← React + Vite frontend
│   ├── App.jsx
│   ├── components/
│   └── lib/
│       ├── api.js        ← All fetch() calls
│       └── constants.js  ← Books, colors, helpers
├── server.js             ← Express server (LOCAL DEV only)
├── vercel.json           ← Routing config
└── package.json
```
