# Testing Guide for Polyglot Persistence Layer

## Prerequisites

- Docker Desktop running, WSL2 with Ubuntu distribution.
- `docker compose` and `docker` available inside WSL.

## 1. Start the stack

```bash
wsl -d Ubuntu -u root -- bash -c "cd /mnt/d/GPP/Polyglot_Perisistence_Layer && docker compose up -d"
```

## 2. Verify services are healthy

```bash
wsl -d Ubuntu -u root -- bash -c "docker compose ps"
```

Check logs:

```bash
wsl -d Ubuntu -u root -- bash -c "cd /mnt/d/GPP/Polyglot_Perisistence_Layer && docker compose logs -f app"
```

## 3. Insert a test event and restart the app

The application processes `events.log` on startup. Append a valid test event and restart the app container to ingest it:

```bash
wsl -d Ubuntu -u root -- bash -c @"
echo '{\"timestamp\": \"2026-05-28T10:00:00Z\", \"type\": \"PACKAGE_STATUS_CHANGE\", \"payload\": {\"package_id\": \"pkg-demo-001\", \"status\": \"PICKED_UP\", \"location\": {\"lat\": 34.05, \"lon\": -118.25}, \"driver_id\": \"drv-demo-999\"}}' >> /mnt/d/GPP/Polyglot_Perisistence_Layer/events.log
"@

wsl -d Ubuntu -u root -- bash -c "cd /mnt/d/GPP/Polyglot_Perisistence_Layer && docker compose restart app"
```

Wait a few seconds, then check the logs. You should see `[MongoDB] Persisted status 'PICKED_UP' for package pkg-demo-001`.

## 4. Confirm data in each DB

### PostgreSQL

```bash
wsl -d Ubuntu -u root -- docker exec -i logistics_postgres psql -U postgres -d logistics_billing -c "SELECT * FROM invoices LIMIT 5;"
```

### MongoDB – packages collection

```bash
wsl -d Ubuntu -u root -- docker exec -i logistics_mongo mongosh logistics_documents --username mongo_user --password mongo_secure_pass --authenticationDatabase admin --eval '"db.packages.find().pretty()"'
```

### Neo4j – driver/location labels

```bash
wsl -d Ubuntu -u root -- docker exec -i logistics_neo4j cypher-shell -u neo4j -p MyStrongPass123 '"CALL db.labels()"'
```

## 5. Retrieve a real `<package_id>` for API testing

```bash
wsl -d Ubuntu -u root -- docker exec -i logistics_mongo mongosh logistics_documents --username mongo_user --password mongo_secure_pass --authenticationDatabase admin --eval '"db.packages.find({}, {_id:0, package_id:1}).limit(5).pretty()"'
```

Copy one of the `package_id` values (e.g., `pkg-demo-001`).

## 6. Test the unified query API

Replace `<package_id>` with the value you copied.

```bash
curl.exe -s http://localhost:3000/query/package/pkg-demo-001
```

*(If you prefer PowerShell’s native cmdlet:)*

```powershell
Invoke-WebRequest -Uri "http://localhost:3000/query/package/pkg-demo-001" | Select-Object -ExpandProperty Content
```

You should receive a JSON payload aggregating data from PostgreSQL, MongoDB, and Neo4j.

## 7. Tear down the stack

```bash
wsl -d Ubuntu -u root -- bash -c "cd /mnt/d/GPP/Polyglot_Perisistence_Layer && docker compose down --volumes"
```

---
