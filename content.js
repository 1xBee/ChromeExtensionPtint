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

// Function to add the print button - only called once
function addPrintButton() {
  console.log("[Content] Attempting to add print button to page");
  
  // Use the already loaded config or load it if not yet available
  (appConfig ? Promise.resolve(appConfig) : loadConfig()).then(config => {
    if (config.allowedUrl && config.allowedUrl.trim() !== '') {
      // Improved URL matching logic
      const isMatch = isUrlMatch(window.location.href, config.allowedUrl.trim());
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
          
          // Create the print button
          const printButton = document.createElement('button');
          printButton.type = 'button';
          printButton.className = 'btn btn-dark bulk-print-btn';
          printButton.style.marginLeft = '4px';
          printButton.textContent = 'Print';
          
          // Append the button after the "Deliver" button
          targetContainer.appendChild(printButton);
          console.log("[Content] Print button successfully added to the page");
          
          // Add click event listener
          printButton.addEventListener('click', () => {
            console.log("[Content] Print button clicked");
            // Use the global config directly - no need to reload
            if (!appConfig.urlPrefix || appConfig.urlPrefix.trim() === '') {
              console.error("[Content] Error: URL prefix not configured in config.json");
              alert('Error: URL prefix not configured in config.json.');
              return;
            }
            
            console.log("[Content] Calling bulkPrintDeliveries with config:", appConfig);
            bulkPrintDeliveries({
              urlPrefix: appConfig.urlPrefix,
              urlSuffix: appConfig.urlSuffix || ''
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

// Exact URL matching function
function isUrlMatch(currentUrl, configUrl) {
  try {
    // Parse the URLs to get their components
    const currentUrlObj = new URL(currentUrl);
    
    // If configUrl is not a full URL, assume it's just a path
    let configUrlObj;
    try {
      configUrlObj = new URL(configUrl.startsWith('http') ? configUrl : `https://example.com${configUrl.startsWith('/') ? '' : '/'}${configUrl}`);
    } catch (e) {
      // If configUrl is not a valid URL, treat it as a path match
      return currentUrlObj.pathname === configUrl;
    }
    
    // Check if hostname matches
    if (currentUrlObj.hostname !== configUrlObj.hostname) {
      return false;
    }
    
    // Check if pathname matches exactly
    // Normalize paths by removing trailing slashes for comparison
    const configPath = configUrlObj.pathname.endsWith('/') ? 
      configUrlObj.pathname.slice(0, -1) : configUrlObj.pathname;
    
    const currentPath = currentUrlObj.pathname.endsWith('/') ?
      currentUrlObj.pathname.slice(0, -1) : currentUrlObj.pathname;
    
    // We only want exact matches - no additional path segments allowed
    return currentPath === configPath;
    
  } catch (error) {
    console.error("[Content] Error in URL matching:", error);
    // Fall back to exact string comparison for pathname
    try {
      const urlObj = new URL(currentUrl);
      return urlObj.pathname === configUrl;
    } catch (e) {
      return false;
    }
  }
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
    return printUrl;
  });

  // Send all URLs to background script to open simultaneously
  console.log(`[Content] Sending message to open ${printUrls.length} tabs`);
  chrome.runtime.sendMessage({ 
    action: 'openAllTabs', 
    urls: printUrls 
  });

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
