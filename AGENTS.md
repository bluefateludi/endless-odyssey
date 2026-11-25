# Endless Odyssey 开发约定

- Windows 下载任务按用户约定默认使用 `D:\download`，用户指定其他位置时以指定位置为准。
- 功能边界见 `docs/design/systems.md`。天赋树属于首版，深渊与图鉴后置；装备的数值语义见 `equipment-system-design.md`。
- 领域逻辑放在 `src/domain`，游戏场景在 `src/game`，UI 在 `src/ui`。让同一属性解析器驱动装备比较和实际战斗。
- 使用 Node 24 和 npm。改动后运行 `npm test`、`npm run build`；涉及画面、操作、存档或核心流程时运行 `npm run test:e2e` 并查看相应截图。发现问题后修复并重跑。
- 外部美术登记实际来源、作者与许可证。资产标准化与性能验收失败时保留错误报告并修复，再纳入发布清单。
