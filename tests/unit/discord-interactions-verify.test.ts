import { generateKeyPairSync, sign } from "node:crypto";

import { describe, expect, it } from "vitest";

import { isValidDiscordSignature } from "@/lib/discord/interactions/verify";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const publicKeyHex = Buffer.from(publicKey.export({ format: "jwk" }).x!, "base64url").toString("hex");

function signed(body: string, timestamp = "1700000000") {
  return { body, publicKeyHex, signatureHex: sign(null, Buffer.from(timestamp + body), privateKey).toString("hex"), timestamp };
}

describe("isValidDiscordSignature", () => {
  it("accepts a request signed with the application's key", () => {
    expect(isValidDiscordSignature(signed('{"type":1}'))).toBe(true);
  });

  it("rejects a changed body, timestamp or signature", () => {
    const request = signed('{"type":1}');

    expect(isValidDiscordSignature({ ...request, body: '{"type":2}' })).toBe(false);
    expect(isValidDiscordSignature({ ...request, timestamp: "1700000001" })).toBe(false);
    expect(isValidDiscordSignature({ ...request, signatureHex: request.signatureHex.replace(/^../, "00") })).toBe(false);
  });

  it("rejects missing or malformed headers and a missing key", () => {
    const request = signed("{}");

    expect(isValidDiscordSignature({ ...request, signatureHex: null })).toBe(false);
    expect(isValidDiscordSignature({ ...request, timestamp: null })).toBe(false);
    expect(isValidDiscordSignature({ ...request, signatureHex: "not-hex" })).toBe(false);
    expect(isValidDiscordSignature({ ...request, publicKeyHex: undefined })).toBe(false);
  });

  it("rejects a signature from another key", () => {
    const other = generateKeyPairSync("ed25519");
    const signatureHex = sign(null, Buffer.from("1700000000{}"), other.privateKey).toString("hex");

    expect(isValidDiscordSignature({ body: "{}", publicKeyHex, signatureHex, timestamp: "1700000000" })).toBe(false);
  });
});
