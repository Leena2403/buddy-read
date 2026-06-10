# Buddy Reading App

## Local development

```bash
# 1. Clone / extract
npm install

# 2. Start both servers
npm run dev:all
# Frontend: http://localhost:5173
# API:      http://localhost:4000
```

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
