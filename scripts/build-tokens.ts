// design/tokens/*.json → src/app/tokens.css + src/lib/map-tokens.ts(逻辑在 build-tokens-lib)
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildMapTs, buildTokensCss, loadSources } from './build-tokens-lib';

const src = loadSources();
writeFileSync('src/app/tokens.css', buildTokensCss(src));
mkdirSync('src/lib', { recursive: true });
writeFileSync('src/lib/map-tokens.ts', buildMapTs(src));
console.log('design/tokens → src/app/tokens.css + src/lib/map-tokens.ts');
