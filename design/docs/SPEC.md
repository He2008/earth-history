# Europa Design Tokens — Normative Specification

Version: 1.0.0-draft.1  
Status: proposed baseline  
Visual inspiration: Europa Universalis historical strategy UI; not official game assets or official game color values.

## 1. Scope

This package defines cross-platform design tokens for color, typography, spacing, shape, motion, layering, themes, components, and map visualization. It is framework-agnostic. CSS variables are a generated/runtime representation, not the source of truth.

## 2. Normative rules

1. Token names use lowercase English words separated by dots in source documentation and kebab-case in CSS custom properties.
2. Three layers are used: primitive, semantic, component. Map visualization tokens are a separate domain namespace.
3. Components consume semantic tokens or their own component tokens. Components must not reference primitive palette values directly.
4. Themes may override semantic values and component aliases only. Primitive values should remain stable across themes.
5. A token's meaning is its contract. Do not change a token's meaning while retaining its name.
6. Use explicit units for dimensions (`px`, `rem`, `ms`). Unitless values are allowed only for ratios, weights, and z-index.
7. No color may be the sole carrier of meaning. Pair map states and status states with labels, icons, patterns, or other cues where practical.
8. Focus indicators must remain visible. Interactive controls need hover, active, focus-visible, disabled, and loading/error states where applicable.
9. Respect `prefers-reduced-motion`; motion is decorative and must not be required to understand state.
10. Tokens must be validated for reference integrity, duplicate names, missing theme values, and contrast before release.

## 3. Naming grammar

- Primitive: `color.palette.<family>.<step>`, `space.<step>`, `font.size.<name>`, `radius.<name>`.
- Semantic: `color.bg.<role>`, `color.text.<role>`, `color.border.<role>`, `color.action.<role>`, `color.status.<state>`.
- Component: `button.primary.background`, `panel.border`, `input.focus-ring`, `table.row-hover`.
- Map: `map.territory.<state>`, `map.route.<type>`, `map.label.<hierarchy>`, `map.overlay.<state>`.

Use semantic role names, not appearance names. Prefer `color.text.secondary` to `color.text.gray`.

## 4. Layers and references

- Primitive tokens contain literal values.
- Semantic tokens reference primitives where the token is theme-independent, or are assigned by each theme where the value changes by theme.
- Component tokens alias semantic tokens, with component-specific dimensions and states allowed.
- References use `{token.path}` syntax in JSON. A build step must resolve aliases and fail on missing/cyclic references.

## 5. Theme contract

`atlas` is the light parchment theme; `court` is the dark navy theme. Both must define the same semantic token paths. Themes may differ in color values, but must preserve intent. Do not assume the same numeric shade has equal contrast in both themes.

## 6. Color and accessibility

- Target WCAG 2.2 AA: 4.5:1 for normal text; 3:1 for large text and essential non-text UI boundaries/focus indicators, subject to applicable criteria.
- Treat the initial palette as a proposal. Automated contrast checks and visual review are required before declaring compliance.
- Status colors must have background/foreground pairs.
- Map colors are data encodings and must be tested for distinguishability, including common color-vision deficiencies.
- Do not use `opacity` to create disabled text if that causes contrast to become unpredictable; use explicit theme tokens.

## 7. Component states

Every interactive component documents: default, hover, active/pressed, focus-visible, disabled, loading (if applicable), invalid/error (if applicable), and selected (if applicable). Disabled controls must be visibly disabled and non-interactive, but still readable.

## 8. Units and scales

- Spacing scale is based on 4px. Use only named spacing tokens for layout unless a documented exception is needed.
- Control heights: small 28px, medium 36px, large 44px. Use large controls for touch-oriented contexts.
- Typography uses a compact scale; display serif is for headings and selected editorial elements, not dense body text.
- Layer order is centrally defined; component code must not invent arbitrary z-index values.

## 9. Versioning

- Patch: typo/documentation correction or non-semantic implementation fix.
- Minor: additive token or backwards-compatible theme/component addition.
- Major: token removal/rename, reference contract change, or semantic meaning change.
- Deprecated tokens remain available for at least one minor release and include a migration note.

## 10. Release checklist

- [ ] JSON parses.
- [ ] All references resolve and no cycles exist.
- [ ] Atlas and Court expose matching semantic paths.
- [ ] All status foreground/background pairs pass contrast checks.
- [ ] Interactive focus indicators pass contrast and visibility review.
- [ ] Map encodings reviewed for color-vision accessibility.
- [ ] CSS generation is deterministic.
- [ ] Changelog records added, deprecated, and breaking tokens.
