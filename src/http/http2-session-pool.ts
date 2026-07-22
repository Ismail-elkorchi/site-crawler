import { connect, type ClientHttp2Session } from "node:http2";
import { isIP } from "node:net";
import tls from "node:tls";
import type { NetworkAddress } from "../network/types.js";
import { HttpPhaseTimeoutError } from "./phase-timeout.js";

export class Http2SessionPool {
  private readonly sessions = new Map<string, ClientHttp2Session>();
  private readonly pending = new Map<string, Promise<ClientHttp2Session>>();
  private readonly rejectUnauthorized: boolean;
  private readonly connectTimeoutMs: number;
  private readonly lifetime = new AbortController();
  private closed = false;

  public constructor(rejectUnauthorized: boolean, connectTimeoutMs: number) {
    this.rejectUnauthorized = rejectUnauthorized;
    this.connectTimeoutMs = connectTimeoutMs;
  }

  public async session(
    url: URL,
    address: NetworkAddress,
    signal: AbortSignal,
  ): Promise<ClientHttp2Session> {
    if (this.closed) throw new Error("HTTP/2 session pool is closed.");
    const key = sessionKey(url, address);
    const existing = this.sessions.get(key);
    if (isUsable(existing)) return existing;

    const creating = this.pending.get(key) ?? this.create(key, url, address);
    return await waitForSession(creating, signal);
  }

  public async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.lifetime.abort();
    const sessions = [...this.sessions.values()];
    const pending = [...this.pending.values()];
    this.sessions.clear();
    this.pending.clear();
    await Promise.all([
      ...sessions.map(closeSession),
      Promise.allSettled(pending).then(() => undefined),
    ]);
  }

  private create(
    key: string,
    url: URL,
    address: NetworkAddress,
  ): Promise<ClientHttp2Session> {
    const creating = createSession(
      url,
      address,
      this.lifetime.signal,
      this.rejectUnauthorized,
      this.connectTimeoutMs,
    )
      .then(async (session) => {
        if (this.closed) {
          await closeSession(session);
          throw new Error("HTTP/2 session pool closed during connection.");
        }
        this.sessions.set(key, session);
        const remove = (): void => {
          if (this.sessions.get(key) === session) this.sessions.delete(key);
        };
        session.once("close", remove);
        session.once("error", remove);
        return session;
      })
      .finally(() => {
        if (this.pending.get(key) === creating) this.pending.delete(key);
      });
    this.pending.set(key, creating);
    return creating;
  }
}

function isUsable(
  session: ClientHttp2Session | undefined,
): session is ClientHttp2Session {
  return session !== undefined && !session.closed && !session.destroyed;
}

function createSession(
  url: URL,
  address: NetworkAddress,
  signal: AbortSignal,
  rejectUnauthorized: boolean,
  connectTimeoutMs: number,
): Promise<ClientHttp2Session> {
  return new Promise((resolve, reject) => {
    const authority = `${url.protocol}//${url.host}`;
    const port = url.port === "" ? 443 : Number(url.port);
    const session = connect(authority, {
      createConnection: () =>
        tls.connect({
          host: address.address,
          port,
          ...(isIP(url.hostname) === 0 ? { servername: url.hostname } : {}),
          rejectUnauthorized,
          ALPNProtocols: ["h2"],
        }),
    });
    const timer = setTimeout(() => {
      cleanup();
      const error = new HttpPhaseTimeoutError("connect");
      session.destroy(error);
      reject(error);
    }, connectTimeoutMs);
    const onConnect = (): void => {
      cleanup();
      resolve(session);
    };
    const onAbort = (): void => {
      cleanup();
      const error = new Error("HTTP/2 connection was aborted.");
      session.destroy(error);
      reject(error);
    };
    const onError = (error: Error): void => {
      cleanup();
      session.destroy();
      reject(error);
    };
    const cleanup = (): void => {
      clearTimeout(timer);
      session.off("connect", onConnect);
      session.off("error", onError);
      signal.removeEventListener("abort", onAbort);
    };
    session.once("connect", onConnect);
    session.once("error", onError);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function waitForSession(
  session: Promise<ClientHttp2Session>,
  signal: AbortSignal,
): Promise<ClientHttp2Session> {
  if (signal.aborted)
    return Promise.reject(new Error("HTTP/2 session acquisition was aborted."));
  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      cleanup();
      reject(new Error("HTTP/2 session acquisition was aborted."));
    };
    const cleanup = (): void => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
    void session.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(
          error instanceof Error
            ? error
            : new Error("HTTP/2 connection failed."),
        );
      },
    );
  });
}

function sessionKey(url: URL, address: NetworkAddress): string {
  return `${url.origin}|${address.family}|${address.address}`;
}

function closeSession(session: ClientHttp2Session): Promise<void> {
  if (session.closed) return Promise.resolve();
  return new Promise((resolve) => {
    session.once("close", resolve);
    session.destroy();
  });
}
