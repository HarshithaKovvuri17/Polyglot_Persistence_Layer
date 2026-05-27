# ADR-001: Data Store Selection for the Logistics Platform

* **Status:** Accepted
* **Date:** 2026-05-26

---

### Context
A real-time logistics platform has diverse data storage and querying requirements. Specifically, it must support:
1. High-frequency **driver location updates** and queries to determine spatial operational zones.
2. Complete and flexible **package tracking histories** showing changing statuses over time.
3. Strict transactional integrity and ACID compliance for **financial invoicing/billing events**.

Using a single database technology (e.g., only relational or only NoSQL) to handle all these query patterns forces sub-optimal performance, overly complex queries, and scaling challenges. This project implements a polyglot persistence layer to route events to specialized databases tailored to their specific paradigms.

---

### Decision
We will deploy three distinct databases orchestrated in a unified container network:
1. **Neo4j (Graph Database)**: To model relationships between drivers and operational zones.
2. **MongoDB (Document Database)**: To store and append package status histories.
3. **PostgreSQL (Relational Database)**: To guarantee ACID transaction properties for invoicing.

---

### Consequences

#### Neo4j (Graph Store)
* **Pros:** 
  * Exceptionally efficient at querying relationships, such as finding which driver is in which zone, traversing network routes, or running path-finding algorithms.
  * Allows dynamic adjustments to the operational network nodes (e.g., depots, zones, routes) without rigid schemas.
* **Cons:** 
  * Heavy overhead for simple transactional rows or large tabular calculations.
  * Less popular for reporting/billing queries.

#### MongoDB (Document Store)
* **Pros:**
  * Schema flexibility allows storing nested tracking histories (`status_history` arrays) that can differ in details (some statuses have GPS coordinates, others contain driver details or notes).
  * Highly scalable for writes, making it suitable for high-frequency tracking updates.
* **Cons:**
  * Lacks strong cross-document transactional guarantees (ACID transactions are harder to model/scale compared to SQL).
  * Not suitable for complex analytical queries that join multiple disparate tables.

#### PostgreSQL (Relational Store)
* **Pros:**
  * Provides strong ACID compliance, ensuring that once a billing record is saved, it is durable, unique, and atomically consistent.
  * Facilitates advanced relational queries, joins, and reporting tools.
* **Cons:**
  * Rigid schema makes storing polymorphic historical tracking arrays difficult (often requiring complicated join tables).
  * Replicating and scaling writes globally is more complex compared to document stores.

#### Architecture Consequences (Polyglot Layer)
* **Pros:** Each sub-system uses the storage engine optimized for its task. The GET API exposes a single interface, abstracting the multi-database backend from the client.
* **Cons:** Increases system complexity, requires managing three separate database engines, and introduces the need for eventual consistency reconciliation (as implemented via the `retry_queue.json` Dead-Letter Queue).
