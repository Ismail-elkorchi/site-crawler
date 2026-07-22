export type EvidenceKind = "html" | "xml" | "rendered-html";
export type EvidenceHashAlgorithm = "sha256";

export type EvidenceCapture =
  | {
      readonly kind: "complete";
      readonly sourceByteLength: number;
    }
  | {
      readonly kind: "truncated";
      readonly sourceByteLength: number | null;
      readonly limitBytes: number;
    };

export interface EvidenceReference {
  readonly schemaId: "site-crawler.evidenceReference";
  readonly schemaVersion: 1;
  readonly algorithm: EvidenceHashAlgorithm;
  readonly digest: string;
  readonly kind: EvidenceKind;
  readonly mediaType: string;
  readonly byteLength: number;
  readonly capture: EvidenceCapture;
  readonly relativePath: string;
  readonly createdAt: string;
}

export interface EvidenceWriteResult {
  readonly reference: EvidenceReference;
  readonly created: boolean;
}

export interface EvidenceAssociation {
  readonly schemaId: "site-crawler.evidenceAssociation";
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly reference: EvidenceReference;
  readonly recordedAt: string;
}

export interface EvidenceBundleFile {
  readonly sourcePath: string;
  readonly bundlePath: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly storedByteLength: number;
  readonly contentEncoding: "identity" | "gzip";
}

export interface EvidenceBundleManifest {
  readonly schemaId: "site-crawler.evidenceBundle";
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly sourceDirectory: string;
  readonly createdAt: string;
  readonly compressed: boolean;
  readonly objectCount: number;
  readonly totalBytes: number;
  readonly storedBytes: number;
  readonly files: readonly EvidenceBundleFile[];
}

export interface EvidenceBundleOptions {
  readonly targetDirectory?: string;
  readonly compressObjects?: boolean;
}

export interface EvidenceBundleVerificationIssue {
  readonly code: string;
  readonly message: string;
  readonly path: string | null;
}

export interface EvidenceBundleVerification {
  readonly schemaId: "site-crawler.evidenceBundleVerification";
  readonly schemaVersion: 1;
  readonly bundleDirectory: string;
  readonly verifiedAt: string;
  readonly valid: boolean;
  readonly verifiedFiles: number;
  readonly issues: readonly EvidenceBundleVerificationIssue[];
}
