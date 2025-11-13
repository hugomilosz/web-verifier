console.log("AI Verifier: Content script active.");

let globalResultBox = null;

// Creates the global result box if it doesn't exist
function createGlobalResultBox() {
    if (!globalResultBox) {
        globalResultBox = document.createElement("div");
        globalResultBox.className = "verifier-result-box fixed";
        (document.body || document.documentElement).appendChild(globalResultBox);
    }
    globalResultBox.style.display = "block";
}

// Adds close button to the given box
function addCloseButton(box) {
    const close = document.createElement("div");
    close.innerHTML = "✕";
    close.className = "verifier-close-btn";
    close.onclick = () => {
        box.style.display = "none";
    };
    box.appendChild(close);
}

// Renders the verification results into a container
function renderResults(data, container) {
    if (!data.claims || data.claims.length === 0) {
        container.innerHTML = `
            <div class="verifier-empty">
                <p>🕵️ No verifiable claims detected in this text.</p>
            </div>`;
        return;
    }

    let html = `
        <div class="verifier-header">
            <h3>AI Fact Check Results</h3>
            <p>Found <strong>${data.claims.length}</strong> factual claims</p>
        </div>
        <div class="verifier-claims">`;

    data.claims.forEach(item => {
        let statusClass = "status-unsure";
        let icon = "❓";
        let statusText = "UNSURE";

        if (item.status === "SUPPORTED") {
            statusClass = "status-supported";
            icon = "✅";
            statusText = "SUPPORTED";
        } else if (item.status === "CONTRADICTED") {
            statusClass = "status-disputed";
            icon = "❌";
            statusText = "CONTRADICTED";
        }

        let sources = [];
        if (item.sources && Array.isArray(item.sources)) {
            sources = item.sources.map(s => `<a href="${s.url}" target="_blank">${new URL(s.url).hostname}</a>`);
        } else if (item.source_url) {
            try {
                sources = [`<a href="${item.source_url}" target="_blank">${new URL(item.source_url).hostname}</a>`];
            } catch {
                sources = [item.source_url];
            }
        }

        html += `
            <div class="claim-item ${statusClass}">
                <div class="claim-status">
                    ${icon} ${statusText}
                </div>
                <div class="claim-text">${item.claim}</div>
                
                ${item.evidence ? `
                <div class="claim-evidence">${item.evidence}</div>` : ''}
                
                ${sources.length > 0 ? `
                <div class="claim-sources">
                    Sources: ${sources.join(' • ')}
                </div>` : ''}
            </div>`;
    });

    html += `</div>`;
    container.innerHTML = html;
}

// Show spinner
function showGlobalLoading(message) {
    createGlobalResultBox();
    globalResultBox.innerHTML = `
        <div class="verifier-loading">
            <span class="spinner"></span>
            <p>${message || "Verifying..."}</p>
        </div>`;
}

function showGlobalError(error) {
    createGlobalResultBox();
    globalResultBox.innerHTML = `<div class="verifier-error">⚠️ ${error || "Unknown error."}</div>`;
    addCloseButton(globalResultBox);
}

// Display results in the box
function showGlobalResults(data) {
    createGlobalResultBox();
    renderResults(data, globalResultBox);
    addCloseButton(globalResultBox);

    const claimsDiv = globalResultBox.querySelector('.verifier-claims');
    if (claimsDiv) {
        claimsDiv.style.maxHeight = "400px";
        claimsDiv.style.overflowY = "auto";
    }
}

// Listens for background.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
        case "getContext":
            const fullPageContext = document.body.innerText.substring(0, 15000);
            sendResponse({ context: fullPageContext });
            break;
        
        case "showGlobalLoader":
            showGlobalLoading(request.message);
            break;

        case "showResults":
            showGlobalResults(request.data);
            break;

        case "showError":
            showGlobalError(request.error);
            break;
    }
    if (request.action === "getContext") {
        return true;
    }
});

// FLOW 1: AI Overview Verification
function findAIOverview() {
    const specificClasses = ['.generative-guide', '.M8OgIe', '.wTY5xe'];
    for (let selector of specificClasses) {
        let el = document.querySelector(selector);
        if (el) return el;
    }
    const allElements = document.querySelectorAll('h1, h2, h3, h4, div, span');
    for (const el of allElements) {
        if (el.innerText && el.innerText.trim() === "AI Overview") {
            return el.closest('div')?.parentElement || el.parentElement;
        }
    }
    return null;
}

// Create inline result box
function injectVerifier() {
    const overview = findAIOverview();
    if (overview && !overview.querySelector('.verifier-btn')) {
        console.log("AI Verifier: Container found. Injecting button.");
        
        const btn = document.createElement("button");
        btn.className = "verifier-btn";
        btn.innerHTML = '<span>🕵️</span> Verify with Trusted Sources';
        
        // 1. Create the INLINE result box
        const resultBox = document.createElement("div");
        resultBox.className = "verifier-result-box";
        resultBox.classList.add("verifier-hidden");

        btn.addEventListener('click', async () => {
            const textToVerify = overview.innerText;
            btn.disabled = true;
            btn.classList.add("verifier-btn-loading");
            btn.innerHTML = '<span class="spinner"></span> Analysing text...';
            
            resultBox.classList.remove("verifier-hidden");
            resultBox.innerHTML = `
                <div class="verifier-loading">
                    <span class="spinner"></span>
                    <p>Extracting factual claims and verifying...</p>
                </div>`;

            chrome.runtime.sendMessage(
                { action: "verifyText", text: textToVerify },
                (response) => {
                    btn.disabled = false;
                    btn.classList.remove("verifier-btn-loading");
                    btn.innerHTML = '<span>🕵️</span> Verify Again';

                    if (chrome.runtime.lastError) {
                        resultBox.innerHTML = `<div class="verifier-error">⚠️ ${chrome.runtime.lastError.message}</div>`;
                        return;
                    }
                    if (response && response.success) {
                        renderResults(response.data, resultBox);
                    } else {
                        resultBox.innerHTML = `<div class="verifier-error">⚠️ ${response.error || "Unknown error."}</div>`;
                    }
                }
            );
        });

        overview.insertBefore(btn, overview.firstChild);
        overview.appendChild(resultBox);
    }
}

// MutationObserver to watch for dynamic content
const mutationCallback = (mutationsList, observer) => {
    for (const mutation of mutationsList) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            // Check if "AI Overview" is now present
            injectVerifier();
        }
    }
};

const observer = new MutationObserver(mutationCallback);
observer.observe(document.body, { childList: true, subtree: true });

// Run it once on initial load, just in case
injectVerifier();


// FLOW 2: Selected Text Verification
let tooltipWrapper = null;
let lastSelectionText = '';

function removeTooltip() {
  if (tooltipWrapper) {
    tooltipWrapper.classList.add('fade-out');
    setTimeout(() => tooltipWrapper?.remove(), 150);
    tooltipWrapper = null;
  }
}

document.addEventListener('mouseup', (evt) => {
  const selectedText = window.getSelection().toString().trim();

  if (!selectedText || selectedText.length < 5) {
    removeTooltip();
    return;
  }
  if (tooltipWrapper && tooltipWrapper.contains(evt.target)) {
    return;
  }

  document.querySelectorAll('.verifier-tooltip').forEach(t => t.remove());
  tooltipWrapper = null;
  lastSelectionText = selectedText;

  const range = window.getSelection().getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (!rect || !rect.top) return;

  tooltipWrapper = document.createElement('div');
  tooltipWrapper.className = 'verifier-tooltip fade-in';
  tooltipWrapper.innerHTML = `
    <div class="verifier-bubble">
      <button class="verifier-bubble-btn" type="button">
        <span class="icon">🕵️</span> Verify this
      </button>
    </div>
  `;
  document.body.appendChild(tooltipWrapper);

  const tooltipWidth = 160;
  const left = Math.min(
    rect.left + window.scrollX + rect.width / 2 - tooltipWidth / 2,
    window.innerWidth - tooltipWidth - 10
  );
  tooltipWrapper.style.top = `${rect.top + window.scrollY - 50}px`;
  tooltipWrapper.style.left = `${Math.max(10, left)}px`;

  const verifyBtn = tooltipWrapper.querySelector('.verifier-bubble-btn');
  verifyBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    e.preventDefault();

    verifyBtn.disabled = true;
    verifyBtn.innerHTML = `<span class="spinner"></span> Verifying...`;

    showGlobalLoading("Verifying highlighted text...");

    const pageContext = document.body.innerText.substring(0, 15000);
    const claimText = lastSelectionText;

    // Send claim and context to background.js
    chrome.runtime.sendMessage(
        { action: "verifyTextWithContext", claim: claimText, context: pageContext },
        (response) => {
            if (chrome.runtime.lastError) {
                showGlobalError(chrome.runtime.lastError.message);
                return;
            } else if (response && response.success) {
                showGlobalResults(response.data);
            } else {
                showGlobalError(response.error || "Verification failed.");
            }

            // Remove tooltip
            verifyBtn.disabled = false;
            verifyBtn.innerHTML = `<span class="icon">🕵️</span> Verify this`;
            removeTooltip();
        }
    );
  });
});

document.addEventListener('mousedown', (e) => {
  if (tooltipWrapper && !tooltipWrapper.contains(e.target)) removeTooltip();
});
document.addEventListener('scroll', removeTooltip);