import { useRef } from 'react'
import type { ReactNode } from 'react'
import { getRuntimePlatform } from '@renderer/composables/runtimePlatformCore'
import { CssSwitchTransition } from '@renderer/components/motion/CssTransition'
import WorkspaceViewSwitcher from './WorkspaceViewSwitcher'
import styles from './WorkspaceSidebarChrome.module.css'

interface WorkspaceSidebarChromeProps {
  count: number
  actionsKey?: string
  children?: ReactNode
}

export default function WorkspaceSidebarChrome({
  count,
  actionsKey,
  children
}: WorkspaceSidebarChromeProps) {
  const { isWindows, usesNativeTrafficLights } = getRuntimePlatform()
  const actionChildrenByKeyRef = useRef(new Map<string, ReactNode>())
  const actionKey = actionsKey || 'sidebar-actions'

  if (children) {
    actionChildrenByKeyRef.current.set(actionKey, children)
  }

  return (
    <header
      className={[
        'sm-sidebar-shell__header',
        styles['sm-sidebar-shell__header'],
        'sm-sidebar-shell__header--chrome',
        usesNativeTrafficLights && 'sm-sidebar-shell__header--chrome-mac',
        isWindows && 'sm-sidebar-shell__header--chrome-windows'
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {(usesNativeTrafficLights || isWindows) && (
        <div
          className={[
            styles['sm-sidebar-shell__chrome-action-hitbox'],
            isWindows && styles['sm-sidebar-shell__chrome-action-hitbox--windows']
          ]
            .filter(Boolean)
            .join(' ')}
          aria-hidden="true"
        />
      )}

      <div className="sm-sidebar-shell__switcher-row">
        <div className="sm-sidebar-shell__switcher-card">
          <WorkspaceViewSwitcher />
        </div>
        <span className="sm-sidebar-shell__count">{count}</span>
      </div>

      {children && (
        <CssSwitchTransition name="sm-sidebar-actions-switch" transitionKey={actionKey} appear>
          {({ transitionKey, className, ref }) => (
            <div
              ref={ref}
              className={['sm-sidebar-shell__actions', className].filter(Boolean).join(' ')}
            >
              {actionChildrenByKeyRef.current.get(transitionKey)}
            </div>
          )}
        </CssSwitchTransition>
      )}
    </header>
  )
}
