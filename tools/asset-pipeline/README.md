# 森林精英资产流水线

游戏从 /assets/registry.json 读取 assets["moss-warden"]，以 currentVersion 查找 versions[currentVersion].url。固定入口为 /assets/models/moss-warden.glb。每个验收版本保留独立 GLB URL 和 SHA-256。

## 战斗接入

| 项目 | 约定 |
| --- | --- |
| 坐标 | 米制，Y 向上，本地 +Z 向前。根节点原点是脚底与地面的接触中心。以 Math.atan2(direction.x, direction.z) 计算水平朝向。 |
| 静止姿态 | 预期宽 1.95–3.1 m、高 2.7–3.15 m、深 0.95–1.65 m。精确实测值见注册版本的验收报告。 |
| 碰撞体 | 圆柱体半径 0.72 m、高 2.5 m，局部中心 (0, 1.25, 0)。Rapier 圆柱体的半高参数为 1.25 m。武器的攻击范围由战斗配置决定。 |
| 动画 | Idle 2.40 s、Walk 0.86 s 可循环。Attack 1.30 s、Hit 0.32 s、Death 1.10 s 单次播放。动作只驱动模型内部节点，实体根位置与朝向由游戏控制。 |
| 攻击 | Attack 的劈击接触姿态在 0.76 s。战斗系统可按自己的判定窗口选择播放速度。 |
| 加载 | GLTFLoader 直接加载 GLB。单实例用 AnimationMixer，场景实例需要独立克隆和动作状态。GLB 使用刚性关节节点、PBR 顶点色和自发光材质。 |

资产规格见 data/asset-specs/moss-warden.json。模型、顶点色以及关键帧由仓库内源码生成。


## 运行

在项目根目录用 Node 24 执行。以下示例使用已安装的 Google Chrome。也可指定 msedge，或执行 npx playwright install chromium 后省略 --channel。

```powershell
node tools/asset-pipeline/cli.mjs data/asset-specs/moss-warden.json --publish --channel chrome
node tools/asset-pipeline/regression.mjs --channel chrome
```

省略 --publish 只生成、截图和验收。--input 接收一个已有 GLB，沿用相同规格和验收门槛。--publish-to 可将已验收包写到指定的资产根目录，回归用它隔离游戏资产。

每次运行在 tools/asset-pipeline/runs/ 下保留 spec.json、候选 GLB、截图以及 report.json。Chrome 在 WebGL 2 中重新加载交付的 GLB，截取正面、持刃侧、背面、等距视角及五段动作的指定时间点。GLB 检验核对内嵌资源、三角面、贴图数量与编码字节数，浏览器核对解码像素、尺寸、关节动作、离地误差、单模型绘制调用数和帧耗时。帧耗时是指定视口中 40 次单模型提交和 WebGL 同步的 P95，含动作更新，不含地板与网格。报告记录浏览器与渲染器。

验收失败时，CLI 返回 1，报告记录字段、实测值和上限。已捕获的截图随本次运行保留。示例见 [超预算报告](examples/over-budget/report.json)。回归还检查截断的 GLB 及拒收后注册表和游戏入口的内容哈希。

版本化预览和报告随 GLB 保存到 public/assets。已登记版本保留原 GLB、规格哈希和验收报告。更改规格或模型时递增版本号。生成器源文件位于 tools/asset-pipeline/models/，通过 generate.mjs 的生成器表接入，后续资源可复用验收与发布步骤。

