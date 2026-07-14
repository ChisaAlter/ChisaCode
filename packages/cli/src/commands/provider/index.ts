import { Command } from "commander";
import { runProviderInspectCommand } from "./inspect.js";
import { runLsCommand } from "./ls.js";
import { runModelsCommand } from "./models.js";
import { withOutput } from "../../output/index.js";
import { addJsonAndDaemonHostOptions } from "../../utils/command-options.js";
import { tCli } from "../../i18n.js";

export function createProviderCommand(): Command {
  const provider = new Command("provider").description(tCli("provider.description"));

  addJsonAndDaemonHostOptions(
    provider.command("ls").description(tCli("provider.ls.description")),
  ).action(withOutput(runLsCommand));
  addJsonAndDaemonHostOptions(
    provider
      .command("inspect")
      .description(tCli("provider.inspect.description"))
      .argument("<provider>", tCli("provider.inspect.provider")),
  ).action(withOutput(runProviderInspectCommand));

  addJsonAndDaemonHostOptions(
    provider
      .command("models")
      .description(tCli("provider.models.description"))
      .argument("<provider>", tCli("provider.models.provider"))
      .option("--thinking", tCli("provider.models.thinking")),
  ).action(withOutput(runModelsCommand));

  return provider;
}
