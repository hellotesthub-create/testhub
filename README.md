# TestHub

TestHub is a web-based test automation platform that lets you run browser tests (Python and Java) on Selenium Grid or Playwright, collect screenshots/videos/logs, and view results from a frontend dashboard.

## What this repo contains

- `backend/`: Go API for auth, suite execution, and result handling
- `runner/`: Python runner that executes uploaded tests and stores artifacts
- `database-microservice/`: MongoDB + Mongo Express stack
- `Frontend/`: React/Vite UI
- `docker-compose.yml`: Full stack orchestration (backend + grid + runner + frontend)

## Running Procedure

### 1) Start the Database Microservice

TestHub uses a dedicated MongoDB instance to store test runs, logs, and AI diagnosis results.

```bash
cd database-microservice
./start-db.sh
cd ..
```

*(Optional: You can verify the database is healthy by running `./check-db.sh` from the `database-microservice` directory).*

### 2) Start the TestHub Platform

The entire TestHub platform (Frontend, Backend API, AI Diagnosis Service, Test Runner, and Selenium Grid) is orchestrated via Docker Compose.

```bash
docker compose up -d --build
```

**Services Started:**
- **Frontend Dashboard:** [http://localhost:3456](http://localhost:3456)
- **Backend API:** [http://localhost:8090](http://localhost:8090)
- **AI Diagnosis Service:** [http://localhost:8001](http://localhost:8001)
- **Selenium Grid Hub:** [http://localhost:4444](http://localhost:4444)

*Note: The `runner` service will start automatically as a background daemon to listen for tests triggered from the frontend.*

### 3) Scale Browsers (Optional)

If you want to run massive parallel testing, you can scale the Selenium nodes dynamically:

```bash
docker compose up -d --scale chrome-node=3 --scale firefox-node=3 chrome-node firefox-node
```

### 4) Stop Services

To safely shut down the entire platform:

```bash
# Stop all core TestHub services
docker compose down

# Stop the database microservice
cd database-microservice
./stop-db.sh
cd ..
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

5. The HTML reports for the baseline and final mutation run are saved in `runner/reports/mutation_baseline/` and `runner/reports/mutation_final/`.
