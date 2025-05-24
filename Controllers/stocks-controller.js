require('dotenv').config(); // Load environment variables from .env file
const fs = require('fs'); // Import the fs module

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

// Initialize DynamoDB client
const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = 'stock_analysis_results';

const put_stocks = async (req, res) => {
    console.log(`[PUT /api/stocks] Received request at ${new Date().toISOString()}`);
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

    if (!symbol) {
        console.warn("[PUT /api/stocks] Validation Error: Missing required field: symbol.");
        return res.status(400).json({ error: "Missing required field: symbol." });
    }

    // Generate timestamp if not provided
    const timestamp = last_analysis_timestamp || new Date().toISOString();

    const item = {
        symbol,
        timestamp, // This will be the sort key
        price: price ? Number(price) : null,
        volume: volume ? Number(volume) : null,
        pe_ratio: pe_ratio ? Number(pe_ratio) : null,
        dividend_yield: divident_yield ? Number(divident_yield) : null,
        one_year_target: one_year_target ? Number(one_year_target) : null,
        news_summaries_json
    };

    try {
        const command = new PutCommand({
            TableName: TABLE_NAME,
            Item: item
        });

        await docClient.send(command);
        console.log("[PUT /api/stocks] Successfully inserted data:", JSON.stringify(item));
        res.status(201).json({ 
            message: "Stock data saved successfully to stock_analysis_results.", 
            data: item 
        });
    } catch (err) {
        console.error("[PUT /api/stocks] ERROR saving stock data to DynamoDB:", err.message);
        res.status(500).json({ error: "Failed to save stock data.", details: err.message });
    }
};

const get_stocks = async (req, res) => {
    console.log(`[GET /api/stocks] Received request at ${new Date().toISOString()}`);
    
    try {
        const command = new ScanCommand({
            TableName: TABLE_NAME,
            Limit: 100
        });

        const result = await docClient.send(command);
        // Sort items by timestamp in descending order (newest first)
        const sortedItems = result.Items.sort((a, b) => 
            new Date(b.timestamp) - new Date(a.timestamp)
        );
        console.log("[GET /api/stocks] Successfully fetched data. Item count:", sortedItems.length);
        res.status(200).json(sortedItems);
    } catch (error) {
        console.error("[GET /api/stocks] ERROR fetching stocks:", error.message);
        res.status(500).json({ error: "Failed to retrieve stocks.", details: error.message });
    }
};

module.exports = { put_stocks, get_stocks };