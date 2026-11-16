"""Configuración de la aplicación."""

from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BASE_DIR / "data"
INSTANCE_DIR = BASE_DIR / "instance"


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "plataforma-qr-clave-local")
    DATABASE = os.environ.get("DATABASE_PATH") or str(INSTANCE_DIR / "plataforma_qr.db")
    MAX_CONTENT_LENGTH = 8 * 1024 * 1024  # 8 MB por petición (logo en base64)
    PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")
    JSON_SORT_KEYS = False
    TEMPLATES_AUTO_RELOAD = True
