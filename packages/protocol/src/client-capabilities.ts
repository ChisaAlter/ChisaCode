export const CLIENT_CAPS = {
  reasoningMergeEnum: "reasoning_merge_enum",
  // COMPAT(customModeIcons): added in v0.1.84. Old clients pin AgentModeIcon to
  // a closed enum and crash rendering unknown values; daemon downgrades icons
  // outside the legacy set to "ShieldCheck" when this cap is absent. Drop the
  // gate when floor >= v0.1.84.
  customModeIcons: "custom_mode_icons",
  // COMPAT(generativeUiWireCapability): added in v0.1.101; remove the gate no earlier than 2027-01-11 when client/daemon floor >= v0.1.101.
  generativeUi: "generative_ui",
  // COMPAT(cindyModules): added in v0.1.102; remove the gate no earlier than 2027-07-29 when client/daemon floor >= v0.1.102.
  cindyModules: "cindy_modules",
  // COMPAT(discoveredPorts): added in v1.0.4; remove the gate no earlier than 2027-09-08 when client/daemon floor >= v1.0.4.
  discoveredPorts: "discovered_ports",
} as const;

export type ClientCapability = (typeof CLIENT_CAPS)[keyof typeof CLIENT_CAPS];
