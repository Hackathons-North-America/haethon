import { lookup } from "node:dns";
import { isIP } from "node:net";
import { Agent, fetch } from "undici";

const MAX_REDIRECTS = 3;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

function ipv4Number(address: string) {
  return address.split(".").reduce((value, part) => (value << 8) + Number(part), 0) >>> 0;
}

function matchesIpv4Cidr(address: string, base: string, prefix: number) {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipv4Number(address) & mask) === (ipv4Number(base) & mask);
}

function embeddedIpv4(address: string) {
  const match = address.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  return match?.[1] ?? null;
}

export function isPrivateOrReservedAddress(address: string) {
  if (isIP(address) === 4) {
    return [
      ["0.0.0.0", 8],
      ["10.0.0.0", 8],
      ["100.64.0.0", 10],
      ["127.0.0.0", 8],
      ["169.254.0.0", 16],
      ["172.16.0.0", 12],
      ["192.0.0.0", 24],
      ["192.0.2.0", 24],
      ["192.168.0.0", 16],
      ["198.18.0.0", 15],
      ["198.51.100.0", 24],
      ["203.0.113.0", 24],
      ["224.0.0.0", 4],
      ["240.0.0.0", 4],
    ].some(([base, prefix]) => matchesIpv4Cidr(address, base as string, prefix as number));
  }

  if (isIP(address) !== 6) {
    return true;
  }

  const normalized = address.toLowerCase();
  const mappedIpv4 = embeddedIpv4(normalized);

  if (mappedIpv4 && (normalized.startsWith("::ffff:") || normalized.startsWith("::"))) {
    return isPrivateOrReservedAddress(mappedIpv4);
  }

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("::ffff:") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("ff") ||
    normalized.startsWith("100:") ||
    normalized.startsWith("2001:db8:")
  );
}

function assertSafeUrl(rawUrl: string) {
  const url = new URL(rawUrl);

  if (!(["http:", "https:"] as string[]).includes(url.protocol) || url.username || url.password) {
    throw new Error("Unsafe image URL.");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();

  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new Error("Unsafe image host.");
  }

  if (isIP(hostname)) {
    if (isPrivateOrReservedAddress(hostname)) {
      throw new Error("Unsafe image address.");
    }
  }

  return url;
}

function createSafeAgent() {
  return new Agent({
    connect: {
      // Validate and pin the exact addresses used by the socket. Doing a
      // separate DNS preflight would still permit a DNS-rebinding race between
      // lookup and connection.
      lookup(hostname, options, callback) {
        lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
          if (error) {
            callback(error, "", 4);
            return;
          }

          if (addresses.length === 0 || addresses.some(({ address }) => isPrivateOrReservedAddress(address))) {
            callback(new Error("Unsafe image address."), "", 4);
            return;
          }

          const candidates = options.family
            ? addresses.filter(({ family }) => family === options.family)
            : addresses;

          if (candidates.length === 0) {
            callback(new Error("Unsafe image address."), "", 4);
            return;
          }

          // Node's Happy Eyeballs path (autoSelectFamily, the default since
          // Node 20) calls lookup with `all: true` and requires the address
          // array back — answering with a single address string here makes
          // every connect throw ERR_INVALID_IP_ADDRESS. Handing back the full
          // validated list also lets Node fall back across address families
          // instead of hanging on an unreachable one.
          if (options.all) {
            callback(null, candidates);
            return;
          }

          callback(null, candidates[0].address, candidates[0].family);
        });
      },
    },
  });
}

export function detectImageContentType(bytes: Uint8Array) {
  if (bytes.length >= 8 && bytes.slice(0, 8).every((byte, index) => byte === [137, 80, 78, 71, 13, 10, 26, 10][index])) {
    return "image/png";
  }

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));

  if (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a") {
    return "image/gif";
  }

  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {
    return "image/webp";
  }

  if (ascii(4, 8) === "ftyp" && ["avif", "avis"].includes(ascii(8, 12))) {
    return "image/avif";
  }

  if (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) {
    return "image/x-icon";
  }

  return null;
}

export async function fetchSafeRemoteImage(rawUrl: string, maxBytes: number) {
  let url = assertSafeUrl(rawUrl);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const agent = createSafeAgent();

    try {
      const response = await fetch(url, {
        dispatcher: agent,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; HaethonBot/1.0)" },
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");

        if (!location || redirectCount === MAX_REDIRECTS) {
          throw new Error("Invalid image redirect.");
        }

        await response.body?.cancel();
        url = assertSafeUrl(new URL(location, url).toString());
        continue;
      }

      const declaredType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? "";
      const declaredLength = Number(response.headers.get("content-length") ?? 0);

      if (!response.ok || !response.body || !ALLOWED_IMAGE_TYPES.has(declaredType) || declaredLength > maxBytes) {
        throw new Error("Upstream image unavailable.");
      }

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;
        length += value.byteLength;

        if (length > maxBytes) {
          await reader.cancel();
          throw new Error("Upstream image is too large.");
        }

        chunks.push(value);
      }

      const bytes = new Uint8Array(length);
      let offset = 0;

      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }

      const contentType = detectImageContentType(bytes);

      if (!contentType || !ALLOWED_IMAGE_TYPES.has(contentType)) {
        throw new Error("Upstream response is not a supported raster image.");
      }

      return { bytes, contentType };
    } finally {
      await agent.close();
    }
  }

  throw new Error("Too many image redirects.");
}
