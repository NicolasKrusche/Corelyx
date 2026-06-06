# Start Web And Runtime Locally

These steps assume the repository is at `C:\NexFlow`.

## 1. Open The Repo

```powershell
cd /d C:\NexFlow
```

## 2. Start The Web App

Run in terminal 1:

```powershell
cd /d C:\NexFlow
pnpm --filter @flowos/web dev
```

Expected output includes:

- `Next.js`
- `Local: http://localhost:3000`
- `Ready`

Quick check:

```powershell
Invoke-WebRequest http://localhost:3000 -UseBasicParsing | Select-Object StatusCode
```

Expected status: `200`. 

## 3. Start The Runtime API

Run in terminal 2: 

```powershell
cd /d C:\NexFlow\apps\runtime
venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8002 --reload
```

If the app-local runtime venv is not available but the repo-root venv is, use:

```powershell
cd /d C:\NexFlow\apps\runtime
..\..\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8002 --reload
```

Expected output includes:

- `Application startup complete`
- `Uvicorn running on http://127.0.0.1:8002`

Quick check:

```powershell
Invoke-WebRequest http://127.0.0.1:8002/health -UseBasicParsing | Select-Object -ExpandProperty Content
```

Expected response:

```json
{"status":"ok"}
```

## 4. Keep Both Terminals Open

- Web and runtime stop when their terminal is closed.
- Press `Ctrl+C` in each terminal to stop manually.

## Notes

- Local environment values live in `apps\web\.env.local` and `apps\runtime\.env`.
- Local env files are ignored by git and must not contain placeholder production secrets.
- Docker Desktop must be running before `supabase start`.
