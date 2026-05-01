# TestHub

TestHub is a web-based test automation platform that lets you run browser tests (Python and Java) on Selenium Grid or Playwright, collect screenshots/videos/logs, and view results from a frontend dashboard.

## What this repo contains

- `backend/`: Go API for auth, suite execution, and result handling
- `runner/`: Python runner that executes uploaded tests and stores artifacts
- `database-microservice/`: MongoDB + Mongo Express stack
- `Frontend/`: React/Vite UI
- `docker-compose.yml`: Full stack orchestration (backend + grid + runner + frontend)

## Running Procedure

### 1) Start database microservice

```bash
cd database-microservice
./start-db.sh
```

Optional health check:

```bash
cd database-microservice
./check-db.sh
```

### 2) Start backend API

```bash
cd backend
./start-backend.sh
```

### 3) Start Selenium Grid (from repo root)

```bash
docker compose up -d selenium-hub
docker compose up -d --scale chrome-node=1 --scale firefox-node=1 chrome-node firefox-node
```

Scale up when needed:

```bash
docker compose up -d --scale chrome-node=3 --scale firefox-node=3 chrome-node firefox-node
```

### 4) Run tests from frontend (recommended)

Open the UI and trigger test execution from there.

### Optional: run tests manually with runner container (debug/admin use)

Single test on Chrome:

```bash
docker compose run --rm runner python src/runner.py --email user@test.com --username tester --file test_github.py --browser chrome
```

Run on both browsers in parallel:

```bash
docker compose run --rm runner python src/runner.py --email user@test.com --username tester --browsers chrome,firefox --parallel 2
```

### 5) Start frontend (local dev mode)

```bash
cd Frontend
npm install
npm run dev
```

### 6) Stop services

Stop backend:

```bash
cd backend
./stop-backend.sh
```

Stop Selenium Grid and other root-compose services:

```bash
docker compose down
```

Stop database microservice:

```bash
cd database-microservice
./stop-db.sh
```

## Notes

- Artifacts are saved under `runner/output/` (`videos/`, `screenshots/`, `reports/`).
- Ensure Docker is running before executing any commands above.
- Database scripts prefer Docker Compose v2 (`docker compose`) to avoid known `docker-compose` v1 recreate issues.

## Mutation Testing Assignment

This repository includes mutation testing setup for `runner/src/database_service.py` as part of the CS-4006 Software Testing assignment.

### How to reproduce the mutation run

1. Ensure you have the dependencies installed:
   ```bash
   cd runner
   pip install mutmut pytest pytest-cov mongomock
   ```

2. Run tests to see baseline coverage:
   ```bash
   cd runner
   pytest tests/test_database_service.py --cov=src/database_service --cov-report=html:reports/baseline_coverage
   ```

3. Run mutmut to generate and evaluate mutants:
   ```bash
   cd runner
   mutmut run
   ```

4. View the results:
   ```bash
   cd runner
   mutmut results
   ```

5. The HTML reports for the baseline and final mutation run are saved in `reports/mutation_baseline/` and `reports/mutation_final/`.
