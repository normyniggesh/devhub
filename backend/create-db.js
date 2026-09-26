const { Client } = require('pg');

async function createDb() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@localhost:5432/postgres'
  });
  
  try {
    await client.connect();
    const res = await client.query("SELECT datname FROM pg_database WHERE datname = 'devhub'");
    if (res.rows.length === 0) {
      await client.query('CREATE DATABASE devhub');
      console.log("Database 'devhub' created successfully.");
    } else {
      console.log("Database 'devhub' already exists.");
    }
  } catch (err) {
    console.error("Failed to connect or create DB:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

createDb();
