import fs from "node:fs";

const b64 = fs.readFileSync("public/kidiplus-watermark.png").toString("base64");
const out = `/** Inlined so LiveKit Web Egress never depends on a second HTTP fetch for the brand mark. */
export const KIDIPLUS_WATERMARK_DATA_URL =
  "data:image/png;base64,${b64}";
`;
fs.writeFileSync("src/lib/kidiplus-watermark-data.ts", out);
console.log("wrote src/lib/kidiplus-watermark-data.ts", out.length, "chars");
