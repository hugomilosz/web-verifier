// Create menu on install
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "verify-selection",
        title: "🕵️ Verify claim",
        contexts: ["selection"]
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "verify-selection") {
        
        chrome.tabs.sendMessage(tab.id, { action: "showGlobalLoader" });

        // Ask content.js for the page context
        chrome.tabs.sendMessage(tab.id, { action: "getContext" }, (response) => {
            if (chrome.runtime.lastError) {
                // Handle error if content script isn't ready
                console.error(chrome.runtime.lastError.message);
                chrome.tabs.sendMessage(tab.id, { action: "showError", error: "Could not get page context. Try reloading." });
                return;
            }

            const pageContext = response.context;
            const selectedText = info.selectionText;

            // Call the server
            console.log("BG: Got context, sending to server...");
            fetch("http://127.0.0.1:8000/verify_with_context", {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    claim_text: selectedText,
                    page_context: pageContext
                })
            })
            .then(response => response.json())
            .then(data => {
                // Send final results back to the content script
                console.log("BG: Got response, showing results:", data);
                chrome.tabs.sendMessage(tab.id, { action: "showResults", data: data });
            })
            .catch(error => {
                console.error("BG Error:", error);
                chrome.tabs.sendMessage(tab.id, { action: "showError", error: error.message });
            });
        });
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "verifyText") {
        console.log("BG: Received verifyText, sending to server...");
        fetch("http://127.0.0.1:8000/verify", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: request.text })
        })
        .then(response => response.json())
        .then(data => {
            console.log("BG: Got response:", data);
            sendResponse({ success: true, data: data }); // Send data back to content.js
        })
        .catch(error => {
            console.error("BG Error:", error);
            sendResponse({ success: false, error: error.message });
        });
        return true;
    }
});