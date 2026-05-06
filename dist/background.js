const STORAGE_KEY = "folderTree";
const ROOT_MENU_ID = "save-takeaway-root";
/**
 * Generate a text fragment URL for highlighting
 * Format: baseUrl#:~:text=[prefix-,]textStart[,textEnd][,-suffix]
 */
function generateTextFragmentUrl(baseUrl, text, prefix, suffix, textStart, textEnd) {
    try {
        // Remove existing hash from URL
        const url = new URL(baseUrl);
        url.hash = "";
        const cleanUrl = url.toString();
        // Build the text fragment
        let fragment = "";
        // Add prefix if provided
        if (prefix && prefix.trim()) {
            fragment += encodeURIComponent(prefix.trim()) + "-,";
        }
        // Use textStart/textEnd format for long text, otherwise use full text
        if (textStart && textEnd) {
            fragment +=
                encodeURIComponent(textStart.trim()) +
                    "," +
                    encodeURIComponent(textEnd.trim());
        }
        else {
            fragment += encodeURIComponent(text.trim());
        }
        // Add suffix if provided
        if (suffix && suffix.trim()) {
            fragment += ",-" + encodeURIComponent(suffix.trim());
        }
        // Create text fragment URL
        return `${cleanUrl}#:~:text=${fragment}`;
    }
    catch (error) {
        console.error("[Key Takeaways] Error generating text fragment URL:", error);
        return baseUrl;
    }
}
chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error(err));
function flattenFolders(nodes, parentId = null) {
    const result = [];
    for (const node of nodes) {
        result.push({ id: node.id, title: node.title, parentId });
        result.push(...flattenFolders(node.children, node.id));
    }
    return result;
}
async function rebuildContextMenu() {
    await chrome.contextMenus.removeAll();
    chrome.contextMenus.create({
        id: ROOT_MENU_ID,
        title: "Save Takeaway",
        // contexts: ["page", "link", "selection"],
        contexts: ["selection"],
    });
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const tree = data[STORAGE_KEY] ?? [];
    const flat = flattenFolders(tree);
    if (flat.length === 0) {
        chrome.contextMenus.create({
            id: "no-folders",
            parentId: ROOT_MENU_ID,
            title: "(No folders yet — open the sidebar to create one)",
            contexts: ["page", "link", "selection"],
            enabled: false,
        });
        return;
    }
    for (const folder of flat) {
        chrome.contextMenus.create({
            id: `folder-${folder.id}`,
            parentId: folder.parentId ? `folder-${folder.parentId}` : ROOT_MENU_ID,
            title: folder.title,
            contexts: ["page", "link", "selection"],
        });
    }
}
chrome.runtime.onInstalled.addListener(() => rebuildContextMenu());
chrome.storage.onChanged.addListener(() => rebuildContextMenu());
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    const menuItemId = String(info.menuItemId);
    if (!menuItemId.startsWith("folder-"))
        return;
    const folderId = menuItemId.replace("folder-", "");
    const url = info.linkUrl ?? info.pageUrl ?? tab?.url ?? "";
    if (!url)
        return;
    const originalText = info.selectionText;
    if (!originalText)
        return;
    try {
        // Ask content script to get expanded selection with context
        const response = await chrome.tabs.sendMessage(tab.id, {
            action: "getExpandedSelection",
            text: originalText,
        });
        const text = response?.text || originalText;
        const prefix = response?.prefix;
        const suffix = response?.suffix;
        const textStart = response?.textStart;
        const textEnd = response?.textEnd;
        chrome.storage.local.get(STORAGE_KEY, (data) => {
            const tree = data[STORAGE_KEY] ?? [];
            addUrlToFolder(tree, folderId, url, text, prefix, suffix, textStart, textEnd);
            chrome.storage.local.set({ [STORAGE_KEY]: tree });
        });
    }
    catch (error) {
        console.error("[Key Takeaways] Error getting expanded selection, using original:", error);
        // Fallback to original text if content script fails
        chrome.storage.local.get(STORAGE_KEY, (data) => {
            const tree = data[STORAGE_KEY] ?? [];
            addUrlToFolder(tree, folderId, url, originalText);
            chrome.storage.local.set({ [STORAGE_KEY]: tree });
        });
    }
});
function addUrlToFolder(nodes, folderId, url, highlight, prefix, suffix, textStart, textEnd) {
    for (const node of nodes) {
        if (node.id === folderId) {
            if (!node.urls)
                node.urls = [];
            const entry = {
                url,
                highlight,
                textFragmentUrl: highlight
                    ? generateTextFragmentUrl(url, highlight, prefix, suffix, textStart, textEnd)
                    : undefined,
            };
            if (!node.urls.some((e) => e.url === url && (!highlight || e.highlight === highlight))) {
                node.urls.push(entry);
            }
            return true;
        }
        if (addUrlToFolder(node.children, folderId, url, highlight, prefix, suffix, textStart, textEnd))
            return true;
    }
    return false;
}
;
//# sourceMappingURL=background.js.map