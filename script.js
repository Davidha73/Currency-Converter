// Get references to HTML elements
const amountInput = document.getElementById("amount");
const fromCurrencySelect = document.getElementById("fromCurrency");
const toCurrencySelect = document.getElementById("toCurrency");
const convertButton = document.getElementById("convertBtn");
const swapButton = document.getElementById("swapBtn");
const resultDisplay = document.getElementById("result");
const messageBox = document.getElementById("messageBox");
const messageText = document.getElementById("messageText");
const loadingIndicator = document.getElementById("loadingIndicator");
const currentRateValueSpan = document.getElementById("currentRateValue");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");
const exportHistoryBtn = document.getElementById("exportHistoryBtn");
const closeMessageBtn = document.querySelector(".btn-close-msg");
const fromSymbolSpan = document.getElementById("fromSymbol");
const toSymbolSpan = document.getElementById("toSymbol");

const currencySymbols = {
  EUR: "€",
  GBP: "£",
  USD: "$",
  JPY: "¥"
};

const currencyFlags = {
  EUR: "eu",
  GBP: "gb",
  USD: "us",
  JPY: "jp"
};

// Global variable for the exchange rate
let currentExchangeRate = null; // Initialize as null to prevent accidental wrong conversions
let messageTimer = null; // Timer for auto-hiding the message box

/**
 * Displays a message in the message box.
 * @param {string} message - The message to display.
 * @param {string} type - The type of message ('error', 'success', 'info').
 */
function showMessage(message, type = "info") {
  clearTimeout(messageTimer);

  messageText.textContent = message;
  messageBox.classList.remove("hidden");
  // Reset classes
  messageBox.classList.remove(
    "msg-error", "msg-success", "msg-info"
  );

  if (type === "error") {
    messageBox.classList.add("msg-error");
  } else if (type === "success") {
    messageBox.classList.add("msg-success");
  } else {
    messageBox.classList.add("msg-info");
  }

  // Auto-hide the message box after 3 seconds
  messageTimer = setTimeout(() => {
    messageBox.classList.add("hidden");
  }, 3000);
}

/**
 * Fetches the live exchange rate from the API.
 */
async function fetchExchangeRate() {
  // Safety check for converter-specific elements
  if (!fromCurrencySelect || !toCurrencySelect) return;

  const from = fromCurrencySelect.value;
  const to = toCurrencySelect.value;

  // Update UI symbols
  fromSymbolSpan.textContent = currencySymbols[from] || '';
  toSymbolSpan.textContent = currencySymbols[to] || '';

  // Immediately update UI labels to show what we are currently fetching
  const rateDisplay = document.getElementById('liveRateDisplay');
  rateDisplay.innerHTML = `1 ${from} = <span id="currentRateValue">...</span> ${to}`;

  // Handle identity conversion locally
  if (from === to) {
    currentExchangeRate = 1.0;
    rateDisplay.innerHTML = `1 ${from} = <span id="currentRateValue">1.0000</span> ${to}`;
    convertCurrency();
    return;
  }

  const cacheKey = `rate_${from}_${to}`;
  const timeKey = `time_${from}_${to}`;
  
  const lastFetchTime = localStorage.getItem(timeKey);
  const cachedRate = localStorage.getItem(cacheKey);
  const now = new Date().getTime();

  // Check if we have a valid cache (less than 12 hours old)
  if (lastFetchTime && cachedRate && (now - lastFetchTime < 12 * 60 * 60 * 1000)) {
    currentExchangeRate = parseFloat(cachedRate);
    rateDisplay.innerHTML = `1 ${from} = <span id="currentRateValue">${currentExchangeRate.toFixed(4)}</span> ${to}`;
    showMessage(`Using cached rate. Last updated less than 12 hours ago.`, "info");
    convertCurrency();
    return;
  }

  const startTime = Date.now();
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
      
      rateDisplay.innerHTML = `1 ${from} = <span id="currentRateValue">${currentExchangeRate.toFixed(4)}</span> ${to}`;
      showMessage(`Live rate updated: 1 ${from} = ${currentExchangeRate.toFixed(4)} ${to}`, "success");
    } else {
      throw new Error("Invalid response from rate service.");
    }
  } catch (error) {
    console.error("Error fetching exchange rate:", error);
    currentExchangeRate = null;
    rateDisplay.innerHTML = `1 ${from} = <span id="currentRateValue">N/A</span> ${to}`;
    showMessage(`Could not fetch live rates. Error: ${error.message}`, "error");
  } finally {
    const elapsed = Date.now() - startTime;
    const remainingDelay = Math.max(0, 1000 - elapsed);

    setTimeout(() => {
      loadingIndicator.classList.add("hidden");
      convertCurrency();
    }, remainingDelay);
  }
}

/**
 * Performs the currency conversion.
 * @param {boolean} shouldSave - Whether to save this conversion to history.
 */
function convertCurrency(shouldSave = false) {
  // Safety check for converter-specific elements
  if (!amountInput || !resultDisplay) return;

  const amount = parseFloat(amountInput.value);
  const fromCurrency = fromCurrencySelect.value;
  const toCurrency = toCurrencySelect.value;

  // Ensure we have a valid rate before attempting conversion
  if (currentExchangeRate === null && fromCurrency !== toCurrency) {
    resultDisplay.textContent = "---";
    return;
  }

  // Validate input amount
  if (isNaN(amount) || amount <= 0) {
    showMessage("Please enter a valid positive amount.", "error");
    resultDisplay.textContent = "0.00";
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

  resultDisplay.textContent = convertedAmount.toFixed(2);

  // Trigger scale animation
  resultDisplay.classList.remove("animate-scale");
  resultDisplay.classList.remove("animate-glow"); // Remove glow too
  void resultDisplay.offsetWidth; // Force reflow to restart both animations
  resultDisplay.classList.add("animate-scale");
  resultDisplay.classList.add("animate-glow"); // Add glow

  // Log this conversion only if explicitly requested (e.g., via button click)
  if (shouldSave) {
    saveToHistory(amount, fromCurrency, toCurrency, convertedAmount, currentExchangeRate);
  }
}

/**
 * Saves a conversion to localStorage and updates the UI.
 */
function saveToHistory(amount, from, to, result, rate) {
  const history = JSON.parse(localStorage.getItem("conv_history") || "[]");
  const timestamp = Date.now();
  
  const newEntry = {
    amount: amount.toFixed(2),
    from, to,
    result: typeof result === 'number' ? result.toFixed(2) : result,
    rate: rate ? rate.toFixed(4) : "1.0000",
    timestamp
  };

  // Prevent duplicate consecutive entries
  if (history.length > 0 && 
      history[0].amount === newEntry.amount && 
      history[0].from === newEntry.from && 
      history[0].to === newEntry.to) {
    return;
  }

  history.unshift(newEntry);
  localStorage.setItem("conv_history", JSON.stringify(history.slice(0, 5)));
  renderHistory();
}

/**
 * Loads a conversion from history back into the main converter.
 */
function loadFromHistory(index) {
  const history = JSON.parse(localStorage.getItem("conv_history") || "[]");
  const item = history[index];
  if (!item) return;

  amountInput.value = item.amount;
  fromCurrencySelect.value = item.from;
  toCurrencySelect.value = item.to;

  fetchExchangeRate();
}

/**
 * Renders the conversion history from localStorage.
 */
function renderHistory() {
  const history = JSON.parse(localStorage.getItem("conv_history") || "[]");
  const container = document.getElementById("conversionHistory");
  const list = document.getElementById("historyList");

  if (history.length === 0) {
    container.classList.add("hidden");
    return;
  }

  container.classList.remove("hidden");
  list.innerHTML = history.map((item, index) => `
    <div class="history-item" onclick="loadFromHistory(${index})">
      <div class="history-details">
        <span class="history-amount">${currencySymbols[item.from] || ''}${item.amount}</span>
        <span class="history-meta">Rate: 1 ${item.from} = ${item.rate} ${item.to}</span>
      </div>
      <span class="material-symbols-outlined" style="color: var(--primary-fixed-dim); font-size: 20px;">arrow_forward</span>
      <div class="history-details" style="text-align: right;">
        <span class="history-amount">${currencySymbols[item.to] || ''}${item.result}</span>
        <span class="history-meta">${new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
      </div>
    </div>
  `).join('');
}

/**
 * Clears the conversion history from localStorage and updates the UI.
 */
function clearHistory() {
  localStorage.removeItem("conv_history");
  renderHistory();
  showMessage("Conversion history cleared", "info");
}

/**
 * Exports the conversion history as a CSV file.
 */
function exportHistoryAsCsv() {
  const history = JSON.parse(localStorage.getItem("conv_history") || "[]");

  if (history.length === 0) {
    showMessage("No history to export.", "info");
    return;
  }

  // Define CSV header
  const headers = ["Amount", "From Currency", "To Currency", "Converted Amount", "Exchange Rate", "Timestamp"];
  
  // Map history items to CSV rows
  const csvRows = history.map(item => {
    return [
      `"${item.amount}"`, // Wrap in quotes to handle commas if any
      `"${item.from}"`,
      `"${item.to}"`,
      `"${item.result}"`,
      `"${item.rate}"`,
      `"${new Date(item.timestamp).toISOString()}"` // ISO string for consistent date format
    ].join(',');
  });

  // Combine headers and rows
  const csvString = [headers.join(','), ...csvRows].join('\n');

  // Create a Blob and download link
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', 'conversion_history.csv');
  document.body.appendChild(link); // Required for Firefox
  link.click();
  document.body.removeChild(link); // Clean up
  showMessage("Conversion history exported to CSV.", "success");
}

/**
 * Updates the custom dropdown UI based on the internal value.
 */
function updateCustomSelectUI(side) {
  const value = side === 'from' ? fromCurrencySelect.value : toCurrencySelect.value;
  const trigger = document.getElementById(`${side}Trigger`);
  const flagImg = trigger.querySelector('.select-flag');
  const codeSpan = trigger.querySelector('.selected-code');
  
  flagImg.src = `https://flagcdn.com/w40/${currencyFlags[value]}.png`;
  codeSpan.textContent = value;
}

/**
 * Sets up the custom dropdown components.
 */
function initCustomSelects() {
  const setups = [
    { side: 'from', wrapperId: 'fromSelectWrapper' },
    { side: 'to', wrapperId: 'toSelectWrapper' }
  ];

  setups.forEach(({ side, wrapperId }) => {
    const wrapper = document.getElementById(wrapperId);
    const trigger = wrapper.querySelector('.select-trigger');
    const optionsList = wrapper.querySelector('.select-options');
    const options = optionsList.querySelectorAll('.option');
    const hiddenInput = document.getElementById(`${side}Currency`);

    // Toggle visibility
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isClosing = !optionsList.classList.contains('hidden');
      
      // Close all dropdowns and reset card z-indices
      document.querySelectorAll('.select-options').forEach(el => el.classList.add('hidden'));
      document.querySelectorAll('.glass-card').forEach(card => card.classList.remove('dropdown-open'));

      if (!isClosing) {
        optionsList.classList.remove('hidden');
        wrapper.closest('.glass-card').classList.add('dropdown-open');
      }
    });

    // Handle option selection
    options.forEach(opt => {
      opt.addEventListener('click', () => {
        const newVal = opt.getAttribute('data-value');
        hiddenInput.value = newVal;
        updateCustomSelectUI(side);
        optionsList.classList.add('hidden');
        wrapper.closest('.glass-card').classList.remove('dropdown-open');
        fetchExchangeRate();
      });
    });
  });

  // Close dropdowns when clicking outside
  document.addEventListener('click', () => {
    document.querySelectorAll('.select-options').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.glass-card').forEach(card => card.classList.remove('dropdown-open'));
  });
}

/**
 * Handles contact form submission via AJAX for a seamless experience.
 */
function initContactForm() {
  const contactForm = document.getElementById("contactForm");
  if (!contactForm) return;

  contactForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const submitBtn = contactForm.querySelector('button[type="submit"]');
    const originalBtnContent = submitBtn.innerHTML;

    // Set loading state
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="loader loader-small btn-spinner"></span> <span>Transmitting...</span>`;

    const formData = new FormData(contactForm);
    const params = new URLSearchParams(formData);
    // Netlify requires the form-name field for AJAX submissions
    params.append("form-name", "contact");
    
    try {
      const response = await fetch(window.location.pathname, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });

      if (response.ok) {
        showMessage("Transmission successful. We will respond shortly.", "success");
        contactForm.reset();
      } else {
        throw new Error("Form submission failed");
      }
    } catch (error) {
      showMessage("Transmission failed. Please try again later.", "error");
    } finally {
      // Restore button state
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnContent;
    }
  });
}

// Event listener for the swap button
if (swapButton) {
  swapButton.addEventListener("click", () => {
    const tempValue = fromCurrencySelect.value;
    fromCurrencySelect.value = toCurrencySelect.value;
    toCurrencySelect.value = tempValue;
    
    // Update custom UI to reflect swap
    updateCustomSelectUI('from');
    updateCustomSelectUI('to');
    
    fetchExchangeRate();
  });
}

// Event listener for the convert button
if (convertButton) {
  convertButton.addEventListener("click", () => convertCurrency(true));
}

// Event listener for clear history button
if (clearHistoryBtn) clearHistoryBtn.addEventListener("click", clearHistory);

// Event listener for the close message button
if (closeMessageBtn) closeMessageBtn.addEventListener("click", () => messageBox.classList.add("hidden"));

// Event listener for export history button
if (exportHistoryBtn) exportHistoryBtn.addEventListener("click", exportHistoryAsCsv);

// Format input to XX.XX on blur
if (amountInput) {
  amountInput.addEventListener("blur", () => {
    const val = parseFloat(amountInput.value);
    if (!isNaN(val)) {
      amountInput.value = val.toFixed(2);
    }
  });
}

// Initial fetch and conversion on page load
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("fromSelectWrapper")) initCustomSelects();
  if (amountInput) fetchExchangeRate();
  if (document.getElementById("conversionHistory")) renderHistory();
  initContactForm();
});

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