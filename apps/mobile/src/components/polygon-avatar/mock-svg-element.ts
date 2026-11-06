const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Just enough of the SVG DOM for the polygon engine to draw into without a browser.
 * The native renderer walks the resulting tree and mirrors it with react-native-svg.
 */
export class MockSvgElement {
  tagName: string;
  namespaceURI: string;
  attrs: Record<string, string> = {};
  children: MockSvgElement[] = [];
  style: { opacity?: string } = {};

  constructor(tagName: string, namespaceURI = SVG_NS) {
    this.tagName = tagName;
    this.namespaceURI = namespaceURI;
  }

  setAttribute(name: string, value: string) {
    this.attrs[name] = value;
  }

  getAttribute(name: string) {
    return this.attrs[name] ?? null;
  }

  removeAttribute(name: string) {
    delete this.attrs[name];
  }

  appendChild(node: MockSvgElement) {
    this.children.push(node);
    return node;
  }

  removeChild(node: MockSvgElement) {
    const index = this.children.indexOf(node);
    if (index >= 0) this.children.splice(index, 1);
    return node;
  }

  prepend(node: MockSvgElement) {
    this.children.unshift(node);
  }

  replaceChildren(...nodes: MockSvgElement[]) {
    this.children = nodes;
  }

  get childNodes() {
    return this.children as unknown as NodeListOf<ChildNode>;
  }

  get lastChild(): MockSvgElement | null {
    return this.children.at(-1) ?? null;
  }

  set innerHTML(markup: string) {
    this.children = parseSvgMarkup(markup);
  }

  /** Supports the only selector form the engine uses: `:scope > tag`. */
  querySelector(selector: string): MockSvgElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): MockSvgElement[] {
    const tag = selector.replace(/^:scope\s*>\s*/, "");
    return this.children.filter((child) => child.tagName === tag);
  }
}

/** Stands in for `document`; the engine is typed against the DOM it normally runs on. */
export function createMockSvgDocument(): Pick<Document, "createElementNS"> {
  return {
    createElementNS(_ns: string, tag: string) {
      return new MockSvgElement(tag);
    },
  } as unknown as Pick<Document, "createElementNS">;
}

/** Parses the flat, self-closing markup used by shapes and glyphs (`<path d="…"/>`). */
export function parseSvgMarkup(markup: string): MockSvgElement[] {
  const nodes: MockSvgElement[] = [];
  for (const [, tag, rest] of markup.matchAll(/<([a-zA-Z]+)\b([^>]*?)\/?>/g)) {
    const node = new MockSvgElement(tag!);
    for (const [, name, value] of rest!.matchAll(/([a-zA-Z:-]+)="([^"]*)"/g)) {
      if (name !== "xmlns") node.setAttribute(name!, value!);
    }
    nodes.push(node);
  }
  return nodes;
}

export function pathDataFromMarkup(markup: string) {
  const match = markup.match(/\sd=\"([^\"]+)\"/);
  return match?.[1] ?? "";
}
