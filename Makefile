SHELL := /bin/bash

.PHONY: dev backend frontend

backend:
	cd backend && PYTHONPATH=. uvicorn app.main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

dev:
	@set -euo pipefail; \
	backend_pid=""; \
	frontend_pid=""; \
	cleanup() { \
		status=$$?; \
		if [ -n "$$backend_pid" ] && kill -0 "$$backend_pid" 2>/dev/null; then \
			kill "$$backend_pid" 2>/dev/null || true; \
		fi; \
		if [ -n "$$frontend_pid" ] && kill -0 "$$frontend_pid" 2>/dev/null; then \
			kill "$$frontend_pid" 2>/dev/null || true; \
		fi; \
		wait "$$backend_pid" 2>/dev/null || true; \
		wait "$$frontend_pid" 2>/dev/null || true; \
		exit $$status; \
	}; \
	trap cleanup INT TERM EXIT; \
	( cd backend && PYTHONPATH=. uvicorn app.main:app --reload --port 8000 ) & \
	backend_pid=$$!; \
	( cd frontend && npm run dev ) & \
	frontend_pid=$$!; \
	while kill -0 "$$backend_pid" 2>/dev/null && kill -0 "$$frontend_pid" 2>/dev/null; do \
		sleep 1; \
	done; \
	wait "$$backend_pid"; \
	backend_status=$$?; \
	wait "$$frontend_pid"; \
	frontend_status=$$?; \
	if [ "$$backend_status" -ne 0 ]; then \
		exit "$$backend_status"; \
	fi; \
	exit "$$frontend_status"
