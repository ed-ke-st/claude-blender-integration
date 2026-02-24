import { DEFAULT_CHUNK_OVERLAP, DEFAULT_CHUNK_SIZE } from "./constants.js";

function buildLineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) {
      starts.push(i + 1);
    }
  }
  return starts;
}

function lineNumberForOffset(lineStarts, offset) {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= offset) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return Math.max(1, high + 1);
}

export function chunkText(
  text,
  { chunkSize = DEFAULT_CHUNK_SIZE, chunkOverlap = DEFAULT_CHUNK_OVERLAP } = {}
) {
  const normalizedText = (text || "").replace(/\r\n/g, "\n");
  if (!normalizedText.trim()) {
    return [];
  }

  const safeChunkSize = Math.max(200, Number(chunkSize) || DEFAULT_CHUNK_SIZE);
  const safeOverlap = Math.max(0, Number(chunkOverlap) || DEFAULT_CHUNK_OVERLAP);
  const step = Math.max(1, safeChunkSize - Math.min(safeOverlap, safeChunkSize - 1));
  const lineStarts = buildLineStarts(normalizedText);
  const chunks = [];

  for (let start = 0; start < normalizedText.length; start += step) {
    const end = Math.min(normalizedText.length, start + safeChunkSize);
    const snippet = normalizedText.slice(start, end).trim();
    if (!snippet) {
      if (end >= normalizedText.length) break;
      continue;
    }

    chunks.push({
      startOffset: start,
      endOffset: end,
      startLine: lineNumberForOffset(lineStarts, start),
      endLine: lineNumberForOffset(lineStarts, Math.max(start, end - 1)),
      text: snippet,
    });

    if (end >= normalizedText.length) {
      break;
    }
  }

  return chunks;
}
