// REMOVE THIS LINE: const fetch = require('node-fetch'); 

exports.handler = async () => {
  const API_KEY = process.env.EXCHANGE_RATE_API_KEY;
  const API_URL = `https://exchangerate-api.com{API_KEY}/pair/GBP/EUR`;

  try {
    // Use the built-in global fetch (no import needed)
    const response = await fetch(API_URL);
    
    if (!response.ok) {
      throw new Error(`API responded with status: ${response.status}`);
    }

    const data = await response.json();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversion_rate: data.conversion_rate }),
    };
  } catch (error) {
    console.error("Fetch error:", error);
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: 'Failed to fetch rate', details: error.message }) 
    };
  }
};
