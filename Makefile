.PHONY: build up down logs dev validate clean

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

validate:
	docker run --rm -v "$$(pwd):/app" -w /app node:20-alpine sh -lc "npm ci && npm run typecheck && npm run build"

clean:
	rm -rf node_modules dist
