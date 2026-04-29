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
const clearHistoryBtn = document.getElementById("clearHistoryBtn");
const exportHistoryBtn = document.getElementById("exportHistoryBtn");
const closeMessageBtn = document.querySelector(".btn-close-msg");
const fromSymbolSpan = document.getElementById("fromSymbol");
const toSymbolSpan = document.getElementById("toSymbol");
const appContainer = document.getElementById("appContainer");
const navTabRight = document.getElementById("navTabRight");
const navTabLeft = document.getElementById("navTabLeft");
const tripMenuBtn = document.getElementById("tripMenuBtn");

const currencySymbols = {
  EUR: "€",
  GBP: "£",
  USD: "$",
  JPY: "¥",
  CAD: "$",
  AUD: "$",
  CHF: "Fr",
  SEK: "kr",
  NOK: "kr",
  DKK: "kr",
  PLN: "zł",
  CZK: "Kč"
};

const currencyFlags = {
  EUR: "eu",
  GBP: "gb",
  USD: "us",
  JPY: "jp",
  CAD: "ca",
  AUD: "au",
  CHF: "ch",
  SEK: "se",
  NOK: "no",
  DKK: "dk",
  PLN: "pl",
  CZK: "cz"
};

const categoryIcons = {
  general: 'payments',
  food: 'restaurant',
  transport: 'directions_car',
  hotel: 'bed',
  shopping: 'shopping_bag'
};

// Global state
let currentExchangeRate = null;
let messageTimer = null;
let budgetExchangeRate = null; // Exchange rate for budget calculations (home to dest)
let setView; 

// Global state for deletion confirmation and view management
let pendingDeleteId = null;
let pendingDeleteItemElement = null;
let isDeletingTrip = false;
let collapsedDates = new Set();
let hasInitializedCollapsedState = false;

/**
 * Displays a message in the message box.
 */
function showMessage(message, type = "info") {
  clearTimeout(messageTimer);
  messageText.textContent = message;
  messageBox.classList.remove("hidden", "msg-error", "msg-success", "msg-info");

  if (type === "error") messageBox.classList.add("msg-error");
  else if (type === "success") messageBox.classList.add("msg-success");
  else messageBox.classList.add("msg-info");

  messageTimer = setTimeout(() => {
    messageBox.classList.add("hidden");
  }, 3000);
}

/**
 * Formats a timestamp into a human-readable string.
 */
function formatLastUpdated(timestamp) {
  if (!timestamp) return "";
  const now = new Date().getTime();
  const diffSeconds = Math.floor((now - timestamp) / 1000);
  if (diffSeconds < 60) return `Updated just now`;
  if (diffSeconds < 3600) return `Updated ${Math.floor(diffSeconds / 60)} min ago`;
  if (diffSeconds < 86400) return `Updated ${Math.floor(diffSeconds / 3600)} hr ago`;
  const days = Math.floor(diffSeconds / 86400);
  return `Updated ${days} day${days > 1 ? 's' : ''} ago`;
}

/**
 * Fetches the live exchange rate from the API.
 */
async function fetchExchangeRate(from = fromCurrencySelect.value, to = toCurrencySelect.value, isBudgetRate = false) {
  if (!fromCurrencySelect || !toCurrencySelect) return;

  fromSymbolSpan.textContent = currencySymbols[from] || '';
  toSymbolSpan.textContent = currencySymbols[to] || '';

  const rateDisplay = document.getElementById('liveRateDisplay');
  rateDisplay.innerHTML = `
    <span>1 ${from} = <span id="currentRateValue">...</span> ${to}</span>
    <span class="rate-last-updated">Fetching...</span>
  `;

  if (from === to) {
    if (isBudgetRate) {
      budgetExchangeRate = 1.0;
    } else {
      currentExchangeRate = 1.0;
    }

    rateDisplay.innerHTML = `1 ${from} = <span id="currentRateValue">1.0000</span> ${to}`;
    convertCurrency();
    return;
  }

  const cacheKey = `rate_${from}_${to}`;
  const timeKey = `time_${from}_${to}`;
  const lastFetchTime = localStorage.getItem(timeKey);
  const cachedRate = localStorage.getItem(cacheKey);
  const now = new Date().getTime();

  if (lastFetchTime && cachedRate && (now - lastFetchTime < 12 * 60 * 60 * 1000)) {
    if (isBudgetRate) {
      budgetExchangeRate = parseFloat(cachedRate);
    } else {
      currentExchangeRate = parseFloat(cachedRate);
    }

    rateDisplay.innerHTML = `
      <span>1 ${from} = <span id="currentRateValue">${currentExchangeRate.toFixed(4)}</span> ${to}</span>
      <span class="rate-last-updated">${formatLastUpdated(parseInt(lastFetchTime))}</span>`;
    convertCurrency();
    return;
  }

  loadingIndicator.classList.remove("hidden");
  try {
    const response = await fetch(`/.netlify/functions/get-rate?from=${from}&to=${to}`);
    if (!response.ok) throw new Error(`Server Error: ${response.status}`);
    const data = await response.json();
    if (data.conversion_rate) { // Check if data.conversion_rate exists
      if (isBudgetRate) {
        budgetExchangeRate = data.conversion_rate;
      } else {
        currentExchangeRate = data.conversion_rate;
      }
      localStorage.setItem(cacheKey, data.conversion_rate);
      localStorage.setItem(timeKey, now);
      rateDisplay.innerHTML = `
        <span>1 ${from} = <span id="currentRateValue">${currentExchangeRate.toFixed(4)}</span> ${to}</span>
        <span class="rate-last-updated">${formatLastUpdated(now)}</span>`;
    }
  } catch (error) {
    if (isBudgetRate) {
      budgetExchangeRate = null;
    } else {
      currentExchangeRate = null;
    }

    rateDisplay.innerHTML = `1 ${from} = <span id="currentRateValue">N/A</span> ${to}`;
    showMessage(`Could not fetch live rates.`, "error");
  } finally {
    loadingIndicator.classList.add("hidden");
    convertCurrency();
  }
}

/**
 * Performs the currency conversion.
 */
function convertCurrency(shouldSave = false) {
  if (!amountInput || !resultDisplay) return;
  resultDisplay.classList.remove("result-pending");
  if (convertButton) convertButton.classList.remove("btn-pulse");

  const amount = parseFloat(amountInput.value);
  const fromCurrency = fromCurrencySelect.value;
  const toCurrency = toCurrencySelect.value;

  if (currentExchangeRate === null && fromCurrency !== toCurrency) {
    resultDisplay.textContent = "---";
    return;
  }

  if (isNaN(amount) || amount <= 0) {
    resultDisplay.textContent = "0.00";
    return;
  }

  const convertedAmount = fromCurrency === toCurrency ? amount : amount * currentExchangeRate;
  resultDisplay.textContent = convertedAmount.toFixed(2);

  resultDisplay.classList.remove("animate-scale", "animate-glow");
  void resultDisplay.offsetWidth; 
  resultDisplay.classList.add("animate-scale", "animate-glow");

  if (shouldSave) {
    saveToHistory(amount, fromCurrency, toCurrency, convertedAmount, currentExchangeRate);
  }
}

function saveToHistory(amount, from, to, result, rate) {
  const history = JSON.parse(localStorage.getItem("conv_history") || "[]");
  const newEntry = {
    amount: amount.toFixed(2),
    from, to,
    result: typeof result === 'number' ? result.toFixed(2) : result,
    rate: rate ? rate.toFixed(4) : "1.0000",
    timestamp: Date.now()
  };

  if (history.length > 0 && history[0].amount === newEntry.amount && history[0].from === newEntry.from && history[0].to === newEntry.to) return;

  history.unshift(newEntry);
  localStorage.setItem("conv_history", JSON.stringify(history.slice(0, 5)));
  renderHistory();
}

async function toggleTripSetup() {
  const form = document.getElementById("tripSetupForm");
  if (!form) return;
  
  const isOpening = form.classList.contains("hidden");
  form.classList.toggle("hidden");

  if (isOpening) {
    // Ensure rate and symbols are ready for a new trip
    updateBudgetCurrencySymbols();
    await fetchBudgetExchangeRate();
  } else {
    // Reset UI labels if closing
    const saveBtn = form.querySelector(".primary-action-btn");
    if (saveBtn) saveBtn.textContent = "Save Trip Settings";
  }
}

async function openEditTripForm() {
  const config = JSON.parse(localStorage.getItem("trip_config"));
  if (!config) return;

  // Defensive selection of form elements
  const els = {
    name: document.getElementById("setupTripName"),
    budgetDest: document.getElementById("setupTripBudgetDest"),
    dailyDest: document.getElementById("setupDailyBudgetDest"),
    start: document.getElementById("setupStartDate"),
    end: document.getElementById("setupEndDate"),
    homeCur: document.getElementById("setupHomeCurrency"),
    destCur: document.getElementById("setupDestCurrency"),
    form: document.getElementById("tripSetupForm")
  };

  if (!els.name || !els.budgetDest || !els.form) {
    console.warn("Trip setup form elements not found on this page.");
    return;
  }

  // Populate general trip details
  els.name.value = config.tripName || "";
  if (els.start) els.start.value = config.startDate || "";
  if (els.end) {
    els.end.value = config.endDate || "";
    els.end.min = config.startDate || "";
  }

  // Set hidden currency values
  if (els.homeCur) els.homeCur.value = config.homeCurrency || "GBP";
  if (els.destCur) els.destCur.value = config.destCurrency || "EUR";

  // Update custom select UIs and fetch budget rate
  ['setupHomeCurrency', 'setupDestCurrency'].forEach(id => updateCustomSelectUI(id));
  
  updateBudgetCurrencySymbols();
  await fetchBudgetExchangeRate();

  // Populate budget fields AFTER fetching rate so calculations work
  els.budgetDest.value = config.tripBudget || "";
  if (els.dailyDest) els.dailyDest.value = config.dailyBudget || "";
  
  updateBudgetFields('setupTripBudgetDest'); 

  const saveBtn = document.querySelector("#tripSetupForm .primary-action-btn");
  if (saveBtn) saveBtn.textContent = "Update Trip Details";

  els.form.classList.remove("hidden");

  closeTripActions();
  els.form.scrollIntoView({ behavior: 'smooth' });
}

async function fetchBudgetExchangeRate() {
  const homeCurEl = document.getElementById("setupHomeCurrency");
  const destCurEl = document.getElementById("setupDestCurrency");
  if (!homeCurEl || !destCurEl) return;

  const from = homeCurEl.value;
  const to = destCurEl.value;

  if (from === to) {
    budgetExchangeRate = 1.0;
    return;
  }

  const cacheKey = `rate_${from}_${to}`;
  const timeKey = `time_${from}_${to}`;
  const lastFetchTime = localStorage.getItem(timeKey);
  const cachedRate = localStorage.getItem(cacheKey);
  const now = new Date().getTime();

  if (lastFetchTime && cachedRate && (now - lastFetchTime < 12 * 60 * 60 * 1000)) {
    budgetExchangeRate = parseFloat(cachedRate);
    return;
  }

  try {
    const response = await fetch(`/.netlify/functions/get-rate?from=${from}&to=${to}`);
    if (!response.ok) throw new Error(`Server Error: ${response.status}`);
    const data = await response.json();
    if (data.conversion_rate) {
      budgetExchangeRate = data.conversion_rate;
      localStorage.setItem(cacheKey, budgetExchangeRate);
      localStorage.setItem(timeKey, now);
    }
  } catch (error) {
    budgetExchangeRate = null;
    showMessage(`Could not fetch budget exchange rates.`, "error");
  }
}

function updateBudgetCurrencySymbols() {
  const homeCurEl = document.getElementById("setupHomeCurrency");
  const destCurEl = document.getElementById("setupDestCurrency");
  if (!homeCurEl || !destCurEl) return;

  const homeCur = homeCurEl.value;
  const destCur = destCurEl.value;

  const homeSyms = [document.getElementById("setupTripBudgetHomeSymbol"), document.getElementById("setupDailyBudgetHomeSymbol")];
  const destSyms = [document.getElementById("setupTripBudgetDestSymbol"), document.getElementById("setupDailyBudgetDestSymbol")];

  homeSyms.forEach(el => { if(el) el.textContent = currencySymbols[homeCur] || ''; });
  destSyms.forEach(el => { if(el) el.textContent = currencySymbols[destCur] || ''; });
}

function updateBudgetFields(changedFieldId) {
  const homeCurEl = document.getElementById("setupHomeCurrency");
  const destCurEl = document.getElementById("setupDestCurrency");
  if (!homeCurEl || !destCurEl) return;

  const homeCurrency = homeCurEl.value;
  const destCurrency = destCurEl.value;

  const setupTripBudgetHome = document.getElementById("setupTripBudgetHome");
  const setupTripBudgetDest = document.getElementById("setupTripBudgetDest");
  const setupDailyBudgetHome = document.getElementById("setupDailyBudgetHome");
  const setupDailyBudgetDest = document.getElementById("setupDailyBudgetDest");

  const startInput = document.getElementById("setupStartDate");
  const endInput = document.getElementById("setupEndDate");
  let durationDays = 0;
  if (startInput.value && endInput.value) {
    const start = new Date(startInput.value);
    const end = new Date(endInput.value);
    if (end >= start) {
      durationDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    }
  }

  // If we don't have a rate yet and currencies differ, we can't calculate others
  if (budgetExchangeRate === null && homeCurrency !== destCurrency) return;

  let tripBudgetDestVal = parseFloat(setupTripBudgetDest.value) || 0;
  let dailyBudgetDestVal = parseFloat(setupDailyBudgetDest.value) || 0;
  let tripBudgetHomeVal = parseFloat(setupTripBudgetHome.value) || 0;
  let dailyBudgetHomeVal = parseFloat(setupDailyBudgetHome.value) || 0;

  // Prioritize the changed field and calculate others
  switch (changedFieldId) {
    case 'setupTripBudgetDest':
      tripBudgetHomeVal = tripBudgetDestVal * budgetExchangeRate;
      dailyBudgetDestVal = durationDays > 0 ? tripBudgetDestVal / durationDays : 0;
      dailyBudgetHomeVal = dailyBudgetDestVal * budgetExchangeRate;
      break;
    case 'setupTripBudgetHome':
      tripBudgetDestVal = budgetExchangeRate > 0 ? tripBudgetHomeVal / budgetExchangeRate : 0;
      dailyBudgetDestVal = durationDays > 0 ? tripBudgetDestVal / durationDays : 0;
      dailyBudgetHomeVal = dailyBudgetDestVal * budgetExchangeRate;
      break;
    case 'setupDailyBudgetDest':
      tripBudgetDestVal = dailyBudgetDestVal * durationDays;
      tripBudgetHomeVal = tripBudgetDestVal * budgetExchangeRate;
      dailyBudgetHomeVal = dailyBudgetDestVal * budgetExchangeRate;
      break;
    case 'setupDailyBudgetHome':
      dailyBudgetDestVal = budgetExchangeRate > 0 ? dailyBudgetHomeVal / budgetExchangeRate : 0;
      tripBudgetDestVal = dailyBudgetDestVal * durationDays;
      tripBudgetHomeVal = tripBudgetDestVal * budgetExchangeRate;
      break;
  }

  // Update other input fields only (don't overwrite the active one to allow natural typing)
  if (changedFieldId !== 'setupTripBudgetDest') setupTripBudgetDest.value = tripBudgetDestVal > 0 ? tripBudgetDestVal.toFixed(2) : '';
  if (changedFieldId !== 'setupTripBudgetHome') setupTripBudgetHome.value = tripBudgetHomeVal > 0 ? tripBudgetHomeVal.toFixed(2) : '';
  if (changedFieldId !== 'setupDailyBudgetDest') setupDailyBudgetDest.value = dailyBudgetDestVal > 0 ? dailyBudgetDestVal.toFixed(2) : '';
  if (changedFieldId !== 'setupDailyBudgetHome') setupDailyBudgetHome.value = dailyBudgetHomeVal > 0 ? dailyBudgetHomeVal.toFixed(2) : '';
}

function saveTripConfig() {
  const nameInput = document.getElementById("setupTripName");
  const tripName = nameInput.value.trim();
  // Use the destination currency budget as the source of truth for saving
  const tripBudget = document.getElementById("setupTripBudgetDest").value;
  const dailyBudget = document.getElementById("setupDailyBudgetDest").value;
  const startDate = document.getElementById("setupStartDate").value;
  const endDate = document.getElementById("setupEndDate").value;
  const homeCurrency = document.getElementById("setupHomeCurrency").value;
  const destCurrency = document.getElementById("setupDestCurrency").value;
  
  nameInput.style.borderColor = "";

  if (!tripName) {
    nameInput.style.borderColor = "#ef4444";
    nameInput.focus();
    showMessage("Please provide a name for your trip.", "error");
    return;
  }

  if (!startDate || !endDate) {
    showMessage("Please select start and end dates.", "error");
    return;
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (end < start) {
    showMessage("End date cannot be before start date.", "error");
    return;
  }

  if (!tripBudget || tripBudget <= 0) {
    showMessage("Please enter a valid trip budget.", "error");
    return;
  }

  const config = {
    tripName,
    tripBudget: parseFloat(tripBudget),
    dailyBudget: parseFloat(dailyBudget) || 0,
    startDate,
    endDate,
    durationDays: Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1,
    homeCurrency,
    destCurrency,
    timestamp: Date.now()
  };

  localStorage.setItem("trip_config", JSON.stringify(config));
  
  // Sync converter to Destination -> Home (matching the spending log logic)
  fromCurrencySelect.value = destCurrency;
  toCurrencySelect.value = homeCurrency;
  updateCustomSelectUI('fromCurrency');
  updateCustomSelectUI('toCurrency');
  fetchExchangeRate();

  collapsedDates.clear();
  hasInitializedCollapsedState = false;
  toggleTripSetup();
  renderTripLog();
  showMessage("Trip configured successfully!", "success");
}

function updateBudgetDashboard(totalSpent) {
  const config = JSON.parse(localStorage.getItem("trip_config"));
  const dashboard = document.getElementById("tripDashboard");
  if (!config || !dashboard) return;
  
  dashboard.classList.remove("hidden");
  const budget = config.tripBudget;
  const percent = Math.min(100, (totalSpent / budget) * 100);
  
  document.getElementById("tripNameDisplay").textContent = config.tripName;
  const progressBar = document.getElementById("tripProgressBar");
  progressBar.style.width = `${percent}%`;
  progressBar.classList.toggle('is-critical', percent > 90);
  document.getElementById("tripBudgetPercent").textContent = `${Math.round(percent)}%`;
  
  const symbol = currencySymbols[config.destCurrency] || '';
  document.getElementById("tripSpentText").textContent = `Spent: ${symbol}${totalSpent.toFixed(2)}`;
  document.getElementById("tripRemainingText").textContent = `Remaining: ${symbol}${Math.max(0, budget - totalSpent).toFixed(2)}`;
}

function deleteTripLogEntry(event, id) {
  if (event && event.stopPropagation) event.stopPropagation();
  let tripLog = JSON.parse(localStorage.getItem("trip_log") || "[]");
  tripLog = tripLog.filter(entry => entry.id !== id);
  localStorage.setItem("trip_log", JSON.stringify(tripLog));
  renderTripLog();
  showMessage("Entry removed from spending log", "info");
}

function showDeleteConfirmation(id, element) {
  pendingDeleteId = id;
  pendingDeleteItemElement = element;
  document.getElementById('confirmOverlay').classList.add('visible');
  document.getElementById('confirmSheet').classList.add('visible');
  document.body.classList.add('body-no-scroll');
}

function closeDeleteConfirmation(shouldDelete = false) {
  document.getElementById('confirmOverlay').classList.remove('visible');
  document.getElementById('confirmSheet').classList.remove('visible');
  document.body.classList.remove('body-no-scroll');

  if (shouldDelete) {
    if (isDeletingTrip) {
      localStorage.removeItem("trip_config");
      localStorage.removeItem("trip_log");
      collapsedDates.clear();
      hasInitializedCollapsedState = false;
      renderTripLog();
      showMessage("Trip deleted permanently", "info");
    } else if (pendingDeleteId) {
      deleteTripLogEntry(null, pendingDeleteId);
    }
  } else if (pendingDeleteItemElement) {
    pendingDeleteItemElement.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
    pendingDeleteItemElement.style.transform = 'translateX(0)';
    pendingDeleteItemElement.style.opacity = '1';
    const bgLabel = pendingDeleteItemElement.parentElement.querySelector('.swipe-background-label');
    if (bgLabel) {
      bgLabel.style.width = '0';
      setTimeout(() => {
        bgLabel.style.opacity = '0';
        bgLabel.style.visibility = 'hidden';
      }, 300);
    }
  }

  // Reset UI and state after the sheet animation finishes
  setTimeout(() => {
    document.getElementById('confirmTitle').textContent = "Delete Expense?";
    const confirmP = document.getElementById('confirmSheet').querySelector('p');
    if (confirmP) confirmP.textContent = "This entry will be permanently removed from your log.";
    isDeletingTrip = false;
    pendingDeleteId = null;
    pendingDeleteItemElement = null;
  }, 400);
}

function openTripActions() {
  document.getElementById('confirmOverlay').classList.add('visible');
  document.getElementById('tripActionsSheet').classList.add('visible');
  document.body.classList.add('body-no-scroll');
}

function confirmDeleteEntireTrip() {
  document.getElementById('tripActionsSheet').classList.remove('visible');
  isDeletingTrip = true;
  document.getElementById('confirmTitle').textContent = "Delete Entire Trip?";
  const confirmP = document.getElementById('confirmSheet').querySelector('p');
  if (confirmP) confirmP.textContent = "This will permanently erase the current trip and all logged expenses. This cannot be undone.";
  document.getElementById('confirmSheet').classList.add('visible');
  // Overlay is already visible from the trip options menu
}

function closeTripActions() {
  document.getElementById('confirmOverlay').classList.remove('visible');
  document.getElementById('tripActionsSheet').classList.remove('visible');
  document.body.classList.remove('body-no-scroll');
}

function finishTrip(customMessage = "Trip finished and archived!") {
  const config = JSON.parse(localStorage.getItem("trip_config"));
  const log = JSON.parse(localStorage.getItem("trip_log") || "[]");
  if (!config) return;

  const history = JSON.parse(localStorage.getItem("trip_history") || "[]");
  history.unshift({
    config,
    log,
    finishedAt: Date.now()
  });
  localStorage.setItem("trip_history", JSON.stringify(history));

  localStorage.removeItem("trip_config");
  localStorage.removeItem("trip_log");
  collapsedDates.clear();
  hasInitializedCollapsedState = false;

  closeTripActions();
  renderTripLog();
  renderTripHistory();
  showMessage(customMessage, "success");
}

function checkTripExpiry() {
  const config = JSON.parse(localStorage.getItem("trip_config"));
  if (!config || !config.endDate) return;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(config.endDate);
  end.setHours(0, 0, 0, 0);

  if (today > end) {
    finishTrip(`Trip "${config.tripName}" ended on ${config.endDate} and has been auto-archived.`);
    if (setView) setView('archive');
  }
}

function updateTripLogNote(id, newNote) {
  let tripLog = JSON.parse(localStorage.getItem("trip_log") || "[]");
  const index = tripLog.findIndex(item => item.id === id);
  if (index !== -1) {
    tripLog[index].note = newNote;
    localStorage.setItem("trip_log", JSON.stringify(tripLog));
  }
}

function addToTripLog(index, category) {
  const history = JSON.parse(localStorage.getItem("conv_history") || "[]");
  const item = history[index];
  if (!item) return;

  const tripLog = JSON.parse(localStorage.getItem("trip_log") || "[]");
  
  const logEntry = {
    ...item,
    id: `spent_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    category: category,
    note: ''
  };

  tripLog.unshift(logEntry);
  localStorage.setItem("trip_log", JSON.stringify(tripLog));
  
  if (typeof renderTripLog === 'function') renderTripLog();
  
  showMessage("Added to spending log", "success");
}

function openCategoryPicker(event, index) {
  event.stopPropagation();
  closeCategoryPicker();

  const picker = document.createElement('div');
  picker.id = 'activeCategoryPicker';
  picker.className = 'category-picker';
  
  const backdrop = document.createElement('div');
  backdrop.id = 'pickerBackdrop';
  backdrop.className = 'picker-backdrop visible';
  document.body.appendChild(backdrop);

  Object.keys(categoryIcons).forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'category-option';
    btn.innerHTML = `
      <span class="material-symbols-outlined">${categoryIcons[cat]}</span>
      <span>${cat}</span>
    `;
    btn.onclick = () => {
      addToTripLog(index, cat);
      closeCategoryPicker();
    };
    picker.appendChild(btn);
  });

  document.body.appendChild(picker);
  backdrop.addEventListener('click', closeCategoryPicker);

  setTimeout(() => {
    document.addEventListener('click', closeCategoryPicker);
  }, 0);

  document.body.classList.add('body-no-scroll');
}

function closeCategoryPicker() {
  const existing = document.getElementById('activeCategoryPicker');
  const backdrop = document.getElementById('pickerBackdrop');
  if (existing) existing.remove();
  if (backdrop) backdrop.remove();
  document.removeEventListener('click', closeCategoryPicker);
  document.body.classList.remove('body-no-scroll');
}

function groupTripLogByDate() {
  const tripLog = JSON.parse(localStorage.getItem("trip_log") || "[]");
  return tripLog.reduce((groups, entry) => {
    const date = new Date(entry.timestamp).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    if (!groups[date]) {
      groups[date] = {
        items: [],
        fromTotals: {},
        toTotals: {}
      };
    }
    groups[date].items.push(entry);

    const fCur = entry.from;
    groups[date].fromTotals[fCur] = (groups[date].fromTotals[fCur] || 0) + parseFloat(entry.amount);

    const tCur = entry.to;
    groups[date].toTotals[tCur] = (groups[date].toTotals[tCur] || 0) + parseFloat(entry.result);
    
    return groups;
  }, {});
}

function toggleDayCollapse(dateString) {
  if (collapsedDates.has(dateString)) {
    collapsedDates.delete(dateString);
  } else {
    collapsedDates.add(dateString);
  }
  renderTripLog();
}

function loadFromHistory(index) {
  const history = JSON.parse(localStorage.getItem("conv_history") || "[]");
  const item = history[index];
  if (!item) return;

  amountInput.value = item.amount;
  fromCurrencySelect.value = item.from;
  toCurrencySelect.value = item.to;

  fetchExchangeRate();
}

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
      <span class="material-symbols-outlined history-arrow">arrow_forward</span>
      <div class="history-details align-right">
        <span class="history-amount">${currencySymbols[item.to] || ''}${item.result}</span>
        <span class="history-meta">${new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
      </div>
      <button 
        class="btn-history-action history-add-btn" 
        onclick="openCategoryPicker(event, ${index})" 
        title="Add to Trip Log">
        <span class="material-symbols-outlined">add</span>
      </button>
    </div>
  `).join('');
}

function renderTripHistory() {
  const archiveList = document.getElementById("archiveList");
  if (!archiveList) return;

  const history = JSON.parse(localStorage.getItem("trip_history") || "[]");

  if (history.length === 0) {
    archiveList.innerHTML = `
      <div class="glass-card empty-state">
        <p style="text-align: center; color: var(--white-60);">No archived trips yet.<br>Finish a trip to see it here.</p>
      </div>`;
    return;
  }

  archiveList.innerHTML = history.map((trip, index) => {
    const config = trip.config;
    const log = trip.log || [];
    const finishedDate = new Date(trip.finishedAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    
    // Calculate Totals
    const totalSpent = log.reduce((sum, item) => sum + parseFloat(item.result), 0);
    const budget = config.tripBudget;
    const percent = Math.min(100, (totalSpent / budget) * 100);
    
    // Calculate Categories
    const catTotals = log.reduce((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + parseFloat(item.result);
      return acc;
    }, {});

    const catHtml = Object.entries(catTotals).map(([cat, amount]) => `
      <div class="category-chart-row">
        <span class="material-symbols-outlined" style="font-size: 14px; color: var(--white-60);">${categoryIcons[cat] || 'payments'}</span>
        <div class="chart-bar-bg">
          <div class="chart-bar-fill" style="width: ${(amount / totalSpent * 100).toFixed(0)}%"></div>
        </div>
        <span class="history-meta">${Math.round(amount / totalSpent * 100)}%</span>
      </div>
    `).join('');

    return `
      <div class="glass-card" style="height: auto; margin-bottom: 1.5rem;">
        <div class="card-header">
          <div class="history-details">
            <h3 style="margin-top: 0; margin-bottom: 0.15rem;">${config.tripName || 'Past Journey'}</h3>
            <span class="header-tagline">${config.homeCurrency} to ${config.destCurrency} • ${finishedDate}</span>
          </div>
          <span class="header-tagline" style="color: ${percent > 100 ? '#ef4444' : 'var(--primary-fixed-dim)'}">
            ${Math.round(percent)}% Budget
          </span>
        </div>
        
        <div class="budget-progress-container" style="margin: 1rem 0;">
          <div class="budget-progress-bar ${percent > 90 ? 'is-critical' : ''}" style="width: ${percent}%"></div>
        </div>

        <div style="display: flex; justify-content: space-between; margin-bottom: 1.5rem;">
          <div class="history-details">
            <span class="history-meta">Total Spent</span>
            <span class="history-amount" style="font-size: 1.25rem;">${currencySymbols[config.destCurrency]}${totalSpent.toFixed(2)}</span>
          </div>
          <div class="history-details align-right">
            <span class="history-meta">Trip Budget</span>
            <span class="history-amount" style="font-size: 1.25rem;">${currencySymbols[config.destCurrency]}${budget.toFixed(2)}</span>
          </div>
        </div>

        <div class="archive-stats-grid">
          ${catHtml}
        </div>
      </div>
    `;
  }).join('');
}

function renderTripLog() {
  const logContainer = document.getElementById("tripLogContainer");
  if (!logContainer) return;

  const config = JSON.parse(localStorage.getItem("trip_config"));

  if (!config) {
    const dashboard = document.getElementById("tripDashboard");
    if (dashboard) dashboard.classList.add("hidden");
    logContainer.innerHTML = `
      <div class="glass-card empty-state">
        <p style="text-align: center; color: var(--white-60);">No trip configured.<br>Setup your journey to start tracking!</p>
        <button class="primary-action-btn" onclick="toggleTripSetup()" style="margin-top: 1.5rem; padding: 1rem;">
          Configure Trip
        </button>
      </div>`;
    return;
  }

  const tripDates = [];
  const start = new Date(config.startDate);
  const end = new Date(config.endDate);
  let iterDate = new Date(start);

  while (iterDate <= end) {
    tripDates.push(new Date(iterDate).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }));
    iterDate.setDate(iterDate.getDate() + 1);
  }

  if (!hasInitializedCollapsedState) {
    const todayStr = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    tripDates.forEach(dateStr => {
      if (dateStr !== todayStr) collapsedDates.add(dateStr);
    });
    hasInitializedCollapsedState = true;
  }

  const groupedData = groupTripLogByDate();
  let overallTotalSpent = 0;

  logContainer.innerHTML = tripDates.map(date => {
    const day = groupedData[date] || { items: [], fromTotals: {}, toTotals: {} };
    
    const fromTotalsHtml = Object.entries(day.fromTotals).map(([cur, total]) => 
      `<span>${currencySymbols[cur] || ''}${total.toFixed(2)}</span>`
    ).join(' | ');

    const toTotalsHtml = Object.entries(day.toTotals).map(([cur, total]) => 
      `<span>${currencySymbols[cur] || ''}${total.toFixed(2)}</span>`
    ).join(' | ');

    const dayTotal = Object.values(day.toTotals).reduce((a, b) => a + b, 0);
    overallTotalSpent += dayTotal;

    const symbol = currencySymbols[config.destCurrency] || '';
    const dailyLimit = config.dailyBudget;
    const isOverDaily = dailyLimit > 0 && dayTotal > dailyLimit;
    const remaining = dailyLimit - dayTotal;

    const dayPercent = dailyLimit > 0 ? Math.min(100, (dayTotal / dailyLimit) * 100) : 0;
    let progressBarClass = '';
    if (dayPercent > 90) {
      progressBarClass = 'is-critical';
    } else if (dayPercent > 70) {
      progressBarClass = 'is-warning';
    }

    const itemsHtml = day.items.map(item => `
      <div class="swipe-action-wrapper">
        <div class="swipe-background-label">
          <span class="material-symbols-outlined" style="font-size: 18px;">delete</span>
          <span>DELETE</span>
        </div>
        <div class="history-item log-item" data-id="${item.id}">
          <span class="material-symbols-outlined log-item-icon">
            ${categoryIcons[item.category] || 'payments'}
          </span>
          <div class="history-details">
            <span class="history-amount">${currencySymbols[item.from] || ''}${item.amount}</span>
          </div>
          <span class="material-symbols-outlined log-item-arrow">arrow_forward</span>
          <div class="history-details align-right">
            <span class="history-amount">${currencySymbols[item.to] || ''}${item.result}</span>
          </div>
          <div class="log-note-container">
          <textarea class="log-note-input" rows="1" placeholder="Add a note..." 
              oninput="this.style.height = 'auto'; this.style.height = this.scrollHeight + 'px'"
              onblur="updateTripLogNote('${item.id}', this.value)" 
              onclick="event.stopPropagation()">${item.note || ''}</textarea>
          </div>
        </div>
      </div>
    `).join('') || `
      <div class="history-item log-item" style="justify-content: center; border: 1px dashed var(--white-10); background: transparent; opacity: 0.5;">
        <span class="history-meta">No expenses logged</span>
      </div>
    `;

    const isCollapsed = collapsedDates.has(date);
    const collapsedClass = isCollapsed ? 'is-collapsed' : '';

    return `
      <div class="day-group-card ${collapsedClass}">
        <div class="day-header-grid" onclick="toggleDayCollapse('${date.replace(/'/g, "\\'")}')">
          <div class="history-details">
            <span class="header-tagline day-date">${date}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            ${dailyLimit > 0 ? `<span class="header-tagline" style="color: ${isOverDaily ? '#ef4444' : 'var(--white-60)'}">${dayTotal.toFixed(0)} / ${dailyLimit.toFixed(0)}</span>` : ''}
            <span class="material-symbols-outlined collapse-icon">expand_less</span>
          </div>
        </div>
        ${dailyLimit > 0 ? `
          <div class="budget-progress-container" style="height: 4px; margin: 0 0.5rem 1rem; width: auto; opacity: 0.9;">
            <div class="budget-progress-bar ${progressBarClass}" style="width: ${dayPercent}%"></div>
          </div>
        ` : ''}
        <div class="day-items-stack">
          ${itemsHtml}
        </div>
        <div class="day-footer-grid">
          <div class="footer-label-row">
            ${dailyLimit > 0 ? `
              <span class="header-tagline" style="font-size: 9px; margin-top: 8px; color: ${isOverDaily ? '#ef4444' : 'var(--primary-fixed-dim)'}">
                ${isOverDaily ? 'EXCEEDED BY' : 'REMAINING TODAY'}: ${symbol}${Math.abs(remaining).toFixed(2)}
              </span>
            ` : `
              <span class="header-tagline day-total-label">TOTAL SPENT</span>
            `}
          </div>
          <div class="footer-amounts-row">
            <div class="grid-spacer w-20"></div>
            <div class="history-details">
              <div class="history-amount day-total">${fromTotalsHtml}</div>
            </div>
            <div class="grid-spacer w-14"></div>
            <div class="history-details align-right">
          <div class="history-amount day-total spent-amount">${toTotalsHtml}</div>
            </div>
            <div class="grid-spacer w-28"></div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  updateBudgetDashboard(overallTotalSpent);

  logContainer.querySelectorAll('.log-note-input').forEach(textarea => {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  });

  initLogSwipe();
}
function initSheetSwipe(sheetId, closeCallback) {
  const sheet = document.getElementById(sheetId);
  if (!sheet) return;
  const handle = sheet.querySelector('.sheet-handle');
  let startY = 0;
  let currentY = 0;

  handle.addEventListener('touchstart', (e) => {
    startY = e.touches[0].clientY;
    sheet.style.transition = 'none';
  }, { passive: true });

  handle.addEventListener('touchmove', (e) => {
    currentY = e.touches[0].clientY;
    const diff = currentY - startY;
    
    if (diff > 0) {
      sheet.style.transform = `translateY(${diff}px)`;
    }
  }, { passive: true });

  handle.addEventListener('touchend', () => {
    sheet.style.transition = '';
    const diff = currentY - startY;
    sheet.style.transform = '';

    if (diff > 100) {
      closeCallback();
    }
    startY = 0;
    currentY = 0;
  });
}

function initLogSwipe() {
  const items = document.querySelectorAll('.log-item');
  let startX = 0;
  let currentX = 0;
  let isSwiping = false;

  items.forEach(item => {
    item.addEventListener('touchstart', (e) => {
      const bgLabel = item.parentElement.querySelector('.swipe-background-label');
      startX = e.touches[0].clientX;
      currentX = startX;
      isSwiping = true;
      item.style.transition = 'none';
      if (bgLabel) bgLabel.style.transition = 'none';
    }, { passive: true });

    item.addEventListener('touchmove', (e) => {
      if (!isSwiping) return;
      currentX = e.touches[0].clientX;
      const diff = currentX - startX;
      const bgLabel = item.parentElement.querySelector('.swipe-background-label');
      
      const translateX = Math.min(0, Math.max(diff, -item.offsetWidth)); 
      
      item.style.transform = `translateX(${translateX}px)`;
      item.style.opacity = 1 - (Math.abs(translateX) / 200);

      if (bgLabel) {
        if (translateX < 0) {
          bgLabel.style.opacity = '1';
          bgLabel.style.visibility = 'visible';
          bgLabel.style.width = `${Math.abs(translateX) + 0.5}px`;
        } else {
          bgLabel.style.width = '0';
          bgLabel.style.opacity = '0';
        }
      }
    }, { passive: true });

    item.addEventListener('touchend', (e) => {
      isSwiping = false;
      const bgLabel = item.parentElement.querySelector('.swipe-background-label');
      
      item.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
      if (bgLabel) bgLabel.style.transition = 'width 0.3s ease, opacity 0.3s ease';
      
      const diff = currentX - startX;
      const threshold = -item.offsetWidth / 2;

      if (diff < threshold) {
        item.style.transform = 'translateX(-120%)';
        item.style.opacity = '0';
        if (bgLabel) bgLabel.style.width = '100%';
        
        setTimeout(() => {
          const id = item.getAttribute('data-id');
          showDeleteConfirmation(id, item);
        }, 300);
      } else {
        item.style.transform = 'translateX(0)';
        item.style.opacity = '1';
        if (bgLabel) {
          bgLabel.style.width = '0';
          bgLabel.style.opacity = '0';
          setTimeout(() => {
            if (!isSwiping) {
              bgLabel.style.visibility = 'hidden';
            }
          }, 300);
        }
      }
      currentX = 0;
    }, { passive: true });
  });
}

function clearHistory() {
  localStorage.removeItem("conv_history");
  renderHistory();
  showMessage("Conversion history cleared", "info");
}

function exportHistoryAsCsv() {
  const history = JSON.parse(localStorage.getItem("conv_history") || "[]");

  if (history.length === 0) {
    showMessage("No history to export.", "info");
    return;
  }

  const headers = ["Amount", "From Currency", "To Currency", "Converted Amount", "Exchange Rate", "Timestamp"];
  
  const csvRows = history.map(item => {
    return [
      `"${item.amount}"`,
      `"${item.from}"`,
      `"${item.to}"`,
      `"${item.result}"`,
      `"${item.rate}"`,
      `"${new Date(item.timestamp).toISOString()}"`
    ].join(',');
  });

  const csvString = [headers.join(','), ...csvRows].join('\n');

  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', 'conversion_history.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showMessage("Conversion history exported to CSV.", "success");
}

function updateScrollIndicators(el) {
  const up = el.querySelector('.scroll-indicator.up');
  const down = el.querySelector('.scroll-indicator.down');
  if (!up || !down) return;

  const isScrollable = el.scrollHeight > el.clientHeight;
  const atTop = el.scrollTop <= 2;
  const atBottom = Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) < 2;

  up.classList.toggle('hidden', !isScrollable || atTop);
  down.classList.toggle('hidden', !isScrollable || atBottom);
}

function updateCustomSelectUI(inputId) {
  const hiddenInput = document.getElementById(inputId);
  if (!hiddenInput) return;
  const trigger = document.getElementById(inputId.replace('Currency', 'Trigger'));
  if (!trigger) return;
  const flagImg = trigger.querySelector('.select-flag'), codeSpan = trigger.querySelector('.selected-code');
  if (currencyFlags[hiddenInput.value]) flagImg.src = `https://flagcdn.com/w40/${currencyFlags[hiddenInput.value]}.png`;
  codeSpan.textContent = hiddenInput.value;
}

function initCustomSelects(configs) {
  configs.forEach(({ wrapperId, hiddenInputId }) => {
    const wrapper = document.getElementById(wrapperId);
    if (!wrapper) return;
    const trigger = wrapper.querySelector('.select-trigger'), optionsList = wrapper.querySelector('.select-options'), hiddenInput = document.getElementById(hiddenInputId);

    trigger.addEventListener('click', e => {
      e.stopPropagation();
      const open = !optionsList.classList.contains('hidden');
      document.querySelectorAll('.select-options').forEach(el => el.classList.add('hidden'));
      if (!open) { optionsList.classList.remove('hidden'); wrapper.closest('.glass-card')?.classList.add('dropdown-open'); updateScrollIndicators(optionsList); }
    });

    optionsList.addEventListener('scroll', () => updateScrollIndicators(optionsList));
    optionsList.querySelectorAll('.option').forEach(opt => {
      opt.addEventListener('click', () => {
        hiddenInput.value = opt.getAttribute('data-value');
        updateCustomSelectUI(hiddenInputId);
        optionsList.classList.add('hidden');
        if (hiddenInputId === 'fromCurrency' || hiddenInputId === 'toCurrency') { convertButton?.classList.add("btn-pulse"); fetchExchangeRate(); }
      });
    });
  });
  document.addEventListener('click', () => { document.querySelectorAll('.select-options').forEach(el => el.classList.add('hidden')); document.querySelectorAll('.glass-card').forEach(c => c.classList.remove('dropdown-open')); });
}

function initContactForm() {
  const form = document.getElementById("contactForm");
  form?.addEventListener("submit", async e => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await fetch("/", { method: "POST", body: new URLSearchParams(new FormData(form)).toString() });
      showMessage("Sent!", "success"); form.reset();
    } catch { showMessage("Failed", "error"); } finally { btn.disabled = false; }
  });
}

function initNavigation() {
  setView = view => {
    appContainer.classList.remove("show-log", "show-archive");
    navTabLeft.classList.remove("hidden"); navTabRight.classList.remove("hidden");
    if (view === "log") { appContainer.classList.add("show-log"); navTabLeft.querySelector('.tab-label').textContent = "Converter"; navTabRight.querySelector('.tab-label').textContent = "History"; }
    else { navTabLeft.classList.add("hidden"); navTabRight.querySelector('.tab-label').textContent = "Spend Log"; }
  };

  navTabRight.addEventListener("click", () => setView(appContainer.classList.contains("show-log") ? "archive" : "log"));
  navTabLeft.addEventListener("click", () => setView(appContainer.classList.contains("show-archive") ? "log" : "converter"));
  document.getElementById("viewArchiveBtn")?.addEventListener("click", () => setView("archive"));
}

document.addEventListener("DOMContentLoaded", () => {
  initCustomSelects([
    { wrapperId: 'fromSelectWrapper', hiddenInputId: 'fromCurrency' },
    { wrapperId: 'toSelectWrapper', hiddenInputId: 'toCurrency' },
    { wrapperId: 'setupHomeSelectWrapper', hiddenInputId: 'setupHomeCurrency' },
    { wrapperId: 'setupDestSelectWrapper', hiddenInputId: 'setupDestCurrency' }
  ]);

  const config = JSON.parse(localStorage.getItem("trip_config"));
  if (config) {
    fromCurrencySelect.value = config.destCurrency; toCurrencySelect.value = config.homeCurrency;
    const h = document.getElementById("setupHomeCurrency"), d = document.getElementById("setupDestCurrency");
    if (h) h.value = config.homeCurrency; if (d) d.value = config.destCurrency;
  }
  ['fromCurrency', 'toCurrency', 'setupHomeCurrency', 'setupDestCurrency'].forEach(updateCustomSelectUI);

  initNavigation();
  amountInput?.addEventListener("input", () => { resultDisplay.classList.add("result-pending"); convertButton?.classList.add("btn-pulse"); });
  convertButton?.addEventListener("click", () => convertCurrency(true));
  clearHistoryBtn?.addEventListener("click", clearHistory);
  exportHistoryBtn?.addEventListener("click", exportHistoryAsCsv);
  if (amountInput) fetchExchangeRate();
  renderHistory(); renderTripLog(); renderTripHistory(); checkTripExpiry(); initContactForm();
  initSheetSwipe('confirmSheet', () => closeDeleteConfirmation(false));
  initSheetSwipe('tripActionsSheet', closeTripActions);
  document.getElementById('confirmDeleteBtn').addEventListener('click', () => closeDeleteConfirmation(true));
  document.getElementById('cancelDeleteBtn').addEventListener('click', () => closeDeleteConfirmation(false));
  tripMenuBtn?.addEventListener('click', openTripActions);
  // Add event listeners for budget fields
  document.getElementById('setupTripBudgetHome')?.addEventListener('input', (e) => updateBudgetFields(e.target.id));
  document.getElementById('setupTripBudgetDest')?.addEventListener('input', (e) => updateBudgetFields(e.target.id));
  document.getElementById('setupDailyBudgetHome')?.addEventListener('input', (e) => updateBudgetFields(e.target.id));
  document.getElementById('setupDailyBudgetDest')?.addEventListener('input', (e) => updateBudgetFields(e.target.id));
  // Update budget fields when currencies or dates change
  document.getElementById('setupHomeCurrency')?.addEventListener('change', async () => { updateBudgetCurrencySymbols(); await fetchBudgetExchangeRate(); updateBudgetFields('setupTripBudgetDest'); });
  document.getElementById('setupDestCurrency')?.addEventListener('change', async () => { updateBudgetCurrencySymbols(); await fetchBudgetExchangeRate(); updateBudgetFields('setupTripBudgetDest'); });
  document.getElementById('editTripBtn')?.addEventListener('click', openEditTripForm);

  document.getElementById('deleteTripBtn')?.addEventListener('click', confirmDeleteEntireTrip);
  document.getElementById('finishTripBtn').addEventListener('click', finishTrip);
  document.getElementById('cancelTripActionsBtn').addEventListener('click', closeTripActions);
  document.getElementById('confirmOverlay').addEventListener('click', () => { closeDeleteConfirmation(false); closeTripActions(); });
  
  const setupStart = document.getElementById("setupStartDate"), setupEnd = document.getElementById("setupEndDate");
  setupStart?.addEventListener("change", e => { if(setupEnd) setupEnd.min = e.target.value; updateBudgetFields('setupTripBudgetDest'); }); // Recalculate on date change
  setupEnd?.addEventListener("change", () => updateBudgetFields('setupTripBudgetDest')); // Recalculate on date change
});

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("/service-worker.js"));
