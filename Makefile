.PHONY: build up down logs dev integration-dev production-up validate clean

build:
	docker compose build

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f --tail=200 frontend

dev:
	docker compose -f docker-compose.dev.yml up --build

integration-dev:
	docker compose --env-file .env.integration.example -f docker-compose.dev.yml up --build

production-up:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.production up -d --build

validate:
	docker run --rm -v "$$(pwd):/app" -w /app node:20-alpine sh -lc "npm ci && npm run typecheck && npm run build"

clean:
	rm -rf node_modules dist
