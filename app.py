"""Punto de entrada de la aplicacion en modo desarrollo.

Ejecutar con el interprete del entorno virtual: python app.py
Se usa use_reloader=False para tener un unico proceso (ver aplicacion.md 4.1).
"""

from __future__ import annotations

import os
import socket

from modules.core.factory import create_app

app = create_app()


def _available_port(preferred: int) -> int:
    """Devuelve el primer puerto libre a partir del preferido."""
    for candidate in range(preferred, preferred + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            if probe.connect_ex(("127.0.0.1", candidate)) != 0:
                return candidate
    return preferred


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    chosen = _available_port(port)
    if chosen != port:
        print(f"El puerto {port} esta ocupado; se usara el {chosen}.")
    app.run(host="0.0.0.0", port=chosen,
            debug=os.environ.get("FLASK_DEBUG", "1") == "1",
            use_reloader=False)