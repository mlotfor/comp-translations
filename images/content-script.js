chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "extractArticle") {
        try {
            const headingSelector = 'h1.mt-2.fw-bold';
            const paraSelectors = [
                '.details_newsArticle___niuZ article p',    // English selector 1
                '.detailsBn_newsArticle__9OmSx article p',  // Bangla selector 1
                '.details_articleArea__15R0I article p',    // English selector 2
                '.detailsBn_articleArea__Drelw article p'   // Bangla selector 2
            ];

            const heading = document.querySelector(headingSelector)?.innerText || "Heading not found";
            
            let paragraphs = [];
            for(const selector of paraSelectors) {
                const nodes = document.querySelectorAll(selector);
                if (nodes.length > 0) {
                    paragraphs = Array.from(nodes).map(p => p.textContent.trim())
                        // NEW: Added more robust filtering
                        .filter(p => 
                            p && 
                            !p.toLowerCase().includes('the writer is') && 
                            !p.toLowerCase().includes('লেখক:') &&
                            !p.includes('__________________________')
                        );
                    break;
                }
            }
            
            if (paragraphs.length > 0) {
                const data = { heading, paragraphs };
                const storageKey = request.lang === 'bangla' ? 'banglaData' : 'englishData';
                
                chrome.storage.local.set({ [storageKey]: data }, () => {
                    console.log(`${request.lang} data extracted and stored.`);
                    sendResponse({ success: true });
                });
            } else {
                throw new Error("Could not find article paragraphs on the page.");
            }
        } catch (error) {
            console.error("Content script error:", error);
            sendResponse({ success: false, error: error.message });
        }
        return true; // Indicates async response
    }
});