document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const editorContainer = document.getElementById('editor-container');
    const savedSessionsContainer = document.getElementById('saved-sessions-container');
    const savedSessionsList = document.getElementById('saved-sessions-list');
    const orderToggle = document.getElementById('order-toggle');
    const resultContainer = document.getElementById('result-container');
    const headingsContainer = document.getElementById('headings-container');
    const heading1 = document.getElementById('heading-1');
    const heading2 = document.getElementById('heading-2');
    const saveBtn = document.getElementById('save-btn');

    // --- State Management ---
    let appState = {
        bn: { heading: '', sentences: [] },
        en: { heading: '', sentences: [] }
    };
    let historyStack = [];

    // --- Core Functions ---
    const saveState = () => {
        historyStack.push(JSON.parse(JSON.stringify(appState)));
        if (historyStack.length > 20) historyStack.shift();
    };
    
    const syncStateFromDOM = () => {
        const pairs = document.querySelectorAll('.article-pair');
        const isEnFirst = orderToggle.checked;
        const lang1Sentences = Array.from(pairs).map(p => p.children[0].textContent);
        const lang2Sentences = Array.from(pairs).map(p => p.children[1].textContent);
        appState.bn.sentences = isEnFirst ? lang2Sentences : lang1Sentences;
        appState.en.sentences = isEnFirst ? lang1Sentences : lang2Sentences;
    };

    const renderContent = () => {
        resultContainer.innerHTML = '';
        const isEnFirst = orderToggle.checked;
        const firstLangData = isEnFirst ? appState.en : appState.bn;
        const secondLangData = isEnFirst ? appState.bn : appState.en;
        
        headingsContainer.style.display = 'block';
        heading1.textContent = firstLangData.heading;
        heading2.textContent = secondLangData.heading;

        const maxLength = Math.max(firstLangData.sentences.length, secondLangData.sentences.length);
        for (let i = 0; i < maxLength; i++) {
            const pairDiv = document.createElement('div');
            pairDiv.className = 'article-pair';
            const p1 = document.createElement('p');
            p1.textContent = firstLangData.sentences[i] || '';
            p1.setAttribute('contenteditable', 'true');
            const p2 = document.createElement('p');
            p2.textContent = secondLangData.sentences[i] || '';
            p2.setAttribute('contenteditable', 'true');
            pairDiv.appendChild(p1);
            pairDiv.appendChild(p2);
            resultContainer.appendChild(pairDiv);
        }
    };

    function handleManualEdit(event) {
        const target = event.target;
        if (!target.isContentEditable) return;
        
        const selection = window.getSelection();
        if (event.key !== 'z') syncStateFromDOM(); // Don't sync on undo
        saveState();

        const pair = target.closest('.article-pair');
        const pairIndex = Array.from(resultContainer.children).indexOf(pair);
        const isEnFirst = orderToggle.checked;
        const isFirstColumn = target === pair.firstChild;
        const targetLang = (isEnFirst && isFirstColumn) || (!isEnFirst && !isFirstColumn) ? 'en' : 'bn';
        const sentenceArray = appState[targetLang].sentences;

        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            const cursorPosition = selection.anchorOffset;
            const text = target.textContent;
            sentenceArray.splice(pairIndex, 1, text.substring(0, cursorPosition), text.substring(cursorPosition));
            renderContent();
        } else if (event.key === 'Enter' && event.shiftKey) {
            event.preventDefault();
            if (pairIndex < sentenceArray.length - 1) {
                const mergedText = sentenceArray[pairIndex] + ' ' + sentenceArray[pairIndex + 1];
                sentenceArray.splice(pairIndex, 2, mergedText);
                renderContent();
            }
        } else if (event.key === 'Backspace' && selection.anchorOffset === 0) {
            event.preventDefault();
            if (pairIndex > 0) {
                const mergedText = sentenceArray[pairIndex - 1] + ' ' + sentenceArray[pairIndex];
                sentenceArray.splice(pairIndex - 1, 2, mergedText);
                renderContent();
            }
        } else if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
            event.preventDefault();
            if (historyStack.length > 0) {
                appState = historyStack.pop();
                renderContent();
            }
        }
    }
    
    // --- OFFLINE SESSION MANAGEMENT ---
    const saveSession = async () => {
        syncStateFromDOM();
        const sessionId = Date.now();
        const newSession = {
            id: sessionId,
            title: appState.en.heading.substring(0, 50) || 'Untitled Session',
            date: new Date().toLocaleString(),
            data: appState
        };
        const result = await chrome.storage.local.get('savedSessions');
        const sessions = result.savedSessions || [];
        sessions.push(newSession);
        await chrome.storage.local.set({ savedSessions: sessions });
        
        // --- NEW: Confirmation and Reload ---
        alert(`Session "${newSession.title}" saved!\nThe page will now refresh to show the updated sessions list.`);
        location.reload();
    };

    const loadSessions = async () => {
        const result = await chrome.storage.local.get('savedSessions');
        const sessions = result.savedSessions || [];
        savedSessionsList.innerHTML = '';
        if (sessions.length === 0) {
            savedSessionsList.innerHTML = '<p>No saved sessions yet. Compare a new article to get started!</p>';
            return;
        }
        sessions.reverse().forEach(session => {
            const sessionDiv = document.createElement('div');
            sessionDiv.className = 'saved-session-item';
            sessionDiv.innerHTML = `<div class="session-info"><strong>${session.title}</strong><small>${session.date}</small></div><div class="session-actions"><button class="load-btn" data-id="${session.id}">Load</button><button class="delete-btn" data-id="${session.id}">Delete</button></div>`;
            savedSessionsList.appendChild(sessionDiv);
});
    };
    
    savedSessionsList.addEventListener('click', async (event) => {
        const sessionId = event.target.getAttribute('data-id');
        if (!sessionId) return;
        let sessions = (await chrome.storage.local.get('savedSessions')).savedSessions || [];
        if (event.target.classList.contains('load-btn')) {
            const sessionToLoad = sessions.find(s => s.id == sessionId);
            if (sessionToLoad) {
                appState = sessionToLoad.data;
                editorContainer.style.display = 'block';
                savedSessionsContainer.style.display = 'none';
                renderContent();
            }
        } else if (event.target.classList.contains('delete-btn')) {
            await chrome.storage.local.set({ savedSessions: sessions.filter(s => s.id != sessionId) });
            loadSessions();
        }
    });

    const initialize = () => {
        chrome.storage.local.get(['banglaData', 'englishData'], (result) => {
            if (result.banglaData && result.englishData) {
                editorContainer.style.display = 'block';
                savedSessionsContainer.style.display = 'none';
                let fullBanglaText = result.banglaData.paragraphs.join(' ');
                fullBanglaText = fullBanglaText.replace(/\[/g, '। [');
                fullBanglaText = fullBanglaText.replace(/\]/g, '] ।');
                appState.bn.sentences = fullBanglaText.split(/[।!]+/).map(s => s.trim()).filter(Boolean);
                appState.bn.heading = result.banglaData.heading;
                const fullEnglishText = result.englishData.paragraphs.join(' ');
                appState.en.sentences = fullEnglishText.match(/[^.!?]+[.!?]+/g) || [];
                appState.en.sentences = appState.en.sentences.map(s => s.trim()).filter(Boolean);
                appState.en.heading = result.englishData.heading;
                renderContent();
                saveState();
                chrome.storage.local.remove(['banglaData', 'englishData']);
            } else {
                editorContainer.style.display = 'none';
                savedSessionsContainer.style.display = 'block';
                loadSessions();
            }
        });
    };

    // --- Attaching Event Listeners ---
    resultContainer.addEventListener('keydown', handleManualEdit);
    resultContainer.addEventListener('input', () => { saveState(); });
    saveBtn.addEventListener('click', saveSession);
    orderToggle.addEventListener('click', () => {
        syncStateFromDOM();
        renderContent();
    });
    initialize();
});