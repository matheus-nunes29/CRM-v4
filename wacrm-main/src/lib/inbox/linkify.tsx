import type { ReactNode } from "react";

const URL_REGEX = /\b(?:https?:\/\/|www\.)[^\s<]+/gi;
// Sentences often end right after a URL ("confira: https://x.com.") — strip
// trailing punctuation that's almost certainly part of the sentence, not the URL.
const TRAILING_PUNCTUATION = /[.,!?;:'")\]]+$/;

/** Splits message text into plain strings and clickable <a> tags for any URL found. */
export function linkifyText(text: string): ReactNode[] {
  const regex = new RegExp(URL_REGEX);
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    let url = match[0];
    const trailing = url.match(TRAILING_PUNCTUATION);
    if (trailing) url = url.slice(0, -trailing[0].length);

    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const href = url.startsWith("http") ? url : `https://${url}`;
    nodes.push(
      <a
        key={key++}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        className="underline underline-offset-2 break-all hover:opacity-80"
      >
        {url}
      </a>,
    );
    lastIndex = match.index + url.length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}
