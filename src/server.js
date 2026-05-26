const express = require('express');
const { initDatabases, closeDatabases, getPgPool, getMongoDb, getNeo4jDriver } = require('./db');
const { ingestLogFile } = require('./router');
const { runReconciliation } = require('./reconciler');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// API Endpoint: Get unified, chronologically-sorted history for a package
app.get('/query/package/:package_id', async (req, res) => {
  const { package_id } = req.params;
  if (!package_id) {
    return res.status(400).json({ error: 'package_id is required' });
  }

  console.log(`[API] Fetching unified history for package: ${package_id}`);

  try {
    const mongoDb = getMongoDb();
    const pgPool = getPgPool();
    const neo4jDriver = getNeo4jDriver();

    // Query 1: Document Store (MongoDB)
    const packagePromise = mongoDb.collection('packages').findOne({ package_id });

    // Query 2: Relational Store (PostgreSQL)
    const invoicesPromise = pgPool.query(
      `SELECT invoice_id, package_id, customer_id, amount, status, created_at 
       FROM invoices 
       WHERE package_id = $1`,
      [package_id]
    );

    // Wait for the Mongo and PG queries to complete
    const [packageDoc, invoicesResult] = await Promise.all([packagePromise, invoicesPromise]);

    const unifiedEvents = [];

    // Process MongoDB Package History
    if (packageDoc && packageDoc.status_history) {
      packageDoc.status_history.forEach(item => {
        unifiedEvents.push({
          source_system: 'document_store',
          timestamp: item.timestamp,
          event_details: {
            package_id,
            status: item.status,
            location: item.location,
            driver_id: item.driver_id
          }
        });
      });
    }

    // Process PostgreSQL Invoices
    if (invoicesResult && invoicesResult.rows) {
      invoicesResult.rows.forEach(row => {
        unifiedEvents.push({
          source_system: 'relational_store',
          timestamp: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
          event_details: {
            invoice_id: row.invoice_id,
            package_id: row.package_id,
            customer_id: row.customer_id,
            amount: parseFloat(row.amount),
            status: row.status
          }
        });
      });
    }

    // Query 3: Graph Store (Neo4j)
    // Find the driver associated with this package.
    // Try first with DELIVERED status, fallback to any status change containing driver_id.
    let driverId = null;
    if (packageDoc && packageDoc.status_history) {
      const deliveredEvent = packageDoc.status_history.find(h => h.status === 'DELIVERED' && h.driver_id);
      if (deliveredEvent) {
        driverId = deliveredEvent.driver_id;
      } else {
        const fallbackEvent = packageDoc.status_history.find(h => h.driver_id);
        if (fallbackEvent) {
          driverId = fallbackEvent.driver_id;
        }
      }
    }

    if (driverId) {
      const session = neo4jDriver.session();
      try {
        const result = await session.run(
          `MATCH (d:Driver {driverId: $driverId})-[r:LOCATED_IN]->(z:Zone)
           RETURN d.driverId as driverId, d.latitude as latitude, d.longitude as longitude, z.zoneId as zoneId, d.updatedAt as updatedAt`,
          { driverId }
        );

        if (result.records.length > 0) {
          const record = result.records[0];
          
          const latVal = record.get('latitude');
          const lonVal = record.get('longitude');
          const lat = latVal !== null && latVal !== undefined ? (typeof latVal === 'object' && latVal.toNumber ? latVal.toNumber() : latVal) : null;
          const lon = lonVal !== null && lonVal !== undefined ? (typeof lonVal === 'object' && lonVal.toNumber ? lonVal.toNumber() : lonVal) : null;

          unifiedEvents.push({
            source_system: 'graph_store',
            timestamp: record.get('updatedAt') || new Date().toISOString(),
            event_details: {
              driver_id: record.get('driverId'),
              location: {
                lat,
                lon
              },
              zone_id: record.get('zoneId')
            }
          });
        }
      } catch (graphErr) {
        console.error(`[API] Neo4j query failed for driver ${driverId}:`, graphErr.message);
      } finally {
        await session.close();
      }
    }

    // Sort the combined list by timestamp in ascending order
    unifiedEvents.sort((a, b) => {
      return new Date(a.timestamp) - new Date(b.timestamp);
    });

    res.json(unifiedEvents);
  } catch (err) {
    console.error('[API] Error handling unified package query:', err.message);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// Server Initialization
async function startServer() {
  try {
    // 1. Connect to all DBs and build schemas/indexes
    await initDatabases();

    // 2. Start the Express server
    const server = app.listen(PORT, () => {
      console.log(`[Server] Web service running on port ${PORT}`);
    });

    // 3. Trigger initial log file ingestion
    await ingestLogFile();

    // 4. Set up periodic reconciliation (e.g. eventual consistency retries)
    const intervalMs = parseInt(process.env.RECONCILER_INTERVAL_MS || '5000');
    const intervalId = setInterval(async () => {
      try {
        await runReconciliation();
      } catch (err) {
        console.error('[Scheduler] Error running background reconciler:', err.message);
      }
    }, intervalMs);

    // Graceful Shutdown
    const shutdown = async () => {
      console.log('Shutting down gracefully...');
      clearInterval(intervalId);
      server.close(async () => {
        await closeDatabases();
        process.exit(0);
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (err) {
    console.error('[Server] Critical failure during startup. Exiting...', err.message);
    process.exit(1);
  }
}

startServer();
