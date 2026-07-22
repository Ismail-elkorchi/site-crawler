export const SITE_CRAWLER_SCHEMA_VERSION = 1;
export type SiteCrawlerSchemaVersion = typeof SITE_CRAWLER_SCHEMA_VERSION;

export interface SchemaIdentity<SchemaId extends string = string> {
  readonly schemaId: SchemaId;
  readonly schemaVersion: SiteCrawlerSchemaVersion;
}

export function hasCurrentSchema(
  value: Readonly<Record<string, unknown>>,
  schemaId: string,
): boolean {
  return (
    value["schemaId"] === schemaId &&
    value["schemaVersion"] === SITE_CRAWLER_SCHEMA_VERSION
  );
}

export function assertCurrentSchema(
  value: Readonly<Record<string, unknown>>,
  schemaId: string,
  description: string,
): void {
  if (!hasCurrentSchema(value, schemaId)) {
    throw new Error(
      `${description} must use ${schemaId} schema version ${SITE_CRAWLER_SCHEMA_VERSION}.`,
    );
  }
}
