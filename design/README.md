# Europa Design Tokens v1.0.0-draft.1

A framework-agnostic token baseline inspired by historical strategy-game interfaces.

## Package contents

- `tokens/primitives.json` — raw palette and non-color primitives
- `tokens/semantic.json` — theme-independent semantic aliases and scales
- `tokens/themes/atlas.json` — parchment/light theme
- `tokens/themes/court.json` — midnight/navy theme
- `tokens/components.json` — component-level token contracts
- `tokens/map.json` — map/data-visualization tokens
- `styles/themes.css` — starter CSS custom properties
- `docs/SPEC.md` — normative rules and release checklist

## Status

This is a draft baseline. It is syntactically valid JSON, but the alias references are intended for a token build step and have not been run through a full Design Tokens Community Group (DTCG) transformer. Contrast compliance is not claimed; run automated contrast tests before production.

## Integration

Set the root element attribute to `data-theme="atlas"` or `data-theme="court"`. Components should consume semantic/component variables, never raw palette values.

## Versioning

Use semantic versioning. The draft must be reviewed and accessibility-tested before calling it a stable 1.0.0 release.
