// ============================================================
// CUBE GENESIS — Spatial Hash Grid
// O(1) insertion/removal, O(k) neighbor lookup where k is the
// number of entities in nearby cells.
//
// The world is divided into a grid of square cells.
// Each cell is keyed by "gx,gz" string where gx/gz are integer
// grid coordinates. A cell holds a Set of entity IDs.
//
// Entities store their current cell so removal is O(1).
// ============================================================

export class SpatialHash {
  private cells: Map<string, Set<number>>;
  private entityCells: Map<number, string>; // entityId -> current cell key
  private readonly cellSize: number;

  constructor(cellSize: number) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this.entityCells = new Map();
  }

  // ──────────────────────────────────────────────
  // GRID COORDINATE CONVERSION
  // ──────────────────────────────────────────────

  private toCell(x: number, z: number): [number, number] {
    return [Math.floor(x / this.cellSize), Math.floor(z / this.cellSize)];
  }

  private cellKey(gx: number, gz: number): string {
    return `${gx},${gz}`;
  }

  private worldToKey(x: number, z: number): string {
    const [gx, gz] = this.toCell(x, z);
    return this.cellKey(gx, gz);
  }

  // ──────────────────────────────────────────────
  // MUTATION OPERATIONS
  // ──────────────────────────────────────────────

  /**
   * Insert entity into the spatial hash at position (x, z).
   * If the entity is already inserted, use update() instead.
   */
  insert(id: number, x: number, z: number): void {
    const key = this.worldToKey(x, z);

    let cell = this.cells.get(key);
    if (!cell) {
      cell = new Set();
      this.cells.set(key, cell);
    }
    cell.add(id);
    this.entityCells.set(id, key);
  }

  /**
   * Remove an entity from the spatial hash.
   * If the entity is not in the hash, this is a no-op.
   */
  remove(id: number): void {
    const key = this.entityCells.get(id);
    if (key === undefined) return;

    const cell = this.cells.get(key);
    if (cell) {
      cell.delete(id);
      // Clean up empty cells to prevent unbounded map growth
      if (cell.size === 0) {
        this.cells.delete(key);
      }
    }
    this.entityCells.delete(id);
  }

  /**
   * Update an entity's position. Only triggers a cell change if the
   * entity has moved to a different grid cell, making this very cheap
   * when entities stay within the same cell across frames.
   */
  update(id: number, oldX: number, oldZ: number, newX: number, newZ: number): void {
    const oldKey = this.worldToKey(oldX, oldZ);
    const newKey = this.worldToKey(newX, newZ);

    if (oldKey === newKey) return; // still in same cell — nothing to do

    // Remove from old cell
    const oldCell = this.cells.get(oldKey);
    if (oldCell) {
      oldCell.delete(id);
      if (oldCell.size === 0) {
        this.cells.delete(oldKey);
      }
    }

    // Insert into new cell
    let newCell = this.cells.get(newKey);
    if (!newCell) {
      newCell = new Set();
      this.cells.set(newKey, newCell);
    }
    newCell.add(id);
    this.entityCells.set(id, newKey);
  }

  /**
   * Move entity to a new position (convenience wrapper over update).
   * Uses stored old cell. If entity not found, inserts.
   */
  move(id: number, newX: number, newZ: number): void {
    const oldKey = this.entityCells.get(id);
    if (oldKey === undefined) {
      this.insert(id, newX, newZ);
      return;
    }
    const newKey = this.worldToKey(newX, newZ);
    if (oldKey === newKey) return;

    const oldCell = this.cells.get(oldKey);
    if (oldCell) {
      oldCell.delete(id);
      if (oldCell.size === 0) this.cells.delete(oldKey);
    }

    let newCell = this.cells.get(newKey);
    if (!newCell) {
      newCell = new Set();
      this.cells.set(newKey, newCell);
    }
    newCell.add(id);
    this.entityCells.set(id, newKey);
  }

  // ──────────────────────────────────────────────
  // QUERY OPERATIONS
  // ──────────────────────────────────────────────

  /**
   * Return all entity IDs in the cells overlapping a square area of
   * (radius * 2) centered on (x, z). The result includes entities
   * from all overlapping cells — caller must do precise distance
   * filtering if needed.
   *
   * This is the hot path. It must be fast.
   */
  getNearby(x: number, z: number, radius: number): number[] {
    const [centerGX, centerGZ] = this.toCell(x, z);
    // Number of cells to expand in each direction
    const span = Math.ceil(radius / this.cellSize);

    const result: number[] = [];

    for (let dgx = -span; dgx <= span; dgx++) {
      for (let dgz = -span; dgz <= span; dgz++) {
        const key = this.cellKey(centerGX + dgx, centerGZ + dgz);
        const cell = this.cells.get(key);
        if (!cell) continue;
        cell.forEach(id => result.push(id));
      }
    }

    return result;
  }

  /**
   * Return nearby entity IDs excluding a specific ID (usually the querying entity itself).
   */
  getNearbyExcluding(x: number, z: number, radius: number, excludeId: number): number[] {
    const candidates = this.getNearby(x, z, radius);
    return candidates.filter(id => id !== excludeId);
  }

  /**
   * Return all entity IDs in the exact grid cell containing (x, z).
   */
  getCell(x: number, z: number): number[] {
    const key = this.worldToKey(x, z);
    const cell = this.cells.get(key);
    return cell ? Array.from(cell) : [];
  }

  /**
   * Return all entity IDs currently registered in the hash.
   */
  getAllIds(): number[] {
    return Array.from(this.entityCells.keys());
  }

  /**
   * Check if an entity is currently tracked.
   */
  has(id: number): boolean {
    return this.entityCells.has(id);
  }

  /**
   * Get the current cell key for an entity (useful for debugging).
   */
  getCellKey(id: number): string | undefined {
    return this.entityCells.get(id);
  }

  /**
   * Remove all entities from the hash.
   */
  clear(): void {
    this.cells.clear();
    this.entityCells.clear();
  }

  // ──────────────────────────────────────────────
  // STATISTICS (for debug overlay)
  // ──────────────────────────────────────────────

  get entityCount(): number {
    return this.entityCells.size;
  }

  get cellCount(): number {
    return this.cells.size;
  }

  get activeCells(): Set<string> {
    return new Set(this.cells.keys());
  }

  /**
   * Return average entities per occupied cell (load factor metric).
   */
  get averageLoad(): number {
    if (this.cells.size === 0) return 0;
    return this.entityCells.size / this.cells.size;
  }
}
