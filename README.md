# TestHub

TestHub is a web-based test automation platform that lets you run browser tests (Python and Java) on Selenium Grid or Playwright, collect screenshots/videos/logs, and view results — including AI failure diagnosis and downloadable PDF reports — from a frontend dashboard.

## What this repo contains

- `backend/`: Go API for auth, suite execution, and result handling
- `runner/`: Python runner that executes uploaded tests and stores artifacts
- `diagnosis_service/`: Python (FastAPI) AI failure-diagnosis microservice
- `database-microservice/`: MongoDB + Mongo Express stack
- `Frontend/`: React/Vite UI
- `docker-compose.yml`: Full stack orchestration (backend + Selenium grid + runner + frontend + diagnosis)

---

## Quick Start (TL;DR)

The whole project runs in Docker — you do **not** need Go, Node, Python, or Java installed on your machine. Run these from the repository root in order:

```bash
# 1. Start the database first (also creates the shared network)
cd database-microservice && ./start-db.sh && cd ..

# 2. Ensure output folders exist & are writable (for video recording)
./prepare-dirs.sh

# 3. Build & start everything else
docker compose up -d --build

# 3. Open the dashboard
#    http://localhost:3456
```

On later runs (images already built):

```bash
cd database-microservice && ./start-db.sh && cd ..
./prepare-dirs.sh
docker compose up -d        # no --build needed
```

The detailed, explained version of each step is below.

---

## Prerequisites & Dependencies

**What you must install on your machine (host):**

| Dependency | Purpose | Check |
|------------|---------|-------|
| **Docker Engine** | Runs every service in a container | `docker --version` |
| **Docker Compose v2** | Orchestrates the stack (`docker compose ...`, not legacy `docker-compose`) | `docker compose version` |
| **Git** | Clone the repository | `git --version` |

That's all you need to install. **Every other dependency is bundled inside the Docker images** — no host install required:

- **Go 1.24** — backend API (`backend/Dockerfile`)
- **Node 20** — frontend build/serve (`Frontend/Dockerfile`)
- **Python 3.11 + Selenium / Playwright** — test runner (`runner/Dockerfile`)
- **Python 3.11 + FastAPI** — AI diagnosis service (`diagnosis_service/Dockerfile`)
- **Java (JDK) + Maven** — Java test compilation (inside the runner image)
- **Selenium Grid 4.21 + Chrome/Firefox nodes** — browser execution
- **MongoDB 7 + Mongo Express** — database (`database-microservice/`)

**Before you start:**

- Make sure Docker is running.
- A root **`.env`** file must exist (it holds Mongo credentials, `JWT_SECRET`, SMTP settings for emails, and AI API keys). The compose files read it automatically. Key variables:
  - `JWT_SECRET` — secret for signing auth tokens
  - `MONGO_URL` / `MONGO_USER` / `MONGO_PASSWORD` — database access
  - `SMTP_HOST` / `SMTP_PORT` / `SMTP_USERNAME` / `SMTP_PASSWORD` / `SMTP_FROM` — required for completion emails **and** password-reset emails
  - `FRONTEND_BASE_URL` — base URL used in email links (e.g. `http://localhost:3456`)
  - `GEMINI_API_KEY` / `GROQ_API_KEY` (or the `*_KEY_1` variants) — for AI diagnosis

> Run every command below from the **repository root** unless a step says otherwise.

---

## Running Procedure (step by step)

### 1) Start the Database Microservice

TestHub uses a dedicated MongoDB instance to store users, test runs, logs, and AI diagnosis results. **Start this first** — it also creates the shared `testops-db-network` that the backend and other services attach to.

```bash
cd database-microservice
./start-db.sh
cd ..
```

This starts:
- **MongoDB:** `mongodb://localhost:27017` (container `testops-mongo`)
- **Mongo Express:** [http://localhost:8081](http://localhost:8081)

*(Optional: verify the database is healthy by running `./check-db.sh` from the `database-microservice` directory.)*

### 2) Build & Start the TestHub Platform

The rest of the platform (Frontend, Backend API, AI Diagnosis Service, Test Runner, and Selenium Grid) is orchestrated via Docker Compose. Use `--build` the first time and whenever code changes:

```bash
# Ensure output directories exist and are writable (needed so the Selenium
# nodes can record videos). Idempotent — safe to run every time.
./prepare-dirs.sh

docker compose up -d --build
```

> **Why `prepare-dirs.sh`?** The Selenium node containers run as a non-root user and write test recordings into `runner/output/videos`. If that folder is missing or not writable, video capture silently fails. The script creates the output folders only if they don't already exist and makes them writable.

**Services started:**
- **Frontend Dashboard:** [http://localhost:3456](http://localhost:3456)
- **Backend API:** [http://localhost:8090](http://localhost:8090)
- **AI Diagnosis Service:** [http://localhost:8001](http://localhost:8001)
- **Selenium Grid Hub:** [http://localhost:4444](http://localhost:4444)
- **Mongo Express:** [http://localhost:8081](http://localhost:8081)

*Note: the `runner` service runs once and exits by design (`restart: "no"`); the backend launches runner containers on demand when tests are triggered from the frontend.*

### 3) Verify Everything Is Up

```bash
docker compose ps
```

All services except `runner` should show `Up`. Then open [http://localhost:3456](http://localhost:3456) and log in. If the login page shows **"Failed to connect to server"**, the backend isn't reachable yet — confirm `testops-backend-api` is `Up` (see Troubleshooting).

### 4) Scale Browsers (Optional)

For parallel testing, scale the Selenium nodes dynamically:

```bash
docker compose up -d --scale chrome-node=3 --scale firefox-node=3 chrome-node firefox-node
```

### 5) Stop Services

```bash
# Stop all core TestHub services
docker compose down

# Stop the database microservice
cd database-microservice
./stop-db.sh
cd ..
```

---

## Troubleshooting

- **`Conflict. The container name "/testops-backend-api" is already in use`** — a stale container from a previous run is holding the name. Remove it and bring the stack back up:

  ```bash
  docker rm -f testops-backend-api
  docker compose up -d
  ```

  To clear *all* stale containers at once: `docker compose down --remove-orphans` then `docker compose up -d`.

- **Login shows "Failed to connect to server"** — the frontend can't reach the backend. Use the Docker frontend (wired to `http://localhost:8090`) rather than a bare host `npm run dev` (which defaults to port `8080`). Check backend logs with `docker compose logs -f backend`.

- **Port 3456 already in use** — a leftover host dev server is holding it. Stop it (or run only the Docker frontend): `docker compose up -d frontend`.

- **Emails (completion report / password reset) not arriving** — set a valid `SMTP_PASSWORD` (and the other `SMTP_*` values) in the root `.env`, then `docker compose up -d --force-recreate backend`.

- **Inspect logs for any service:**

  ```bash
  docker compose logs -f backend          # or: frontend, diagnosis-service, selenium-hub
  ```

---

## Notes

- Artifacts are saved under `runner/output/` (`videos/`, `screenshots/`, `reports/`).
- Ensure Docker is running before executing any commands above.
- Database scripts prefer Docker Compose v2 (`docker compose`) to avoid known `docker-compose` v1 recreate issues.
- A GitHub Actions CI pipeline (`.github/workflows/ci.yml`) validates the frontend, backend, runner, AI diagnosis, database, Docker images, and compose files on every push/PR to `main`.
