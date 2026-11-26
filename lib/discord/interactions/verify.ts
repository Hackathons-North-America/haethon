import { createPublicKey, verify, type KeyObject } from "node:crypto";

const keyCache = new Map<string, KeyObject>();

function publicKey(hex: string) {
  let key = keyCache.get(hex);

  if (!key) {
    key = createPublicKey({
      format: "jwk",
      key: { crv: "Ed25519", kty: "OKP", x: Buffer.from(hex, "hex").toString("base64url") },
    });
    keyCache.set(hex, key);
  }

  return key;
}

/**
 * Whether a request really came from Discord: every interaction is signed
 * with the application's Ed25519 key over timestamp + raw body. Discord sends
 * deliberately bad signatures when the endpoint is registered and refuses
 * endpoints that accept them, so this must reject anything that fails.
 */
export function isValidDiscordSignature(input: {
  body: string;
  publicKeyHex: string | undefined;
  signatureHex: string | null;
  timestamp: string | null;
}) {
  const { body, publicKeyHex, signatureHex, timestamp } = input;

  if (!publicKeyHex || !signatureHex || !timestamp || !/^[0-9a-f]{128}$/i.test(signatureHex)) {
    return false;
  }

  try {
    return verify(null, Buffer.from(timestamp + body), publicKey(publicKeyHex), Buffer.from(signatureHex, "hex"));
  } catch {
    return false;
  }
}
