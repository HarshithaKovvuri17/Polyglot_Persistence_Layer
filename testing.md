# 🧪 Testing Guide for Polyglot Persistence Layer

Follow these simple steps to start, test, and verify the logistics platform.

---

## 1. Start the Stack
Build and spin up the databases and application:
```powershell
docker compose up -d --build
```

---

## 2. Verify Ingested Data in the Databases
Check each database to confirm that the initial events in `events.log` were successfully ingested and routed:

### A. PostgreSQL (Billing / Relational Store)
```powershell
docker exec -i logistics_postgres psql -U postgres -d logistics_billing -c "SELECT * FROM invoices;"
```

### B. MongoDB (Tracking History / Document Store)
```powershell
docker exec -i logistics_mongo mongosh logistics_documents --username mongo_user --password mongo_secure_pass --authenticationDatabase admin --eval "db.packages.find().pretty()"
```

### C. Neo4j (Driver Relationships / Graph Store)
```powershell
docker exec -i logistics_neo4j cypher-shell -u neo4j -p MyStrongPass123 "MATCH (n) RETURN labels(n), count(n);"
```

---

## 3. Test the Unified Query API
Call the unified API to retrieve the aggregated tracking history for the package from all three databases:
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/query/package/pkg-abc-123" | ConvertTo-Json -Depth 5
```

---

## 4. Tear Down
Stop the services and clear the database volumes when finished:
```powershell
docker compose down --volumes
```
