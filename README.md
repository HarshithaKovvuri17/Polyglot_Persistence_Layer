# 🚚 Polyglot Persistence Layer for Logistics Event Processing

![Node.js](https://img.shields.io/badge/Node.js-Backend-green?style=for-the-badge\&logo=node.js)
![Express.js](https://img.shields.io/badge/Express.js-Framework-black?style=for-the-badge\&logo=express)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-blue?style=for-the-badge\&logo=postgresql)
![MongoDB](https://img.shields.io/badge/MongoDB-Database-green?style=for-the-badge\&logo=mongodb)
![Neo4j](https://img.shields.io/badge/Neo4j-GraphDB-blue?style=for-the-badge\&logo=neo4j)
![Docker](https://img.shields.io/badge/Docker-Containerized-blue?style=for-the-badge\&logo=docker)

---

# 📌 Overview

The **Polyglot Persistence Layer** is a distributed logistics event processing system designed to demonstrate how multiple databases can work together efficiently in a single backend application.

This project implements **Polyglot Persistence Architecture**, where different databases are used for different types of workloads based on their strengths.

The system processes logistics events from an event log file and routes them to:

* 🐘 PostgreSQL for billing data
* 🍃 MongoDB for package tracking
* 🔗 Neo4j for graph-based driver relationships

The application also exposes a unified API to retrieve complete package history from multiple databases.

---

# ✨ Features

* 📦 Event-driven logistics processing
* 🧠 Polyglot persistence architecture
* 🔄 Automatic event routing
* 🌐 Unified package history API
* 🔁 Retry queue & reconciliation mechanism
* 🐳 Dockerized deployment
* ⚡ Multi-database integration
* 📂 Log-based event ingestion
* 🛠️ Eventual consistency implementation

---

# 🏗️ System Architecture

```text id="2xb6rf"
                          ┌──────────────────────────┐
                          │        events.log        │
                          └─────────────┬────────────┘
                                        │ (Reads line-by-line)
                                        ▼
                            ┌──────────────────────┐
                            │     Event Router     │
                            └────┬───┬───────────┬─┘
     DRIVER_LOCATION_UPDATE      │   │           │      BILLING_EVENT
  ┌──────────────────────────────┘   │           └─────────────────────────────┐
  │                                  │ PACKAGE_STATUS_CHANGE                   │
  ▼                                  ▼                                         ▼
┌──────────────┐             ┌──────────────┐                          ┌──────────────┐
│  Neo4j Graph │             │ MongoDB Doc  │                          │ Postgres SQL │
│ (Driver/Zone)│             │  (Packages)  │                          │  (Invoices)  │
└──────────────┘             └──────┬───────┘                          └──────▲───────┘
                                    │                                         │
                                    │ (Checks status history)                 │
                                    ▼                                         │ (If delivered)
                            ┌────────────────────────┐                        │
                            │  Is status DELIVERED?  ├─No──► [retry_queue.json]
                            └───────────┬────────────┘           (Reconciler)
                                        │                               ▲
                                        └──────────────Yes──────────────┘
```

---

# 🧰 Tech Stack

| Technology     | Purpose                    |
| -------------- | -------------------------- |
| Node.js        | Backend Runtime            |
| Express.js     | REST API Framework         |
| PostgreSQL     | Relational Billing Storage |
| MongoDB        | Package Tracking Storage   |
| Neo4j          | Driver Relationship Graph  |
| Docker         | Containerization           |
| Docker Compose | Multi-container Management |
| dotenv         | Environment Variables      |

---

# 📂 Project Structure

```
Polyglot_Perisistence_Layer/
│
├── docs/
│   ├──ADR-001-Data-Store-Selection.md
├── src/
│   ├── db.js
│   ├── handlers.js
│   ├── reconciler.js
│   ├── router.js
│   └── server.js
│
├── docker-compose.yml
├── Dockerfile
├── events.log
├── retry_queue.json
├── package.json
├── package-lock.json
└── README.md
```

---

# 📥 Event Processing

The application reads logistics events from:

```bash id="aot0nq"
events.log
```

Events are automatically routed to the appropriate database based on event type.

---

# 🌐 API Endpoint

## Get Unified Package History

```http id="uv84lk"
GET /query/package/:package_id
```

### Example

```bash id="3whkqn"
curl http://localhost:3000/query/package/pkg-demo-001
```

---

# 🧪 Testing

## Start Containers

```bash id="v75nwy"
docker compose up -d
```

## Run Backend

```bash id="zw4fry"
npm start
```

## Test API

```bash id="0e6axl"
curl http://localhost:3000/query/package/pkg-demo-001
```

---

# 🔥 Concepts Implemented

* ✅ Polyglot Persistence
* ✅ Event Driven Architecture
* ✅ Multi-Database Integration
* ✅ Distributed Data Management
* ✅ Eventual Consistency
* ✅ Retry Queue Mechanism
* ✅ Unified Query Layer
* ✅ Dockerized Backend Deployment

---

# 🚀 Future Enhancements

* Kafka Integration
* Real-time Event Streaming
* Authentication & Authorization
* Kubernetes Deployment
* Monitoring Dashboard
* Redis Caching
* CI/CD Pipeline
* WebSocket Live Tracking

---

# 👨‍💻 Author

## Kovvuri Harshitha
- Email: harshitahanisha@gmail.com

---
