import { readFileSync } from "node:fs";

const [file, field] = process.argv.slice(2);

if (!file || !field) {
  console.error("usage: node scripts/toml-field-to-hex.mjs <file> <field>");
  process.exit(1);
}

const content = readFileSync(file, "utf8");
const match = content.match(new RegExp(`^${field}\\s*=\\s*\"([^\"]+)\"`, "m"));

if (!match) {
  console.error(`missing field: ${field}`);
  process.exit(1);
}

const value = match[1].startsWith("0x") ? BigInt(match[1]) : BigInt(match[1]);
process.stdout.write(`0x${value.toString(16).padStart(64, "0")}`);

