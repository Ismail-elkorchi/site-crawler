export interface MemoryResponseBody {
  readonly kind: "memory";
  readonly bytes: Uint8Array;
  readonly size: number;
}

export interface FileResponseBody {
  readonly kind: "file";
  readonly path: string;
  readonly size: number;
  readonly temporary: boolean;
}

export type ResponseBody = MemoryResponseBody | FileResponseBody;
