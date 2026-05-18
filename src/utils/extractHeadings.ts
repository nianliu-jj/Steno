export interface OutlineHeading {
  id: string;
  level: number;
  text: string;
}

const HEADING_RE = /^(#{1,6})[ \t]+(.+)$/gm;

export function extractHeadings(markdown: string): OutlineHeading[] {
  const out: OutlineHeading[] = [];
  let index = 0;

  for (const match of markdown.matchAll(HEADING_RE)) {
    const text = match[2].trim();
    if (!text) continue;

    out.push({
      id: `heading-${index++}`,
      level: match[1].length,
      text,
    });
  }

  return out;
}
