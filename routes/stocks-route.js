
const express = require('express');
const router = express.Router();

// fetch the Controller logic
const { get_stocks, put_stocks } = require('../Controllers/stocks-controller');

// '/' subroute routing
router.route('/').get(get_stocks).put(put_stocks);

module.exports = router;