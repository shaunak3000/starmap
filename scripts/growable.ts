/**
 * Minimal growable typed arrays.
 *
 * The pipeline streams ~2.5M catalogue rows and cannot know a tier's final size
 * up front. Pushing into plain JS arrays would box every number; doubling a
 * typed array keeps the whole run inside a few hundred megabytes.
 */

export class GrowableFloat32 {
  private buffer: Float32Array
  private length = 0

  constructor(initialCapacity = 1024) {
    this.buffer = new Float32Array(initialCapacity)
  }

  push(...values: number[]): void {
    if (this.length + values.length > this.buffer.length) {
      this.grow(this.length + values.length)
    }
    for (const value of values) {
      this.buffer[this.length++] = value
    }
  }

  private grow(minimum: number): void {
    let capacity = this.buffer.length || 1
    while (capacity < minimum) capacity *= 2
    const next = new Float32Array(capacity)
    next.set(this.buffer.subarray(0, this.length))
    this.buffer = next
  }

  get size(): number {
    return this.length
  }

  toTypedArray(): Float32Array {
    return this.buffer.slice(0, this.length)
  }
}

export class GrowableUint32 {
  private buffer: Uint32Array
  private length = 0

  constructor(initialCapacity = 1024) {
    this.buffer = new Uint32Array(initialCapacity)
  }

  push(value: number): void {
    if (this.length + 1 > this.buffer.length) {
      this.grow(this.length + 1)
    }
    this.buffer[this.length++] = value
  }

  private grow(minimum: number): void {
    let capacity = this.buffer.length || 1
    while (capacity < minimum) capacity *= 2
    const next = new Uint32Array(capacity)
    next.set(this.buffer.subarray(0, this.length))
    this.buffer = next
  }

  get size(): number {
    return this.length
  }

  toTypedArray(): Uint32Array {
    return this.buffer.slice(0, this.length)
  }
}
