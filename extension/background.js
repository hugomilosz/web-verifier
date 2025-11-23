// Add 1 hour cache
const apiCache = new Map();
const CACHE_TTL_MS = 1000 * 60 * 60;

// Call the verification API
async function callVerificationAPI(endpoint, body) {
    const cacheKey = `${endpoint}:${JSON.stringify(body)}`;

    // Check cache
    if (apiCache.has(cacheKey)) {
        const cachedItem = apiCache.get(cacheKey);
        if (Date.now() - cachedItem.timestamp < CACHE_TTL_MS) {
            console.log("Returning cached result");
            return cachedItem.data;
        } else {
            apiCache.delete(cacheKey);
        }
    }

    try {
        const response = await fetch(`http://127.0.0.1:8000${endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            throw new Error(
                `Server error: ${response.status} ${response.statusText}`
            );
        }

        const data = await response.json();
        const result = { success: true, data: data };

        // Store in cache
        apiCache.set(cacheKey, { timestamp: Date.now(), data: result });
        return result;
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
        contexts: ["selection"],
    });
});

// Listener for context menu click
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "verify-selection") {
        chrome.tabs.sendMessage(tab.id, {
            action: "showGlobalLoader",
            message: "Verifying selection...",
        });

        // Get page context
        chrome.tabs.sendMessage(
            tab.id,
            { action: "getContext" },
            async (response) => {
                if (chrome.runtime.lastError) {
                    chrome.tabs.sendMessage(tab.id, {
                        action: "showError",
                        error: "Could not get page context. Try reloading.",
                    });
                    return;
                }

                (async () => {
                    const storage = await chrome.storage.sync.get("badDomains");
                    const userBadDomains = storage.badDomains || [];

                    const apiResponse = await callVerificationAPI(
                        "/verify_with_context",
                        {
                            claim_text: info.selectionText,
                            page_context: contextResponse.context,
                            user_bad_domains: userBadDomains,
                        }
                    );

                    if (apiResponse.success) {
                        chrome.tabs.sendMessage(tab.id, {
                            action: "showResults",
                            data: apiResponse.data,
                        });
                    } else {
                        chrome.tabs.sendMessage(tab.id, {
                            action: "showError",
                            error: apiResponse.error,
                        });
                    }
                })();
            }
        );
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Listener for Verify AI Overview button
    if (request.action === "verifyText") {
        (async () => {
            const storage = await chrome.storage.sync.get("badDomains");
            const userBadDomains = storage.badDomains || [];

            const response = await callVerificationAPI("/verify", {
                text: request.text,
                user_bad_domains: userBadDomains,
            });
            sendResponse(response);
        })();
        return true;
    }

    // Listener for tooltip
    if (request.action === "verifyTextWithContext") {
        (async () => {
            const storage = await chrome.storage.sync.get("badDomains");
            const userBadDomains = storage.badDomains || [];

            const response = await callVerificationAPI("/verify_with_context", {
                claim_text: request.claim,
                page_context: request.context,
                user_bad_domains: userBadDomains,
            });
            sendResponse(response);
        })();
        return true;
    }
});
