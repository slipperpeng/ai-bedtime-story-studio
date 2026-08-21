export class RequestGate {
  private generation = 0
  private running = false

  get active(): boolean {
    return this.running
  }

  begin(): number | undefined {
    if (this.running) return undefined
    this.generation += 1
    this.running = true
    return this.generation
  }

  isCurrent(token: number): boolean {
    return this.running && token === this.generation
  }

  finish(token: number): boolean {
    if (!this.isCurrent(token)) return false
    this.running = false
    return true
  }

  cancel(): void {
    this.generation += 1
    this.running = false
  }
}
