# Start Web and Runtime Locally

This is the exact flow used to start:
- Web app: `http://localhost:3000`
- Runtime API: `http://127.0.0.1:8002`

## 1. Open terminal in the repo root

```powershell
cd /d n:\ai
```

## 2. Start the web app (Next.js on port 3000)

Run this in terminal window 1:

```powershell
pnpm --filter @flowos/web dev
```

Expected output includes:
- `Next.js ...`
- `Local: http://localhost:3000`
- `Ready`

Quick check:

```powershell
Invoke-WebRequest http://localhost:3000 -UseBasicParsing | Select-Object StatusCode
```

Expected: `200`

## 3. Start the runtime API (Uvicorn on port 8002)

Run this in terminal window 2:

```powershell
cd /d n:\ai\apps\runtime
venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8002
```

Expected output includes:
- `Application startup complete`
- `Uvicorn running on http://127.0.0.1:8002`

Quick check (from any terminal):

```powershell
Invoke-WebRequest http://127.0.0.1:8002/health -UseBasicParsing | Select-Object -ExpandProperty Content
```

Expected response:

```json
{"status":"ok"}
```

## 4. Keep both terminals open

- Web and runtime stop when their terminal is closed.
- To stop manually, press `Ctrl+C` in each terminal.

---

## Laptop Startup Guide (`C:\NexFlow`)

Use these steps when the repo is located at `C:\NexFlow`.

### 1. Open terminal in repo root

```powershell
cd /d C:\NexFlow
```

### 2. Start web app (terminal 1)

```powershell
cd /d C:\NexFlow
pnpm --filter @flowos/web dev
```

Quick check:

```powershell
Invoke-WebRequest http://localhost:3000 -UseBasicParsing | Select-Object StatusCode
```

Expected: `200`

### 3. Start runtime API (terminal 2)

If needed, activate the virtual environment first:

```powershell
cd /d C:\NexFlow
(Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned) ; (& C:\NexFlow\.venv\Scripts\Activate.ps1)
```

Then start runtime:

```powershell
cd /d C:\NexFlow\apps\runtime
..\..\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8002
```

Quick check:

```powershell
Invoke-WebRequest http://127.0.0.1:8002/health -UseBasicParsing | Select-Object -ExpandProperty Content
```

Expected response:

```json
{"status":"ok"}
```

## Notes from this environment

- `apps/runtime/package.json` uses a cross-shell fallback in `dev` that can fail on Windows PowerShell.
- Running runtime directly with `venv\Scripts\python.exe -m uvicorn ...` is the reliable path.
- If `supabase start` is needed, Docker Desktop must be installed and running first.
