import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeBody } from "../dist/experimental/public.js";

const encoder = new TextEncoder();

test("BOM has precedence over HTTP charset", () => {
  const text = encoder.encode("é");
  const body = Uint8Array.from([0xef, 0xbb, 0xbf, ...text]);
  const result = decodeBody(body, "text/html; charset=windows-1252", "html", {
    kind: "replacement",
  });
  assert.equal(result.encoding.source, "bom");
  assert.equal(result.encoding.encoding, "utf-8");
  assert.equal(result.text, "é");
});

test("HTTP charset decodes bytes before markup hints", () => {
  const result = decodeBody(
    Uint8Array.from([0xe9]),
    "text/html; charset=windows-1252",
    "html",
    { kind: "replacement" },
  );
  assert.equal(result.encoding.source, "http-header");
  assert.equal(result.text, "é");
});

test("HTML meta charset is detected", () => {
  const body = Uint8Array.from([
    ...encoder.encode('<meta charset="windows-1252"><p>'),
    0xe9,
    ...encoder.encode("</p>"),
  ]);
  const result = decodeBody(body, "text/html", "html", {
    kind: "replacement",
  });
  assert.equal(result.encoding.source, "html-meta");
  assert.match(result.text, /é/u);
});

test("XML declaration encoding is detected", () => {
  const body = Uint8Array.from([
    ...encoder.encode('<?xml version="1.0" encoding="windows-1252"?><x>'),
    0xe9,
    ...encoder.encode("</x>"),
  ]);
  const result = decodeBody(body, "application/xml", "xml", {
    kind: "replacement",
  });
  assert.equal(result.encoding.source, "xml-declaration");
  assert.match(result.text, /é/u);
});

test("XML byte signatures select UTF-16 without a BOM", () => {
  const utf16be = swapUtf16Endianness(
    Buffer.from(
      '<?xml version="1.0" encoding="utf-16be"?><root>é</root>',
      "utf16le",
    ),
  );
  const result = decodeBody(utf16be, "application/xml", "xml", {
    kind: "fatal",
  });
  assert.equal(result.encoding.source, "xml-signature");
  assert.equal(result.encoding.encoding, "utf-16be");
  assert.match(result.text, /<root>é<\/root>/u);
});

function swapUtf16Endianness(input) {
  const result = Uint8Array.from(input);
  for (let index = 0; index < result.length; index += 2) {
    const first = result[index];
    result[index] = result[index + 1];
    result[index + 1] = first;
  }
  return result;
}

test("XML transport charset remains authoritative without a BOM", () => {
  const body = Uint8Array.from([
    ...encoder.encode('<?xml version="1.0" encoding="windows-1252"?><x>'),
    0xe9,
    ...encoder.encode("</x>"),
  ]);
  const result = decodeBody(
    body,
    "application/xml; charset=windows-1252",
    "xml",
    { kind: "fatal" },
  );
  assert.equal(result.encoding.source, "http-header");
  assert.match(result.text, /<x>é<\/x>/u);
});

test("UTF-32 signatures fail as unsupported instead of being misread as UTF-16", () => {
  assert.throws(
    () =>
      decodeBody(
        Uint8Array.from([0xff, 0xfe, 0x00, 0x00, 0x3c, 0x00, 0x00, 0x00]),
        "application/xml",
        "xml",
        { kind: "fatal" },
      ),
    (error) => error?.code === "UNSUPPORTED_ENCODING",
  );
});

test("unsupported charset falls back with a diagnostic", () => {
  const result = decodeBody(
    encoder.encode("hello"),
    "text/plain; charset=not-a-charset",
    "text",
    { kind: "replacement" },
  );
  assert.equal(result.encoding.source, "fallback");
  assert.equal(result.warnings.length, 1);
});

test("replacement characters are reported", () => {
  const result = decodeBody(Uint8Array.from([0xff]), null, "text", {
    kind: "replacement",
  });
  assert.equal(result.encoding.hadReplacementChars, true);
  assert.equal(result.warnings.length, 1);
});
