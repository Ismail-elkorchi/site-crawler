import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { FileHandle } from "node:fs/promises";

export const PRIVATE_DIRECTORY_MODE = 0o700;
export const PRIVATE_FILE_MODE = 0o600;

export async function ensurePrivateDirectory(directory: string): Promise<void> {
  await fs.mkdir(directory, {
    recursive: true,
    mode: PRIVATE_DIRECTORY_MODE,
  });
  if (process.platform !== "win32") {
    await fs.chmod(directory, PRIVATE_DIRECTORY_MODE);
  }
}

export async function openPrivateFile(
  filePath: string,
  flags: string,
): Promise<FileHandle> {
  const handle = await fs.open(filePath, flags, PRIVATE_FILE_MODE);
  if (process.platform !== "win32") {
    await handle.chmod(PRIVATE_FILE_MODE);
  }
  return handle;
}

export async function protectPrivateFile(filePath: string): Promise<void> {
  if (process.platform !== "win32") {
    await fs.chmod(filePath, PRIVATE_FILE_MODE);
  }
}

export function protectPrivateFileSync(filePath: string): void {
  if (process.platform !== "win32") {
    fsSync.chmodSync(filePath, PRIVATE_FILE_MODE);
  }
}

export async function writePrivateFileAtomic(
  target: string,
  content: string | Uint8Array,
  sync: boolean,
): Promise<void> {
  await ensurePrivateDirectory(path.dirname(target));
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  try {
    const handle = await openPrivateFile(temporary, "wx");
    try {
      if (typeof content === "string") await handle.writeFile(content, "utf8");
      else await handle.writeFile(content);
      if (sync) await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(temporary, target);
    await protectPrivateFile(target);
  } catch (caught) {
    await fs.rm(temporary, { force: true });
    throw caught;
  }
}
