# Usa la imagen completa de Python (3.10) para evitar problemas de repositorios "slim"
FROM python:3.10

# Evita que Python genere archivos .pyc y que el log se bufferée
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Instalar Google Chrome y sus dependencias de forma directa y simplificada
# La imagen completa de Python ya tiene muchas librerías de sistema básicas
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    curl \
    --no-install-recommends \
    && wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
    && apt-get install -y ./google-chrome-stable_current_amd64.deb \
    && rm google-chrome-stable_current_amd64.deb \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Establece el directorio de trabajo
WORKDIR /app

# Copia los archivos de requerimientos e instala las dependencias de Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# Verificar que gunicorn esté instalado
RUN python -m gunicorn --version

# Copia el resto del código
COPY . .

# Comando para ejecutar la aplicación usando Gunicorn vía Python (más robusto)
# --access-logfile - y --error-logfile - envían los logs a la consola de Render
# --bind 0.0.0.0:$PORT es esencial para que Render detecte el servicio
CMD ["sh", "-c", "python -m gunicorn --bind 0.0.0.0:$PORT --access-logfile - --error-logfile - --timeout 120 --workers 1 --threads 4 servicio_scraping:app"]
