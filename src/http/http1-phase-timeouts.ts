import type { ClientRequest } from "node:http";
import type { Socket } from "node:net";
import { TLSSocket } from "node:tls";
import {
  HttpPhaseTimeoutError,
  type HttpTimeoutPhase,
} from "./phase-timeout.js";

export interface Http1PhaseTimeoutConfig {
  readonly connectTimeoutMs: number;
  readonly firstByteTimeoutMs: number;
}

export class Http1PhaseTimeouts {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private connected = false;
  private readonly request: ClientRequest;
  private readonly config: Http1PhaseTimeoutConfig;

  public constructor(request: ClientRequest, config: Http1PhaseTimeoutConfig) {
    this.request = request;
    this.config = config;
    this.arm("connect", config.connectTimeoutMs);
  }

  public observe(socket: Socket): void {
    if (!socket.connecting) {
      this.markConnected();
      return;
    }
    if (socket instanceof TLSSocket) {
      socket.once("secureConnect", () => this.markConnected());
      return;
    }
    socket.once("connect", () => this.markConnected());
  }

  public markResponseStarted(): void {
    this.clear();
  }

  public close(): void {
    this.clear();
  }

  private markConnected(): void {
    if (this.connected) return;
    this.connected = true;
    this.arm("first-byte", this.config.firstByteTimeoutMs);
  }

  private arm(phase: HttpTimeoutPhase, timeoutMs: number): void {
    this.clear();
    this.timer = setTimeout(() => {
      this.request.destroy(new HttpPhaseTimeoutError(phase));
    }, timeoutMs);
  }

  private clear(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
  }
}
