# 史地

3D 卫星地球 × AI 中文史料深度研究。当前:M0 编排器。文档见 `docs/`。

## 快速开始

```bash
npm install          # .npmrc 已指向 npmmirror
cp .env.example .env # 填三把 key(博查/智谱/DeepSeek),PREP §1
npm test             # 全部测试,不需要真实 key
npm run dev          # 起服务
npm run m0           # 跑 D3 十地点验证(需要 key,先起 dev)
```
