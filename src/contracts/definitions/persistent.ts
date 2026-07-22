import type { ObjectContractOptions } from "../object-contract.js";
import { crawlDefinitions } from "./persistent/crawl.js";
import { documentDefinitions } from "./persistent/documents.js";
import { evidenceDefinitions } from "./persistent/evidence.js";
import { operationsDefinitions } from "./persistent/operations.js";

export const persistentObjectDefinitions: readonly ObjectContractOptions[] = [
  ...crawlDefinitions,
  ...documentDefinitions,
  ...evidenceDefinitions,
  ...operationsDefinitions,
];
