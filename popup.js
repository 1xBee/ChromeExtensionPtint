// Load configuration from config.json
function loadConfig() {
  console.log('[Popup] Loading configuration from config.json');
  return fetch(chrome.runtime.getURL('config.json'))
    .then(response => response.json())
    .catch(error => {
      console.error('[Popup] Error loading configuration:', error);
      return {};
    });
}

document.getElementById('printAll').addEventListener('click', async () => {
  console.log('[Popup] Print All button clicked');
  const printButton = document.getElementById('printAll');
  const statusElement = document.getElementById('status');

  printButton.disabled = true;
  printButton.innerHTML = '<span class="spinner"></span> Processing...';
  console.log('[Popup] Button disabled and showing spinner');

  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  console.log('[Popup] Active tab:', tab);

  // Load configuration from config.json
  loadConfig().then(config => {
    console.log('[Popup] URL configuration loaded:', config);

    if (!config.urlPrefix || config.urlPrefix.trim() === '') {
      console.error('[Popup] URL prefix not configured in config.json');
      statusElement.textContent = "Error: URL prefix not configured in config.json.";
      printButton.disabled = false;
      printButton.textContent = "Print All Deliveries";
      return;
    }

    const urlConfig = {
      urlPrefix: config.urlPrefix,
      urlSuffix: config.urlSuffix || ''
    };

    console.log('[Popup] Executing bulkPrintDeliveries with config:', urlConfig);

    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: bulkPrintDeliveries,
      args: [urlConfig]
    }, (results) => {
      console.log('[Popup] bulkPrintDeliveries executed, results:', results);
      printButton.disabled = false;
      printButton.textContent = "Print All Deliveries";
      
      if (results && results[0] && results[0].result) {
        console.log(`[Popup] Found ${results[0].result} deliveries`);
        statusElement.textContent = `Found ${results[0].result} deliveries.`;
      } else {
        console.log('[Popup] No delivery links found');
        statusElement.textContent = "No delivery links found.";
      }
    });
  });
});

function bulkPrintDeliveries(urlConfig) {
  console.log('[Content Script from Popup] Looking for delivery links on the page');
  const deliveryLinks = document.querySelectorAll('.rt-table a');
  
  console.log(`[Content Script from Popup] Found ${deliveryLinks.length} total links`);
  
  if (deliveryLinks.length === 0) {
    console.log('[Content Script from Popup] No links found, returning 0');
    return 0;
  }

  const validLinks = Array.from(deliveryLinks).filter(link => {
    const deliveryUrl = link.getAttribute('href');
    const regex = /\/Deliveries\/Edit\/\d+/;
    const isValid = regex.test(deliveryUrl);
    console.log(`[Content Script from Popup] Checking link: ${deliveryUrl} - Valid: ${isValid}`);
    return isValid;
  });

  console.log(`[Content Script from Popup] Found ${validLinks.length} valid delivery links`);
  
  if (validLinks.length === 0) {
    console.log('[Content Script from Popup] No valid links found, returning 0');
    return 0;
  }

  // Prepare all URLs at once
  const printUrls = validLinks.map(link => {
    const deliveryUrl = link.getAttribute('href');
    const deliveryId = deliveryUrl.split('/').pop();
    const printUrl = `${urlConfig.urlPrefix}${deliveryId}${urlConfig.urlSuffix}`;
    console.log(`[Content Script from Popup] Created print URL: ${printUrl} for delivery ID: ${deliveryId}`);
    return printUrl;
  });

  // Send all URLs to background script to open simultaneously
  console.log(`[Content Script from Popup] Sending message to open ${printUrls.length} tabs`);
  chrome.runtime.sendMessage({ 
    action: 'openAllTabs', 
    urls: printUrls 
  });

  return validLinks.length;
}