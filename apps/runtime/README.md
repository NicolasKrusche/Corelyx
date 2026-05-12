# Corelyx Runtime

FastAPI service for executing validated Corelyx workflow schemas.

## Local Setup

```powershell
Copy-Item .env.example .env
venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8002 --reload
```

Health check:

```powershell
Invoke-WebRequest http://127.0.0.1:8002/health -UseBasicParsing | Select-Object -ExpandProperty Content
```

## Tests

```powershell
venv\Scripts\python.exe -m pytest tests
```

See `.env.example` for required runtime secrets and callback URLs.

## Railway Deployment

Create a Railway service from this repo with the root directory set to
`apps/runtime`. The included `railway.json` tells Railway to build the runtime
from `Dockerfile`; the image installs `requirements.txt` and starts FastAPI on
Railway's `$PORT`, falling back to `8002` locally.

Set the production environment variables from `.env.example`, then point the
web app's `RUNTIME_URL` and `RUNTIME_INTERNAL_URL` to the Railway service URL.
