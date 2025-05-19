// Global config variable
let appConfig = null;

// Load configuration from config.json
function loadConfig() {
  console.log('[Background] Loading configuration from config.json');
  return fetch(chrome.runtime.getURL('config.json'))
    .then(response => response.json())
    .then(config => {
      appConfig = config;
      console.log('[Background] Configuration loaded successfully:', config);
      return config;
    })
    .catch(error => {
      console.error('[Background] Error loading configuration:', error);
      return null;
    });
}

// Load configuration on installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Background] Extension installed/updated, loading configuration');
  loadConfig();
});

// Also load config when background script starts
loadConfig();

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Background] Message received:', request);
  if (request.action === 'openAllTabs') {
    console.log(`[Background] Opening ${request.urls.length} tabs for printing`);
    // Open all tabs in the current window
    openTabsSimultaneously(request.urls);
  }
});

// Function to open all tabs simultaneously in the current window without grouping
function openTabsSimultaneously(urls) {
  if (!urls || urls.length === 0) {
    console.log('[Background] No URLs provided to open');
    return;
  }
  
  console.log(`[Background] Opening ${urls.length} tabs simultaneously`);
  
  // Get the current window ID
  chrome.windows.getCurrent((currentWindow) => {
    console.log(`[Background] Got current window ID: ${currentWindow.id}`);
    // Create all tabs in the current window
    urls.forEach((url, index) => {
      console.log(`[Background] Creating tab ${index + 1}/${urls.length}: ${url}`);
      chrome.tabs.create({
        windowId: currentWindow.id,
        url: url,
        active: false  // Don't activate these tabs
      });
    });
    console.log('[Background] All tabs created');
  });
}
