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
