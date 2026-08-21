import { ericWebApiBase, ericWebHeaders, readEricEnvelope, type EricWebAuth } from './eric-api';

export interface SafeWordSuggestion {
  source: string;
  replacement: string;
  success: boolean;
  failedWords: string[];
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

export async function getSafeWordSuggestions(
  workspaceId: string,
  terms: string[],
  auth: EricWebAuth,
  signal?: AbortSignal,
): Promise<SafeWordSuggestion[]> {
  const trademarks = [...new Set(terms.map((term) => term.trim()).filter(Boolean))];
  const response = await fetch(`${ericWebApiBase()}/v4/trademark/safe-words`, {
    method: 'POST',
    credentials: 'omit',
    headers: ericWebHeaders(auth),
    body: JSON.stringify({ work_space_id: Number(workspaceId), trademark: trademarks }),
    signal,
  });
  const payload = await readEricEnvelope<unknown>(
    response,
    'ERiC could not generate safer wording.',
  );
  const data = record(payload.data);
  const items = Array.isArray(data.data) ? data.data : [];
  return items.map((entry): SafeWordSuggestion => {
    const item = record(entry);
    return {
      source: text(item.word),
      replacement: text(item.replace_word),
      success: Boolean(item.is_success) && Boolean(text(item.replace_word)),
      failedWords: Array.isArray(item.failed_words)
        ? item.failed_words.map(text).filter(Boolean)
        : [],
    };
  });
}
