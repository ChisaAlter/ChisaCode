# Theme System Consolidation Design

## Goal

Align the shipped ChisaCode theme system with `design/web3-themes-v2.html` across the
Electron desktop app and Android app. New installations default to Blockchain Light. Both
surfaces expose the same five product themes plus the system-adaptive option.

## Product Decisions

The visible theme picker order is:

1. Follow system (`auto`)
2. Blockchain Light (`light`) - default
3. Cyber Dark (`dark`)
4. Liquid Glass (`liquid-neon`)
5. Chisaki (`chisaki`)
6. Aemeath (`aemeath`)

Internal identifiers remain stable so existing persisted settings and Unistyles registration
do not require a destructive rename. User-facing labels use the design names above.

Electron and Android use the same catalog, ordering, preview metadata, and default. Android no
longer has a smaller theme whitelist or a Liquid Glass fallback.

## Approaches Considered

### 1. Delete legacy identifiers outright

This gives the smallest type surface, but old stored values become invalid without an explicit
migration path. It risks surprising existing users after an update.

### 2. Hide legacy themes and migrate stored values (selected)

The four legacy themes (`zinc`, `midnight`, `claude`, and `ghostty`) disappear from theme menus
and keyboard cycling. Storage still recognizes them and rewrites them to Cyber Dark, preserving
dark-mode intent without continuing to expose an obsolete product catalog.

### 3. Keep legacy themes in an advanced section

This avoids migration, but preserves the current fragmented product identity and keeps theme
selection larger than the design target. It does not solve the reported problem.

## Theme Authority

`packages/app/src/styles/theme.ts` owns one canonical visible-theme order and its preview
metadata. Settings menus, keyboard theme cycling, Android policy, storage validation, and tests
consume that authority instead of maintaining separate arrays.

The canonical visible order is:

```text
light -> dark -> liquid-neon -> chisaki -> aemeath
```

`auto` is available in settings but is not part of manual theme cycling because cycling must
produce deterministic visual themes rather than depend on the operating-system state.

## Defaults And Migration

- `DEFAULT_CLIENT_SETTINGS.theme` becomes `light`.
- Android fallback becomes `light`.
- Empty storage resolves to `light` on both supported surfaces.
- Stored `zinc`, `midnight`, `claude`, or `ghostty` values normalize to `dark` and are rewritten
  to storage during the normal load path.
- Stored values for the five active themes and `auto` remain unchanged.
- Unknown values continue to fall back to the default.

This is a local settings migration. It does not alter protocol schemas or daemon state.

## Visual Rules

- Blockchain Light is the calm default and must retain readable borders and secondary text on
  white working surfaces.
- Cyber Dark is the primary dark counterpart, not a secondary novelty theme.
- Liquid Glass remains optional. Glass, glow, and backdrop effects must not reduce text contrast,
  obscure panel boundaries, or create overlapping content.
- Chisaki brand red must remain distinct from destructive-state red through separate semantic
  tokens.
- Aemeath pastel accents must preserve readable text, borders, selected states, and disabled
  states.
- Layout, typography, spacing, radius, and component structure continue to follow
  `docs/design.md`; themes change presentation tokens, not component anatomy.

## Settings Experience

The existing dropdown remains the correct picker because the catalog is small and fixed. It
shows `auto` first, followed by the five canonical themes. Each item uses the existing miniature
theme preview and a checkmark for the selected value.

Desktop and Android display the same names and order. No platform-specific theme names or hidden
fallback behavior are allowed.

## Verification

Automated coverage must prove:

- the canonical visible catalog contains exactly five themes in the intended order;
- new settings default to `light`;
- each legacy stored theme migrates to `dark` and is rewritten;
- active themes and `auto` round-trip unchanged;
- settings options and keyboard cycling consume the canonical catalog;
- Android accepts all five themes plus `auto` and falls back to `light`;
- theme metadata still exposes correct light/dark status and complete preview tokens.

Run only focused Vitest files, followed by app typecheck and targeted lint/format checks.

Visual acceptance must use the real target surface:

- Electron: open the real desktop settings screen, switch through all five themes, and inspect
  the workspace, sidebar, composer, menus, floating panels, and settings surfaces.
- Android: use a connected device or emulator, switch through all five themes, relaunch to prove
  persistence, and inspect status/navigation bars, sidebar, workspace, composer, menus, and
  compact settings.

Browser preview results may support comparison with the design source, but they cannot replace
Electron or Android acceptance.

## Non-Goals

- Renaming persisted theme identifiers to `blockchain-light`, `cyber-dark`, or `liquid-glass`
- Adding iOS support
- Redesigning component layout or navigation
- Adding more themes or a theme editor
- Migrating syntax-highlight theme selection
