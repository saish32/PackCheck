@echo off
REM =====================================================================
REM PackCheck - 1-Click Unified Platform Launcher (Windows)
REM =====================================================================

title PackCheck Unified Launcher

if exist "backend\venv\Scripts\python.exe" (
    backend\venv\Scripts\python.exe run.py %*
) else (
    python run.py %*
)
