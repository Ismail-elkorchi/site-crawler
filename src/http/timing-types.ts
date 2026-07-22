export interface NetworkTimings {
  readonly dnsMs: number | null;
  readonly connectMs: number | null;
  readonly tlsMs: number | null;
  readonly firstByteMs: number | null;
  readonly bodyMs: number | null;
  readonly totalMs: number;
}

export type NegotiatedProtocol = "http/1.1" | "h2" | "unknown";

export interface TlsFacts {
  readonly protocol: string | null;
  readonly cipher: string | null;
  readonly authorized: boolean | null;
  readonly authorizationError: string | null;
  readonly certificateValidTo: string | null;
}
