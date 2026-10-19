/* Convert scene PNGs to optimized avif + webp via sharp. */
import sharp from "sharp";
import { readdir } from "node:fs/promises";
import path from "node:path";

const DIR = "public/img/scenes";
const files = (await readdir(DIR)).filter((f) => f.endsWith(".png"));

for (const f of files) {
  const src = path.join(DIR, f);
  const base = f.replace(/\.png$/, "");
  const avif = path.join(DIR, `${base}.avif`);
  const webp = path.join(DIR, `${base}.webp`);
  try {
    await sharp(src).avif({ quality: 55, effort: 6 }).toFile(avif);
    await sharp(src).webp({ quality: 72, effort: 6 }).toFile(webp);
    console.log(`OK ${base}`);
  } catch (e) {
    console.error(`FAIL ${base}: ${(e as Error).message}`);
    process.exitCode = 1;
  }
}
console.log("done");
