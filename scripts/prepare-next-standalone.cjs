const fs = require("node:fs");
const path = require("node:path");

function copyDirectoryIfExists(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) {
    return false;
  }

  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  fs.cpSync(sourceDir, targetDir, {
    recursive: true,
    force: true,
  });

  return true;
}

function prepareNextStandalone(appRoot, standaloneServer) {
  if (!standaloneServer || !fs.existsSync(standaloneServer)) {
    return;
  }

  const standaloneAppRoot = path.dirname(standaloneServer);
  const appStaticDir = path.join(appRoot, ".next", "static");
  const standaloneStaticDir = path.join(standaloneAppRoot, ".next", "static");
  const appPublicDir = path.join(appRoot, "public");
  const standalonePublicDir = path.join(standaloneAppRoot, "public");

  const copiedStatic = copyDirectoryIfExists(appStaticDir, standaloneStaticDir);
  const copiedPublic = copyDirectoryIfExists(appPublicDir, standalonePublicDir);

  if (copiedStatic || copiedPublic) {
    console.log("[standalone] synced runtime assets", {
      standaloneAppRoot,
      copiedStatic,
      copiedPublic,
    });
  }
}

module.exports = {
  prepareNextStandalone,
};
