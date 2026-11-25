# 角色领域接口

从 `src/domain/index.ts` 导入。状态操作返回新快照，失败时带原因和原快照。调用方应以最近一次成功的返回值作为下一次操作的输入。

| 用途 | 接口 |
| --- | --- |
| 初始化、成长和生命 | `createHero`、`DEFAULT_HERO`、`experienceToNextLevel`、`gainExperience`、`setHeroHealth`、`reviveHero` |
| 面板、比较与普通伤害 | `resolveStats`、`compareItem`、`calculateDirectHit`、`calculateArmorFactor` |
| 天赋 | `TALENTS`、`getTalentPoints`、`getTalentPurchaseIssue`、`purchaseTalent`、`resetTalents`、`restoreTalents` |
| 装备流程 | `createRewardState`、`resolveDeath`、`pickupItem`、`equipItem`、`unequipItem`、`dismantleItem` |
| 生成与校验 | `generateItem`、`rollLoot`、`createSeededRng`、`validateTalents`、`validateEquipmentCatalog` |
| 战斗运行时 | `createCombatEffects`、`resolveCombatStats`、`resolveCombatAttack`、`tickCombatEffects`、`resolveIncomingHit` |

- 每次进入新遭遇时调用 `createRewardState()`。把遭遇 ID 和敌人 ID 组成稳定的 `deathEventId` 传给 `resolveDeath(hero, rewards, event)`，并提交返回的角色和奖励快照。场景用 `drops` 生成地面表现，拾取成功后从场景移除。
- 战斗效果使用同一时钟下单调递增的游戏秒数。换装和洗点时沿用战斗效果快照。重新加载进度或重置遭遇时钟时用 `createCombatEffects(hero, now, true)` 对已拥有的传奇和雷暴应用完整起始冷却。
- 选择攻击目标后，`resolveCombatAttack` 返回同一动作内有序的直接伤害和派生伤害。定时调用 `tickCombatEffects` 以结算燃烧。使用 `resolveIncomingHit` 结算护甲已处理的物理伤害和可选元素伤害。`resolveCombatStats` 包含当前狂暴和条件回血。
- `resolveStats` 在未装备武器时使用默认空手伤害和攻频。装备比较使用常驻数值。增加最大生命时保留当前生命的绝对值，降低上限时执行截断。
- 传说装备和史诗装备分解时，调用方应在玩家二次确认后传入 `confirmed = true`。强化碎片和重铸晶石的键见 `MATERIALS`。
- 生成器可注入 `rng`、`createId`、`now` 复现同一实例。随机样本范围为 `[0, 1)`。实际滚出的属性与效果参数保存在装备实例中。

底材属性按每级 6% 增长，缩放以物品等级 50 为上限。雷霆之誓可在首版低等级遭遇按原品质权重掉落。风暴余烬读取本次直接命中前已存在的燃烧，新的燃烧从命中后一秒开始结算。

运行领域单测使用 `npm test -- src/domain/domain.test.ts`。
