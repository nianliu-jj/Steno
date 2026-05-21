export interface OutlineNode {
  id: string;
  text: string;
  level: number;
  line: number;
  children: OutlineNode[];
}

export interface FlatHeading {
  id: string;
  text: string;
  level: number;
  line: number;
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;

export function useMarkdownOutline() {
  function listHeadings(content: string): FlatHeading[] {
    return content
      .split('\n')
      .map((rawLine, index) => {
        const match = HEADING_RE.exec(rawLine);
        if (!match) return null;

        return {
          id: `heading-${index + 1}`,
          text: match[2].trim(),
          level: match[1].length,
          line: index + 1,
        } satisfies FlatHeading;
      })
      .filter((heading): heading is FlatHeading => heading !== null);
  }

  function buildOutline(content: string): OutlineNode[] {
    const roots: OutlineNode[] = [];
    const stack: OutlineNode[] = [];

    for (const heading of listHeadings(content)) {
      const node: OutlineNode = { ...heading, children: [] };

      while (stack.length > 0 && stack.at(-1)!.level >= node.level) {
        stack.pop();
      }

      if (stack.length === 0) {
        roots.push(node);
      } else {
        stack.at(-1)!.children.push(node);
      }

      stack.push(node);
    }

    return roots;
  }

  function decorateHeadingAnchors(html: string, headings: FlatHeading[]): string {
    if (headings.length === 0) return html;

    let headingIndex = 0;

    return html.replace(/<h([1-6])>/g, (match) => {
      const heading = headings[headingIndex];
      headingIndex += 1;
      if (!heading) return match;
      return `<h${heading.level} id="${heading.id}" data-heading-id="${heading.id}">`;
    });
  }

  return {
    listHeadings,
    buildOutline,
    decorateHeadingAnchors,
  };
}
