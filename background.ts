import type { FolderNode } from "./types.js";

declare const chrome: any;

const STORAGE_KEY = "folderTree";
const ROOT_MENU_ID = "save-takeaway-root";

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

chrome.contextMenus.onClicked.addListener((info: any, tab: any) => {
  const menuItemId = String(info.menuItemId);
  if (!menuItemId.startsWith("folder-")) return;

  const folderId = menuItemId.replace("folder-", "");
  const url: string = info.linkUrl ?? info.pageUrl ?? tab?.url ?? "";
  if (!url) return;
  const highlight: string | undefined = info.selectionText;

  chrome.storage.local.get(STORAGE_KEY, (data: any) => {
    const tree: FolderNode[] = data[STORAGE_KEY] ?? [];
    addUrlToFolder(tree, folderId, url, highlight);
    chrome.storage.local.set({ [STORAGE_KEY]: tree });
  });
});

function addUrlToFolder(
  nodes: FolderNode[],
  folderId: string,
  url: string,
  highlight?: string,
): boolean {
  for (const node of nodes) {
    if (node.id === folderId) {
      if (!node.urls) node.urls = [];
      if (!node.urls.some(entry => entry.url === url && (!highlight || entry.highlight === highlight))) {
        node.urls.push(highlight ? { url, highlight } : { url });
      }
      return true;
    }
    if (addUrlToFolder(node.children, folderId, url, highlight)) return true;
  }
  return false;
}
