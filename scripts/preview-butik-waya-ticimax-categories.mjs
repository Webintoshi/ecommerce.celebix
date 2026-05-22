import {
  buildAuditReport,
  fetchAndMapButikWayaFeed,
  getButikWayaTicimaxDefaults,
  readJson,
  writeJson,
} from "./lib/butik-waya-ticimax.mjs";

const defaults = getButikWayaTicimaxDefaults();

function parseArgs(argv) {
  const args = {
    profile: defaults.profilePath,
    output: defaults.auditPath,
    write: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--profile" && argv[index + 1]) {
      args.profile = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === "--output" && argv[index + 1]) {
      args.output = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === "--no-write") {
      args.write = false;
    }
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const profile = readJson(args.profile);
  const parsedFeed = await fetchAndMapButikWayaFeed(profile);
  const report = buildAuditReport(profile, parsedFeed);

  if (args.write) {
    writeJson(args.output, report);
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
