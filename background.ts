import type { FolderNode, UrlEntry } from "./types.js";

declare const chrome: any;

const STORAGE_KEY = "folderTree";
const ROOT_MENU_ID = "save-takeaway-root";

function getBaseUrlWithQuery(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);

    // Keep origin + pathname + search (query params)
    return `${url.origin}${url.pathname}${url.search}`;
  } catch (e) {
    console.warn("Invalid URL:", rawUrl);
    return rawUrl; // fallback
  }
}

interface FragmentData {
  textStart?: string;
  textEnd?: string;
  prefix?: string;
  suffix?: string;
}

function getLinkToSelected(baseUrl: string, frag: FragmentData | null): string {
  if (!frag || !frag.textStart) return baseUrl;

  const prefix = frag.prefix ? `${encodeURIComponent(frag.prefix)}-,` : "";
  const suffix = frag.suffix ? `,-${encodeURIComponent(frag.suffix)}` : "";
  const textStart = encodeURIComponent(frag.textStart);
  const textEnd = frag.textEnd ? `,${encodeURIComponent(frag.textEnd)}` : "";

  console.log(
    `prefix: ${prefix}\ntextstart: ${textStart}\ntextend: ${textEnd}\nsuffix: ${suffix}`,
  );
  const url = `${baseUrl}#:~:text=${prefix}${textStart}${textEnd}${suffix}`;
  console.log(`fragment url: ${url}`);
  return url;
}
// Background must not access page DOM. Content scripts generate fragments and respond
// to `getExpandedSelection` messages. See content-script.ts for the generator.

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
  console.log("aici", info);
  const rawUrl: string = info.linkUrl ?? info.pageUrl ?? tab?.url ?? "";
  console.log("Context menu clicked:", {
    folderId,
    url: rawUrl,
    selection: info.selectionText,
  });
  if (!rawUrl) return;
  const selectedText: string | undefined = info.selectionText;
  if (!selectedText) return;

  const baseUrl = getBaseUrlWithQuery(rawUrl);

  const handleAndStore = (finalUrl: string) => {
    chrome.storage.local.get(STORAGE_KEY, (data: any) => {
      const tree: FolderNode[] = data[STORAGE_KEY] ?? [];
      console.log("Before adding URL:", selectedText);
      addUrlToFolder(tree, folderId, finalUrl, selectedText);
      console.log("After adding URL:", selectedText);
      chrome.storage.local.set({ [STORAGE_KEY]: tree });
    });
  };

  if (tab?.id != null) {
    chrome.tabs.sendMessage(
      tab.id,
      { action: "getExpandedSelection" },
      (response: any) => {
        if (chrome.runtime.lastError) {
          console.warn(
            "No content script response:",
            chrome.runtime.lastError.message,
          );
          handleAndStore(baseUrl);
          return;
        }

        const frag: FragmentData | null = response ?? null;
        console.log("frag", frag);

        if (!frag) {
          handleAndStore(baseUrl);
          return;
        }

        const derective_url = getLinkToSelected(baseUrl, frag);
        console.log("derective_url", derective_url);
        handleAndStore(derective_url);
      },
    );
  } else {
    handleAndStore(baseUrl);
  }
});

function addUrlToFolder(
  nodes: FolderNode[],
  folderId: string,
  url: string,
  selectedText?: string,
): boolean {
  for (const node of nodes) {
    if (node.id === folderId) {
      if (!node.urls) node.urls = [];
      const entry: UrlEntry = {
        url,
        highlight: selectedText,
      };
      if (
        !node.urls.some((e) => e.url === url && e.highlight === selectedText)
      ) {
        node.urls.push(entry);
      }
      return true;
    }
    if (addUrlToFolder(node.children, folderId, url, selectedText)) return true;
  }
  return false;
}
