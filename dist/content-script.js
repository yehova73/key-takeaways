"use strict";
/**
 * Content script for extracting text selections with context for text fragments.
 */
/**
 * Get all text content from a range
 */
function getTextFromRange(range) {
    const tempDiv = document.createElement("div");
    tempDiv.appendChild(range.cloneContents());
    return tempDiv.textContent || "";
}
/**
 * Get text content before a range (for prefix context)
 */
function getTextBefore(range, maxLength = 50) {
    const beforeRange = document.createRange();
    beforeRange.selectNodeContents(document.body);
    beforeRange.setEnd(range.startContainer, range.startOffset);
    const text = getTextFromRange(beforeRange);
    const words = text.trim().split(/\s+/);
    // Get last few words as prefix (typically 3-5 words)
    const prefixWords = words.slice(-5);
    return prefixWords.join(" ");
}
/**
 * Get text content after a range (for suffix context)
 */
function getTextAfter(range, maxLength = 50) {
    const afterRange = document.createRange();
    afterRange.selectNodeContents(document.body);
    afterRange.setStart(range.endContainer, range.endOffset);
    const text = getTextFromRange(afterRange);
    const words = text.trim().split(/\s+/);
    // Get first few words as suffix (typically 3-5 words)
    const suffixWords = words.slice(0, 5);
    return suffixWords.join(" ");
}
/**
 * Expand range to word boundaries
 */
function expandRangeToWordBoundaries(range) {
    const newRange = range.cloneRange();
    // Expand start
    if (newRange.startContainer.nodeType === Node.TEXT_NODE) {
        const textNode = newRange.startContainer;
        const text = textNode.textContent || "";
        let start = newRange.startOffset;
        // Move back to word boundary
        while (start > 0 && /\w/.test(text[start - 1])) {
            start--;
        }
        newRange.setStart(textNode, start);
    }
    // Expand end
    if (newRange.endContainer.nodeType === Node.TEXT_NODE) {
        const textNode = newRange.endContainer;
        const text = textNode.textContent || "";
        let end = newRange.endOffset;
        // Move forward to word boundary
        while (end < text.length && /\w/.test(text[end])) {
            end++;
        }
        newRange.setEnd(textNode, end);
    }
    return newRange;
}
/**
 * Extract selection data with context for generating text fragment URL
 */
function getSelectionData() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
        return null;
    }
    try {
        const range = selection.getRangeAt(0);
        const expandedRange = expandRangeToWordBoundaries(range);
        // Get the full selected text
        let text = getTextFromRange(expandedRange).trim();
        // Get prefix and suffix context
        const prefix = getTextBefore(expandedRange);
        const suffix = getTextAfter(expandedRange);
        const result = {
            text,
            prefix: prefix || undefined,
            suffix: suffix || undefined,
        };
        // For longer text, use textStart/textEnd format
        // Chrome typically uses this when text is > ~300 chars or spans multiple blocks
        const words = text.split(/\s+/);
        if (words.length > 20) {
            // Use first 3-4 words as start, last 3-4 words as end
            const startWords = words.slice(0, 4).join(" ");
            const endWords = words.slice(-4).join(" ");
            result.textStart = startWords;
            result.textEnd = endWords;
        }
        return result;
    }
    catch (error) {
        console.error("[Key Takeaways] Error getting selection data:", error);
        return null;
    }
}
/**
 * Listen for requests to get selection data
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getExpandedSelection") {
        const selectionData = getSelectionData();
        sendResponse(selectionData || { text: request.text || "" });
    }
    return true; // Keep the message channel open for async response
});
console.log("[Key Takeaways] Content script loaded");
//# sourceMappingURL=content-script.js.map