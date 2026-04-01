const fetch = require('node-fetch'); // Netlify includes this by default

exports.handler = async () => {
  const API_KEY = process.env.EXCHANGE_RATE_API_KEY;
  const API_URL = `https://v6.exchangerate-api.com/v6/${API_KEY}/pair/GBP/EUR`;

  try {
    const response = await fetch(API_URL);
    const data = await response.json();

    return {
      statusCode: 200,
      body: JSON.stringify({ conversion_rate: data.conversion_rate }),
    };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to fetch rate' }) };
  }
};
