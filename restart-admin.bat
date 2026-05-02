@echo off
REM Script to restart the web server and apply admin dashboard changes

echo ==========================================
echo FlowOS Admin Dashboard Setup
echo ==========================================
echo.

REM Kill existing Node processes for the web app
echo [1/4] Stopping existing Next.js server...
taskkill /F /IM node.exe /FI "WINDOWTITLE eq *web*" 2>nul
taskkill /F /PID 16524 2>nul
timeout /t 2 /nobreak >nul
echo      Done!
echo.

REM Apply database migrations
echo [2/4] Applying database migrations...
echo      Please run this SQL in Supabase dashboard:
echo      https://supabase.com/dashboard/project/fzvmsejkqjbqyavxvirf/sql
echo.
echo      Files to run:
echo        1. supabase/migrations/20260111120000_launch_readiness.sql
echo        2. supabase/migrations/20260111130000_add_admin_role.sql
echo        3. make-admin.sql (set your email as admin)
echo.
pause

REM Clear Next.js cache
echo [3/4] Clearing Next.js cache...
if exist "apps/web/.next" (
    rmdir /s /q "apps/web/.next"
    echo      Cache cleared!
) else (
    echo      No cache to clear
)
echo.

REM Start the server
echo [4/4] Starting Next.js dev server...
echo.
echo ==========================================
echo Admin Dashboard will be available at:
echo   http://localhost:3000/admin
echo ==========================================
echo.
echo Press any key to start the server...
pause >nul

cd apps/web
pnpm dev
