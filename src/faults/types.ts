export type FaultPoint =
  | "before-journal-append"
  | "after-journal-append"
  | "before-terminal-transition"
  | "after-terminal-transition"
  | "before-manifest-write"
  | "after-manifest-write"
  | "before-evidence-write"
  | "after-evidence-write";
