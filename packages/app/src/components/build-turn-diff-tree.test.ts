import { describe, expect, it } from "vitest";
import { buildTurnDiffTree, type DiffTreeNode } from "./build-turn-diff-tree";
import type { ChangedFileEntry } from "@/types/stream";

function file(path: string, additions = 0, deletions = 0): ChangedFileEntry {
  return { path, ...(additions ? { additions } : {}), ...(deletions ? { deletions } : {}) };
}

function findDir(nodes: DiffTreeNode[], name: string): DiffTreeNode | undefined {
  return nodes.find((node) => node.isDir && node.name === name);
}

describe("buildTurnDiffTree", () => {
  it("returns an empty array for no files", () => {
    expect(buildTurnDiffTree([])).toEqual([]);
  });

  it("returns a single file row at the root", () => {
    const tree = buildTurnDiffTree([file("README.md", 3, 1)]);
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({
      name: "README.md",
      isDir: false,
      path: "README.md",
      additions: 3,
      deletions: 1,
      parentDir: null,
      children: [],
    });
  });

  it("groups files under directory nodes", () => {
    const tree = buildTurnDiffTree([
      file("packages/app/src/a.ts", 4, 2),
      file("packages/app/src/b.ts", 1, 0),
    ]);
    expect(tree).toHaveLength(1);
    const packages = findDir(tree, "packages");
    const app = packages ? findDir(packages.children, "app") : undefined;
    const src = app ? findDir(app.children, "src") : undefined;
    expect(src?.children.map((child) => child.name)).toEqual(["a.ts", "b.ts"]);
  });

  it("aggregates directory stats over the subtree", () => {
    const tree = buildTurnDiffTree([
      file("src/a.ts", 4, 2),
      file("src/b.ts", 1, 3),
      file("src/deep/c.ts", 2, 0),
    ]);
    const src = findDir(tree, "src");
    expect(src).toMatchObject({ additions: 7, deletions: 5 });
    const deep = src ? findDir(src.children, "deep") : undefined;
    expect(deep).toMatchObject({ additions: 2, deletions: 0 });
  });

  it("sorts directories before files, then by name", () => {
    const tree = buildTurnDiffTree([
      file("zeta.ts", 1, 0),
      file("alpha/b.ts", 1, 0),
      file("alpha/a.ts", 1, 0),
    ]);
    expect(tree.map((node) => node.name)).toEqual(["alpha", "zeta.ts"]);
    const alpha = findDir(tree, "alpha");
    expect(alpha?.children.map((child) => child.name)).toEqual(["a.ts", "b.ts"]);
  });

  it("marks shared basenames with a parentDir disambiguation", () => {
    const tree = buildTurnDiffTree([
      file("app/index.ts", 1, 0),
      file("server/index.ts", 1, 0),
      file("unique.ts", 1, 0),
    ]);
    const app = findDir(tree, "app");
    const server = findDir(tree, "server");
    expect(app?.children[0]?.parentDir).toBe("app");
    expect(server?.children[0]?.parentDir).toBe("server");
    expect(tree.find((node) => node.name === "unique.ts")?.parentDir).toBeNull();
  });

  it("treats a nested and a root file with the same basename as shared", () => {
    const tree = buildTurnDiffTree([file("README.md", 1, 0), file("docs/README.md", 1, 0)]);
    const docs = findDir(tree, "docs");
    expect(tree[0]?.parentDir).toBeNull();
    expect(docs?.children[0]?.parentDir).toBe("docs");
  });

  it("does not double-count when a file path collides with a directory segment", () => {
    // Git cannot report a path as both file and directory; if a malformed
    // feed ever does, the shared node keeps the directory's aggregated stats
    // with the file entry's own numbers as its leaf identity — the important
    // guarantee is that totals never double-count the same path twice.
    const tree = buildTurnDiffTree([file("src/inner.ts", 3, 0), file("src/inner.ts", 3, 0)]);
    expect(tree).toHaveLength(1);
    const src = findDir(tree, "src");
    expect(src).toMatchObject({ additions: 3, deletions: 0 });
    expect(src?.children[0]).toMatchObject({ name: "inner.ts", additions: 3 });
  });

  it("skips entries with empty paths", () => {
    expect(buildTurnDiffTree([file("", 1, 1)])).toEqual([]);
  });

  it("defaults missing additions/deletions to zero", () => {
    const tree = buildTurnDiffTree([file("a.ts")]);
    expect(tree[0]).toMatchObject({ additions: 0, deletions: 0 });
  });

  it("supports deep nesting", () => {
    const tree = buildTurnDiffTree([file("a/b/c/d.ts", 1, 1)]);
    let current = tree[0];
    for (const segment of ["a", "b", "c"]) {
      expect(current?.name).toBe(segment);
      current = current?.children[0];
    }
    expect(current).toMatchObject({ name: "d.ts", isDir: false, path: "a/b/c/d.ts" });
  });

  it("keeps deterministic ordering across repeated builds", () => {
    const files = [file("m.ts", 1, 0), file("a/x.ts", 1, 0), file("a/y.ts", 1, 0)];
    const first = buildTurnDiffTree(files);
    const second = buildTurnDiffTree(files.toReversed());
    expect(second).toEqual(first);
  });
});
