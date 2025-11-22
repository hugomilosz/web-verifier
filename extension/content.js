console.log("AI Verifier: Content script active.");

let globalResultBox = null;
let loadingInterval = null;

const LOAD_PHRASES = [
    "Searching the archives...",
    "Putting on the reading glasses...",
    "Sipping coffee...",
    "Asking the librarian...",
    "Scanning the microfiche...",
];

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

function getConfidenceColor(score) {
    if (score >= 80) return '#3b82f6';
    if (score >= 50) return '#a855f7';
    return '#9ca3af';
}

function getSourceBadgeHTML(type) {
    let label = "Web Source";
    let className = "badge-unknown";

    switch (type) {
        case 'GOVERNMENT':
            label = "Gov / Official";
            className = "badge-gov";
            break;
        case 'ACADEMIC':
            label = "Academic / Science";
            className = "badge-edu";
            break;
        case 'NEWS':
            label = "News Media";
            className = "badge-news";
            break;
        case 'OPINION':
            label = "Opinion / Blog";
            className = "badge-opinion";
            break;
        default:
            // Use defaults
            break;
    }
    return `<span class="source-badge ${className}">${label}</span>`;
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
        
        if (item.status === "SUPPORTED") {
            statusClass = "status-supported";
            icon = "✅";
        } else if (item.status === "CONTRADICTED") {
            statusClass = "status-disputed";
            icon = "❌";
        }

        const confidence = item.confidence_score || 0;
        const barColor = getConfidenceColor(confidence);
        
        let confLabel = "Low";
        if (confidence > 80) confLabel = "High";
        else if (confidence > 50) confLabel = "Medium";

        let sourcesHTML = "";
        if (item.source_url) {
            try {
                let hostname = new URL(item.source_url).hostname.replace('www.', '');
                const badge = getSourceBadgeHTML(item.source_type); // <--- Generate Badge
                sourcesHTML = `${badge}<a href="${item.source_url}" target="_blank">${hostname}</a>`;
            } catch { 
                sourcesHTML = `<span class="source-badge badge-unknown">Unknown</span> Source`; 
            }
        }

        html += `
            <div class="claim-item ${statusClass}">
                <div class="claim-header-row">
                    <span class="claim-status-pill">${icon} ${item.status}</span>
                </div>

                <div class="claim-text">"${item.claim}"</div>

                <div class="confidence-section">
                    <div class="conf-label">
                        <span>AI Confidence: <strong>${confLabel}</strong></span>
                        <span>${confidence}%</span>
                    </div>
                    <div class="conf-bar-track">
                        <div class="conf-bar-fill" style="width: ${confidence}%; background-color: ${barColor};"></div>
                    </div>
                </div>
                
                ${item.evidence ? `
                <div class="claim-actions" style="margin-top: 8px;">
                    <button class="toggle-evidence-btn">
                        See Evidence & Reasoning ▼
                    </button>
                    <div class="claim-evidence-hidden">
                        ${item.evidence}
                    </div>
                </div>` : ''}
                
                ${sourcesHTML ? `<div class="claim-sources">${sourcesHTML}</div>` : ''}
            </div>`;
    });

    html += `</div>`;
    container.innerHTML = html;

    // Show evidence toggles
    const buttons = container.querySelectorAll('.toggle-evidence-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const button = e.currentTarget;
            const evidenceBox = button.nextElementSibling;
            
            if (evidenceBox) {
                evidenceBox.classList.toggle('show-evidence');
                
                if (evidenceBox.classList.contains('show-evidence')) {
                    button.innerText = "Hide Evidence & Reasoning ▲";
                } else {
                    button.innerText = "See Evidence & Reasoning ▼";
                }
            }
        });
    });
}

// Show spinner
function showGlobalLoading(message) {
    createGlobalResultBox();
    if (loadingInterval) clearInterval(loadingInterval);

    // Set initial content
    globalResultBox.innerHTML = `
        <div class="verifier-loading">
            <span class="spinner"></span>
            <p id="verifier-loading-text">${message || "Verifying..."}</p>
        </div>`;

    const textEl = document.getElementById("verifier-loading-text");
    
    // Cycle through loading phrases
    if (textEl) {
        loadingInterval = setInterval(() => {
            const randomPhrase = LOAD_PHRASES[Math.floor(Math.random() * LOAD_PHRASES.length)];
            textEl.innerText = randomPhrase;
        }, 2000);
    }
}

function showGlobalError(error) {
    createGlobalResultBox();
    if (loadingInterval) clearInterval(loadingInterval);
    globalResultBox.innerHTML = `<div class="verifier-error">⚠️ ${error || "Unknown error."}</div>`;
    addCloseButton(globalResultBox);
}

// Display results in the box
function showGlobalResults(data) {
    createGlobalResultBox();
    if (loadingInterval) clearInterval(loadingInterval);
    globalResultBox.classList.remove("verifier-stamp-animation");
    void globalResultBox.offsetWidth;
    globalResultBox.classList.add("verifier-stamp-animation");
    setTimeout(() => {
        globalResultBox.classList.remove("verifier-stamp-animation");
    }, 500);
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