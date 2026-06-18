---
title: Providers
description: How ChisaCode launches and supervises external coding agent CLIs.
nav: Providers
order: 3
---

# Providers

ChisaCode does not ship its own coding agent. It launches and supervises external CLIs you have installed and authenticated. Your subscriptions, credentials, project config, and MCP servers stay with the underlying provider.

## Mental model

A provider is the contract between ChisaCode and one external agent runtime: how to launch it, how to stream output, how to send input back, what modes and models it exposes, and how permissions are represented.

The actual binary lives on your machine and runs as a subprocess of the local daemon.

## Current built-ins

The built-in provider manifest currently declares:

- Claude
- Codex
- OpenCode
- MiMoCode
- Pi
- Kimi Code

See [Supported providers](/docs/supported-providers) for IDs and install links.

## Custom providers

Custom providers live in `agents.providers` inside ChisaCode config.

- Extend a built-in provider to create a separate profile, override environment variables, replace the command, or curate models.
- Extend `acp` to run a generic Agent Client Protocol command.
- Disable a built-in provider by setting `enabled: false`.

See [Custom providers](/docs/custom-providers) for examples and field reference.

## Where to go next

- [Supported providers](/docs/supported-providers), the current built-in provider list.
- [Custom providers](/docs/custom-providers), profiles, custom binaries, model overrides, and generic ACP commands.
