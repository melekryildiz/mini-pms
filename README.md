# Mini-PMS

Mini Power Monitoring System is a microservices-based application for monitoring electrical measurements, managing devices, calculating energy data, and generating alarms and reports.

## Tech Stack

- **Backend:** NestJS, TypeScript
- **Frontend:** Next.js
- **Monorepo:** Nx, pnpm
- **Database:** PostgreSQL, Neo4j
- **Messaging:** Kafka, RabbitMQ
- **Other:** Redis, Keycloak, jsreport
- **Infrastructure:** Docker Compose

## Setup

Install Node.js, pnpm and Docker Desktop before starting.

```bash
pnpm install
cp .env.example .env
docker compose up -d
docker compose ps
pnpm nx run-many -t build
```

Configure the passwords in `.env` before starting Docker.

## Local Services

| Service | Address |
|---|---|
| Kafka UI | http://localhost:8081 |
| RabbitMQ UI | http://localhost:15672 |
| Neo4j Browser | http://localhost:7474 |
| Keycloak Admin | http://localhost:8080/admin/ |
| jsreport Studio | http://localhost:5488 |

## Useful Commands

```bash
docker compose up -d       # Start services
docker compose ps          # Check status
docker compose logs -f     # View logs
docker compose down        # Stop and remove containers
```

## Troubleshooting

- **Unhealthy container:** Check `docker compose logs <service-name>`.
- **Port conflict:** Make sure the required port is available.
- **Configuration error:** Run `docker compose config --quiet`.

