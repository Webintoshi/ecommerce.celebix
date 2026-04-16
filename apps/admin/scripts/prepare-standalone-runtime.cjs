const fs = require("node:fs");
const path = require("node:path");
const { prepareNextStandalone } = require("../../../scripts/prepare-next-standalone.cjs");

const appRoot = path.join(__dirname, "..");
const standaloneCandidates = [
  path.join(appRoot, ".next", "standalone", "apps", "admin", "server.js"),
  path.join(appRoot, ".next", "standalone", "server.js"),
];
const standaloneServer = standaloneCandidates.find((candidate) => fs.existsSync(candidate));

if (!standaloneServer) {
  console.error("Admin standalone server output was not found.");
  console.error("Checked:", standaloneCandidates);
  process.exit(1);
}

prepareNextStandalone(appRoot, standaloneServer);
console.log("[standalone] admin runtime assets prepared", { standaloneServer });
