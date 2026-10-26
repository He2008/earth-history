// design/tokens 发布清单(design/docs/SPEC.md §10):引用完整性、双主题路径对齐、确定性、对比度
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildMapTs, buildTokensCss, contrast, loadSources, themeColorMap, type Json } from '../scripts/build-tokens-lib';

const src = loadSources();

function varsOfBlock(css: string, selector: string): string[] {
  const after = css.split(selector)[1] ?? '';
  const body = after.split(/\n\[/)[0]; // 到下一个块选择器为止
  return [...body.matchAll(/^  (--[a-z0-9-]+):/gm)].map((m) => m[1]);
}

describe('design tokens 引用完整性', () => {
  it('全部 JSON 可解析,{ref} 引用全部可解析(含主题/组件跨层)', () => {
    expect(() => buildTokensCss(loadSources())).not.toThrow();
    expect(() => buildMapTs(loadSources())).not.toThrow();
  });

  it('缺引用抛错', () => {
    const bad = loadSources();
    ((bad.themes.atlas.color as Json).bg as Json).canvas = '{color.palette.not-exist}';
    expect(() => buildTokensCss(bad)).toThrow(/未解析引用/);
  });

  it('循环引用抛错', () => {
    const bad = loadSources();
    ((bad.themes.court.color as Json).text as Json).primary = '{color.text.secondary}';
    ((bad.themes.court.color as Json).text as Json).secondary = '{color.text.primary}';
    expect(() => buildTokensCss(bad)).toThrow(/循环引用/);
  });
});

describe('主题契约', () => {
  it('atlas 与 court 暴露完全同名的变量集合', () => {
    const css = buildTokensCss(src);
    expect(varsOfBlock(css, '[data-theme="atlas"]')).toEqual(varsOfBlock(css, '[data-theme="court"]'));
  });

  it('生成确定性:两次独立加载+生成,输出逐字节一致', () => {
    expect(buildTokensCss(loadSources())).toBe(buildTokensCss(loadSources()));
  });

  it('磁盘上的生成物与源同步(改了 JSON 必须先 npm run tokens)', () => {
    expect(readFileSync('src/app/tokens.css', 'utf8')).toBe(buildTokensCss(src));
    expect(readFileSync('src/lib/map-tokens.ts', 'utf8')).toBe(buildMapTs(src));
  });
});

describe('对比度(WCAG AA,SPEC §6:正文 4.5:1,焦点指示 3:1)', () => {
  const cases: [name: string, fg: string, bg: string, min: number][] = [];
  for (const theme of ['atlas', 'court'] as const) {
    const c = themeColorMap(src, theme);
    for (const bgKey of ['bg.canvas', 'bg.surface', 'bg.elevated']) {
      cases.push([`${theme} 主文本 @ ${bgKey}`, c['text.primary'], c[bgKey], 4.5]);
    }
    for (const bgKey of ['bg.canvas', 'bg.surface']) {
      cases.push([`${theme} 次文本 @ ${bgKey}`, c['text.secondary'], c[bgKey], 4.5]);
      cases.push([`${theme} 弱文本 @ ${bgKey}`, c['text.tertiary'], c[bgKey], 4.5]);
      cases.push([`${theme} 链接 @ ${bgKey}`, c['text.link'], c[bgKey], 4.5]);
      cases.push([`${theme} 焦点环 @ ${bgKey}`, c['focus.ring'], c[bgKey], 3]);
    }
    cases.push([`${theme} 主按钮文字`, c['action.primary-text'], c['action.primary'], 4.5]);
    for (const s of ['success', 'warning', 'danger', 'info']) {
      cases.push([`${theme} ${s} 状态前景/底`, c[`status.${s}`], c[`status.${s}-bg`], 4.5]);
    }
  }

  it.each(cases)('%s ≥ %d:1', (_name, fg, bg, min) => {
    expect(contrast(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(min);
  });
});
