import { useState } from 'react'
import { Icon } from './primitives'
import type { IconName } from './primitives'
import type { GameUIProps, UIEquipment, UIEquipmentSlot, UIRarity } from './types'

const slots = {
  weapon: { label: '武器', icon: 'sword' },
  head: { label: '头部', icon: 'head' },
  chest: { label: '胸甲', icon: 'chest' },
  hands: { label: '手部', icon: 'hands' },
  feet: { label: '足部', icon: 'feet' },
  accessory: { label: '饰品', icon: 'accessory' },
} satisfies Record<UIEquipmentSlot, { label: string; icon: IconName }>

const slotOrder = Object.keys(slots) as UIEquipmentSlot[]

const rarities: Record<UIRarity, string> = {
  common: '普通',
  magic: '魔法',
  rare: '稀有',
  epic: '史诗',
  legendary: '传说',
}

type InventoryProps = Pick<GameUIProps, 'player' | 'inventory' | 'equipment' | 'inventoryCapacity' | 'onEquip' | 'onUnequip' | 'onSalvage' | 'onCompare'>

export function InventoryPanel({ player, inventory, equipment, inventoryCapacity, onEquip, onUnequip, onSalvage, onCompare }: InventoryProps) {
  const [selectedId, setSelectedId] = useState<string>()
  const [tab, setTab] = useState<'details' | 'comparison'>('details')
  const [confirmId, setConfirmId] = useState<string>()
  const wornItems = Object.values(equipment)
  const selected = inventory.find(item => item.id === selectedId)
    ?? wornItems.find(item => item.id === selectedId)
    ?? inventory[0]
    ?? wornItems[0]
  const equipped = selected && equipment[selected.slot]?.id === selected.id
  const activeTab = equipped ? 'details' : tab
  const compareWith = selected && equipment[selected.slot]
  const comparison = selected && activeTab === 'comparison' ? onCompare(selected.id) : []
  const eligible = selected && player.level >= selected.requiredLevel
  const full = inventory.length >= inventoryCapacity

  function selectItem(item: UIEquipment) {
    setSelectedId(item.id)
    setConfirmId(undefined)
    setTab('details')
  }

  function salvage(item: UIEquipment) {
    if (onSalvage(item.id) !== false) {
      setConfirmId(undefined)
      setSelectedId(undefined)
      setTab('details')
    }
  }

  return (
    <div className="eo-inventory">
      <section className="eo-inventory-bag" aria-label="背包内容">
        <div className="eo-section-heading">
          <h3>携行物品</h3>
          <span className={full ? 'eo-warn-text' : undefined}>{inventory.length} / {inventoryCapacity}</span>
        </div>
        <div className="eo-item-grid">
          {Array.from({ length: Math.max(inventoryCapacity, inventory.length) }, (_, index) => {
            const item = inventory[index]
            return item ? (
              <button className={`eo-item-cell eo-rarity-${item.rarity}`} key={item.id} type="button" aria-pressed={selected?.id === item.id} title={`${item.name} · ${rarities[item.rarity]}`} aria-label={`${item.name}，${rarities[item.rarity]}`} onClick={() => selectItem(item)}>
                <Icon name={slots[item.slot].icon} />
                {item.locked && <Icon className="eo-item-lock" name="lock" />}
              </button>
            ) : <div className="eo-item-cell eo-item-cell-empty" key={`empty-${index}`} aria-hidden="true" />
          })}
        </div>
        <dl className="eo-wallet">
          <div><dt><Icon name="coin" />金币</dt><dd>{player.gold}</dd></div>
          {player.materials.map(material => <div key={material.label}><dt>{material.label}</dt><dd>{material.amount}</dd></div>)}
        </dl>
      </section>
      <section className="eo-inventory-equipped" aria-label="已穿戴装备">
        <div className="eo-section-heading"><h3>已穿戴</h3></div>
        <div className="eo-equipped-list">
          {slotOrder.map(slot => {
            const item = equipment[slot]
            return item ? (
              <button className={`eo-equipped-slot eo-rarity-${item.rarity}`} key={slot} type="button" aria-pressed={selected?.id === item.id} onClick={() => selectItem(item)}>
                <Icon name={slots[slot].icon} />
                <span><small>{slots[slot].label}</small><strong>{item.name}</strong></span>
              </button>
            ) : (
              <div className="eo-equipped-slot eo-equipped-slot-empty" key={slot}>
                <Icon name={slots[slot].icon} />
                <span><small>{slots[slot].label}</small><span>空槽</span></span>
              </div>
            )
          })}
        </div>
      </section>
      <section className="eo-item-detail" aria-label="装备详情">
        {selected ? <>
          <header className={`eo-item-heading eo-rarity-${selected.rarity}`}>
            <span className="eo-item-emblem"><Icon name={slots[selected.slot].icon} /></span>
            <div>
              <p>{rarities[selected.rarity]} · {slots[selected.slot].label}{equipped ? ' · 已穿戴' : ''}</p>
              <h3>{selected.name}</h3>
              <p className={eligible ? 'eo-muted' : 'eo-warn-text'}>需求等级 {selected.requiredLevel} · 物品等级 {selected.itemLevel}</p>
            </div>
          </header>
          {!equipped && <div className="eo-item-tabs" role="group" aria-label="装备详情视图">
            <button type="button" aria-pressed={activeTab === 'details'} onClick={() => setTab('details')}>属性</button>
            <button type="button" aria-pressed={activeTab === 'comparison'} onClick={() => setTab('comparison')}>比较装备</button>
          </div>}
          {activeTab === 'comparison' ? (
            <div className="eo-comparison">
              <p className="eo-muted">同部位当前装备 · {compareWith?.name ?? '空槽'}</p>
              {comparison.length > 0 ? <table>
                <thead><tr><th scope="col">角色属性</th><th scope="col">当前</th><th scope="col">替换后</th><th scope="col">变化</th></tr></thead>
                <tbody>{comparison.map(row => <tr key={row.label}>
                  <th scope="row">{row.label}</th><td>{row.current}</td><td>{row.proposed}</td>
                  <td className={`eo-change-${row.direction ?? 'neutral'}`}>{row.change ?? (row.direction === 'increase' ? '提高' : row.direction === 'decrease' ? '降低' : '—')}</td>
                </tr>)}</tbody>
              </table> : <p>替换后，角色属性数值相同。</p>}
              {(selected.legendaryEffect || compareWith?.legendaryEffect) && <div className="eo-comparison-effects">
                {selected.legendaryEffect && <p>替换后 · {selected.legendaryEffect.name} · {selected.legendaryEffect.description}</p>}
                {compareWith?.legendaryEffect && <p>当前 · {compareWith.legendaryEffect.name} · {compareWith.legendaryEffect.description}</p>}
              </div>}
            </div>
          ) : (
            <>
              <dl className="eo-stat-list">
                {selected.stats.map(stat => <div key={stat.label}><dt>{stat.label}</dt><dd>{stat.value}</dd></div>)}
                {selected.affixes?.map((affix, index) => <div className="eo-affix" key={`${affix.label}-${index}`}><dt>{affix.label}{affix.tier !== undefined && <small> T{affix.tier}</small>}</dt><dd>{affix.value}</dd></div>)}
              </dl>
              {selected.legendaryEffect && <div className="eo-legendary">
                <h4><Icon name="spark" />{selected.legendaryEffect.name}</h4>
                <p>{selected.legendaryEffect.description}</p>
              </div>}
            </>
          )}
          <div className="eo-detail-actions">
            {confirmId === selected.id ? (
              <div className="eo-confirm" role="group" aria-label="确认分解">
                <p role="status">分解「{selected.name}」后，装备将永久消失。</p>
                <button type="button" className="eo-button" onClick={() => setConfirmId(undefined)}>取消</button>
                <button type="button" className="eo-button eo-button-danger" onClick={() => salvage(selected)}>确认分解</button>
              </div>
            ) : equipped ? (
              <>
                <button type="button" className="eo-button" disabled={full} onClick={() => onUnequip(selected.slot)}>卸下</button>
                {full && <small className="eo-warn-text">背包已满</small>}
              </>
            ) : (
              <>
                <button type="button" className="eo-button eo-button-primary" disabled={!eligible} onClick={() => {
                  if (onEquip(selected.id) !== false) {
                    setSelectedId(selected.id)
                    setTab('details')
                  }
                }}>穿戴</button>
                <button type="button" className="eo-button" disabled={selected.locked} onClick={() => {
                  if (selected.rarity === 'epic' || selected.rarity === 'legendary') setConfirmId(selected.id)
                  else salvage(selected)
                }}>分解</button>
                {selected.locked && <small className="eo-muted">已锁定</small>}
              </>
            )}
          </div>
        </> : <div className="eo-empty-detail"><Icon name="pack" /><h3>行囊空空</h3><p>在林地击败敌人后，按 E 拾取附近的战利品。</p></div>}
      </section>
    </div>
  )
}
