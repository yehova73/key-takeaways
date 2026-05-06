import type { FolderNode } from "./types.js";

declare const chrome: any;

const STORAGE_KEY = "folderTree";
let tree: FolderNode[] = [];
let expandedIds = new Set<string>();
let searchTerm = "";
const folderList = document.getElementById("folder-list") as HTMLDivElement;
const addRootBtn = document.getElementById("add-root-btn") as HTMLButtonElement;
const searchInput = document.getElementById("search-input") as HTMLInputElement;
const template = document.getElementById(
  "folder-row-template",
) as HTMLTemplateElement;

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function loadTree(): Promise<void> {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  tree = data[STORAGE_KEY] ?? [];
  render();
}

function saveTree(): void {
  chrome.storage.local.set({ [STORAGE_KEY]: tree });
}

function getFilteredTree(nodes: FolderNode[], query: string): FolderNode[] {
  if (!query) return nodes;

  const normalized = query.trim().toLowerCase();
  return nodes
    .map((node) => {
      const children = getFilteredTree(node.children, normalized);
      const matches = node.title.toLowerCase().includes(normalized);
      return matches || children.length ? { ...node, children } : null;
    })
    .filter(Boolean) as FolderNode[];
}

function render(): void {
  folderList.innerHTML = "";
  const renderTree = searchTerm ? getFilteredTree(tree, searchTerm) : tree;

  if (!renderTree.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = searchTerm
      ? "No matching folders found."
      : "No folders yet. Click New folder to create your first folder.";
    folderList.appendChild(empty);
    return;
  }

  renderTree.forEach((node) => {
    folderList.appendChild(createFolderItem(node));
  });
}

function createFolderItem(node: FolderNode): HTMLDivElement {
  const fragment = document.importNode(template.content, true);
  const item = fragment.querySelector(".folder-item") as HTMLDivElement;
  const toggleBtn = fragment.querySelector(".toggle-btn") as HTMLButtonElement;
  const folderLabel = fragment.querySelector(
    ".folder-label",
  ) as HTMLButtonElement;
  const addBtn = fragment.querySelector(".add-btn") as HTMLButtonElement;
  const renameBtn = fragment.querySelector(".rename-btn") as HTMLButtonElement;
  const deleteBtn = fragment.querySelector(".delete-btn") as HTMLButtonElement;

  const hasChildren = node.children.length > 0;
  const expanded = expandedIds.has(node.id);
  const showChildren = hasChildren && (expanded || Boolean(searchTerm));

  toggleBtn.textContent = hasChildren ? (expanded ? "–" : "+") : "";
  toggleBtn.disabled = !hasChildren;
  toggleBtn.classList.toggle("hidden", !hasChildren);
  folderLabel.textContent = node.title;

  toggleBtn.addEventListener("click", () => {
    if (expanded) {
      expandedIds.delete(node.id);
    } else {
      expandedIds.add(node.id);
    }
    render();
  });

  folderLabel.addEventListener("click", () => {
    expandedIds.add(node.id);
    render();
  });

  addBtn.addEventListener("click", () => {
    const title = prompt("Subfolder name", "New subfolder");
    if (title && title.trim()) {
      addFolder(node.id, title.trim());
    }
  });

  renameBtn.addEventListener("click", () => {
    const title = prompt("Rename folder", node.title);
    if (title && title.trim()) {
      renameFolder(node.id, title.trim());
    }
  });

  deleteBtn.addEventListener("click", () => {
    if (confirm(`Delete folder "${node.title}" and all its subfolders?`)) {
      removeFolder(node.id);
    }
  });

  if (showChildren) {
    const childContainer = document.createElement("div");
    childContainer.className = "children";
    node.children.forEach((child) => {
      childContainer.appendChild(createFolderItem(child));
    });
    item.appendChild(childContainer);
  }

  if (node.urls && node.urls.length > 0) {
    const urlList = document.createElement("ul");
    urlList.className = "url-list";
    node.urls.forEach((entry) => {
      const li = document.createElement("li");
      const linkContainer = document.createElement("div");
      linkContainer.className = "url-link-container";

      const a = document.createElement("a");
      a.href = entry.url;
      a.textContent = entry.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.className = "url-link";
      linkContainer.appendChild(a);

      // Add View button if there's a highlight
      if (entry.highlight && entry.textFragmentUrl) {
        const viewBtn = document.createElement("button");
        viewBtn.className = "view-btn";
        viewBtn.textContent = "View";
        viewBtn.title = "View and highlight this quote";
        viewBtn.addEventListener("click", async (e) => {
          e.preventDefault();
          try {
            // Open the URL with text fragment - browser will handle highlighting
            await chrome.tabs.create({ url: entry.textFragmentUrl });
          } catch (error) {
            console.error("[Key Takeaways] Error opening URL:", error);
            alert("Failed to open page. Please try again.");
          }
        });
        linkContainer.appendChild(viewBtn);
      }

      li.appendChild(linkContainer);

      if (entry.highlight) {
        const highlightDiv = document.createElement("div");
        highlightDiv.className = "highlight-text";
        highlightDiv.textContent = entry.highlight;
        li.appendChild(document.createElement("br"));
        li.appendChild(highlightDiv);
      }
      urlList.appendChild(li);
    });
    item.appendChild(urlList);
  }

  return item;
}

function addFolder(parentId: string | null, title: string): void {
  const newNode: FolderNode = {
    id: generateId(),
    title,
    urls: [],
    children: [],
  };
  if (!parentId) {
    tree.push(newNode);
  } else {
    const parent = findNode(tree, parentId);
    parent?.children.push(newNode);
    expandedIds.add(parentId);
  }

  saveTree();
  render();
}

function renameFolder(nodeId: string, title: string): void {
  const node = findNode(tree, nodeId);
  if (node) {
    node.title = title;
    saveTree();
    render();
  }
}

function removeFolder(nodeId: string): void {
  tree = deleteNode(tree, nodeId);
  expandedIds.delete(nodeId);
  saveTree();
  render();
}

function findNode(nodes: FolderNode[], nodeId: string): FolderNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    const found = findNode(node.children, nodeId);
    if (found) return found;
  }
  return null;
}

function deleteNode(nodes: FolderNode[], nodeId: string): FolderNode[] {
  return nodes
    .filter((node) => node.id !== nodeId)
    .map((node) => ({
      ...node,
      children: deleteNode(node.children, nodeId),
    }));
}

addRootBtn.addEventListener("click", () => {
  const title = prompt("Folder name", "New folder");
  if (title && title.trim()) {
    addFolder(null, title.trim());
  }
});

searchInput.addEventListener("input", (event) => {
  searchTerm = (event.target as HTMLInputElement).value;
  render();
});

loadTree();

chrome.storage.onChanged.addListener((changes: any, area: any) => {
  if (area === "local" && changes[STORAGE_KEY]) {
    loadTree();
  }
});
