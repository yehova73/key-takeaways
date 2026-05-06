import type { FolderNode, UrlEntry } from "./types.js";

declare const chrome: any;

const STORAGE_KEY = "folderTree";
const ROOT_MENU_ID = "save-takeaway-root";

/**
 * Generate a text fragment URL for highlighting
 * Format: baseUrl#:~:text=[prefix-,]textStart[,textEnd][,-suffix]
 */
function generateTextFragmentUrl(
  baseUrl: string,
  displayText: string,
  prefix?: string,
  suffix?: string,
  textStart?: string,
  textEnd?: string,
): string {
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

    // Use textStart/textEnd format if provided, otherwise use displayText
    if (textStart && textEnd) {
      fragment +=
        encodeURIComponent(textStart.trim()) +
        "," +
        encodeURIComponent(textEnd.trim());
    } else if (textStart) {
      fragment += encodeURIComponent(textStart.trim());
    } else {
      fragment += encodeURIComponent(displayText.trim());
    }

    // Add suffix if provided
    if (suffix && suffix.trim()) {
      fragment += ",-" + encodeURIComponent(suffix.trim());
    }

    // Create text fragment URL
    return `${cleanUrl}#:~:text=${fragment}`;
  } catch (error) {
    console.error("[Key Takeaways] Error generating text fragment URL:", error);
    return baseUrl;
  }
}

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err: Error) => console.error(err));

function flattenFolders(
  nodes: FolderNode[],
  parentId: string | null = null,
): Array<{ id: string; title: string; parentId: string | null }> {
  const result: Array<{ id: string; title: string; parentId: string | null }> =
    [];
  for (const node of nodes) {
    result.push({ id: node.id, title: node.title, parentId });
    result.push(...flattenFolders(node.children, node.id));
  }
  return result;
}

async function rebuildContextMenu(): Promise<void> {
  await chrome.contextMenus.removeAll();

  chrome.contextMenus.create({
    id: ROOT_MENU_ID,
    title: "Save Takeaway",
    // contexts: ["page", "link", "selection"],
    contexts: ["selection"],
  });

  const data = await chrome.storage.local.get(STORAGE_KEY);
  const tree: FolderNode[] = data[STORAGE_KEY] ?? [];
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

chrome.contextMenus.onClicked.addListener(async (info: any, tab: any) => {
  const menuItemId = String(info.menuItemId);
  if (!menuItemId.startsWith("folder-")) return;

  const folderId = menuItemId.replace("folder-", "");
  const url: string = info.linkUrl ?? info.pageUrl ?? tab?.url ?? "";
  if (!url) return;
  const originalText: string | undefined = info.selectionText;

  if (!originalText) return;

  try {
    // Ask content script to generate text fragment
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: "getExpandedSelection",
      text: originalText,
    });

    // Extract fragment data from response
    const textStart = response?.textStart || originalText;
    const textEnd = response?.textEnd;
    const prefix = response?.prefix;
    const suffix = response?.suffix;

    // Reconstruct full text for display
    const displayText = textEnd ? `${textStart} ... ${textEnd}` : textStart;

    chrome.storage.local.get(STORAGE_KEY, (data: any) => {
      const tree: FolderNode[] = data[STORAGE_KEY] ?? [];
      addUrlToFolder(
        tree,
        folderId,
        url,
        displayText,
        prefix,
        suffix,
        textStart,
        textEnd,
      );
      chrome.storage.local.set({ [STORAGE_KEY]: tree });
    });
  } catch (error) {
    console.error(
      "[Key Takeaways] Error getting fragment data, using original:",
      error,
    );
    // Fallback to original text if content script fails
    chrome.storage.local.get(STORAGE_KEY, (data: any) => {
      const tree: FolderNode[] = data[STORAGE_KEY] ?? [];
      addUrlToFolder(tree, folderId, url, originalText);
      chrome.storage.local.set({ [STORAGE_KEY]: tree });
    });
  }
});

function addUrlToFolder(
  nodes: FolderNode[],
  folderId: string,
  url: string,
  highlight?: string,
  prefix?: string,
  suffix?: string,
  textStart?: string,
  textEnd?: string,
): boolean {
  for (const node of nodes) {
    if (node.id === folderId) {
      if (!node.urls) node.urls = [];
      const entry: UrlEntry = {
        url,
        highlight,
        textFragmentUrl: highlight
          ? generateTextFragmentUrl(
              url,
              highlight,
              prefix,
              suffix,
              textStart,
              textEnd,
            )
          : undefined,
      };
      if (
        !node.urls.some(
          (e) => e.url === url && (!highlight || e.highlight === highlight),
        )
      ) {
        node.urls.push(entry);
      }
      return true;
    }
    if (
      addUrlToFolder(
        node.children,
        folderId,
        url,
        highlight,
        prefix,
        suffix,
        textStart,
        textEnd,
      )
    )
      return true;
  }
  return false;
}
