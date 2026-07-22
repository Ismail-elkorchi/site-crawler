import assert from "node:assert/strict";
import { test } from "node:test";
import { CrawlEventHub } from "../dist/events/public.js";

const event = (runId) => ({
  type: "run-started",
  runId,
  createdAt: new Date(0).toISOString(),
});

async function collect(subscription) {
  const values = [];
  for await (const value of subscription) values.push(value);
  return values;
}

test("event hub broadcasts independently to every subscriber", async () => {
  const hub = new CrawlEventHub(4);
  const first = hub.subscribe();
  const second = hub.subscribe();
  hub.emit(event("one"));
  hub.emit(event("two"));
  hub.close();
  assert.deepEqual(
    (await collect(first)).map((value) => value.runId),
    ["one", "two"],
  );
  assert.deepEqual(
    (await collect(second)).map((value) => value.runId),
    ["one", "two"],
  );
});

test("event subscriptions bound memory and count dropped events", async () => {
  const hub = new CrawlEventHub(1);
  const subscription = hub.subscribe();
  hub.emit(event("old"));
  hub.emit(event("new"));
  hub.close();
  const values = await collect(subscription);
  assert.deepEqual(
    values.map((value) => value.runId),
    ["new"],
  );
  assert.equal(subscription.droppedEvents, 1);
  assert.equal(hub.droppedEvents, 1);
});
