import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import * as domain from './domain'
import type { GameController, GameSnapshot } from './game/contracts'
import { GameUI } from './ui'
import type { GameUIProps, UINotice, UISave } from './ui/types'
import { compareStats, displayItem, talentViews } from './presentation'
import { isCharacter } from './save/character'
import { readSlot, SaveConflict, writeSlot } from './save/store'
import { createEncounterHooks } from './session'

const initialGame: GameSnapshot = {
  phase: 'camp', stage: 0, stageName: '林地营地', health: 100, maxHealth: 100,
  cleaveCooldown: 0, cleaveCooldownMax: 4, paused: false, enemiesRemaining: 0,
  kills: 0, target: null, nearbyLoot: null, groundLootCount: 0,
}

function App() {
  const host = useRef<HTMLDivElement>(null)
  const engine = useRef<GameController | null>(null)
  const [hero, renderHero] = useState(domain.createHero)
  const current = useRef(hero)
  const [game, setGame] = useState(initialGame)
  const [ready, setReady] = useState(false)
  const [fatal, setFatal] = useState('')
  const [save, setSave] = useState<UISave>({ status: 'loading' })
  const [notice, setNotice] = useState<UINotice | null>(null)
  const noticeId = useRef(0)
  const revision = useRef(0)
  const queued = useRef<domain.Hero | null>(null)
  const writing = useRef(false)
  const conflicted = useRef(false)
  const notify = (text: string, tone: UINotice['tone'] = 'info') => setNotice({ id: ++noticeId.current, text, tone })

  async function flush() {
    if (writing.current || !queued.current || conflicted.current) return
    writing.current = true
    setSave({ status: 'saving' })
    try {
      while (queued.current) {
        const snapshot: domain.Hero = queued.current
        queued.current = null
        try {
          revision.current = await writeSlot(snapshot, revision.current)
        } catch (err) {
          queued.current ??= snapshot
          throw err
        }
      }
      setSave({ status: 'saved' })
    } catch (err) {
      conflicted.current = err instanceof SaveConflict
      setSave({ status: 'error', message: err instanceof Error ? err.message : '存档写入失败' })
    } finally {
      writing.current = false
    }
  }
  function commit(next: domain.Hero) {
    current.current = next
    renderHero(next)
    queued.current = next
    void flush()
  }

  useEffect(() => {
    let disposed = false
    const init = async () => {
      const slot = await readSlot(isCharacter)
      if (disposed) return
      if (slot) {
        revision.current = slot.revision
        current.current = domain.reviveHero(domain.restoreTalents(slot.hero, slot.hero.talents))
        renderHero(current.current)
      }
      setSave({ status: slot ? 'saved' : 'idle' })
      const hooks = createEncounterHooks(() => current.current, commit, setGame, notify)
      const { mountGame } = await import('./game')
      if (disposed) return
      const controller = await mountGame(host.current!, hooks)
      if (disposed) { controller.dispose(); return }
      engine.current = controller
      setReady(true)
    }
    init().catch(err => { if (!disposed) setFatal(err instanceof Error ? err.message : String(err)) })
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (writing.current || queued.current) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => { disposed = true; engine.current?.dispose(); window.removeEventListener('beforeunload', beforeUnload) }
  }, [])

  const inventory = useMemo(() => hero.inventory.items.map(displayItem), [hero.inventory.items])
  const equipment = useMemo(() => Object.fromEntries(Object.entries(hero.inventory.equipped)
    .map(([slot, item]) => [slot, displayItem(item)])), [hero.inventory.equipped])
  function apply(result: domain.HeroChange<string>, message: string) {
    if (!result.ok) { notify('当前条件无法完成此操作，请检查等级、格数或所需点数。', 'warning'); return false }
    commit(result.hero)
    notify(message, 'success')
    return true
  }
  const actions: Pick<GameUIProps, 'onEquip'|'onUnequip'|'onSalvage'|'onCompare'|'onAllocateTalent'|'onResetTalents'> = {
    onEquip: id => apply(domain.equipItem(current.current, id), '装备已穿戴'),
    onUnequip: slot => apply(domain.unequipItem(current.current, slot), '装备已收入背包'),
    onSalvage: id => apply(domain.dismantleItem(current.current, id, true), '已分解，材料已入账'),
    onCompare: id => {
      const selected = current.current.inventory.items.find(i => i.id === id)
      if (!selected) return []
      const comparison = domain.compareItem(current.current, selected)
      return compareStats(comparison.current, comparison.projected)
    },
    onAllocateTalent: id => apply(domain.purchaseTalent(current.current, id), '天赋已生效'),
    onResetTalents: () => apply(domain.resetTalents(current.current, game.phase === 'camp'), '天赋点已返还'),
  }
  return <main style={{ position: 'fixed', inset: 0 }}>
    <div ref={host} aria-label="林地游戏场景" style={{ position: 'absolute', inset: 0 }} />
    <GameUI {...actions} game={game} ready={ready} inventory={inventory} equipment={equipment}
      inventoryCapacity={hero.inventory.capacity} talents={talentViews} allocatedTalents={hero.talents}
      player={{ level: hero.level, experience: hero.experience, experienceToNext: domain.experienceToNextLevel(hero.level),
        talentPoints: domain.getTalentPoints(hero), gold: hero.inventory.gold,
        materials: Object.entries(hero.inventory.materials).map(([key, amount]) => ({ label: materialName(key), amount })) }}
      save={save} notice={notice}
      onStart={() => engine.current?.start()} onReturnToCamp={() => engine.current?.returnToCamp()}
      onPickup={() => engine.current?.pickup()} onPanelChange={panel => engine.current?.setPaused(!!panel)}
      onRetrySave={() => { if (conflicted.current) window.location.reload(); else void flush() }} />
    {fatal && <div role="alert" style={{ position: 'fixed', zIndex: 100, inset: '30% 15% auto', padding: 32, background: '#231f19', border: '1px solid #a58e59' }}>
      <h2>无法进入营地</h2><p>{fatal}</p><button onClick={() => location.reload()}>重新载入</button>
    </div>}
  </main>
}

function materialName(key: string) {
  return /reforge|crystal/i.test(key) ? '重铸晶石' : '强化碎片'
}

createRoot(document.getElementById('root')!).render(<App />)
