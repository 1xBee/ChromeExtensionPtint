// Global config variable that will be loaded once
let appConfig = null;

// Storage for print data when using merged view
let pendingPrintData = null;

// Load configuration from config.json - only done once
function loadConfig() {
  // If we already have the config, return it as a resolved promise
  if (appConfig !== null) {
    console.log('[Background] Using cached configuration');
    return Promise.resolve(appConfig);
  }
  
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
  
  else if (request.action === 'openMergedTab') {
    console.log(`[Background] Opening merged tab with ${request.printItems.length} items`);
    
    // Store the print data for retrieval by the new tab
    pendingPrintData = {
      items: request.printItems,
      timestamp: Date.now()
    };
    
    // Base URL for the new tab - No longer adding parameters to keep URL clean
    const domain = request.domain;

    // Create a clean URL without query parameters
    chrome.tabs.create({ url: domain }, (tab) => {
      console.log(`[Background] Created merged tab with ID: ${tab.id}`);
      
      // Execute a content script in the new tab after it loads
      chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo, updatedTab) {
        // Only proceed if this is our tab and it's fully loaded
        if (tabId === tab.id && changeInfo.status === 'complete') {
          console.log(`[Background] Merged tab (${tab.id}) fully loaded, injecting content script`);
          
          // Remove this listener since we only need it once
          chrome.tabs.onUpdated.removeListener(listener);
          
          // Execute a script to transform the page
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: setupMergedPrintPage,
          });
        }
      });
    });
  }
  
  else if (request.action === 'getPrintData') {
    console.log('[Background] Print data requested by merged tab');
    // Send the pending print data and then clear it
    sendResponse({ printData: pendingPrintData });
    return true; // Keep the messaging channel open for the async response
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

// This function will be injected into the merged print tab to set up the UI
function setupMergedPrintPage() {
  console.log('[MergedPrint] Setting up merged print page');
  
  // Add page unload warning
  window.addEventListener('beforeunload', (event) => {
    // Show confirmation dialog when user tries to close or reload
    event.preventDefault();
    event.returnValue = 'You have unsaved changes. Are you sure you want to leave this page?';
    return event.returnValue;
  });
  
  // Add a loading indicator
  const loadingDiv = document.createElement('div');
  loadingDiv.innerHTML = '<h1>Preparing print view...</h1><p>Please wait while we load all delivery items.</p>';
  loadingDiv.style.textAlign = 'center';
  loadingDiv.style.margin = '20px';
  loadingDiv.style.fontFamily = 'Arial, sans-serif';
  
  // Save the original body content in case we need to restore it
  const originalContent = document.body.innerHTML;
  
  // Clear the page and show loading message
  document.body.innerHTML = '';
  document.body.appendChild(loadingDiv);
  
  // Request the print data from the background script
  chrome.runtime.sendMessage({ action: 'getPrintData' }, (response) => {
    if (!response || !response.printData || !response.printData.items || response.printData.items.length === 0) {
      console.error('[MergedPrint] No valid print data received');
      loadingDiv.innerHTML = '<h1>Error</h1><p>Failed to load delivery items. Please try again.</p>';
      return;
    }
    
    console.log(`[MergedPrint] Received print data with ${response.printData.items.length} items`);
    const printItems = response.printData.items;
    
    // Create the container for all print frames
    const container = document.createElement('div');
    const iframeContainer = document.createElement('div');
    container.className = 'bulk-print-container';
    iframeContainer.className = 'iframe-container';
    
    // Add header with print instructions
    const header = document.createElement('div');
    header.className = 'bulk-print-header';
    header.innerHTML = `
      <h1>Bulk Print View</h1>
      <p>Total items: ${printItems.length}</p>
      <button id="printNowBtn" class="btn btn-dark">Print Now</button>
    `;
    header.style.margin = '55px';
    header.style.pageBreakAfter = 'always';
    container.appendChild(header);
    
    // Create style element for print styling
    const styleElement = document.createElement('style');
    styleElement.textContent = `
      body {
        margin: 0;
        padding: 0;
        font-family: Arial, sans-serif;
      }
      .print-frame {
        box-sizing: border-box;
        width: calc(50% - 40px);
        height: 11.5in;
        margin: 10px;
        padding: 20px;
        border: 2.5px solid #4e221f;
        page-break-after: always;
      }
      .iframe-container{
        transform: scale(.9);
        transform-origin: top;
      }
      @media print {
        .bulk-print-header {
          display: none;
        }
        .print-frame {
          page-break-after: always;
          width: 100%;
          height: 11.5in;
          margin: none;
          padding: none;
          border: none;
        }
        .iframe-container{
          transform: scale(1);
        }
      }
    `;
    document.head.appendChild(styleElement);
    
    // Create iframes for each delivery
    printItems.forEach((item, index) => {
      console.log(`[MergedPrint] Creating iframe for item ${index+1}/${printItems.length}: ${item.id}`);
      
      // Create the iframe
      const iframe = document.createElement('iframe');
      iframe.className = 'print-frame';
      iframe.src = item.url;
      iframe.title = `Delivery ${item.id}`;
      iframe.setAttribute('data-delivery-id', item.id);
      
      // Add iframe to container
      iframeContainer.appendChild(iframe);
    });
    // Add iframe-container to main container
    container.appendChild(iframeContainer);
    
    // Replace loading with the container
    document.body.innerHTML = '';
    document.body.appendChild(container);
    
    // Add event listener to the print button
    document.getElementById('printNowBtn').addEventListener('click', () => {
      window.print();
    });
    
    console.log('[MergedPrint] Page setup complete');
  });
}
