# ChisaCode Skills

ChisaCode skills teach coding agents how to use ChisaCode itself. They are
instructions for agents, not commands for people to run directly.

Use them when you want an agent to hand off work, ask another model for advice,
run a long loop, create a committee, or execute a large task through a structured
multi-agent flow.

## Install

The desktop app can install or update the bundled skills from Settings >
Integrations. That is the recommended path because it syncs the same skill set
shipped with the app.

After installation, skills are available to supported agent runtimes such as
Codex, Claude Code, and compatible skill loaders.

If you install skills manually from GitHub, use the repository slug:

```bash
npx skills add ChisaAlter/ChisaCode
```

## Core Skills

`chisacode`

Reference skill for creating agents, managing worktrees, sending prompts,
discovering providers, and checking daemon state. Other ChisaCode skills build
on this one.

`chisacode-advisor`

Starts one separate agent for a second opinion. Use it when you want review,
pushback, or a focused answer without handing off implementation.

`chisacode-committee`

Starts two contrasting agents to analyze a problem from different angles. Use it
for unclear failures, architecture tradeoffs, or plans that need adversarial
review before implementation.

`chisacode-handoff`

Transfers work to another agent with the context needed to continue. Use it when
one provider is better suited for the next phase, such as planning with one model
and implementing with another.

`chisacode-loop`

Runs an agent repeatedly against an exit condition. Use it for long-running
repair loops, flaky checks, or tasks that need iteration until clear acceptance
criteria pass.

`chisacode-epic`

Runs a heavy, resumable orchestration flow for large work: research, planning,
review, implementation, audit, and delivery. Use it for work that spans many
files or packages and may run for hours.

`chisacode-orchestrate`

Compatibility alias for the epic flow. Prefer `chisacode-epic` in new prompts.

## Choosing A Skill

- Use `chisacode-advisor` for a single second opinion.
- Use `chisacode-committee` when disagreement and root-cause analysis are useful.
- Use `chisacode-handoff` when another agent should continue the work.
- Use `chisacode-loop` when the same task should repeat until a condition passes.
- Use `chisacode-epic` for large, multi-phase work that needs a persistent plan.

For small edits, you usually do not need a skill. Ask the active agent directly.

## Provider Preferences

Orchestration skills choose providers by role. A planning agent, implementation
agent, UI agent, research agent, and audit agent may use different providers.

Configure these preferences once in ChisaCode. After that, skills can dispatch
the right kind of agent without hardcoding provider names in every prompt.

## Example Prompts

Ask for advice:

```text
Use chisacode-advisor to review this migration plan.
```

Hand off implementation:

```text
Use chisacode-handoff and send this bugfix to a Codex implementation agent.
```

Run a loop:

```text
Use chisacode-loop until the changed test file passes.
```

Run a large task:

```text
Use chisacode-epic --worktree to build the new provider settings flow end to end.
```

## Operational Notes

Skills create real ChisaCode agents. Those agents may take minutes or hours and
may continue in the background.

When a skill creates a worktree, keep related implementation inside that
worktree. When a skill launches an audit agent, treat it as read-only unless the
skill says otherwise.

If a skill appears missing or stale, return to Settings > Integrations and update
the bundled skills.
