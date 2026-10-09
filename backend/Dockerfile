FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN apt-get update && apt-get install -y --no-install-recommends gettext \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY VERSION /app/VERSION
COPY backend/ .
RUN python manage.py compilemessages && \
    ENVIRONNEMENT=test python manage.py collectstatic --noinput
RUN useradd --create-home innov
USER innov
EXPOSE 8000
# Render donne le port dans PORT (0.9.5) ; 8000 en local.
CMD ["sh", "-c", "exec gunicorn config.wsgi:application --bind 0.0.0.0:${PORT:-8000} --workers ${WEB_CONCURRENCY:-3}"]
