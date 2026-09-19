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
# `${PORT:-8080}` y no un 8080 fijo: Render (y casi cualquier PaaS) inyecta el
# puerto por entorno y espera que el proceso escuche ahí. Con el puerto cableado
# el contenedor arranca, responde en local, y el health check del proveedor falla
# contra un puerto en el que no hay nadie — un fallo que se lee como «la imagen
# está rota» cuando lo único que pasa es que nadie preguntó.
#
# Forma de shell y no exec, porque la exec no expande variables. Pero con `exec`
# delante: sin él, uvicorn queda como HIJO del shell, el `SIGTERM` de cada
# despliegue se lo come el shell, y el contenedor muere por el temporizador de
# gracia en vez de cerrar sus conexiones. Con `exec`, el shell se sustituye a sí
# mismo por uvicorn, que pasa a ser PID 1 y recibe la señal.
#
# Un worker: el trabajo es esperar al modelo, no calcular. Escalar va por
# instancias, que es lo que sabe hacer el orquestador.
CMD exec uvicorn manifestation.manifestation_router:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1
