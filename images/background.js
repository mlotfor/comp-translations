// This script runs when the extension icon is clicked.
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.create({
    url: 'main.html'
  });
});

/**
 * Extracts article heading and content using a robust, multi-step process.
 * Includes detailed console logging for debugging.
 * @param {string} html - The raw HTML text of the page.
 * @param {string} lang - 'Bangla' or 'English' for error reporting.
 * @returns {object} - An object { heading, content }. Throws an error on failure.
 */
function extractArticleData(html, lang) {
  console.log(`[DEBUGGER] --- Starting extraction for ${lang} ---`);
  console.log(`[DEBUGGER] Received HTML. Total length: ${html.length}`);

  // Step 1: Find the START of the 'details' object.
  const searchString = '"details":{';
  const startIndex = html.indexOf(searchString);

  if (startIndex === -1) {
    console.error(`[DEBUGGER] Step 1 FAILED for ${lang}. Could not find the string: ${searchString}`);
    throw new Error(`Extraction Step 1 Failed for ${lang}: Could not find the starting point of the article data object.`);
  }
  console.log(`[DEBUGGER] Step 1 OK for ${lang}: Found start string at index ${startIndex}.`);

  // Step 1.5: Find the corresponding CLOSING brace to properly isolate the object.
  let openBraces = 1;
  let endIndex = -1;
  const startOfObject = startIndex + searchString.length;

  for (let i = startOfObject; i < html.length; i++) {
    if (html[i] === '{') openBraces++;
    else if (html[i] === '}') openBraces--;
    
    if (openBraces === 0) {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    console.error(`[DEBUGGER] Step 1.5 FAILED for ${lang}. The data object seems incomplete.`);
    throw new Error(`Extraction Step 1.5 Failed for ${lang}: Found the start of the data object, but the structure appears incomplete or malformed.`);
  }
  console.log(`[DEBUGGER] Step 1.5 OK for ${lang}: Found closing brace at index ${endIndex}.`);
  
  const jsonString = html.substring(startOfObject - 1, endIndex + 1);
  console.log(`[DEBUGGER] Isolated JSON string for ${lang}:`, jsonString.substring(0, 200) + '...');

  let detailsObj;
  try {
    detailsObj = JSON.parse(jsonString);
  } catch (e) {
    console.error(`[DEBUGGER] Step 1.8 FAILED for ${lang}. JSON parsing error:`, e);
    throw new Error(`Extraction Step 1.8 Failed for ${lang}: Could not parse the isolated article data object. Error: ${e.message}`);
  }
  console.log(`[DEBUGGER] Step 1.8 OK for ${lang}: Parsed details object successfully.`);

  const heading = detailsObj.n_head;
  const contentRefKey = detailsObj.n_details;

  if (!heading || !contentRefKey || !contentRefKey.startsWith('$')) {
     console.error(`[DEBUGGER] Step 1.9 FAILED for ${lang}. 'n_head' or 'n_details' key is missing or invalid in:`, detailsObj);
     throw new Error(`Extraction Step 1.9 Failed for ${lang}: The data object is missing 'n_head' or a valid 'n_details' reference key.`);
  }
  console.log(`[DEBUGGER] Step 1.9 OK for ${lang}: Found Heading: "${heading}" | Found Content Reference: "${contentRefKey}"`);

  const lookupKey = contentRefKey.substring(1);

  // Step 2: Use the reference key to find the actual article content.
  const contentRegex = new RegExp(`"${lookupKey}":T[\\w\\d]*,\\"(.*?)\\"\\]`, 's');
  const contentMatch = html.match(contentRegex);

  if (!contentMatch || !contentMatch[1]) {
    console.error(`[DEBUGGER] Step 2 FAILED for ${lang}. Could not find content block for key: "${lookupKey}"`);
    throw new Error(`Extraction Step 2 Failed for ${lang}: Found reference key '${lookupKey}' but could not find its corresponding content block.`);
  }
  console.log(`[DEBUGGER] Step 2 OK for ${lang}: Matched content block for key "${lookupKey}".`);

  let content = '';
  try {
    content = JSON.parse(`"${contentMatch[1]}"`);
  } catch (e) {
     console.error(`[DEBUGGER] Step 2.5 FAILED for ${lang}. Could not parse the final content string.`);
     throw new Error(`Extraction Step 2.5 Failed for ${lang}: Could not parse the final content string.`);
  }
  
  console.log(`[DEBUGGER] Step 2.5 OK for ${lang}: Successfully extracted and parsed content.`);
  console.log(`[DEBUGGER] --- Finished extraction for ${lang} ---`);
  return { heading, content };
}

// Listens for messages from main.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "fetchArticles") {
    const fetchBoth = async () => {
      try {
        console.log('[DEBUGGER] Received fetch request from UI with URLs:', request.urls);
        const [bnResponse, enResponse] = await Promise.all([
          fetch(request.urls.bn),
          fetch(request.urls.en)
        ]);
        console.log('[DEBUGGER] Fetch responses received.');

        if (!bnResponse.ok || !enResponse.ok) {
           throw new Error(`Network error. BN Status: ${bnResponse.status}, EN Status: ${enResponse.status}`);
        }

        const bnHtml = await bnResponse.text();
        const enHtml = await enResponse.text();
        
        const bnData = extractArticleData(bnHtml, 'Bangla');
        const enData = extractArticleData(enHtml, 'English');

        console.log('[DEBUGGER] Both languages extracted. Sending success response to UI.');
        sendResponse({ 
          success: true, 
          data: { 
            bn: bnData,
            en: enData
          } 
        });

      } catch (error) {
        console.error('[DEBUGGER] An error occurred in the fetch/extract process:', error);
        sendResponse({ success: false, error: error.message });
      }
    };

    fetchBoth();
    return true; // Indicates that the response is sent asynchronously
  }
});