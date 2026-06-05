# Developer commands for wavydance.ai.
# Run `make help` (or just `make`) to see what's available.

.DEFAULT_GOAL := help
SHELL := /bin/bash
.PHONY: help up down restart logs build shell db-shell redis-shell reset \
        test test-unit test-integration test-clean test-coverage \
        lint fmt vet web-dev web-build clean

# ----------------------------------------------------------------------------
# Help
# ----------------------------------------------------------------------------

help: ## Show this help
	@printf "\nwavydance.ai — make targets\n\n"
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@printf "\n"

# ----------------------------------------------------------------------------
# Local stack (app + Postgres + Redis)
# ----------------------------------------------------------------------------

up: ## Start the local stack (builds on first run)
	docker compose up -d --build
	@printf "\n→ Open http://localhost:%s (root / \$$INITIAL_ROOT_PASSWORD)\n\n" "$${APP_PORT:-3000}"

down: ## Stop the local stack
	docker compose down

restart: down up ## Restart the local stack

logs: ## Tail app logs
	docker compose logs -f app

build: ## Rebuild the app image without starting
	docker compose build app

shell: ## Open a shell inside the app container
	docker compose exec app sh

db-shell: ## Open psql against local Postgres
	docker compose exec db psql -U wavydance -d wavydance

redis-shell: ## Open redis-cli against local Redis
	docker compose exec redis redis-cli

reset: ## Tear down stack and DELETE volumes (destructive)
	docker compose down -v
	@printf "\nLocal data wiped. Next \`make up\` will start from a clean slate.\n\n"

# ----------------------------------------------------------------------------
# Tests
# ----------------------------------------------------------------------------

test: test-unit test-integration ## Run unit + integration tests

test-unit: ## Run Go unit tests with race detector and coverage
	go test -race -cover -coverprofile=coverage.txt -covermode=atomic ./...

test-integration: ## Run integration tests against a disposable Postgres + Redis
	@set -eo pipefail; \
	cleanup() { \
		echo "→ tearing down test stack"; \
		docker compose -f docker-compose.test.yml down -v --remove-orphans >/dev/null 2>&1 || true; \
	}; \
	trap cleanup EXIT INT TERM; \
	docker compose -f docker-compose.test.yml up -d --wait; \
	TEST_SQL_DSN="postgres://test:test@localhost:5433/test?sslmode=disable" \
	TEST_REDIS_CONN_STRING="redis://localhost:6380" \
		go test -tags=integration -race -count=1 ./...

test-clean: ## Force-stop the test stack and delete its volumes (use if a previous run left containers behind)
	@docker compose -f docker-compose.test.yml down -v --remove-orphans 2>/dev/null || true
	@echo "test stack cleaned"

test-coverage: test-unit ## Open the HTML coverage report
	go tool cover -html=coverage.txt

# ----------------------------------------------------------------------------
# Lint / format
# ----------------------------------------------------------------------------

lint: vet ## Run all linters
	@unformatted=$$(gofmt -l . | grep -v '^web/'); \
	if [ -n "$$unformatted" ]; then \
		echo "gofmt: the following files need formatting:"; \
		echo "$$unformatted"; \
		exit 1; \
	fi

vet: ## Run go vet
	go vet ./...

fmt: ## Format Go source
	gofmt -w .

# ----------------------------------------------------------------------------
# Frontend (Vite + bun)
# ----------------------------------------------------------------------------

web-dev: ## Run the frontend with hot reload (separate from the Go binary)
	cd web/wavy && bun install && bun dev

web-build: ## Build the frontend into web/build/wavy/
	cd web && ./build.sh

# ----------------------------------------------------------------------------
# Cleanup
# ----------------------------------------------------------------------------

clean: ## Remove build artifacts (does not touch volumes)
	rm -f one-api wavydanceai coverage.txt
	rm -rf web/build web/wavy/dist
