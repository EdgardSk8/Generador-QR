"""Fábrica de la aplicación Flask."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

from flask import Flask, jsonify, render_template

from modules.analytics import api_bp as analytics_api
from modules.bulk import api_bp as bulk_api
from modules.catalog import api_bp as catalog_api
from modules.codes import api_bp as codes_api
from modules.core.config import Config
from modules.core.db import init_app as init_db_app
from modules.core.utils import human_day, short_datetime
from modules.design import api_bp as design_api
from modules.dynamic.views import bp as dynamic_bp
from modules.pages.views import bp as pages_bp
from modules.system.views import bp as system_bp
from version import VERSION


def create_app(config_object=Config) -> Flask:
    base_dir = Path(__file__).resolve().parents[2]
    app = Flask(
        __name__,
        template_folder=str(base_dir / "templates"),
        static_folder=str(base_dir / "static"),
    )
    app.config.from_object(config_object)

    init_db_app(app)

    app.register_blueprint(catalog_api)
    app.register_blueprint(design_api)
    app.register_blueprint(codes_api)
    app.register_blueprint(analytics_api)
    app.register_blueprint(bulk_api)
    app.register_blueprint(dynamic_bp)
    app.register_blueprint(pages_bp)
    app.register_blueprint(system_bp)

    app.jinja_env.filters["human_day"] = human_day
    app.jinja_env.filters["short_datetime"] = short_datetime
    app.jinja_env.globals["APP_VERSION"] = VERSION
    app.jinja_env.globals["CURRENT_YEAR"] = datetime.now().year

    @app.errorhandler(404)
    def not_found(_error):
        return render_template("estado.html", title="Página no encontrada",
                               message="La dirección solicitada no existe.",
                               status="404"), 404

    @app.errorhandler(413)
    def too_large(_error):
        return jsonify({"ok": False, "errors": {
            "archivo": "El archivo o la imagen supera el límite de 8 MB"}}), 413

    @app.errorhandler(500)
    def server_error(_error):  # pragma: no cover - solo en producción
        return jsonify({"ok": False, "errors": {"servidor": "Error interno"}}), 500

    return app
