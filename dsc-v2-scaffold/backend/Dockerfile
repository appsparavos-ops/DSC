FROM python:3.12-slim

# Usuario no-root
RUN useradd --create-home --uid 10001 --shell /usr/sbin/nologin app

WORKDIR /srv

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/

USER app
EXPOSE 10000

CMD ["gunicorn", "--bind", "0.0.0.0:10000", "--workers", "2", "--timeout", "60", "backend.app.health:app"]
