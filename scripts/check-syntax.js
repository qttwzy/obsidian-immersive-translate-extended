"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const FILES = ["plugin", "scripts"].flatMap((directory) => fs
  .readdirSync(path.join(ROOT, directory), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
  .map((entry) => directory + "/" + entry.name)
  .sort());

for (const file of FILES) {
  const result = spawnSync(process.execPath, ["--check", path.join(ROOT, file)], { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || ("Syntax check failed: " + file + "\n"));
    process.exit(result.status || 1);
  }
}

process.stdout.write("Syntax checked product and repository JavaScript files\n");
