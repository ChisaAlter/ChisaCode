import { Command } from "commander";

import { tCli } from "../../i18n.js";
import { withOutput } from "../../output/index.js";
import { addJsonAndDaemonHostOptions } from "../../utils/command-options.js";
import { runUsageSummaryCommand } from "./summary.js";

/** Creates local usage reporting commands. */
export function createUsageCommand(): Command {
  const usage = new Command("usage").description(tCli("usage.description"));

  addJsonAndDaemonHostOptions(
    usage
      .command("summary")
      .description(tCli("usage.summary.description"))
      .option("--range <days>", tCli("usage.summary.range"), "30"),
  ).action(withOutput(runUsageSummaryCommand));

  return usage;
}
