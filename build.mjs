import { build } from "esbuild";
import { readdirSync, mkdirSync, readFileSync, writeFileSync, statSync } from "fs";
import { join } from "path";
const SRC = "public";
const OUT = join(SRC, "dist");
mkdirSync(OUT, { recursive: true });
const jsFiles = readdirSync(SRC).filter((f) => f.endsWith(".js"));
let totalIn = 0, totalOut = 0;
for (const f of jsFiles) {
  const inPath = join(SRC, f);
  const outPath = join(OUT, f);
  const before = statSync(inPath).size;
  await build({
    entryPoints: [inPath],
    outfile: outPath,
    minify: true,
    bundle: false,
    legalComments: "none",
    target: ["es2020"]
  });
  const after = statSync(outPath).size;
  totalIn += before;
  totalOut += after;
  console.log(`JS  ${f}: ${(before / 1024).toFixed(1)}KB → ${(after / 1024).toFixed(1)}KB`);
}
const css = readFileSync(join(SRC, "style.css"), "utf8");
const cssRes = await build({
  stdin: { contents: css, loader: "css" },
  minify: true,
  write: false
});
const cssMin = cssRes.outputFiles[0].text;
writeFileSync(join(OUT, "style.css"), cssMin);
console.log(`CSS style.css: ${(css.length / 1024).toFixed(1)}KB → ${(cssMin.length / 1024).toFixed(1)}KB`);
totalIn += css.length;
totalOut += cssMin.length;
console.log(`
Итого: ${(totalIn / 1024).toFixed(0)}KB → ${(totalOut / 1024).toFixed(0)}KB (−${Math.round((1 - totalOut / totalIn) * 100)}%)`);
