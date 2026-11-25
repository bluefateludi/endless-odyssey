import { useState } from 'react'
import { Icon } from './primitives'
import type { IconName } from './primitives'
import type { GameUIProps, UITalent, UITalentBranch } from './types'

const branches: readonly { id: UITalentBranch; name: string; icon: IconName }[] = [
  { id: 'martial', name: '武技', icon: 'sword' },
  { id: 'guard', name: '守御', icon: 'shield' },
  { id: 'elemental', name: '元素', icon: 'spark' },
]

type NodeState = 'allocated' | 'available' | 'locked'

const stateLabels: Record<NodeState, string> = {
  allocated: '已点亮',
  available: '可点亮',
  locked: '锁定',
}

const branchLayout = {
  martial: [[50, 12], [23, 35], [77, 35], [82, 60], [18, 60], [50, 62], [56, 87]],
  guard: [[50, 12], [23, 35], [77, 35], [18, 60], [82, 60], [50, 62], [44, 87]],
  elemental: [[50, 12], [23, 35], [77, 35], [18, 60], [82, 60], [50, 86]],
}

type TalentProps = Pick<GameUIProps, 'talents' | 'allocatedTalents' | 'onAllocateTalent' | 'onResetTalents'> & {
  points: number
  inCamp: boolean
}

export function TalentPanel({ points, inCamp, talents, allocatedTalents, onAllocateTalent, onResetTalents }: TalentProps) {
  const [selectedId, setSelectedId] = useState(talents[0]?.id)
  const [pendingReset, setPendingReset] = useState(false)
  const selected = talents.find(node => node.id === selectedId) ?? talents[0]
  const allocated = new Set(allocatedTalents)
  const byId = new Map(talents.map(node => [node.id, node]))

  function getState(node: UITalent): NodeState {
    if (allocated.has(node.id)) return 'allocated'
    return points >= node.cost && node.prerequisites.every(id => allocated.has(id)) ? 'available' : 'locked'
  }

  const selectedState = selected && getState(selected)
  const missing = selected?.prerequisites.filter(id => !allocated.has(id)) ?? []

  return (
    <div className="eo-talent-layout">
      <div className="eo-talent-main">
        <div className="eo-talent-summary">
          <div className="eo-points"><strong>{points}</strong><span>可用天赋点</span></div>
          <div className="eo-talent-legend" aria-label="节点状态图例">
            <span><i className="eo-node-allocated" />已点亮</span>
            <span><i className="eo-node-available" />可点亮</span>
            <span><i className="eo-node-locked" />锁定</span>
          </div>
        </div>
        <div className="eo-talent-branches">
          {branches.map(branch => {
            const nodes = talents.filter(node => node.branch === branch.id)
            const positions = new Map(nodes.map((node, index) => [node.id, branchLayout[branch.id][index]]))
            return (
              <section className={`eo-branch eo-branch-${branch.id}`} key={branch.id} aria-label={branch.name}>
                <h3><Icon name={branch.icon} />{branch.name}</h3>
                <div className="eo-branch-graph">
                  <svg className="eo-branch-edges" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    {nodes.flatMap(node => node.prerequisites.map(prerequisite => {
                      const origin = positions.get(prerequisite)
                      const end = positions.get(node.id)
                      if (!origin || !end) return null
                      return <line key={`${prerequisite}-${node.id}`} x1={origin[0]} y1={origin[1]} x2={end[0]} y2={end[1]} vectorEffect="non-scaling-stroke" data-allocated={allocated.has(prerequisite) && allocated.has(node.id)} />
                    }))}
                  </svg>
                  {nodes.map(node => {
                    const [x, y] = positions.get(node.id) ?? [50, 98]
                    const state = getState(node)
                    return (
                      <button type="button" className={`eo-node eo-node-${state}`} key={node.id} style={{ left: `${x}%`, top: `${y}%` }} aria-label={`${node.name}，${stateLabels[state]}`} aria-pressed={selected?.id === node.id} onClick={() => setSelectedId(node.id)}>
                        <span className="eo-node-emblem"><Icon name={state === 'allocated' ? 'check' : state === 'locked' ? 'lock' : branch.icon} /></span>
                        <span className="eo-node-label">{node.name}</span>
                      </button>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      </div>
      <section className="eo-talent-detail" aria-label="天赋详情">
        {selected && selectedState && <>
          <span className={`eo-talent-state eo-node-${selectedState}`}>{stateLabels[selectedState]}</span>
          <h3>{selected.name}</h3>
          <p className="eo-talent-effect">{selected.description}</p>
          <dl className="eo-stat-list">
            <div><dt>消耗</dt><dd>{selected.cost} 点</dd></div>
            <div><dt>前置天赋</dt><dd>{selected.prerequisites.map(id => byId.get(id)?.name ?? id).join('、') || '无'}</dd></div>
          </dl>
          {selectedState === 'locked' && <p className="eo-muted">
            {missing.length ? `需要先点亮「${missing.map(id => byId.get(id)?.name ?? id).join('」「')}」。` : '可用天赋点不足。'}
          </p>}
          <button type="button" className="eo-button eo-button-primary" disabled={selectedState !== 'available'} onClick={() => onAllocateTalent(selected.id)}>
            {selectedState === 'allocated' ? '已点亮' : '点亮天赋'}
          </button>
        </>}
        <div className="eo-reset">
          {pendingReset && inCamp && allocated.size > 0 ? (
            <div className="eo-confirm" role="group" aria-label="确认重置天赋">
              <p role="status">重置会清空全部已选天赋并返还点数。</p>
              <button type="button" className="eo-button" onClick={() => setPendingReset(false)}>取消</button>
              <button type="button" className="eo-button eo-button-primary" onClick={() => {
                if (onResetTalents() !== false) setPendingReset(false)
              }}>确认重置</button>
            </div>
          ) : <>
            <button type="button" className="eo-button" disabled={!inCamp || allocated.size === 0} onClick={() => setPendingReset(true)}>重置天赋</button>
            {!inCamp && <small className="eo-muted">回到营地后可以免费重置。</small>}
          </>}
        </div>
      </section>
    </div>
  )
}
