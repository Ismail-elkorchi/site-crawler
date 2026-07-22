import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { FRONTIER_SCHEMA } from "./sqlite-schema.js";
import {
  ensurePrivateDirectory,
  protectPrivateFile,
} from "../../core/private-files.js";

export class SqliteConnection {
  private handle: DatabaseSync | null = null;
  private readonly databasePath: string;
  private readonly fullSync: boolean;

  public constructor(databasePath: string, fullSync: boolean) {
    this.databasePath = databasePath;
    this.fullSync = fullSync;
  }

  public async open(): Promise<void> {
    await ensurePrivateDirectory(path.dirname(this.databasePath));
    this.handle = new DatabaseSync(this.databasePath);
    await protectPrivateFile(this.databasePath);
    this.database().exec(FRONTIER_SCHEMA);
    this.database().exec(
      this.fullSync
        ? "PRAGMA synchronous = FULL;"
        : "PRAGMA synchronous = NORMAL;",
    );
  }

  public database(): DatabaseSync {
    if (this.handle === null)
      throw new Error("SQLite frontier is not initialized.");
    return this.handle;
  }

  public transaction<T>(operation: () => T): T {
    const database = this.database();
    database.exec("BEGIN IMMEDIATE;");
    try {
      const result = operation();
      database.exec("COMMIT;");
      return result;
    } catch (caught) {
      database.exec("ROLLBACK;");
      throw caught;
    }
  }

  public flush(): void {
    if (this.handle !== null)
      this.handle.exec("PRAGMA wal_checkpoint(PASSIVE);");
  }

  public close(): void {
    if (this.handle === null) return;
    this.handle.close();
    this.handle = null;
  }
}
