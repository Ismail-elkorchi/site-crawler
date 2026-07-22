import type { CrawlEvent } from "./types.js";

export interface CrawlEventSubscription extends AsyncIterable<CrawlEvent> {
  readonly droppedEvents: number;
  close(): void;
}

export class CrawlEventHub {
  private readonly channels = new Set<EventChannel>();
  private readonly defaultCapacity: number;
  private closed = false;
  private droppedFromClosedChannels = 0;

  public constructor(defaultCapacity: number) {
    this.defaultCapacity = defaultCapacity;
  }

  public get droppedEvents(): number {
    let total = this.droppedFromClosedChannels;
    for (const channel of this.channels) total += channel.droppedEvents;
    return total;
  }

  public subscribe(
    capacity: number = this.defaultCapacity,
  ): CrawlEventSubscription {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new TypeError("Event buffer capacity must be a positive integer.");
    }
    let channel: EventChannel;
    channel = new EventChannel(capacity, (dropped) => {
      this.droppedFromClosedChannels += dropped;
      this.channels.delete(channel);
    });
    if (this.closed) channel.close();
    else this.channels.add(channel);
    return channel;
  }

  public emit(event: CrawlEvent): void {
    if (this.closed) return;
    for (const channel of this.channels) channel.emit(event);
  }

  public close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const channel of [...this.channels]) channel.close();
  }
}

class EventChannel implements CrawlEventSubscription {
  private readonly queue: CrawlEvent[] = [];
  private readonly waiters: ((value: IteratorResult<CrawlEvent>) => void)[] =
    [];
  private readonly capacity: number;
  private readonly onClose: (droppedEvents: number) => void;
  private closed = false;
  private dropped = 0;

  public constructor(
    capacity: number,
    onClose: (droppedEvents: number) => void,
  ) {
    this.capacity = capacity;
    this.onClose = onClose;
  }

  public get droppedEvents(): number {
    return this.dropped;
  }

  public emit(event: CrawlEvent): void {
    if (this.closed) return;
    const waiter = this.waiters.shift();
    if (waiter !== undefined) {
      waiter({ done: false, value: event });
      return;
    }
    if (this.queue.length >= this.capacity) {
      this.queue.shift();
      this.dropped += 1;
    }
    this.queue.push(event);
  }

  public close(): void {
    if (this.closed) return;
    this.closed = true;
    this.onClose(this.dropped);
    if (this.queue.length > 0) return;
    this.resolveCompletedWaiters();
  }

  public [Symbol.asyncIterator](): AsyncIterator<CrawlEvent> {
    return { next: async () => await this.next() };
  }

  private async next(): Promise<IteratorResult<CrawlEvent>> {
    const event = this.queue.shift();
    if (event !== undefined) return { done: false, value: event };
    if (this.closed) return { done: true, value: undefined };
    return await new Promise<IteratorResult<CrawlEvent>>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  private resolveCompletedWaiters(): void {
    while (this.waiters.length > 0) {
      this.waiters.shift()?.({ done: true, value: undefined });
    }
  }
}
