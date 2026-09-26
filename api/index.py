import os
import sys
from pathlib import Path

# Add project root and backend directory to sys.path so all imports resolve seamlessly
ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"

if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Import the FastAPI application from backend.app.main
try:
    from backend.app.main import app
except ImportError:
    from app.main import app

# Vercel Serverless Function looks for `app` WSGI/ASGI application
