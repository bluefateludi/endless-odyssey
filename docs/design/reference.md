# 参考项目调研与复用决策

本次核对 majo-no-tabitabi 的源码版本 `d8a192ba8e4db990bf0745f0689861cd67deccd3`。其 AGENTS.md 说明运行时按清单装载系统，测试使用隔离的浏览器配置，资产进入清单时记录许可。项目采用这些可独立验证的做法，游戏逻辑和角色内容按无尽之途的设计开发。[仓库快照](https://github.com/shoal-rat/majo-no-tabitabi/tree/d8a192ba8e4db990bf0745f0689861cd67deccd3)

| 检查对象 | 对本项目的决定 |
| --- | --- |
| `tools/sculpt/sdf.mjs`、`mesh.mjs`、`gltf.mjs` | Sculpt 的形体带有距离场、边界和表面部位，支持平滑合并与切割。需要复杂连续曲面的资产可引入该离线后端。首个林地精英走原创参数化几何路线，先验证一条可维护的 GLB 生产与返修流程。 |
| `src/world/builders/sculpt.js` | 参考其近景实例化、远景低细节和命名锚点方案。该模块依赖上游全局游戏对象、材质钩子及地图构建器。首版使用本项目的场景与加载器，在测出瓶颈后引入分级渲染。 |
| `tools/play.mjs`、`tools/acceptance/` | 复用隔离存档、固定尺寸、多视角截图、收集运行错误的验收思路。在本项目用 Playwright 驱动玩家实际入口，战斗与装备规则用 Vitest 独立测试。 |
| `LICENSE`、`CREDITS.md`、`assets/manifest.json` | 仓库代码采用 MIT；实际复用时保留所用版本的版权与许可文本。美术按单件素材的来源和许可核对。首版森林精英记录原创生成器与输入规格。 |

## 对照入口

- 建模与预览使用独立的离线命令。[Sculpt 工具](https://github.com/shoal-rat/majo-no-tabitabi/tree/d8a192ba8e4db990bf0745f0689861cd67deccd3/tools/sculpt)
- 系统修改和渲染效果需以游戏内运行与截图核对。[上游开发约定](https://github.com/shoal-rat/majo-no-tabitabi/blob/d8a192ba8e4db990bf0745f0689861cd67deccd3/AGENTS.md)
