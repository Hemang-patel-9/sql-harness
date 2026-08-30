.DEFAULT_GOAL := help

FRONTEND_DIR := frontend
BACKEND_DIR  := backend

ifeq ($(OS),Windows_NT)
VENV_PY := .venv/Scripts/python.exe
else
VENV_PY := .venv/bin/python
endif

.PHONY: help \
	install install-frontend install-backend \
	lint lint-frontend lint-backend \
	typecheck typecheck-frontend typecheck-backend \
	build build-frontend build-backend \
	check check-frontend check-backend

help:
	@echo "install     - install frontend (npm) + backend (pip) dependencies"
	@echo "lint        - eslint (frontend) + ruff (backend)"
	@echo "typecheck   - tsc --noEmit (frontend) + mypy (backend)"
	@echo "build       - next build (frontend) + compileall (backend)"
	@echo "check       - lint + typecheck + build, both sides"
	@echo "Append -frontend or -backend to any target to run one side only."

install: install-frontend install-backend

install-frontend:
	cd $(FRONTEND_DIR) && npm install

install-backend:
	@if [ ! -f "$(BACKEND_DIR)/$(VENV_PY)" ]; then python -m venv $(BACKEND_DIR)/.venv; fi
	cd $(BACKEND_DIR) && $(VENV_PY) -m pip install -r requirements-dev.txt

lint: lint-frontend lint-backend

lint-frontend:
	cd $(FRONTEND_DIR) && npm run lint

lint-backend:
	cd $(BACKEND_DIR) && $(VENV_PY) -m ruff check app

typecheck: typecheck-frontend typecheck-backend

typecheck-frontend:
	cd $(FRONTEND_DIR) && npx tsc --noEmit

typecheck-backend:
	cd $(BACKEND_DIR) && $(VENV_PY) -m mypy app

build: build-frontend build-backend

build-frontend:
	cd $(FRONTEND_DIR) && npm run build

build-backend:
	cd $(BACKEND_DIR) && $(VENV_PY) -m compileall -q app

check: check-frontend check-backend

check-frontend: lint-frontend typecheck-frontend build-frontend

check-backend: lint-backend typecheck-backend build-backend
