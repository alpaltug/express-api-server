require('dotenv').config(); // Load environment variables from .env file

const express = require('express');
const { Pool } = require('pg');

let pool;

async function getDbCredentials() {
    console.log("[DB_INIT] Attempting to load DB credentials from environment variables...");
    const dbHost = process.env.DB_HOST;
    const dbUser = process.env.DB_USER;
    const dbPassword = process.env.DB_PASSWORD;
    const dbName = process.env.DB_NAME || 'stockdata'; // Default to stockdata if not in .env
    const dbPort = process.env.DB_PORT || 5432;     // Default to 5432 if not in .env

    if (!dbHost || !dbUser || !dbPassword || !dbName) {
        const errorMessage = "[DB_INIT_ERROR] Missing one or more required DB credentials in .env file (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME).";
        console.error(errorMessage);
        console.error("[DB_INIT_ERROR] Current values - DB_HOST:", dbHost, "DB_USER:", dbUser, "DB_NAME:", dbName, "DB_PORT:", dbPort);
        throw new Error(errorMessage);
    }

    const credentials = {
        host: dbHost,
        user: dbUser,
        password: dbPassword,
        database: dbName,
        port: parseInt(dbPort, 10), // Ensure port is an integer
    };
    console.log("[DB_INIT] Successfully loaded DB credentials. Host:", credentials.host, "User:", credentials.user, "DB:", credentials.database, "Port:", credentials.port);
    return credentials;
}

async function initializePool() {
    console.log("[DB_INIT] Initializing database connection pool...");
    try {
        const dbCredentials = await getDbCredentials(); // No longer needs to be async, but kept for consistency
        
        pool = new Pool(dbCredentials);
        console.log(`[DB_INIT] Connection pool created for database '${dbCredentials.database}'. Attempting to connect...`);

        const client = await pool.connect();
        console.log(`[DB_INIT] Successfully connected to database '${dbCredentials.database}' on host '${dbCredentials.host}'.`);
        try {
            await client.query('SELECT NOW()');
            console.log("[DB_INIT] Database connection test query successful.");

            const createTableQuery = `
                CREATE TABLE IF NOT EXISTS stock_analysis_results (
                    symbol VARCHAR(10) NOT NULL,
                    price NUMERIC NULL,
                    volume BIGINT NULL,
                    pe_ratio NUMERIC NULL,
                    dividend_yield NUMERIC NULL,
                    one_year_target NUMERIC NULL,
                    news_summaries_json TEXT NULL,
                    last_analysis_timestamp TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'::text)
                );
            `;
            console.log("[DB_INIT] Executing CREATE TABLE IF NOT EXISTS for 'stock_analysis_results'...");
            await client.query(createTableQuery);
            console.log("[DB_INIT] 'stock_analysis_results' table checked/created successfully.");

        } finally {
            client.release();
            console.log("[DB_INIT] Database client released.");
        }
        console.log("[DB_INIT] Database pool initialization and table setup complete.");
    } catch (error) {
        console.error("[DB_INIT_ERROR] Critical error during database pool initialization or table setup:", error.message);
        // Log the full error object if more details are needed, especially the original error if wrapped.
        // console.error(error); 
        process.exit(1);
    }
}

initializePool();

const put_stocks = async (req, res) => {
    console.log(`[PUT /api/stocks] Received request at ${new Date().toISOString()}`);
    // Sensitive data logging: For development, req.body can be logged.
    // In production, be cautious about logging sensitive PII or credentials.
    console.log("[PUT /api/stocks] Request body:", JSON.stringify(req.body, null, 2));

    const { 
        symbol, 
        price, 
        volume, 
        pe_ratio, 
        divident_yield,
        one_year_target, 
        news_summaries_json, 
        last_analysis_timestamp 
    } = req.body;

    if (!pool) {
        console.error("[PUT /api/stocks] ERROR: Database pool not initialized.");
        return res.status(500).json({ error: "Database connection not available. Please check server logs." });
    }

    if (!symbol) {
        console.warn("[PUT /api/stocks] Validation Error: Missing required field: symbol.");
        return res.status(400).json({ error: "Missing required field: symbol." });
    }
    
    const insertQuery = 
        'INSERT INTO stock_analysis_results ( ' +
        '    symbol, price, volume, pe_ratio, dividend_yield, ' +
        '    one_year_target, news_summaries_json, last_analysis_timestamp' +
        ') VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ' +
        'RETURNING *;';

    const values = [
        symbol, price, volume, pe_ratio, 
        divident_yield, // Mapped to dividend_yield column
        one_year_target, news_summaries_json, last_analysis_timestamp
    ];
    console.log("[PUT /api/stocks] Attempting to insert values:", JSON.stringify(values)); // Stringify for better array logging

    let client;
    try {
        client = await pool.connect();
        console.log("[PUT /api/stocks] Database client acquired from pool.");
        const result = await client.query(insertQuery, values);
        console.log("[PUT /api/stocks] Successfully inserted data. Rows affected:", result.rowCount, "Data:", JSON.stringify(result.rows[0]));
        res.status(201).json({ message: "Stock data saved successfully to stock_analysis_results.", data: result.rows[0] });
    } catch (err) {
        console.error("[PUT /api/stocks] ERROR saving stock data to RDS:", err.message);
        // console.error(err); // Uncomment for full error stack
        res.status(500).json({ error: "Failed to save stock data.", details: err.message });
    } finally {
        if (client) {
            client.release();
            console.log("[PUT /api/stocks] Database client released.");
        }
    }
};

const get_stocks = async (req, res) => {
    console.log(`[GET /api/stocks] Received request at ${new Date().toISOString()}`);
    if (!pool) {
        console.error("[GET /api/stocks] ERROR: Database pool not initialized.");
        return res.status(500).json({ error: "Database connection not available." });
    }
    
    console.log("[GET /api/stocks] Attempting to fetch data from 'stock_analysis_results'...");
    let client;
    try {
        client = await pool.connect();
        console.log("[GET /api/stocks] Database client acquired from pool.");
        const result = await client.query('SELECT * FROM stock_analysis_results LIMIT 100');
        console.log("[GET /api/stocks] Successfully fetched data. Row count:", result.rowCount);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error("[GET /api/stocks] ERROR fetching stocks:", error.message);
        // console.error(error); // Uncomment for full error stack
        res.status(500).json({ error: "Failed to retrieve stocks.", details: error.message });
    } finally {
        if (client) {
            client.release();
            console.log("[GET /api/stocks] Database client released.");
        }
    }
};

module.exports = { put_stocks, get_stocks };