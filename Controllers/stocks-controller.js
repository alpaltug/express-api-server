const express = require('express');
const { Pool } = require('pg');
const AWS = require('aws-sdk');

const secretsManager = new AWS.SecretsManager({ region: 'us-east-2' });
const secretArn = 'arn:aws:secretsmanager:us-east-2:851725294551:secret:my-webapp/rds-credentials-TsndWS';

let pool;

async function getDbCredentials() {
    console.log("[DB_INIT] Attempting to fetch DB credentials from Secrets Manager...");
    try {
        const data = await secretsManager.getSecretValue({ SecretId: secretArn }).promise();
        if (data && data.SecretString) {
            const secret = JSON.parse(data.SecretString);
            if (!secret.username || !secret.host || !secret.password) {
                console.error("[DB_INIT_ERROR] DB credentials from Secrets Manager are incomplete.", secret);
                throw new Error('DB credentials from Secrets Manager are incomplete.');
            }
            const credentials = {
                user: secret.username,
                host: secret.host,
                database: secret.dbname || 'stockdata',
                password: secret.password,
                port: secret.port || 5432,
            };
            console.log("[DB_INIT] Successfully fetched and parsed DB credentials for host:", credentials.host, "user:", credentials.user, "db:", credentials.database);
            return credentials;
        } else {
            console.error("[DB_INIT_ERROR] SecretString not found in AWS Secrets Manager response.");
            throw new Error('SecretString not found in AWS Secrets Manager response.');
        }
    } catch (err) {
        console.error("[DB_INIT_ERROR] Error retrieving or parsing DB credentials:", err);
        throw err;
    }
}

async function initializePool() {
    console.log("[DB_INIT] Initializing database connection pool...");
    try {
        const dbCredentials = await getDbCredentials();
        
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
        console.error("[DB_INIT_ERROR] Critical error during database pool initialization or table setup:", error);
        process.exit(1);
    }
}

initializePool();

const put_stocks = async (req, res) => {
    console.log(`[PUT /api/stocks] Received request at ${new Date().toISOString()}`);
    console.log("[PUT /api/stocks] Request body:", JSON.stringify(req.body, null, 2)); // Log entire body for dev

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
    console.log("[PUT /api/stocks] Attempting to insert values:", values);

    let client;
    try {
        client = await pool.connect();
        console.log("[PUT /api/stocks] Database client acquired from pool.");
        const result = await client.query(insertQuery, values);
        console.log("[PUT /api/stocks] Successfully inserted data. Rows affected:", result.rowCount, "Data:", result.rows[0]);
        res.status(201).json({ message: "Stock data saved successfully to stock_analysis_results.", data: result.rows[0] });
    } catch (err) {
        console.error("[PUT /api/stocks] ERROR saving stock data to RDS:", err);
        res.status(500).json({ error: "Failed to save stock data.", details: err.message });
    } finally {
        if (client) {
            client.release();
            console.log("[PUT /api/stocks] Database client released.");
        }
    }
};

const get_stocks = async (req, res) => { // Made async to align with potential async operations
    console.log(`[GET /api/stocks] Received request at ${new Date().toISOString()}`);
    if (!pool) {
        console.error("[GET /api/stocks] ERROR: Database pool not initialized.");
        return res.status(500).json({ error: "Database connection not available." });
    }
    
    console.log("[GET /api/stocks] Attempting to fetch data from 'stock_analysis_results'...");
    let client;
    try {
        client = await pool.connect(); // It's good practice to use a client from the pool for each operation
        console.log("[GET /api/stocks] Database client acquired from pool.");
        const result = await client.query('SELECT * FROM stock_analysis_results LIMIT 100');
        console.log("[GET /api/stocks] Successfully fetched data. Row count:", result.rowCount);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error("[GET /api/stocks] ERROR fetching stocks:", error);
        res.status(500).json({ error: "Failed to retrieve stocks.", details: error.message });
    } finally {
        if (client) {
            client.release();
            console.log("[GET /api/stocks] Database client released.");
        }
    }
};

module.exports = { put_stocks, get_stocks };