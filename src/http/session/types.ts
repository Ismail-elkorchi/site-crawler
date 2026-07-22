export interface InitialCookie {
  readonly url: string;
  readonly cookie: string;
}

export interface BasicAuthCredential {
  readonly origin: string;
  readonly username: string;
  readonly password: string;
}

export interface BearerCredential {
  readonly origin: string;
  readonly token: string;
}

export interface SessionConfig {
  readonly enabled: boolean;
  readonly persistCookies: boolean;
  readonly cookieFile: string | null;
  readonly initialCookies: readonly InitialCookie[];
  readonly basicAuth: readonly BasicAuthCredential[];
  readonly bearerAuth: readonly BearerCredential[];
}
