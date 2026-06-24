/** A bounded undo/redo stack over immutable snapshots. */
export class History<T> {
  private past: T[] = []
  private future: T[] = []
  private current: T
  private limit: number

  constructor(initial: T, limit = 100) {
    this.current = initial
    this.limit = limit
  }

  get value(): T {
    return this.current
  }

  /** Record a new state, clearing the redo stack. */
  push(next: T): void {
    if (next === this.current) {
      return
    }
    this.past.push(this.current)
    if (this.past.length > this.limit) {
      this.past.shift()
    }
    this.future = []
    this.current = next
  }

  /** Replace the current state without creating a history entry (live drag). */
  replace(next: T): void {
    this.current = next
  }

  canUndo(): boolean {
    return this.past.length > 0
  }

  canRedo(): boolean {
    return this.future.length > 0
  }

  undo(): T {
    const previous = this.past.pop()
    if (previous !== undefined) {
      this.future.push(this.current)
      this.current = previous
    }
    return this.current
  }

  redo(): T {
    const next = this.future.pop()
    if (next !== undefined) {
      this.past.push(this.current)
      this.current = next
    }
    return this.current
  }
}
