.PHONY: dev stop migrate makemigrations test logs shell

dev:
	docker-compose up -d

stop:
	docker-compose down

migrate:
	docker-compose exec api alembic upgrade head

makemigrations:
ifndef msg
	$(error "msg is required. Usage: make makemigrations msg=\"description\"")
endif
	docker-compose exec api alembic revision --autogenerate -m "$(msg)"

test:
	docker-compose exec api pytest -v

logs:
	docker-compose logs -f api

shell:
	docker-compose exec api bash

lint:
	docker-compose exec api ruff check .
	docker-compose exec api black --check .

format:
	docker-compose exec api ruff check --fix .
	docker-compose exec api black .

restart:
	docker-compose restart api

clean:
	docker-compose down -v
	rm -rf __pycache__ .pytest_cache

init: migrate