const ALLOWED_KEYS = new Set(["model", "prompt", "size", "quality", "n"]);
const ALLOWED_SIZES = new Set(["auto", "1024x1024", "1536x1024", "1024x1536"]);
const ALLOWED_QUALITIES = new Set(["auto", "low", "medium", "high"]);
const DEFAULT_SIZE = "auto";
const DEFAULT_QUALITY = "auto";
const DEFAULT_N = 1;

export function buildImages2Request(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("input must be an object");
  }

  for (const key of Object.keys(input)) {
    if (!ALLOWED_KEYS.has(key)) {
      throw new Error(`unknown input key: ${key}`);
    }
  }

  if (typeof input.prompt !== "string" || input.prompt.trim() === "") {
    throw new TypeError("prompt must be a non-empty string");
  }

  const size = input.size ?? DEFAULT_SIZE;
  if (!ALLOWED_SIZES.has(size)) {
    throw new RangeError(`size must be one of: ${[...ALLOWED_SIZES].join(", ")}`);
  }

  const quality = input.quality ?? DEFAULT_QUALITY;
  if (!ALLOWED_QUALITIES.has(quality)) {
    throw new RangeError(`quality must be one of: ${[...ALLOWED_QUALITIES].join(", ")}`);
  }

  const n = input.n ?? DEFAULT_N;
  if (!Number.isInteger(n) || n < 1 || n > 10) {
    throw new RangeError("n must be an integer from 1 through 10");
  }

  return {
    model: "gpt-image-2",
    prompt: input.prompt.trim(),
    size,
    quality,
    n,
  };
}
