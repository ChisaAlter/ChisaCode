const { withAppBuildGradle } = require("expo/config-plugins");

const DEFAULT_EXPO_CLI_PATTERN =
  /cliFile = new File\(\["node", "--print", "require\.resolve\('@expo\/cli', \{ paths: \[require\.resolve\('expo\/package\.json'\)\] \}"\)\]\.execute\(null, rootDir\)\.text\.trim\(\)\)/;
const WRAPPER_CLI_LINE = 'cliFile = file("../../scripts/expo-export-embed-cli.cjs")';

module.exports = function withAndroidExportEmbedCli(config) {
  return withAppBuildGradle(config, (appBuildGradleConfig) => {
    appBuildGradleConfig.modResults.contents = appBuildGradleConfig.modResults.contents.replace(
      DEFAULT_EXPO_CLI_PATTERN,
      WRAPPER_CLI_LINE,
    );

    return appBuildGradleConfig;
  });
};
