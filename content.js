// Global config variable that will be loaded once
let appConfig = null;

console.log("[Content] Bulk Print Extension loaded");

// Load configuration from config.json - only done once
function loadConfig() {
  // If we already have the config, return it as a resolved promise
  if (appConfig !== null) {
    console.log("[Content] Using cached configuration");
    return Promise.resolve(appConfig);
  }
  
  console.log("[Content] Loading configuration from config.json");
  return fetch(chrome.runtime.getURL('config.json'))
    .then(response => response.json())
    .then(config => {
      // Store config globally
      appConfig = config;
      console.log("[Content] Configuration loaded successfully:", config);
      return config;
    })
    .catch(error => {
      console.error("[Content] Error loading configuration:", error);
      return {};
    });
}

// Load config immediately when script runs
loadConfig();

// Function to add the print button with dropdown - only called once
function addPrintButton() {
  console.log("[Content] Attempting to add print button to page");
  
  // Use the already loaded config or load it if not yet available
  (appConfig ? Promise.resolve(appConfig) : loadConfig()).then(config => {
    if (config.allowedUrl && config.allowedUrl.trim() !== '') {
      // URL matching logic - match exact base path with optional query parameters
      const matchUrl = (currentUrl, configUrl) => {
        try {
          const current = new URL(currentUrl);
          const config = new URL(configUrl);
          
          // Check if hostnames match
          if (current.hostname !== config.hostname) {
            return false;
          }
          
          // Check if the pathname matches exactly (normalize by removing trailing slashes)
          const currentPath = current.pathname.endsWith('/') ? 
            current.pathname.slice(0, -1) : current.pathname;
          const configPath = config.pathname.endsWith('/') ? 
            config.pathname.slice(0, -1) : config.pathname;
          
          return currentPath === configPath;
        } catch (error) {
          console.error("[Content] Error in URL matching:", error);
          return false;
        }
      };

      const isMatch = matchUrl(window.location.href, config.allowedUrl.trim());
      console.log(`[Content] URL match check: "${window.location.href}" against "${config.allowedUrl.trim()}"? ${isMatch}`);
      
      if (isMatch) {
        console.log("[Content] URL match found, attempting to add print button");
        
        // Look for the target container where we'll add our button
        const targetContainer = document.querySelector('div.col p.float-right');
        if (targetContainer) {
          console.log("[Content] Target container found");
          
          // Check if button already exists to avoid duplicates
          const existingButton = targetContainer.querySelector('button.bulk-print-btn');
          if (existingButton) {
            console.log("[Content] Print button already exists, skipping");
            return;
          }
          
          // Create a container for the print button and dropdown
          const printButtonGroup = document.createElement('span');
          printButtonGroup.className = 'bulk-print-group';
          printButtonGroup.style.marginLeft = '4px';
          printButtonGroup.style.display = 'inline-flex';
          
          // Create the print mode dropdown
          const printModeSelect = document.createElement('select');
          printModeSelect.className = 'bulk-print-mode form-control';
          printModeSelect.style.marginRight = '4px';
          printModeSelect.style.height = '100%';
          printModeSelect.style.padding = '0 8px';
          printModeSelect.style.borderRadius = '4px 0 0 4px';
          
          // Add options to the dropdown
          const individualOption = document.createElement('option');
          individualOption.value = 'individual';
          individualOption.textContent = 'Individual';
          individualOption.selected = true;
          
          const mergeOption = document.createElement('option');
          mergeOption.value = 'merge';
          mergeOption.textContent = 'Merge';
          
          printModeSelect.appendChild(individualOption);
          printModeSelect.appendChild(mergeOption);
          
          // Create the print button
          const printButton = document.createElement('button');
          printButton.type = 'button';
          printButton.className = 'btn btn-dark bulk-print-btn';
          printButton.textContent = 'Print';
          
          // Add elements to the container
          printButtonGroup.appendChild(printModeSelect);
          printButtonGroup.appendChild(printButton);
          
          // Append the button group after the "Deliver" button
          targetContainer.appendChild(printButtonGroup);
          console.log("[Content] Print button with dropdown successfully added to the page");
          
          // Add click event listener
          printButton.addEventListener('click', () => {
            console.log("[Content] Print button clicked");
            // Use the global config directly - no need to reload
            if (!appConfig.urlPrefix || appConfig.urlPrefix.trim() === '') {
              console.error("[Content] Error: URL prefix not configured in config.json");
              alert('Error: URL prefix not configured in config.json.');
              return;
            }
            
            // Get the selected print mode
            const printMode = printModeSelect.value;
            console.log(`[Content] Selected print mode: ${printMode}`);
            
            console.log("[Content] Calling bulkPrintDeliveries with config:", appConfig);
            bulkPrintDeliveries({
              urlPrefix: appConfig.urlPrefix,
              urlSuffix: appConfig.urlSuffix || '',
              mode: printMode
            });
          });
        } else {
          console.log("[Content] Target container not found, cannot add button");
        }
      } else {
        console.log("[Content] Current URL does not match allowed URL pattern");
      }
    } else {
      console.log("[Content] No allowed URL configured, skipping button addition");
    }
  });
}

// Only try to add the button once the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log("[Content] DOMContentLoaded event fired, adding print button");
  addPrintButton();
});

// As a fallback, also try after a short delay in case DOMContentLoaded already fired
setTimeout(() => {
  console.log("[Content] Timeout callback executing, trying to add print button");
  addPrintButton();
}, 1000);

function bulkPrintDeliveries(urlConfig) {
  console.log("[Content] bulkPrintDeliveries function called");
  const deliveryLinks = document.querySelectorAll('.rt-table a');
  console.log(`[Content] Found ${deliveryLinks.length} total links on the page`);
  
  // Create status element for user feedback
  const statusElement = document.createElement('div');
  statusElement.style.position = 'fixed';
  statusElement.style.top = '10px';
  statusElement.style.right = '10px';
  statusElement.style.padding = '10px';
  statusElement.style.backgroundColor = '#4285f4';
  statusElement.style.color = 'white';
  statusElement.style.borderRadius = '4px';
  statusElement.style.zIndex = '9999';
  statusElement.style.transition = 'opacity 1s ease-out';
  document.body.appendChild(statusElement);
  console.log("[Content] Status notification element created and added to page");

  if (deliveryLinks.length === 0) {
    console.log("[Content] No delivery links found");
    statusElement.textContent = 'No delivery links found';
    
    // Add fade out effect
    setTimeout(() => {
      console.log("[Content] Starting fade out of status notification");
      statusElement.style.opacity = '0';
      setTimeout(() => {
        statusElement.remove();
        console.log("[Content] Status notification removed from DOM");
      }, 1000); // Remove after fade completes
    }, 3000); // Start fading after 3 seconds
    
    return;
  }

  statusElement.textContent = `Found ${deliveryLinks.length} deliveries. Processing...`;
  console.log(`[Content] Status updated: Found ${deliveryLinks.length} deliveries`);

  const validLinks = Array.from(deliveryLinks).filter(link => {
    const deliveryUrl = link.getAttribute('href');
    const regex = /\/Deliveries\/Edit\/\d+/;
    const isValid = regex.test(deliveryUrl);
    console.log(`[Content] Checking link: ${deliveryUrl} - Valid: ${isValid}`);
    return isValid;
  });

  console.log(`[Content] Filtered to ${validLinks.length} valid delivery links`);

  if (validLinks.length === 0) {
    console.log("[Content] No valid delivery links found after filtering");
    statusElement.textContent = 'No valid delivery links found';
    
    // Add fade out effect
    setTimeout(() => {
      console.log("[Content] Starting fade out of status notification");
      statusElement.style.opacity = '0';
      setTimeout(() => {
        statusElement.remove();
        console.log("[Content] Status notification removed from DOM");
      }, 1000); // Remove after fade completes
    }, 3000); // Start fading after 3 seconds
    
    return;
  }

  // Prepare all URLs at once
  const printUrls = validLinks.map(link => {
    const deliveryUrl = link.getAttribute('href');
    const deliveryId = deliveryUrl.split('/').pop();
    const printUrl = `${urlConfig.urlPrefix}${deliveryId}${urlConfig.urlSuffix}`;
    console.log(`[Content] Created print URL: ${printUrl} for delivery ID: ${deliveryId}`);
    return { id: deliveryId, url: printUrl };
  });

  // Handle printing based on selected mode
  if (urlConfig.mode === 'individual') {
    // Original behavior - open multiple tabs
    console.log(`[Content] Using individual mode, sending message to open ${printUrls.length} tabs`);
    chrome.runtime.sendMessage({ 
      action: 'openAllTabs', 
      urls: printUrls.map(item => item.url)
    });
  } else if (urlConfig.mode === 'merge') {
    // New behavior - open single tab with multiple iframes
    console.log(`[Content] Using merge mode, sending message to create merged view with ${printUrls.length} items`);
    
    // Get base domain to construct the URL for the new tab
    const currentUrl = new URL(window.location.href);
    const baseUrl = `${currentUrl.protocol}//${currentUrl.hostname}`;
    
    chrome.runtime.sendMessage({
      action: 'openMergedTab',
      baseUrl: baseUrl,
      printItems: printUrls
    });
  }

  statusElement.textContent = `Processed ${validLinks.length} deliveries`;
  console.log(`[Content] Processing complete, processed ${validLinks.length} deliveries`);
  
  // Add fade out effect
  setTimeout(() => {
    console.log("[Content] Starting fade out of status notification");
    statusElement.style.opacity = '0';
    setTimeout(() => {
      statusElement.remove();
      console.log("[Content] Status notification removed from DOM");
    }, 1000); // Remove after fade completes
  }, 3000); // Start fading after 3 seconds
}
