# Imagen del Arquitecto de Manifestación (D-164).
#
# Contenedor de VIDA LARGA, no función serverless. Es una decisión, no una
# preferencia: este servicio ya está en medio de una cadena que la persona
# espera con un botón pulsado (navegador → Vercel → aquí → Gemini → vuelta), y
# un arranque en frío en este salto es el que se nota.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app

COPY pyproject.toml ./
COPY manifestation ./manifestation
RUN pip install --no-cache-dir .

EXPOSE 8080
# Un worker: el trabajo es esperar al modelo, no calcular. Escalar va por
# instancias, que es lo que sabe hacer el orquestador.
CMD ["uvicorn", "manifestation.manifestation_router:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
