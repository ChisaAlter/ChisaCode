import { getErrorMessage } from "./utils/errors.js";
import { runCli } from "./run.js";

// Global safety nets so an unhandled rejection or stray throw never escapes
// as an unfiltered stack trace (which may include environment-derived paths or
// other sensitive context) to stderr. We normalise the message via
// getErrorMessage and force a non-zero exit code.
process.on("unhandledRejection", (error: unknown) => {
  process.stderr.write(`${getErrorMessage(error)}\n`);
  process.exitCode = 1;
});

process.on("uncaughtException", (error: unknown) => {
  process.stderr.write(`${getErrorMessage(error)}\n`);
  process.exitCode = 1;
});

try {
  const exitCode = await runCli(process.argv.slice(2), {
    nodeArgv: [process.argv[0] ?? "node", process.argv[1] ?? "chisacode"],
  });
  process.exitCode = exitCode;
} catch (error) {
  // Covers action handlers that bypass the withOutput wrapper and re-throw
  // (e.g. onboard cancellation paths), plus commander's own CommanderError.
  process.stderr.write(`${getErrorMessage(error)}\n`);
  process.exitCode = 1;
}
