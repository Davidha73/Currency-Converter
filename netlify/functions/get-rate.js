exports.handler = async (event) => {
  const API_KEY = process.env.EXCHANGE_RATE_API_KEY;
  
  // Get currencies from query parameters, defaulting to GBP/EUR
  const from = event.queryStringParameters.from || 'GBP';
  const to = event.queryStringParameters.to || 'EUR';

  const API_URL = `https://v6.exchangerate-api.com/v6/${API_KEY}/pair/${from}/${to}`;

  try {
    // Use the built-in global fetch
    const response = await fetch(API_URL);
    
    if (!response.ok) {
      // Log the status to help debug if the key is invalid
      console.error(`API Error: ${response.status}`);
      throw new Error(`API responded with status: ${response.status}`);
    }

    const data = await response.json();

    // ExchangeRate-API returns 'conversion_rate' for pair requests
    return {
      statusCode: 200,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*" // Useful if calling from a browser
      },
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
