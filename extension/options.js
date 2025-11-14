const domainsText = document.getElementById('domains');
const saveBtn = document.getElementById('save');
const statusEl = document.getElementById('status');

// Load saved domains
function loadOptions() {
    chrome.storage.sync.get('badDomains', (data) => {
        if (data.badDomains && Array.isArray(data.badDomains)) {
            domainsText.value = data.badDomains.join('\n');
        }
    });
}

// Save domains
function saveOptions() {
    const domains = domainsText.value
        .split('\n')
        .map(d => d.trim().replace('www.', ''))
        .filter(d => d.length > 0); // Remove empty lines

    chrome.storage.sync.set({ badDomains: domains }, () => {
        statusEl.textContent = 'Options saved!';
        setTimeout(() => {
            statusEl.textContent = '';
        }, 2000);
    });
}

document.addEventListener('DOMContentLoaded', loadOptions);
saveBtn.addEventListener('click', saveOptions);