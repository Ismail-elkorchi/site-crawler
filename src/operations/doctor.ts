import { installedPackageVersion } from "../core/dependency-version.js";
import { SITE_CRAWLER_VERSION } from "../core/version.js";
import type { DoctorReport } from "./types.js";

export async function doctor(): Promise<DoctorReport> {
  const issues: string[] = [];
  const major = Number(process.versions.node.split(".")[0]);
  if (!Number.isInteger(major) || major < 24) {
    issues.push("Node.js 24 or newer is required by the package contract.");
  }
  return {
    crawlerVersion: SITE_CRAWLER_VERSION,
    nodeVersion: process.versions.node,
    platform: process.platform,
    architecture: process.arch,
    sqlite: await available("node:sqlite"),
    playwright: await available("playwright-core"),
    htmlParserVersion: installedPackageVersion("@ismail-elkorchi/html-parser"),
    xmlParserVersion: installedPackageVersion("@ismail-elkorchi/xml-parser"),
    issues,
  };
}

async function available(specifier: string): Promise<boolean> {
  try {
    await import(specifier);
    return true;
  } catch {
    return false;
  }
}
