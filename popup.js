// This function is injected into pages to scrape content.
function scrapeArticle() {
    try {
        const headingSelector = 'h1.mt-2.fw-bold';
        const paraSelectors = [
            '.details_newsArticle___niuZ article p', '.detailsBn_newsArticle__9OmSx article p',
            '.details_articleArea__15R0I article p', '.detailsBn_articleArea__Drelw article p'
        ];
        const heading = document.querySelector(headingSelector)?.innerText || "Heading not found";
        let paragraphs = [];
        for (const selector of paraSelectors) {
            const nodes = document.querySelectorAll(selector);
            if (nodes.length > 0) {
                paragraphs = Array.from(nodes).map(p => p.textContent.trim())
                    .filter(p => p && !p.toLowerCase().includes('the writer is') && !p.toLowerCase().includes('executive editor') && !p.toLowerCase().includes('লেখক:') && !p.toLowerCase().includes('নির্বাহী সম্পাদক') && !p.includes('__________________________'));
                break;
            }
        }
        if (paragraphs.length > 0) return { success: true, data: { heading, paragraphs } };
        else return { success: false, error: "Could not find article paragraphs on the page using the known selectors." };
    } catch (error) { return { success: false, error: error.message }; }
}

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const setBnBtn = document.getElementById('set-bn-btn');
    const setEnBtn = document.getElementById('set-en-btn');
    const compareBtn = document.getElementById('compare-btn');
    const bnStatusLight = document.getElementById('bn-status-light');
    const enStatusLight = document.getElementById('en-status-light');
    const autoCompareContainer = document.getElementById('auto-compare-container');
    const autoCompareBtn = document.getElementById('auto-compare-btn');
    const manualContainer = document.getElementById('manual-container');

    let matchingTabs = { bn: null, en: null };

    const updateStatusUI = () => {
        chrome.storage.local.get(['banglaData', 'englishData'], (result) => {
            bnStatusLight.classList.toggle('ready', !!result.banglaData);
            enStatusLight.classList.toggle('ready', !!result.englishData);
            compareBtn.disabled = !(result.banglaData && result.englishData);
        });
    };

    const handleSetSource = (lang) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs[0];
            if (!tab.url || !tab.url.includes('daily-sun.com')) {
                alert("This feature only works on Daily Sun article pages."); return;
            }
            chrome.scripting.executeScript({ target: { tabId: tab.id }, function: scrapeArticle }, (injectionResults) => {
                if (chrome.runtime.lastError || !injectionResults || !injectionResults[0]?.result) {
                    console.error("Script injection failed:", chrome.runtime.lastError?.message);
                    alert("Failed to inject script into the page. Try reloading the tab.");
                    return;
                }
                const result = injectionResults[0].result;
                if (result.success) {
                    const storageKey = lang === 'bangla' ? 'banglaData' : 'englishData';
                    chrome.storage.local.set({ [storageKey]: result.data }, () => updateStatusUI());
                } else {
                    alert(`Failed to extract content for ${lang}.\n\nError: ${result.error}`);
                }
            });
        });
    };
    
    // Helper to wrap chrome.scripting.executeScript in a Promise
    const injectAndScrape = (tabId) => new Promise((resolve, reject) => {
        chrome.scripting.executeScript({ target: { tabId }, function: scrapeArticle }, (results) => {
            if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
            const result = results[0]?.result;
            if (result && result.success) resolve(result.data);
            else reject(new Error(result?.error || "Unknown extraction error"));
        });
    });

    const runAutoCompare = async () => {
        if (!matchingTabs.bn || !matchingTabs.en) return;
        autoCompareBtn.disabled = true;
        autoCompareBtn.textContent = 'Extracting...';
        try {
            const banglaData = await injectAndScrape(matchingTabs.bn.id);
            const englishData = await injectAndScrape(matchingTabs.en.id);
            await chrome.storage.local.set({ banglaData, englishData });
            chrome.tabs.create({ url: 'main.html' });
            window.close(); // Close the popup
        } catch (error) {
            alert(`Auto-compare failed: ${error.message}`);
            autoCompareBtn.disabled = false;
            autoCompareBtn.textContent = 'Auto-Compare Found Tabs';
        }
    };
    
    // --- Initialization Logic ---
    const initializePopup = async () => {
        // Clear any leftover data from a previous manual selection
        await chrome.storage.local.remove(['banglaData', 'englishData']);
        
        const bnRegex = /daily-sun\.com\/bangla\/post\/\d+/;
        const enRegex = /daily-sun\.com\/post\/\d+/;
        const tabs = await chrome.tabs.query({ url: "https://*.daily-sun.com/*" });

        for (const tab of tabs) {
            if (bnRegex.test(tab.url)) matchingTabs.bn = tab;
            if (enRegex.test(tab.url) && !tab.url.includes('/bangla/')) matchingTabs.en = tab;
        }

        if (matchingTabs.bn && matchingTabs.en) {
            autoCompareContainer.classList.remove('hidden');
            manualContainer.classList.add('hidden');
        } else {
            autoCompareContainer.classList.add('hidden');
            manualContainer.classList.remove('hidden');
            updateStatusUI();
        }
    };

    // --- Event Listeners ---
    setBnBtn.addEventListener('click', () => handleSetSource('bangla'));
    setEnBtn.addEventListener('click', () => handleSetSource('english'));
    compareBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: 'main.html' });
        window.close(); // Close the popup
    });
    autoCompareBtn.addEventListener('click', runAutoCompare);

    initializePopup();
});