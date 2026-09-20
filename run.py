#!/usr/bin/env python3
"""
PackCheck - Unified Project Launcher
Runs all platform services (Backend FastAPI + Frontend Next.js + Future Workers).
Press Ctrl+C to cleanly stop all running services.

MAINTENANCE INSTRUCTION FOR FUTURE PHASES:
Whenever new implementations or services (such as OCR workers, Celery/Redis queues,
AI inference pipelines, vector databases, or PDF generators) are introduced into PackCheck,
register them in the `SERVICES` list below.
"""

import os
import sys
import time
import signal
import socket
import subprocess
from pathlib import Path

# Project Root
ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "backend"
FRONTEND_DIR = ROOT_DIR / "frontend"

# Resolve Python Executable for Backend (prefer virtualenv)
if os.name == "nt":
    VENV_PYTHON = BACKEND_DIR / "venv" / "Scripts" / "python.exe"
else:
    VENV_PYTHON = BACKEND_DIR / "venv" / "bin" / "python"

PYTHON_EXEC = str(VENV_PYTHON) if VENV_PYTHON.exists() else sys.executable

# =====================================================================
# SERVICE REGISTRY
# Add any new services/workers introduced in future phases here.
# =====================================================================
SERVICES = [
    {
        "name": "FastAPI Backend",
        "cwd": BACKEND_DIR,
        "command": [
            PYTHON_EXEC,
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            "8000",
            "--reload",
        ],
        "port": 8000,
        "url": "http://localhost:8000/docs",
    },
    {
        "name": "Next.js Frontend",
        "cwd": FRONTEND_DIR,
        # Using cmd.exe /c on Windows avoids PowerShell script execution policy issues with npm.ps1
        "command": (
            ["cmd.exe", "/c", "npm run dev"]
            if os.name == "nt"
            else ["npm", "run", "dev"]
        ),
        "port": 3000,
        "url": "http://localhost:3000",
    },
]

running_processes = []


def is_port_in_use(port: int) -> bool:
    """Checks if a local TCP port is already open."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


def free_port(port: int):
    """Automatically frees a local TCP port if occupied by a stale dev process."""
    if not is_port_in_use(port):
        return
    try:
        if os.name == "nt":
            out = subprocess.check_output(
                f"netstat -ano | findstr :{port}", shell=True
            ).decode()
            for line in out.strip().splitlines():
                parts = line.split()
                if (
                    len(parts) >= 5
                    and parts[1].endswith(f":{port}")
                    and parts[3] == "LISTENING"
                ):
                    pid = parts[4]
                    if pid != "0" and int(pid) != os.getpid():
                        print(f"[Port {port}] Freeing stale process PID {pid}...")
                        subprocess.run(
                            ["taskkill", "/F", "/T", "/PID", pid],
                            stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL,
                        )
                        time.sleep(0.5)
    except Exception:
        pass


def kill_process_tree(proc: subprocess.Popen):
    """Gracefully terminates a process and all its child processes on Windows/Unix."""
    if proc.poll() is not None:
        return
    try:
        if os.name == "nt":
            # Force kill the entire process tree on Windows
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        else:
            proc.terminate()
            proc.wait(timeout=3)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass


def shutdown(signum=None, frame=None):
    """Cleanly stops all services on interrupt."""
    print("\n[PackCheck] Shutting down all platform services...")
    for item in running_processes:
        name = item["name"]
        proc = item["proc"]
        print(f"  Stopping {name} (PID {proc.pid})...")
        kill_process_tree(proc)

    # Extra safety: ensure ports are clean on exit
    for svc in SERVICES:
        port = svc.get("port")
        if port:
            free_port(port)

    print("[PackCheck] All services stopped cleanly. Goodbye!\n")
    sys.exit(0)


def print_banner():
    print(
        """
=====================================================================
            PackCheck - Unified Platform Launcher
=====================================================================
[System] Initializing PackCheck platform services...
"""
    )


def print_ready():
    print(
        """
=====================================================================
            [READY] All Services Running!
=====================================================================
  Web Application:    http://localhost:3000
  API Docs (Swagger): http://localhost:8000/docs
  API Health Check:   http://localhost:8000/api/v1/health

  Press Ctrl+C anytime in this window to stop all services.
=====================================================================
"""
    )


def main():
    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    print_banner()

    # Pre-flight environment checks
    if not VENV_PYTHON.exists():
        print(f"[Warning] Backend venv python not found at {VENV_PYTHON}.")
        print(f"          Falling back to active Python: {PYTHON_EXEC}")

    node_modules = FRONTEND_DIR / "node_modules"
    if not node_modules.exists():
        print("[Setup] Installing frontend dependencies (npm install)...")
        install_cmd = (
            ["cmd.exe", "/c", "npm install"]
            if os.name == "nt"
            else ["npm", "install"]
        )
        subprocess.run(install_cmd, cwd=FRONTEND_DIR, check=True)

    # Clean stale ports and launch services
    for svc in SERVICES:
        name = svc["name"]
        cwd = svc["cwd"]
        cmd = svc["command"]
        port = svc.get("port")

        if port and is_port_in_use(port):
            free_port(port)

        print(f"[Starting] {name} in {cwd.name}...")
        try:
            proc = subprocess.Popen(cmd, cwd=cwd)
            running_processes.append({"name": name, "proc": proc})
            time.sleep(1.0)
        except Exception as e:
            print(f"[Error] Failed to start {name}: {e}")
            shutdown()

    print_ready()

    # Keep alive and monitor child processes
    try:
        while running_processes:
            for item in list(running_processes):
                proc = item["proc"]
                ret = proc.poll()
                if ret is not None:
                    print(
                        f"\n[Warning] {item['name']} exited with code {ret}."
                    )
                    running_processes.remove(item)
            if not running_processes:
                print("\n[PackCheck] All services have exited.")
                break
            time.sleep(1)
    except KeyboardInterrupt:
        shutdown()


if __name__ == "__main__":
    main()
