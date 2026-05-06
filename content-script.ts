/**
 * Content script for generating text fragments following Chrome's algorithm.
 * Based on https://github.com/GoogleChromeLabs/text-fragments-polyfill
 */

declare const chrome: any;

const BLOCK_ELEMENTS = [
  "ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "BR", "DETAILS", "DIALOG",
  "DD", "DIV", "DL", "DT", "FIELDSET", "FIGCAPTION", "FIGURE", "FOOTER",
  "FORM", "H1", "H2", "H3", "H4", "H5", "H6", "HEADER", "HGROUP", "HR",
  "LI", "MAIN", "NAV", "OL", "P", "PRE", "SECTION", "TABLE", "UL",
  "TR", "TH", "TD", "COLGROUP", "COL", "CAPTION", "THEAD", "TBODY", "TFOOT",
];

interface TextFragmentData {
  textStart: string;
  textEnd?: string;
  prefix?: string;
  suffix?: string;
}

/**
 * Check if a node is a block element
 */
function isBlockElement(node: Node): boolean {
  return (
    node.nodeType === Node.ELEMENT_NODE &&
    BLOCK_ELEMENTS.includes((node as Element).tagName.toUpperCase())
  );
}

/**
 * Expand range to word boundaries
 */
function expandRangeToWordBound(range: Range): void {
  // Expand start to word boundary
  if (range.startContainer.nodeType === Node.TEXT_NODE) {
    const text = range.startContainer.textContent || "";
    let start = range.startOffset;
    // Move back to find word start
    while (start > 0 && /\w/.test(text[start - 1])) {
      start--;
    }
    range.setStart(range.startContainer, start);
  }

  // Expand end to word boundary
  if (range.endContainer.nodeType === Node.TEXT_NODE) {
    const text = range.endContainer.textContent || "";
    let end = range.endOffset;
    // Move forward to find word end
    while (end < text.length && /\w/.test(text[end])) {
      end++;
    }
    range.setEnd(range.endContainer, end);
  }
}

/**
 * Get text from a range, handling multiple nodes
 */
function getTextFromRange(range: Range): string {
  return range.toString().replace(/\s+/g, " ").trim();
}

/**
 * Check if range crosses block boundaries
 */
function crossesBlockBoundary(range: Range): boolean {
  const walker = document.createTreeWalker(
    range.commonAncestorContainer,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode: (node) => {
        if (!range.intersectsNode(node)) {
          return NodeFilter.FILTER_REJECT;
        }
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

/**
 * Get prefix context (words before selection)
 */
function getPrefix(range: Range): string {
  const prefixRange = document.createRange();
  prefixRange.selectNodeContents(document.body);
  prefixRange.setEnd(range.startContainer, range.startOffset);

  const text = prefixRange.toString().replace(/\s+/g, " ").trim();
  const words = text.split(/\s+/);
  return words.slice(-5).join(" ");
}

/**
 * Get suffix context (words after selection)
 */
function getSuffix(range: Range): string {
  const suffixRange = document.createRange();
  suffixRange.selectNodeContents(document.body);
  suffixRange.setStart(range.endContainer, range.endOffset);

  const text = suffixRange.toString().replace(/\s+/g, " ").trim();
  const words = text.split(/\s+/);
  return words.slice(0, 5).join(" ");
}

/**
 * Generate text fragment data from selection
 */
function generateFragmentFromSelection(): TextFragmentData | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  try {
    const range = selection.getRangeAt(0);
    
    // Expand to word boundaries
    expandRangeToWordBound(range);

    const fullText = getTextFromRange(range);
    if (!fullText) {
      return null;
    }

    const words = fullText.split(/\s+/);
    const needsRangeMatch =
      fullText.length > 300 || crossesBlockBoundary(range);

    let fragment: TextFragmentData;

    if (needsRangeMatch) {
      // Use textStart/textEnd format for long text or text crossing blocks
      const numStartWords = Math.min(4, Math.floor(words.length / 2));
      const numEndWords = Math.min(4, Math.floor(words.length / 2));

      fragment = {
        textStart: words.slice(0, numStartWords).join(" "),
        textEnd: words.slice(-numEndWords).join(" "),
      };
    } else {
      // Use exact text match
      fragment = {
        textStart: fullText,
      };
    }

    // Add context for disambiguation
    const prefix = getPrefix(range);
    const suffix = getSuffix(range);

    if (prefix) {
      // Take last few words for prefix
      const prefixWords = prefix.split(/\s+/);
      fragment.prefix = prefixWords.slice(-3).join(" ");
    }

    if (suffix) {
      // Take first few words for suffix
      const suffixWords = suffix.split(/\s+/);
      fragment.suffix = suffixWords.slice(0, 3).join(" ");
    }

    return fragment;
  } catch (error) {
    console.error("[Key Takeaways] Error generating fragment:", error);
    return null;
  }
}

/**
 * Listen for requests to generate text fragment
 */
chrome.runtime.onMessage.addListener(
  (request: any, sender: any, sendResponse: any) => {
    if (request.action === "getExpandedSelection") {
      const fragment = generateFragmentFromSelection();
      sendResponse(fragment || { text: request.text || "" });
    }
    return true;
  }
);

console.log("[Key Takeaways] Content script loaded");
