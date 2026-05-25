const fs = require('fs');
const path = require('path');
const { getPgPool, getMongoDb } = require('./db');
require('dotenv').config();

const RETRY_QUEUE_PATH = process.env.RETRY_QUEUE_PATH || path.join(__dirname, '../retry_queue.json');

async function runReconciliation() {
  if (!fs.existsSync(RETRY_QUEUE_PATH)) {
    return;
  }

  let queue = [];
  try {
    const fileContent = fs.readFileSync(RETRY_QUEUE_PATH, 'utf8').trim();
    if (!fileContent) {
      return;
    }
    queue = JSON.parse(fileContent);
    if (!Array.isArray(queue) || queue.length === 0) {
      return;
    }
  } catch (err) {
    console.error('[Reconciler] Failed to read or parse retry queue:', err.message);
    return;
  }

  console.log(`[Reconciler] Running billing reconciliation check for ${queue.length} queue item(s)...`);

  const mongoDb = getMongoDb();
  const pgPool = getPgPool();
  const remainingEvents = [];
  let processedCount = 0;

  for (const event of queue) {
    const { invoice_id, package_id, customer_id, amount } = event.payload;
    try {
      // 1. Query MongoDB to check if package is now DELIVERED
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
          console.log(`[Reconciler] Reconciled: invoice ${invoice_id} successfully inserted for package ${package_id}`);
          processedCount++;
        } catch (pgErr) {
          if (pgErr.code === '23505') {
            console.error(`[Reconciler] [Duplicate Key Error] Invoice ID ${invoice_id} already exists. Removing from queue.`);
            processedCount++; // Remove from queue since it already exists in the database
          } else {
            console.error(`[Reconciler] Database insert error during reconciliation for invoice ${invoice_id}:`, pgErr.message);
            remainingEvents.push(event); // Try again next run
          }
        }
      } else {
        // Package is not yet delivered, keep in queue
        remainingEvents.push(event);
      }
    } catch (err) {
      console.error(`[Reconciler] Error verifying status or inserting for invoice ${invoice_id}:`, err.message);
      remainingEvents.push(event);
    }
  }

  // Update retry_queue.json
  try {
    fs.writeFileSync(RETRY_QUEUE_PATH, JSON.stringify(remainingEvents, null, 2), 'utf8');
    if (processedCount > 0) {
      console.log(`[Reconciler] Reconciliation finished. Reconciled ${processedCount} invoice(s). ${remainingEvents.length} invoice(s) remain in retry queue.`);
    }
  } catch (err) {
    console.error('[Reconciler] Failed to save updated retry queue:', err.message);
  }
}

module.exports = {
  runReconciliation
};
