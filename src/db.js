const { Pool } = require('pg');
const { MongoClient } = require('mongodb');
const neo4j = require('neo4j-driver');
require('dotenv').config();

// PostgreSQL Client Setup
const pgPool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres_secure_pass',
  database: process.env.POSTGRES_DB || 'logistics_billing',
});

// MongoDB Client Setup
const mongoUri = process.env.MONGO_URI || 'mongodb://mongo_user:mongo_secure_pass@localhost:27017/logistics_documents?authSource=admin';
const mongoClient = new MongoClient(mongoUri);
let mongoDb = null;

// Neo4j Driver Setup
const neo4jUri = process.env.NEO4J_URI || 'bolt://localhost:7687';
const neo4jUser = process.env.NEO4J_USER || 'neo4j';
const neo4jPassword = process.env.NEO4J_PASSWORD || 'neo4j_secure_pass';
let neo4jDriver = null;

async function initDatabases() {
  console.log('Initializing database connections...');

  // 1. PostgreSQL Initialization
  try {
    const pgClient = await pgPool.connect();
    console.log('Connected to PostgreSQL successfully.');
    
    // Create invoices table
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        invoice_id VARCHAR(255) PRIMARY KEY,
        package_id VARCHAR(255) NOT NULL,
        customer_id VARCHAR(255) NOT NULL,
        amount NUMERIC(10, 2) NOT NULL,
        status VARCHAR(50) DEFAULT 'PAID',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('PostgreSQL invoices table verified.');
    pgClient.release();
  } catch (err) {
    console.error('Error connecting to PostgreSQL or creating schema:', err.message);
    throw err;
  }

  // 2. MongoDB Initialization
  try {
    await mongoClient.connect();
    console.log('Connected to MongoDB successfully.');
    mongoDb = mongoClient.db(process.env.MONGO_DB_NAME || 'logistics_documents');
    
    // Create packages collection if it doesn't exist, though Mongo does this dynamically.
    // Ensure index on package_id for performance.
    await mongoDb.collection('packages').createIndex({ package_id: 1 }, { unique: true });
    console.log('MongoDB collection indexes configured.');
  } catch (err) {
    console.error('Error connecting to MongoDB:', err.message);
    throw err;
  }

  // 3. Neo4j Initialization
  try {
    neo4jDriver = neo4j.driver(neo4jUri, neo4j.auth.basic(neo4jUser, neo4jPassword), {
      encryption: 'ENCRYPTION_OFF',
      disableLosslessIntegers: true
    });
    await neo4jDriver.verifyConnectivity();
    console.log('Connected to Neo4j successfully.');

    // Optional: create constraints/indices in Neo4j
    const session = neo4jDriver.session();
    try {
      // Set unique constraint on Driver.driverId and Zone.zoneId (supported in modern Neo4j syntax)
      await session.run(`
        CREATE CONSTRAINT UNIQUE_DRIVER_ID IF NOT EXISTS
        FOR (d:Driver) REQUIRE d.driverId IS UNIQUE
      `);
      await session.run(`
        CREATE CONSTRAINT UNIQUE_ZONE_ID IF NOT EXISTS
        FOR (z:Zone) REQUIRE z.zoneId IS UNIQUE
      `);
      console.log('Neo4j constraints verified.');
    } catch (e) {
      console.warn('Could not create Neo4j constraints (might already exist or not supported):', e.message);
    } finally {
      await session.close();
    }
  } catch (err) {
    console.error('Error connecting to Neo4j:', err.message);
    throw err;
  }
}

async function closeDatabases() {
  console.log('Closing database connections...');
  if (pgPool) {
    await pgPool.end();
  }
  if (mongoClient) {
    await mongoClient.close();
  }
  if (neo4jDriver) {
    await neo4jDriver.close();
  }
}

module.exports = {
  initDatabases,
  closeDatabases,
  getPgPool: () => pgPool,
  getMongoDb: () => mongoDb,
  getNeo4jDriver: () => neo4jDriver,
};
