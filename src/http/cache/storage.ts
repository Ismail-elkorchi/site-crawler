import { writePrivateFileAtomic } from "../../core/private-files.js";

export async function writeCacheFile(
  filePath: string,
  bytes: Uint8Array,
): Promise<void> {
  await writePrivateFileAtomic(filePath, bytes, false);
}
