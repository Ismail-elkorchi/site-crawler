export class DeferredReference<T> {
  private value: T | null = null;
  private readonly name: string;

  public constructor(name: string) {
    this.name = name;
  }

  public set(value: T): void {
    if (this.value !== null) {
      throw new Error(`${this.name} was initialized more than once.`);
    }
    this.value = value;
  }

  public get(): T {
    if (this.value === null) {
      throw new Error(`${this.name} was accessed before initialization.`);
    }
    return this.value;
  }
}
