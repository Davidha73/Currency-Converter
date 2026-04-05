// Get references to HTML elements
const amountInput = document.getElementById("amount");
const fromCurrencySelect = document.getElementById("fromCurrency");
const toCurrencySelect = document.getElementById("toCurrency");
const convertButton = document.getElementById("convertBtn");
const resultDisplay = document.getElementById("result");
const messageBox = document.getElementById("messageBox");
const messageText = document.getElementById("messageText");
const loadingIndicator = document.getElementById("loadingIndicator");
const currentRateValueSpan = document.getElementById("currentRateValue");

// Global variable for the exchange rate
let currentExchangeRate = 1.0; // Dynamic rate holder

/**
 * Displays a message in the message box.
 * @param {string} message - The message to display.
 * @param {string} type - The type of message ('error', 'success', 'info').
 */
function showMessage(message, type = "info") {
  messageText.textContent = message;
  messageBox.classList.remove("hidden");
  // Reset classes
  messageBox.classList.remove(
    "bg-red-100", "border-red-400", "text-red-700",
    "bg-green-100", "border-green-400", "text-green-700",
    "bg-blue-100", "border-blue-400", "text-blue-700"
  );

  if (type === "error") {
    messageBox.classList.add("bg-red-100", "border-red-400", "text-red-700");
  } else if (type === "success") {
    messageBox.classList.add("bg-green-100", "border-green-400", "text-green-700");
  } else {
    messageBox.classList.add("bg-blue-100", "border-blue-400", "text-blue-700");
  }
}

/**
 * Fetches the live exchange rate from the API.
 */
async function fetchExchangeRate() {
  const from = fromCurrencySelect.value;
  const to = toCurrencySelect.value;
  const cacheKey = `rate_${from}_${to}`;
  const timeKey = `time_${from}_${to}`;
  
  const lastFetchTime = localStorage.getItem(timeKey);
  const cachedRate = localStorage.getItem(cacheKey);
  const now = new Date().getTime();

  // Check if we have a valid cache (less than 12 hours old)
  if (lastFetchTime && cachedRate && (now - lastFetchTime < 12 * 60 * 60 * 1000)) {
    currentExchangeRate = parseFloat(cachedRate);
    document.querySelector('#liveRateDisplay').innerHTML = `Current Rate: 1 ${from} = <span id="currentRateValue" class="font-semibold">${currentExchangeRate.toFixed(4)}</span> ${to}`;
    showMessage(`Using cached rate. Last updated less than 12 hours ago.`, "info");
    convertCurrency();
    return;
  }

  loadingIndicator.classList.remove("hidden");
  messageBox.classList.add("hidden");

  try {
    const response = await fetch(`/.netlify/functions/get-rate?from=${from}&to=${to}`);
    if (!response.ok) {
      throw new Error(`Server Error: ${response.status}`);
    }
    const data = await response.json();
    if (data.conversion_rate) {
      currentExchangeRate = data.conversion_rate;
      localStorage.setItem(cacheKey, currentExchangeRate);
      localStorage.setItem(timeKey, now);
      
      document.querySelector('#liveRateDisplay').innerHTML = `Current Rate: 1 ${from} = <span id="currentRateValue" class="font-semibold">${currentExchangeRate.toFixed(4)}</span> ${to}`;
      showMessage(`Live rate updated: 1 ${from} = ${currentExchangeRate.toFixed(4)} ${to}`, "success");
    } else {
      throw new Error("Invalid response from rate service.");
    }
  } catch (error) {
    console.error("Error fetching exchange rate:", error);
    document.getElementById("currentRateValue").textContent = "N/A";
    showMessage(`Could not fetch live rates. Error: ${error.message}`, "error");
  } finally {
    loadingIndicator.classList.add("hidden");
    convertCurrency();
  }
}

/**
 * Performs the currency conversion.
 */
function convertCurrency() {
  const amount = parseFloat(amountInput.value);
  const fromCurrency = fromCurrencySelect.value;
  const toCurrency = toCurrencySelect.value;

  // Validate input amount
  if (isNaN(amount) || amount <= 0) {
    showMessage("Please enter a valid positive amount.", "error");
    resultDisplay.textContent = "0.00 " + toCurrency;
    return;
  }

  let convertedAmount;
  if (fromCurrency === toCurrency) {
    convertedAmount = amount;
    if (messageBox.classList.contains("hidden")) {
      showMessage(`Converting from ${fromCurrency} to ${toCurrency} results in the same amount.`, "info");
    }
  } else {
    convertedAmount = amount * currentExchangeRate;
  }

  resultDisplay.textContent = `${convertedAmount.toFixed(2)} ${toCurrency}`;
}

// Event listener for the convert button
convertButton.addEventListener("click", convertCurrency);

// Fetch new rates automatically when currency is changed
fromCurrencySelect.addEventListener("change", fetchExchangeRate);
toCurrencySelect.addEventListener("change", fetchExchangeRate);

// Initial fetch and conversion on page load
document.addEventListener("DOMContentLoaded", fetchExchangeRate);

// Service Worker Registration
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js")
      .then((registration) => {
        console.log("Service Worker registered with scope:", registration.scope);
      })
      .catch((error) => {
        console.error("Service Worker registration failed:", error);
      });
  });
}