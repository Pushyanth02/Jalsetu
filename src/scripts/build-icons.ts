/**
 * One-off asset generator: favicon.ico + apple-icon.png + icon.svg
 * Rasterizes the brand SVG mark into a proper multi-size .ico (PNG-in-ICO)
 * and the 180x180 Apple touch icon. Output goes to src/app/ so the Next.js
 * App Router metadata conventions auto-emit the <link> tags.
 */
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const SVG = fs.readFileSync(path.join(process.cwd(), "public/img/jalsetu-mark.svg"));

/** Encodes a list of PNG buffers as a valid .ico file (PNG-compressed entries). */
function encodeIco(pngs: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);

  const entries = Buffer.alloc(pngs.length * 16);
  let offset = 6 + pngs.length * 16;
  const blobs: Buffer[] = [];
  pngs.forEach(({ size, data }, i) => {
    const base = i * 16;
    entries.writeUInt8(size >= 256 ? 0 : size, base + 0); // width
    entries.writeUInt8(size >= 256 ? 0 : size, base + 1); // height
    entries.writeUInt8(0, base + 2); // palette
    entries.writeUInt8(0, base + 3); // reserved
    entries.writeUInt16LE(1, base + 4); // color planes
    entries.writeUInt16LE(32, base + 6); // bits per pixel
    entries.writeUInt32LE(data.length, base + 8); // byte size
    entries.writeUInt32LE(offset, base + 12); // data offset
    blobs.push(data);
    offset += data.length;
  });

  return Buffer.concat([header, entries, ...blobs]);
}

async function main() {
  const sizes = [16, 32, 48];
  const pngs: { size: number; data: Buffer }[] = [];
  for (const size of sizes) {
    const data = await sharp(SVG, { density: 480 })
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    pngs.push({ size, data });
  }
  fs.writeFileSync(path.join(process.cwd(), "src/app/favicon.ico"), encodeIco(pngs));

  await sharp(SVG, { density: 480 })
    .resize(180, 180, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(path.join(process.cwd(), "src/app/apple-icon.png"));

  fs.writeFileSync(path.join(process.cwd(), "src/app/icon.svg"), SVG);

  console.log("Wrote src/app/favicon.ico, src/app/apple-icon.png, src/app/icon.svg");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
