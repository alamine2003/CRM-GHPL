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
    DJANGO_SECRET_KEY=construction ENVIRONNEMENT=build python manage.py collectstatic --noinput
RUN useradd --create-home innov
USER innov
EXPOSE 8000
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3"]
