// Call the verification API
async function callVerificationAPI(endpoint, body) {
    try {
        const response = await fetch(`http://127.0.0.1:8000${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return { success: true, data: data };

    } catch (error) {
        console.error("BG API Error:", error);
        return { success: false, error: error.message };
    }
}

// Create menu on install
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "verify-selection",
        title: "🕵️ Verify selection",
        contexts: ["selection"]
    });
});

// Listener for context menu click
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "verify-selection") {
        
        // Show the loader
        chrome.tabs.sendMessage(tab.id, { 
            action: "showGlobalLoader", 
            message: "Verifying selection..." 
        });

        // Get page context
        chrome.tabs.sendMessage(tab.id, { action: "getContext" }, async (response) => {
            if (chrome.runtime.lastError) {
                chrome.tabs.sendMessage(tab.id, { 
                    action: "showError", 
                    error: "Could not get page context. Try reloading." 
                });
                return;
            }

            const apiResponse = await callVerificationAPI("/verify_with_context", {
                claim_text: info.selectionText,
                page_context: response.context
            });

            // Send results back to the content.js
            if (apiResponse.success) {
                chrome.tabs.sendMessage(tab.id, { action: "showResults", data: apiResponse.data });
            } else {
                chrome.tabs.sendMessage(tab.id, { action: "showError", error: apiResponse.error });
            }
        });
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    // Listener for Verify AI Overview button
    if (request.action === "verifyText") {
        callVerificationAPI("/verify", { text: request.text })
            .then(response => sendResponse(response));
        
        return true; 
    }

    // Listener for tooltip
    if (request.action === "verifyTextWithContext") {
        callVerificationAPI("/verify_with_context", {
            claim_text: request.claim,
            page_context: request.context
        })
        .then(response => sendResponse(response));
        
        return true;
    }
});