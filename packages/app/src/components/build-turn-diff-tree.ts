import type { ChangedFileEntry } from "@/types/stream";

/**
 * A node in the turn-changes file tree: either a directory (aggregated stats
 * over its children) or a file leaf.
 */
export interface DiffTreeNode {
  /** Path segment this node represents (basename for files, segment for dirs). */
  name: string;
  isDir: boolean;
  /** Full path from the workspace root. */
  path: string;
  additions: number;
  deletions: number;
  children: DiffTreeNode[];
  /**
   * Files only: when another file in the tree shares this basename, the parent
   * directory path to display for disambiguation; null otherwise.
   */
  parentDir: string | null;
}

function entryStats(entry: ChangedFileEntry): { additions: number; deletions: number } {
  return { additions: entry.additions ?? 0, deletions: entry.deletions ?? 0 };
}

interface MutableNode {
  name: string;
  isDir: boolean;
  path: string;
  additions: number;
  deletions: number;
  children: Map<string, MutableNode>;
}

function ensureChild(parent: MutableNode, name: string, isDir: boolean): MutableNode {
  const existing = parent.children.get(name);
  if (existing) {
    return existing;
  }
  const node: MutableNode = {
    name,
    isDir,
    path: parent.path ? `${parent.path}/${name}` : name,
    additions: 0,
    deletions: 0,
    children: new Map(),
  };
  parent.children.set(name, node);
  return node;
}

function toSortedList(node: MutableNode): DiffTreeNode[] {
  const children = [...node.children.values()].sort((a, b) => {
    if (a.isDir !== b.isDir) {
      return a.isDir ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
  return children.map((child) => ({
    name: child.name,
    isDir: child.isDir,
    path: child.path,
    additions: child.additions,
    deletions: child.deletions,
    parentDir: null,
    children: toSortedList(child),
  }));
}

/**
 * Builds a directory-grouped tree from a turn's changed files. Directories
 * aggregate their subtree stats; siblings sort directories first, then by
 * name. Files sharing a basename across different directories carry
 * `parentDir` for row disambiguation.
 * @param files The turn's changed files
 * @returns The sorted tree roots, or an empty array for no files
 */
export function buildTurnDiffTree(files: readonly ChangedFileEntry[]): DiffTreeNode[] {
  const root: MutableNode = {
    name: "",
    isDir: true,
    path: "",
    additions: 0,
    deletions: 0,
    children: new Map(),
  };
  const basenameCounts = new Map<string, number>();
  const seenPaths = new Set<string>();
  for (const file of files) {
    // A duplicated path (malformed feed) must not double its stats.
    if (seenPaths.has(file.path)) {
      continue;
    }
    seenPaths.add(file.path);
    const segments = file.path.split("/").filter((segment) => segment.length > 0);
    if (segments.length === 0) {
      continue;
    }
    const { additions, deletions } = entryStats(file);
    root.additions += additions;
    root.deletions += deletions;
    let current = root;
    for (let index = 0; index < segments.length - 1; index += 1) {
      const segment = segments[index];
      if (!segment) continue;
      const dir = ensureChild(current, segment, true);
      dir.additions += additions;
      dir.deletions += deletions;
      current = dir;
    }
    const basename = segments[segments.length - 1] ?? file.path;
    const fileNode = ensureChild(current, basename, false);
    fileNode.additions = additions;
    fileNode.deletions = deletions;
    basenameCounts.set(basename, (basenameCounts.get(basename) ?? 0) + 1);
  }

  const result = toSortedList(root);
  markDisambiguations(result, basenameCounts);
  return result;
}

function markDisambiguations(nodes: DiffTreeNode[], basenameCounts: Map<string, number>): void {
  for (const node of nodes) {
    if (node.isDir) {
      markDisambiguations(node.children, basenameCounts);
      continue;
    }
    node.parentDir =
      (basenameCounts.get(node.name) ?? 0) > 1 && node.path.includes("/")
        ? node.path.slice(0, node.path.lastIndexOf("/"))
        : null;
  }
}
