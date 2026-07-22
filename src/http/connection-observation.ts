import type { Socket } from "node:net";
import { TLSSocket } from "node:tls";
import type { CrawlError } from "../diagnostics/types.js";
import { failure } from "./result-factory.js";
import type { ResponseReadContext } from "./response-reader.js";
import type { TlsFacts } from "./timing-types.js";
import type { FetchResult } from "./types.js";

export class ConnectionObservation {
  private connectMs: number | null = null;
  private tlsMs: number | null = null;
  private firstByteMs: number | null = null;
  private connectedAt: number | null = null;
  private readonly requestStartedAt: number;
  private readonly dnsMs: number;

  public constructor(requestStartedAt: number, dnsMs: number) {
    this.requestStartedAt = requestStartedAt;
    this.dnsMs = dnsMs;
  }

  public observe(socket: Socket): void {
    const socketStartedAt = performance.now();
    if (!socket.connecting) {
      this.connectMs = 0;
      this.connectedAt = socketStartedAt;
    } else {
      socket.once("connect", () => {
        this.connectMs = performance.now() - socketStartedAt;
        this.connectedAt = performance.now();
      });
    }
    if (socket instanceof TLSSocket) {
      socket.once("secureConnect", () => {
        const base = this.connectedAt ?? socketStartedAt;
        this.tlsMs = performance.now() - base;
      });
    }
  }

  public markFirstByte(): void {
    this.firstByteMs = performance.now() - this.requestStartedAt;
  }

  public context(socket: Socket): ResponseReadContext {
    return {
      requestStartedAt: this.requestStartedAt,
      dnsMs: this.dnsMs,
      connectMs: this.connectMs,
      tlsMs: this.tlsMs,
      firstByteMs: this.firstByteMs,
      protocol: "http/1.1",
      tls: tlsFacts(socket),
    };
  }

  public failure(
    code: CrawlError["code"],
    message: string,
    url: string,
    requestId: string,
    statusCode: number | null,
    headers: Headers,
    cause: unknown,
    retryable: boolean,
  ): FetchResult {
    return withTransportTiming(
      failure(
        code,
        message,
        url,
        requestId,
        statusCode,
        headers,
        cause,
        retryable,
      ),
      this.requestStartedAt,
      this.dnsMs,
      this.connectMs,
      this.tlsMs,
      this.firstByteMs,
    );
  }
}

export function withTransportTiming(
  result: FetchResult,
  startedAt: number,
  dnsMs: number,
  connectMs: number | null = null,
  tlsMs: number | null = null,
  firstByteMs: number | null = null,
): FetchResult {
  const totalMs = performance.now() - startedAt;
  return {
    ...result,
    responseTimeMs: totalMs,
    timings: {
      dnsMs,
      connectMs,
      tlsMs,
      firstByteMs,
      bodyMs: null,
      totalMs,
    },
  };
}

function tlsFacts(socket: Socket): TlsFacts | null {
  if (!(socket instanceof TLSSocket)) return null;
  const certificate = socket.getPeerCertificate();
  const cipher = socket.getCipher();
  const authorizationError = socket.authorizationError;
  return {
    protocol: socket.getProtocol(),
    cipher: cipher?.name ?? null,
    authorized: socket.authorized,
    authorizationError:
      authorizationError === undefined ? null : String(authorizationError),
    certificateValidTo: certificate.valid_to ?? null,
  };
}
