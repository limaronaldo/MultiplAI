import type { CodebaseIndex } from "./codebase-index";

export class CodebaseSearch<TMeta = unknown> {
  constructor(private index: CodebaseIndex<TMeta>) {}

  search(query: string): TMeta[] {
    return this.index.search(query);
  }
}

