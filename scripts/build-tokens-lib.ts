// design/tokens/*.json → tokens.css / map-tokens.ts 的纯逻辑,CLI(scripts/build-tokens.ts)与测试(tests/tokens.test.ts)共用。
// 规范见 design/docs/SPEC.md:JSON 是唯一真源,生成物勿手改;输出必须确定性。
import { readFileSync } from 'node:fs';

export type Json = Record<string, unknown>;

export type Sources = {
  primitives: Json;
  semantic: Json;
  components: Json;
  map: Json;
  themes: { atlas: Json; court: Json };
};

export function readJson(rel: string): Json {
  return JSON.parse(readFileSync(rel, 'utf8')) as Json;
}

export function loadSources(): Sources {
  return {
    primitives: readJson('design/tokens/primitives.json'),
    semantic: readJson('design/tokens/semantic.json'),
    components: readJson('design/tokens/components.json'),
    map: readJson('design/tokens/map.json'),
    themes: { atlas: readJson('design/tokens/themes/atlas.json'), court: readJson('design/tokens/themes/court.json') },
  };
}

// ---- {a.b.c} 引用解析 ----

export function getPath(obj: Json, dotted: string): unknown {
  let cur: unknown = obj;
  for (const key of dotted.split('.')) {
    if (cur === null || typeof cur !== 'object' || !(key in (cur as Json))) return undefined;
    cur = (cur as Json)[key];
  }
  return cur;
}

export function resolveString(s: string, ctx: Json, trail: string[] = []): string {
  return s.replace(/\{([a-zA-Z0-9.-]+)\}/g, (_, key: string) => {
    if (trail.includes(key)) throw new Error(`循环引用: ${[...trail, key].join(' → ')}`);
    const target = getPath(ctx, key);
    if (target === undefined) throw new Error(`未解析引用 {${key}},解析链:${trail.join(' → ') || '(根)'}`);
    if (typeof target === 'number') return String(target);
    if (typeof target === 'string') return resolveString(target, ctx, [...trail, key]);
    throw new Error(`引用 {${key}} 指向非叶子节点`);
  });
}

export function resolveTree(node: unknown, ctx: Json): unknown {
  if (typeof node === 'string') return resolveString(node, ctx);
  if (node === null || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map((v) => resolveTree(v, ctx));
  const out: Json = {};
  for (const [k, v] of Object.entries(node as Json)) out[k] = resolveTree(v, ctx);
  return out;
}

// ---- 主题上下文 ----

function deepMerge(base: Json, over: Json): Json {
  const out: Json = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = out[k];
    out[k] = b !== null && typeof b === 'object' && !Array.isArray(b) && v !== null && typeof v === 'object' && !Array.isArray(v)
      ? deepMerge(b as Json, v as Json)
      : v;
  }
  return out;
}

// 主题 component 段与 components.json 的叶子键名差异归一(主题侧键 → 契约侧键)
const COMPONENT_KEY_ALIASES = {
  'header-bg': 'header-background',
  'row-bg': 'row-background',
  focus: 'focus-ring',
} as const;

function aliasComponentKeys(themeComponent: Json): Json {
  const out: Json = {};
  for (const [group, node] of Object.entries(themeComponent)) {
    if (node === null || typeof node !== 'object') { out[group] = node; continue; }
    const remapped: Json = { ...(node as Json) };
    for (const [from, to] of Object.entries(COMPONENT_KEY_ALIASES)) {
      if (from in remapped) { remapped[to] = remapped[from]; delete remapped[from]; }
    }
    out[group] = remapped;
  }
  return out;
}

// 某主题的解析上下文:primitive + 已解析的 semantic + 主题色 + 主题 component 覆盖后的 components。
// semantic 必须先对 primitives 单独解析:它的 space 段是恒等别名(space.1 → {space.1}),直接与 primitives
// 合并会造成同路径自引用,被循环检测拒绝。
export function themeContext(src: Sources, themeName: keyof Sources['themes']): Json {
  const theme = src.themes[themeName];
  const resolvedSemantic = resolveTree(src.semantic, src.primitives) as Json;
  const merged = deepMerge(src.components, aliasComponentKeys((theme.component ?? {}) as Json));
  return deepMerge(deepMerge(src.primitives, resolvedSemantic), {
    color: theme.color,
    component: merged,
  });
}

// ---- CSS / TS 生成 ----

type VarEntry = [jsonPath: string, cssVar: string];

const SPACE_STEPS = ['0', '1', '2', '3', '4', '5', '6', '8', '10', '12', '16'];
const RADIUS_PRIMS = ['none', 'xs', 'sm', 'md', 'lg', 'xl', 'full'];

const ROOT_VARS: VarEntry[] = [
  ['typography.family.display', '--font-display'],
  ['typography.family.body', '--font-body'],
  ['typography.family.numeric', '--font-mono'],
  ...(['xs', 'sm', 'md', 'lg', 'xl', 'display'] as const).map((k): VarEntry => [`typography.size.${k}`, `--font-size-${k}`]),
  ...(['regular', 'medium', 'semibold', 'bold'] as const).map((k): VarEntry => [`typography.weight.${k}`, `--font-weight-${k}`]),
  ...SPACE_STEPS.map((k): VarEntry => [`space.${k}`, `--space-${k}`]),
  ...RADIUS_PRIMS.map((k): VarEntry => [`radius.${k}`, `--radius-${k}`]),
  ['radius.control', '--radius-control'],
  ['radius.panel', '--radius-panel'],
  ['radius.dialog', '--radius-dialog'],
  ['border.width.default', '--border-width-default'],
  ['border.width.strong', '--border-width-strong'],
  ['size.control-sm', '--control-height-sm'],
  ['size.control-md', '--control-height-md'],
  ['size.control-lg', '--control-height-lg'],
  ['shadow.panel', '--shadow-panel'],
  ['shadow.popover', '--shadow-popover'],
  ['shadow.modal', '--shadow-modal'],
  ['motion.duration.fast', '--duration-fast'],
  ['motion.duration.normal', '--duration-normal'],
  ['motion.duration.slow', '--duration-slow'],
  ['motion.easing.standard', '--ease-standard'],
  ...(['base', 'sticky', 'dropdown', 'overlay', 'modal', 'toast', 'tooltip'] as const).map((k): VarEntry => [`layer.${k}`, `--layer-${k}`]),
];

const MAP_GROUPS = ['territory', 'route', 'label', 'overlay'] as const;

function mapVarEntries(mapDoc: Json): VarEntry[] {
  const out: VarEntry[] = [];
  for (const group of MAP_GROUPS) {
    const node = getPath(mapDoc, `map.${group}`) as Json | undefined;
    if (!node) continue;
    for (const key of Object.keys(node)) out.push([`map.${group}.${key}`, `--map-${group}-${key}`]);
  }
  return out;
}

const THEME_VARS: VarEntry[] = [
  ...(['canvas', 'surface', 'elevated', 'subtle', 'navigation', 'inverse'] as const).map((k): VarEntry => [`color.bg.${k}`, `--bg-${k}`]),
  ...(['primary', 'secondary', 'tertiary', 'inverse', 'link'] as const).map((k): VarEntry => [`color.text.${k}`, `--text-${k}`]),
  ...(['default', 'subtle', 'strong', 'accent', 'focus'] as const).map((k): VarEntry => [`color.border.${k}`, `--border-${k}`]),
  ['color.action.primary', '--action-primary'],
  ['color.action.primary-hover', '--action-primary-hover'],
  ['color.action.primary-active', '--action-primary-active'],
  ['color.action.primary-text', '--action-primary-text'],
  ['color.action.secondary', '--action-secondary'],
  ['color.action.secondary-text', '--action-secondary-text'],
  ...(['success', 'warning', 'danger', 'info'] as const).flatMap((k): VarEntry[] => [
    [`color.status.${k}`, `--status-${k}`],
    [`color.status.${k}-bg`, `--status-${k}-bg`],
  ]),
  ['color.focus.ring', '--focus-ring'],
];

const COMPONENT_VARS: VarEntry[] = [
  ['component.button.radius', '--button-radius'],
  ['component.button.padding-x', '--button-padding-x'],
  ['component.button.primary.background', '--button-primary-bg'],
  ['component.button.primary.foreground', '--button-primary-fg'],
  ['component.button.primary.hover', '--button-primary-bg-hover'],
  ['component.button.primary.active', '--button-primary-bg-active'],
  ['component.button.secondary.background', '--button-secondary-bg'],
  ['component.button.secondary.foreground', '--button-secondary-fg'],
  ['component.button.focus-ring', '--button-focus-ring'],
  ['component.panel.background', '--panel-bg'],
  ['component.panel.border', '--panel-border'],
  ['component.panel.radius', '--panel-radius'],
  ['component.panel.padding', '--panel-padding'],
  ['component.panel.shadow', '--panel-shadow'],
  ['component.input.background', '--input-bg'],
  ['component.input.foreground', '--input-fg'],
  ['component.input.placeholder', '--input-placeholder'],
  ['component.input.border', '--input-border'],
  ['component.input.focus-ring', '--input-focus-ring'],
  ['component.input.radius', '--input-radius'],
  ['component.input.height', '--input-height'],
  ['component.table.header-background', '--table-header-bg'],
  ['component.table.row-background', '--table-row-bg'],
  ['component.table.row-hover', '--table-row-hover'],
  ['component.table.row-selected', '--table-row-selected'],
  ['component.table.divider', '--table-divider'],
  ['component.badge.radius', '--badge-radius'],
  ['component.badge.padding-x', '--badge-padding-x'],
  ['component.badge.padding-y', '--badge-padding-y'],
  ...(['success', 'warning', 'danger', 'info'] as const).flatMap((k): VarEntry[] => [
    [`component.badge.${k}-background`, `--badge-${k}-bg`],
    [`component.badge.${k}-foreground`, `--badge-${k}-fg`],
  ]),
  ['component.dialog.background', '--dialog-bg'],
  ['component.dialog.border', '--dialog-border'],
  ['component.dialog.radius', '--dialog-radius'],
  ['component.dialog.shadow', '--dialog-shadow'],
  ['component.dialog.padding', '--dialog-padding'],
];

function emitVars(ctx: Json, entries: VarEntry[]): string[] {
  const lines: string[] = [];
  for (const [path, cssVar] of entries) {
    const v = resolveTree(getPath(ctx, path), ctx);
    if (v === undefined) throw new Error(`生成 ${cssVar} 时缺令牌:${path}`);
    if (typeof v !== 'string' && typeof v !== 'number') throw new Error(`生成 ${cssVar} 时 ${path} 不是叶子值`);
    lines.push(`  ${cssVar}: ${String(v).trim()};`);
  }
  return lines;
}

function cssBlock(selector: string, lines: string[]): string {
  return `${selector} {\n${lines.join('\n')}\n}`;
}

export function buildTokensCss(src: Sources): string {
  const rootCtx = deepMerge(deepMerge(src.primitives, resolveTree(src.semantic, src.primitives) as Json), src.map);
  const blocks = [
    cssBlock(':root', [
      '  /* 主题无关令牌:尺度/字体/动效/层级/地图编码 */',
      ...emitVars(rootCtx, ROOT_VARS),
      ...emitVars(rootCtx, mapVarEntries(src.map)),
    ]),
  ];
  for (const name of ['atlas', 'court'] as const) {
    const ctx = themeContext(src, name);
    blocks.push(cssBlock(`[data-theme="${name}"]`, [
      `  /* ${name} 主题:色彩语义 + 组件契约 */`,
      `  color-scheme: ${name === 'atlas' ? 'light' : 'dark'};`,
      ...emitVars(ctx, THEME_VARS),
      ...emitVars(ctx, COMPONENT_VARS),
    ]));
  }
  return `/* 生成的文件,勿手改 — npm run tokens(源:design/tokens/,规范:design/docs/SPEC.md) */\n\n${blocks.join('\n\n')}\n`;
}

export function buildMapTs(src: Sources): string {
  const court = themeContext(src, 'court');
  const mapResolved = resolveTree(src.map, court) as Json;
  const globe = {
    space: String(getPath(court, 'color.bg.navigation')),
    marker: String(getPath(src.map, 'map.territory.selected-outline')),
  };
  const tsObj = (v: Json) => JSON.stringify(v, null, 2).replace(/"([a-zA-Z_$][a-zA-Z0-9_$]*)":/g, '$1:');
  const territory = getPath(mapResolved, 'map.territory') as Json;
  const route = getPath(mapResolved, 'map.route') as Json;
  const label = getPath(mapResolved, 'map.label') as Json;
  const overlay = getPath(mapResolved, 'map.overlay') as Json;
  return `// 生成的文件,勿手改 — npm run tokens(源:design/tokens/map.json)
// maplibre paint 属性不解析 CSS 变量,globe 需要这里的字面量。
export const MAP = {
  territory: ${tsObj(territory)},
  route: ${tsObj(route)},
  label: ${tsObj(label)},
  overlay: ${tsObj(overlay)},
} as const;

export const GLOBE = {
  space: ${JSON.stringify(globe.space)},
  marker: ${JSON.stringify(globe.marker)},
} as const;
`;
}

// ---- 对比度(WCAG 2.x) ----

export function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '').slice(0, 6);
  if (h.length !== 6) throw new Error(`非法颜色:${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(hexA: string, hexB: string): number {
  const [a, b] = [relativeLuminance(hexA), relativeLuminance(hexB)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

// 展平某主题解析后的 color.* 为 'bg.canvas' → '#xxx' 映射,供测试取值
export function themeColorMap(src: Sources, name: keyof Sources['themes']): Record<string, string> {
  const colors = getPath(themeContext(src, name), 'color') as Json;
  const resolved = resolveTree(colors, themeContext(src, name)) as Json;
  const flat: Record<string, string> = {};
  const walk = (node: Json, prefix: string) => {
    for (const [k, v] of Object.entries(node)) {
      if (v !== null && typeof v === 'object') walk(v as Json, `${prefix}${k}.`);
      else flat[`${prefix}${k}`] = String(v);
    }
  };
  walk(resolved, '');
  return flat;
}
