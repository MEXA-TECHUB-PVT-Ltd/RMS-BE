
const pool = require("./config/db");
const fs = require("fs");
const path = require("path");

// Adjust the path to wherever your db.js is located
async function initializeDatabase() {
  // installing extension for random genrated id
  try {
    pool.connect((err, client, release) => {
      if (err) {
        console.log("Could not connect to PostgreSQL server:", err);
      } else {
        console.log("Connected to Database Successfully");
        client.release();
      }
    });

    await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    const initSql = path.join(__dirname, "models", "init.sql");

    const sql = fs.readFileSync(initSql, "utf-8");

    await pool.query(sql);

    console.log("Tables Initialized Successfully.");
  } catch (error) {
    console.log("Error While Initializing Tables", error);
  }
}

module.exports = initializeDatabase;
