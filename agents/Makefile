.PHONY: install test lint run

VENV := .venv
PY := $(VENV)/bin/python

install:
	uv venv $(VENV) --python 3.12
	uv pip install --python $(PY) -e ".[dev]"

test:
	$(PY) -m pytest -q

lint:
	$(VENV)/bin/ruff check manifestation tests

run:
	$(VENV)/bin/uvicorn manifestation.manifestation_router:app --reload --port 8080
