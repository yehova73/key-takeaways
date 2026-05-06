// Content script (compiled-from-TS equivalent)
// Generates text fragments and responds to background messages

const BLOCK_ELEMENTS = [
  "ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "BR", "DETAILS", "DIALOG",
  "DD", "DIV", "DL", "DT", "FIELDSET", "FIGCAPTION", "FIGURE", "FOOTER",
  "FORM", "H1", "H2", "H3", "H4", "H5", "H6", "HEADER", "HGROUP", "HR",
  "LI", "MAIN", "NAV", "OL", "P", "PRE", "SECTION", "TABLE", "UL",
  "TR", "TH", "TD", "COLGROUP", "COL", "CAPTION", "THEAD", "TBODY", "TFOOT",
];

function isBlockElement(node) {
  return (
    node.nodeType === Node.ELEMENT_NODE &&
    BLOCK_ELEMENTS.includes(node.tagName.toUpperCase())
  );
}

function expandRangeToWordBound(range) {
  if (range.startContainer.nodeType === Node.TEXT_NODE) {
    const text = range.startContainer.textContent || "";
    let start = range.startOffset;
    while (start > 0 && /\w/.test(text[start - 1])) {
      start--;
    }
    range.setStart(range.startContainer, start);
  }

  if (range.endContainer.nodeType === Node.TEXT_NODE) {
    const text = range.endContainer.textContent || "";
    let end = range.endOffset;
    while (end < text.length && /\w/.test(text[end])) {
      end++;
    }
    range.setEnd(range.endContainer, end);
  }
}

function getTextFromRange(range) {
  return range.toString().replace(/\s+/g, " ").trim();
}

function crossesBlockBoundary(range) {
  const walker = document.createTreeWalker(
    range.commonAncestorContainer,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode: (node) => {
        if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
        return isBlockElement(node)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP;
      },
    }
  );

  let blockCount = 0;
  while (walker.nextNode()) {
    blockCount++;
    if (blockCount > 1) return true;
  }
  return false;
}

function getPrefix(range) {
  const prefixRange = document.createRange();
  prefixRange.selectNodeContents(document.body);
  prefixRange.setEnd(range.startContainer, range.startOffset);

  const text = prefixRange.toString().replace(/\s+/g, " ").trim();
  const words = text.split(/\s+/);
  return words.slice(-5).join(" ");
}

function getSuffix(range) {
  const suffixRange = document.createRange();
  suffixRange.selectNodeContents(document.body);
  suffixRange.setStart(range.endContainer, range.endOffset);

  const text = suffixRange.toString().replace(/\s+/g, " ").trim();
  const words = text.split(/\s+/);
  return words.slice(0, 5).join(" ");
}

function generateFragmentFromSelection() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  try {
    const range = selection.getRangeAt(0);
    expandRangeToWordBound(range);

    const fullText = getTextFromRange(range);
    if (!fullText) return null;

    const words = fullText.split(/\s+/);
    const needsRangeMatch = fullText.length > 300 || crossesBlockBoundary(range);

    let fragment;

    if (needsRangeMatch) {
      const numStartWords = Math.min(4, Math.floor(words.length / 2));
      const numEndWords = Math.min(4, Math.floor(words.length / 2));

      fragment = {
        textStart: words.slice(0, numStartWords).join(" "),
        textEnd: words.slice(-numEndWords).join(" "),
      };
    } else {
      fragment = { textStart: fullText };
    }

    const prefix = getPrefix(range);
    const suffix = getSuffix(range);

    if (prefix) {
      const prefixWords = prefix.split(/\s+/);
      fragment.prefix = prefixWords.slice(-3).join(" ");
    }

    if (suffix) {
      const suffixWords = suffix.split(/\s+/);
      fragment.suffix = suffixWords.slice(0, 3).join(" ");
    }

    return fragment;
  } catch (error) {
    console.error("[Key Takeaways] Error generating fragment:", error);
    return null;
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request && request.action === "getExpandedSelection") {
    const fragment = generateFragmentFromSelection();
    sendResponse(fragment || { text: request.text || "" });
  }
  return true;
});

console.log("[Key Takeaways] content-script.js loaded");
