const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { handleDriverLocationUpdate, handlePackageStatusChange, handleBillingEvent } = require('./handlers');
const { runReconciliation } = require('./reconciler');
require('dotenv').config();

const LOG_FILE_PATH = process.env.LOG_FILE_PATH || path.join(__dirname, '../events.log');

async function ingestLogFile() {
  console.log(`[Router] Starting event log ingestion from: ${LOG_FILE_PATH}`);

  if (!fs.existsSync(LOG_FILE_PATH)) {
    console.warn(`[Router] Log file not found at ${LOG_FILE_PATH}. Skipping initial ingestion.`);
    // Run reconciler anyway in case there are pending retries in queue
    try {
      await runReconciliation();
    } catch (err) {
      console.error('[Router] Error running reconciler:', err.message);
    }
    return;
  }

  const fileStream = fs.createReadStream(LOG_FILE_PATH);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let lineCount = 0;
  let successCount = 0;
  let failCount = 0;

  for await (const line of rl) {
    lineCount++;
    // Strip null characters (\0) which can occur when files are written in UTF-16 encoding
    const trimmedLine = line.replace(/\0/g, '').trim();
    if (!trimmedLine) continue;

    try {
      const event = JSON.parse(trimmedLine);
      if (!event.type || !event.payload) {
        throw new Error('Event is missing required fields (type or payload)');
      }

      switch (event.type) {
        case 'DRIVER_LOCATION_UPDATE':
          await handleDriverLocationUpdate(event);
          break;
        case 'PACKAGE_STATUS_CHANGE':
          await handlePackageStatusChange(event);
          break;
        case 'BILLING_EVENT':
          await handleBillingEvent(event);
          break;
        default:
          console.warn(`[Router] Line ${lineCount}: Unknown event type '${event.type}'`);
      }
      successCount++;
    } catch (err) {
      failCount++;
      console.error(`[Router] Line ${lineCount}: Failed to process event line. Error: ${err.message}. Line content: "${trimmedLine}"`);
    }
  }

  console.log(`[Router] Event log ingestion complete. Total lines read: ${lineCount}, Success: ${successCount}, Failures: ${failCount}`);
  
  // Run eventual consistency check after ingestion
  try {
    await runReconciliation();
  } catch (err) {
    console.error('[Router] Error running reconciler post-ingestion:', err.message);
  }
}

module.exports = {
  ingestLogFile
};
