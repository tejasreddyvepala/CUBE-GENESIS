// ============================================================
// CUBE GENESIS — Lineage Tracker
// Tracks parent-child tree for all cubes (living and recently dead).
// Implements the leaf-node selection algorithm for the save system.
// ============================================================

import { CONFIG } from '../config.ts';
import { Cube } from '../entities/Cube.ts';

export interface LineageEdge {
  childId: number;
  parentId: number;
}

export class LineageTracker {
  // childId → parentId mapping (all cubes ever, capped)
  private edges: Map<number, number> = new Map();

  // ──────────────────────────────────────────────
  // REGISTRATION
  // ──────────────────────────────────────────────

  addCube(id: number, parentId: number): void {
    if (parentId !== 0) {
      this.edges.set(id, parentId);
    }
    // Cap edges to prevent unbounded growth
    if (this.edges.size > CONFIG.LINEAGE_TREE_MAX_EDGES) {
      // Remove oldest entries (first inserted)
      const iter = this.edges.keys();
      const toRemove = iter.next().value;
      if (toRemove !== undefined) this.edges.delete(toRemove);
    }
  }

  // ──────────────────────────────────────────────
  // ANCESTRY QUERY
  // ──────────────────────────────────────────────

  getParentChain(id: number): number[] {
    const chain: number[] = [];
    let current = id;
    const visited = new Set<number>();
    while (this.edges.has(current) && !visited.has(current)) {
      visited.add(current);
      const parent = this.edges.get(current)!;
      chain.push(parent);
      current = parent;
    }
    return chain;
  }

  getTreeDepth(id: number): number {
    return this.getParentChain(id).length;
  }

  // ──────────────────────────────────────────────
  // LEAF NODE SELECTION ALGORITHM
  // See CLAUDE.md for full specification.
  // ──────────────────────────────────────────────

  selectLeafNodes(aliveCubes: Cube[]): { leaves: Cube[]; ghosts: Cube[] } {
    // Build parent → alive children map
    const childrenOf = new Map<number, number[]>();
    const cubeMap = new Map<number, Cube>();

    for (const cube of aliveCubes) {
      cubeMap.set(cube.id, cube);
      const parentId = cube.lineage[0] ?? null;
      if (parentId !== null) {
        if (!childrenOf.has(parentId)) childrenOf.set(parentId, []);
        childrenOf.get(parentId)!.push(cube.id);
      }
    }

    const leaves: Cube[] = [];
    const ghosts: Cube[] = [];

    for (const cube of aliveCubes) {
      const children = childrenOf.get(cube.id) ?? [];
      const aliveChildren = children.filter(cid => cubeMap.has(cid));
      if (aliveChildren.length === 0) {
        leaves.push(cube);
      } else {
        ghosts.push(cube);
      }
    }

    // Sort leaves: deepest generation first, then highest fitness
    leaves.sort((a, b) => {
      if (b.generation !== a.generation) return b.generation - a.generation;
      return b.fitness - a.fitness;
    });

    // Assign each ghost its nearest leaf descendant for brain cloning on load
    for (const ghost of ghosts) {
      const descendantLeaf = this._findNearestLeafDescendant(ghost.id, childrenOf, cubeMap, leaves);
      ghost._nearestLeafId = descendantLeaf?.id ?? leaves[0]?.id;
    }

    return { leaves, ghosts };
  }

  private _findNearestLeafDescendant(
    ghostId: number,
    childrenOf: Map<number, number[]>,
    cubeMap: Map<number, Cube>,
    leaves: Cube[]
  ): Cube | null {
    // BFS from ghost to find a leaf descendant
    const queue: number[] = [ghostId];
    const visited = new Set<number>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const children = childrenOf.get(current) ?? [];
      for (const childId of children) {
        const child = cubeMap.get(childId);
        if (!child) continue;
        // Check if this child is a leaf
        const isLeaf = leaves.some(l => l.id === childId);
        if (isLeaf) return child;
        queue.push(childId);
      }
    }

    return null;
  }

  // ──────────────────────────────────────────────
  // SERIALIZATION
  // ──────────────────────────────────────────────

  serialize(): LineageEdge[] {
    const result: LineageEdge[] = [];
    this.edges.forEach((parentId, childId) => {
      result.push({ childId, parentId });
    });
    return result;
  }

  deserialize(edges: LineageEdge[]): void {
    this.edges.clear();
    for (const { childId, parentId } of edges) {
      this.edges.set(childId, parentId);
    }
  }

  getRoots(aliveCubes: Cube[]): number[] {
    // Cubes with no parent in edges = genesis cubes
    return aliveCubes
      .filter(c => !this.edges.has(c.id))
      .map(c => c.id);
  }

  getAllEdges(): Array<[number, number]> {
    const result: Array<[number, number]> = [];
    this.edges.forEach((parentId, childId) => {
      result.push([childId, parentId]);
    });
    return result;
  }
}
