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

// Update popup based on URL when tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    console.log(`[Background] Tab updated (ID: ${tabId}), checking if extension should be enabled`);
    updatePopup(tab);
  }
});

// Update popup when tab is activated
chrome.tabs.onActivated.addListener((activeInfo) => {
  console.log(`[Background] Tab activated (ID: ${activeInfo.tabId}), checking if extension should be enabled`);
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    updatePopup(tab);
  });
});

// Function to update the extension popup based on URL
function updatePopup(tab) {
  // If config hasn't loaded yet, load it
  if (!appConfig) {
    console.log('[Background] No config available, loading before updating popup');
    loadConfig().then(config => {
      if (config) updatePopupWithConfig(tab, config);
    });
    return;
  }
  
  updatePopupWithConfig(tab, appConfig);
}

// Helper function to update popup with config
function updatePopupWithConfig(tab, config) {
  const isAllowed = config.allowedUrl && tab.url && tab.url.includes(config.allowedUrl.trim());
  
  console.log(`[Background] Checking URL match: "${tab.url}" includes "${config.allowedUrl}"? ${isAllowed}`);
  
  // Enable or disable the popup based on URL
  chrome.action.setPopup({
    popup: isAllowed ? 'popup.html' : '',
    tabId: tab.id
  });
  
  console.log(`[Background] Extension ${isAllowed ? 'enabled' : 'disabled'} for tab ${tab.id}`);
}

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
