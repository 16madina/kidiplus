#!/usr/bin/env node
// `npx cap sync` rewrites ios/App/App/capacitor.config.json and drops local
// plugins that live in the App target (not npm packages). Keep them listed
// so Capacitor auto-registers them like Camera / Haptics.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const extras = ["LivePipPlugin", "KidiCameraKitPlugin"];
const target = resolve(process.cwd(), "ios/App/App/capacitor.config.json");
if (!existsSync(target)) {
  console.warn("⚠️  ios/App/App/capacitor.config.json missing — skip plugin list patch");
  process.exit(0);
}

const config = JSON.parse(readFileSync(target, "utf8"));
const list = Array.isArray(config.packageClassList) ? config.packageClassList : [];
const missing = extras.filter((name) => !list.includes(name));
if (missing.length === 0) {
  console.log("✅ capacitor.config.json already lists", extras.join(", "));
  process.exit(0);
}
config.packageClassList = [...list, ...missing];
writeFileSync(target, `${JSON.stringify(config, null, "\t")}\n`, "utf8");
console.log("✅ added to packageClassList:", missing.join(", "));
