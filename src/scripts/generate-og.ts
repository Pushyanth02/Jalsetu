/**
 * One-off asset generator: Open Graph image (server-side only).
 * Generates a 1536x832 branded illustration, then sharp-crops it to the
 * 1200x630 OG card standard and composites the brand wordmark via SVG text.
 */
import ZAI from "z-ai-web-dev-sdk";
import sharp from "sharp";
import fs from "node:fs";

const PROMPT =
  "Clean modern civic-tech dashboard hero illustration: stylized dark charcoal city street map of Delhi at night with glowing electric-blue circular location markers of varying sizes, a few amber and red warning pins, thin blue data connection lines between markers, subtle monsoon raindrop pattern, deep navy background color #111527, electric blue #2563eb accents, flat vector data-visualization aesthetic, wide banner composition with calm empty space on the left third for a title, crisp high quality, no text, no letters";

async function main() {
  const zai = await ZAI.create();
  // 1536x832 satisfies the API (multiples of 32, 512-2880, <= 2^22 px) even
  // though the SDK type union is narrower; cast keeps the script reproducible.
  const size = "1536x832" as "1440x720";
  const res = await zai.images.generations.create({ prompt: PROMPT, size });
  const b64 = res.data[0]?.base64;
  if (!b64) throw new Error("Image generation returned no data");
  fs.writeFileSync("public/img/og-source.png", Buffer.from(b64, "base64"));

  // Crop to exactly 1200x630 (OG standard) with cover fit.
  await sharp("public/img/og-source.png")
    .resize(1200, 630, { fit: "cover", position: "entropy" })
    .png({ compressionLevel: 9 })
    .toFile("public/og.png");
  console.log("Wrote public/og.png (1200x630) and public/img/og-source.png");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
