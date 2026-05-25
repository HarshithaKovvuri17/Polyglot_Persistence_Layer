const fs = require('fs');
const path = require('path');
const { getPgPool, getMongoDb, getNeo4jDriver } = require('./db');
require('dotenv').config();

const RETRY_QUEUE_PATH = process.env.RETRY_QUEUE_PATH || path.join(__dirname, '../retry_queue.json');

// Graph Store Handler (DRIVER_LOCATION_UPDATE)
async function handleDriverLocationUpdate(event) {
  const { driver_id, location, zone_id } = event.payload;
  if (!driver_id || !zone_id) {
    console.error('Invalid DRIVER_LOCATION_UPDATE payload: missing driver_id or zone_id', event);
    return;
  }
  const lat = location ? location.lat : null;
  const lon = location ? location.lon : null;

  const driver = getNeo4jDriver();
  const session = driver.session();
  try {
    // We clean up any older LOCATED_IN relations for this driver and establish the new one,
    // ensuring the driver has exactly one latest zone relationship.
    await session.run(`
      MERGE (d:Driver {driverId: $driver_id})
      SET d.latitude = $lat, d.longitude = $lon, d.updatedAt = $timestamp
      MERGE (z:Zone {zoneId: $zone_id})
      WITH d, z
      OPTIONAL MATCH (d)-[r:LOCATED_IN]->(oldZ:Zone)
      WHERE oldZ <> z
      DELETE r
      WITH d, z
      MERGE (d)-[:LOCATED_IN]->(z)
    `, {
      driver_id,
      lat: lat !== null ? parseFloat(lat) : null,
      lon: lon !== null ? parseFloat(lon) : null,
      zone_id,
      timestamp: event.timestamp
    });
    console.log(`[Neo4j] Persisted location update for driver ${driver_id} in zone ${zone_id}`);
  } catch (err) {
    console.error('[Neo4j] Error storing driver location update:', err.message);
  } finally {
    await session.close();
  }
}

// Document Store Handler (PACKAGE_STATUS_CHANGE)
async function handlePackageStatusChange(event) {
  const { package_id, status, location, driver_id } = event.payload;
  if (!package_id || !status) {
    console.error('Invalid PACKAGE_STATUS_CHANGE payload: missing package_id or status', event);
    return;
  }

  const mongoDb = getMongoDb();
  try {
    const statusEntry = {
      status,
      timestamp: event.timestamp,
      location: location || null,
      driver_id: driver_id || null
    };

    // Upsert: Push new status to history array, create document if it doesn't exist
    await mongoDb.collection('packages').updateOne(
      { package_id },
      {
        $setOnInsert: { package_id },
        $addToSet: { status_history: statusEntry }
      },
      { upsert: true }
    );
    console.log(`[MongoDB] Persisted status '${status}' for package ${package_id}`);
  } catch (err) {
    console.error('[MongoDB] Error updating package status change:', err.message);
  }
}

// Helper to push a deferred event into the retry queue
async function queueForRetry(event) {
  try {
    let queue = [];
    if (fs.existsSync(RETRY_QUEUE_PATH)) {
      const content = fs.readFileSync(RETRY_QUEUE_PATH, 'utf8').trim();
      if (content) {
        try {
          queue = JSON.parse(content);
          if (!Array.isArray(queue)) {
            queue = [];
          }
        } catch (e) {
          console.warn('[RetryQueue] file was malformed, resetting queue to empty.');
          queue = [];
        }
      }
    }
    
    // Add the event
    queue.push(event);
    
    // Write back atomically
    fs.writeFileSync(RETRY_QUEUE_PATH, JSON.stringify(queue, null, 2), 'utf8');
    console.log(`[RetryQueue] Deferred billing event for package ${event.payload.package_id} (Invoice: ${event.payload.invoice_id})`);
  } catch (err) {
    console.error('[RetryQueue] Failed to write event to retry queue:', err.message);
  }
}

// Relational Store Handler (BILLING_EVENT)
async function handleBillingEvent(event) {
  const { invoice_id, package_id, customer_id, amount } = event.payload;
  if (!invoice_id || !package_id || !customer_id || amount === undefined) {
    console.error('Invalid BILLING_EVENT payload:', event);
    return;
  }

  const mongoDb = getMongoDb();
  const pgPool = getPgPool();

  try {
    // 1. Query MongoDB to check if package is DELIVERED
    const packageDoc = await mongoDb.collection('packages').findOne({ package_id });
    const isDelivered = packageDoc && packageDoc.status_history && 
                        packageDoc.status_history.some(h => h.status === 'DELIVERED');

    if (isDelivered) {
      // 2. Insert into PostgreSQL
      try {
        await pgPool.query(
          `INSERT INTO invoices (invoice_id, package_id, customer_id, amount, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [invoice_id, package_id, customer_id, parseFloat(amount), 'PAID', event.timestamp]
        );
        console.log(`[PostgreSQL] Successfully inserted invoice ${invoice_id} for package ${package_id}`);
      } catch (pgErr) {
        // Unique violation code in Postgres is 23505
        if (pgErr.code === '23505') {
          console.error(`[PostgreSQL] [Duplicate Key Error] Invoice ID ${invoice_id} already exists. Skipping insertion.`);
        } else {
          console.error('[PostgreSQL] Database insertion error:', pgErr.message);
        }
      }
    } else {
      // 3. Defer processing
      await queueForRetry(event);
    }
  } catch (err) {
    console.error('[BillingHandler] Error processing billing event:', err.message);
  }
}

module.exports = {
  handleDriverLocationUpdate,
  handlePackageStatusChange,
  handleBillingEvent
};
