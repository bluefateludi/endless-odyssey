import { useCallback, useEffect, useRef, useState } from 'react'
import { InventoryPanel } from './inventory'
import { Icon, Key, Meter } from './primitives'
import { TalentPanel } from './talents'
import type { GameUIProps, UINotice, UIPanel, UISave } from './types'
import './game-ui.css'

export type * from './types'

const panelTitles: Record<UIPanel, string> = { inventory: '背包', talents: '天赋树', controls: '操作指南' }
const enemyKinds = { normal: '普通', elite: '精英', boss: '首领' } as const
const saveLabels: Record<UISave['status'], string> = {
  loading: '读取存档中',
  idle: '本地存档',
  saving: '保存中',
  saved: '已保存',
  error: '保存失败',
}

const controls = [
  { keys: ['W', 'A', 'S', 'D'], action: '移动', detail: '按屏幕方向行走' },
  { keys: ['鼠标'], action: '瞄准', detail: '指向地面以调整攻击朝向' },
  { keys: ['左键'], action: '普攻', detail: '朝指针方向挥击' },
  { keys: ['Q'], action: '顺劈', detail: '攻击前方扇形范围' },
  { keys: ['E'], action: '拾取', detail: '拾取最近的战利品' },
  { keys: ['I'], action: '背包', detail: '查看、比较与更换装备' },
  { keys: ['T'], action: '天赋树', detail: '查看分支并分配天赋点' },
  { keys: ['Esc'], action: '关闭面板', detail: '继续游戏' },
]

function SaveStatus({ save, onRetry }: { save: UISave; onRetry?: () => void }) {
  return <div className={`eo-save eo-save-${save.status}`}>
    <span role="status" title={save.message}><span className="eo-save-indicator" aria-hidden="true" />{saveLabels[save.status]}</span>
    {save.status === 'error' && save.message && <small>{save.message}</small>}
    {save.status === 'error' && onRetry && <button type="button" className="eo-text-button" onClick={onRetry}>重试保存</button>}
  </div>
}

function Notice({ notice }: { notice?: UINotice | null }) {
  return <div className="eo-notice-region" aria-live="polite" aria-atomic="true">
    {notice && <p className={`eo-notice eo-notice-${notice.tone ?? 'info'}`} key={notice.id}>
      <Icon name={notice.tone === 'success' ? 'check' : notice.tone === 'warning' ? 'warning' : 'pickup'} />{notice.text}
    </p>}
  </div>
}

function ControlsPanel() {
  return <div className="eo-controls">
    <p>移动可以避开地面标出的攻击范围。</p>
    <dl>
      {controls.map(control => <div key={control.action}>
        <dt><strong>{control.action}</strong><span>{control.detail}</span></dt>
        <dd>{control.keys.map(key => <Key key={key}>{key}</Key>)}</dd>
      </div>)}
    </dl>
  </div>
}

export function GameUI(props: GameUIProps) {
  const { game, player, ready = true, onPanelChange, onStart, onReturnToCamp, onPickup } = props
  const [panel, setPanel] = useState<UIPanel | null>(null)
  const [levelNotice, setLevelNotice] = useState<number>()
  const previousProgress = useRef({ level: player.level, ready })
  const activeDialog = useRef<HTMLDialogElement>(null)
  const restoreFocus = useRef<HTMLElement | null>(null)
  const camp = game.phase === 'camp'
  const victory = game.phase === 'victory'
  const defeat = game.phase === 'defeat'
  const target = game.target
  const cooldown = Math.max(0, game.cleaveCooldown)
  const showLoot = !camp && !defeat && game.nearbyLoot

  const changePanel = useCallback((next: UIPanel | null) => {
    if (next === panel) return
    if (!panel && next) {
      restoreFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    }
    setPanel(next)
    onPanelChange(next)
  }, [panel, onPanelChange])

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return
      const key = event.key.toLowerCase()
      const requested = key === 'i' ? 'inventory' : key === 't' ? 'talents' : null
      if (!(ready && requested) && !(panel && key === 'escape')) return
      event.preventDefault()
      event.stopPropagation()
      if (event.repeat) return
      changePanel(requested === panel ? null : requested)
    }
    window.addEventListener('keydown', handleKey, true)
    return () => window.removeEventListener('keydown', handleKey, true)
  }, [changePanel, panel, ready])

  useEffect(() => {
    const dialog = activeDialog.current
    if (panel && dialog && !dialog.open) dialog.showModal()
    if (panel && dialog && !dialog.contains(document.activeElement)) {
      dialog.querySelector<HTMLButtonElement>('.eo-dialog-close')?.focus()
    }
    if (!panel && dialog?.open) {
      dialog.close()
      restoreFocus.current?.focus({ preventScroll: true })
      restoreFocus.current = null
    }
  }, [panel])

  useEffect(() => {
    const previous = previousProgress.current
    previousProgress.current = { level: player.level, ready }
    if (!ready || !previous.ready || player.level <= previous.level) return
    setLevelNotice(player.level)
    const timeout = window.setTimeout(() => setLevelNotice(undefined), 5000)
    return () => window.clearTimeout(timeout)
  }, [player.level, ready])

  return (
    <div className={`eo-ui eo-phase-${game.phase}`} onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
      <div className="eo-vignette" aria-hidden="true" />
      <header className="eo-topbar">
        <div className="eo-brand">
          <span className="eo-brand-emblem"><Icon name="mark" /></span>
          <div><p>ENDLESS ODYSSEY</p><span>无尽之途</span></div>
        </div>
        <div className="eo-location" aria-label="当前区域">
          <span className="eo-location-mark" aria-hidden="true" />
          <div><strong>{camp ? '林缘营地' : game.stageName || '灰棘林地'}</strong>
            <span>{camp ? '安全区' : game.phase === 'combat' ? `遭遇 ${game.stage} / 3 · 剩余 ${game.enemiesRemaining}` : victory ? '关卡已完成' : '本次远征已结束'}</span>
          </div>
          <span className="eo-location-mark" aria-hidden="true" />
        </div>
        <nav className="eo-nav" aria-label="游戏面板">
          <button className="eo-nav-button" type="button" aria-label="背包" aria-haspopup="dialog" aria-expanded={panel === 'inventory'} aria-keyshortcuts="I" disabled={!ready} onClick={() => changePanel('inventory')}>
            <Icon name="pack" /><span>背包</span><Key>I</Key>
          </button>
          <button className="eo-nav-button" type="button" aria-label={player.talentPoints ? `天赋，${player.talentPoints} 点可用` : '天赋'} aria-haspopup="dialog" aria-expanded={panel === 'talents'} aria-keyshortcuts="T" disabled={!ready} onClick={() => changePanel('talents')}>
            <Icon name="talent" /><span>天赋</span><Key>T</Key>
            {player.talentPoints > 0 && <b className="eo-nav-points" aria-hidden="true">{player.talentPoints}</b>}
          </button>
          <button className="eo-nav-button eo-nav-help" type="button" aria-label="操作指南" aria-haspopup="dialog" aria-expanded={panel === 'controls'} disabled={!ready} onClick={() => changePanel('controls')} title="操作指南"><Icon name="controls" /></button>
        </nav>
      </header>

      {camp && (
        <section className="eo-camp" aria-label="林地远征">
          <div className="eo-camp-kicker"><span aria-hidden="true" />林地远征</div>
          <h1>灰棘林地</h1>
          <p>踏过林道，击败守卫，深入裂木古王的石环。</p>
          <button type="button" className="eo-forward" disabled={!ready} onClick={onStart}>
            <Icon name="camp" /><span>{ready ? '出发远征' : '准备中'}</span><Icon name="arrow" />
          </button>
        </section>
      )}

      {!camp && !defeat && target && (
        <section className={`eo-target eo-target-${target.kind}`} aria-label="当前目标">
          <div><strong>{target.name}</strong><span>{enemyKinds[target.kind]}</span><span>{Math.ceil(target.health)} / {Math.ceil(target.maxHealth)}</span></div>
          <Meter label={`${target.name}生命`} value={target.health} max={target.maxHealth} />
        </section>
      )}

      {(victory || defeat) && (
        <section className={`eo-result ${defeat ? 'eo-result-defeat' : ''}`} aria-labelledby="eo-result-title">
          <Icon name={victory ? 'mark' : 'warning'} />
          <h2 id="eo-result-title">{victory ? '远征告捷' : '远征失败'}</h2>
          <p>{victory ? `裂木古王已倒下。共击败 ${game.kills} 名敌人。` : '已获得的经验、装备和材料会保留。'}</p>
          {game.groundLootCount > 0 && <p className="eo-warn-text">{victory ? `地面还有 ${game.groundLootCount} 件战利品。回营后将消失。` : '返回营地后，遗留在地面的战利品将消失。'}</p>}
          <button type="button" className="eo-button eo-button-primary" onClick={onReturnToCamp}>{victory ? '返回营地' : '复活并返回营地'}</button>
        </section>
      )}

      <div className="eo-feedback">
        <div aria-live="polite" aria-atomic="true">
          {levelNotice !== undefined && levelNotice === player.level && <p className="eo-level-up" key={levelNotice}><Icon name="spark" /><span><strong>等级提升</strong>已达到 {levelNotice} 级{player.talentPoints > 0 && `，可分配 ${player.talentPoints} 点天赋`}</span></p>}
        </div>
        {!panel && <Notice notice={props.notice} />}
      </div>
      {showLoot && <button type="button" className={`eo-pickup eo-rarity-${showLoot.rarity}`} aria-keyshortcuts="E" onClick={onPickup}>
        <Key>E</Key><span>拾取<strong>{showLoot.name}</strong></span>
      </button>}

      <footer className="eo-bottom">
        <section className="eo-character" aria-label="角色状态">
          <div className="eo-level" aria-label={`角色等级 ${player.level}`}><span>等级</span><strong>{player.level}</strong></div>
          <div className="eo-vitals">
            <div className="eo-health-header"><span><Icon name="heart" />生命</span><strong>{Math.ceil(game.health)} <small>/ {Math.ceil(game.maxHealth)}</small></strong></div>
            <Meter className="eo-health" label="角色生命" value={game.health} max={game.maxHealth} />
            <div className="eo-xp-header"><span>经验</span><span>{player.experience} / {player.experienceToNext}</span></div>
            <Meter className="eo-xp" label="升级经验" value={player.experience} max={player.experienceToNext} />
          </div>
        </section>
        <div className="eo-actionbar" aria-label="战斗动作">
          <div className="eo-action">
            <span className="eo-action-emblem"><Icon name="sword" /></span><span><strong>普攻</strong><Key>左键</Key></span>
          </div>
          <div className={`eo-action eo-action-cleave${cooldown > 0 ? ' eo-action-cooldown' : ''}`} title={cooldown > 0 ? `顺劈冷却 ${cooldown.toFixed(1)} 秒` : '顺劈可用'}>
            <span className="eo-action-emblem">
              <Icon name="cleave" />
              {cooldown > 0 && <span className="eo-cooldown-fill" aria-hidden="true" style={{ height: `${Math.min(1, cooldown / Math.max(1, game.cleaveCooldownMax)) * 100}%` }} />}
            </span>
            <span><strong>顺劈{cooldown > 0 && <small> {cooldown.toFixed(1)} 秒</small>}</strong><Key>Q</Key></span>
          </div>
        </div>
        <div className="eo-footer-right">
          <span className="eo-movement"><Key>W A S D</Key>移动 <Key>E</Key>拾取</span>
          <SaveStatus save={props.save} onRetry={props.onRetrySave} />
        </div>
      </footer>

      <dialog ref={activeDialog} className={`eo-dialog eo-dialog-${panel ?? 'closed'}`} aria-labelledby="eo-panel-title" onCancel={event => {
        event.preventDefault()
        changePanel(null)
      }} onClick={event => {
        if (event.target === event.currentTarget) changePanel(null)
      }}>
        {panel && <div className="eo-dialog-inner">
          <header className="eo-dialog-header">
            <span className="eo-dialog-emblem"><Icon name={panel === 'inventory' ? 'pack' : panel === 'talents' ? 'talent' : 'controls'} /></span>
            <h2 id="eo-panel-title">{panelTitles[panel]}</h2>
            <span className="eo-dialog-pause">{!camp && '游戏已暂停'}</span>
            <button type="button" className="eo-dialog-close" aria-label="关闭面板" onClick={() => changePanel(null)}><Key>Esc</Key><Icon name="close" /></button>
          </header>
          <div className="eo-dialog-body">
            {panel === 'inventory' && <InventoryPanel {...props} />}
            {panel === 'talents' && <TalentPanel talents={props.talents} allocatedTalents={props.allocatedTalents} points={player.talentPoints} inCamp={camp} onAllocateTalent={props.onAllocateTalent} onResetTalents={props.onResetTalents} />}
            {panel === 'controls' && <ControlsPanel />}
          </div>
          <Notice notice={props.notice} />
        </div>}
      </dialog>
    </div>
  )
}
