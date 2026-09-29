"""Aplicación mínima del backend DSC v2.

Fase 3 agrega: auth middleware (ID token Firebase), CORS, validación,
rate limiting y los blueprints reales (fichas, jugadores, scraping).
"""

from flask import Flask, jsonify


def create_app() -> Flask:
    app = Flask(__name__)

    @app.get("/api/health")
    def health():
        return jsonify(status="ok", service="dsc-v2-backend")

    return app


app = create_app()
