
const express = require('express');

const app = express();

// setup the routers
const stock_router = require('./routes/stocks-route');

// to fetch the json inside the body using middleware
app.use(express.json())

// routes
app.use('/api/stocks', stock_router);

app.listen(8000, () => {
    console.log('api sever started listening on port 8000');
})