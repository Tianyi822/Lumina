import type { ReactNode } from 'react'
import { getRuntimePlatform } from '@renderer/composables/runtimePlatformCore'
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
        <div key={actionsKey || 'sidebar-actions'} className="sm-sidebar-shell__actions">
          {children}
        </div>
      )}
    </header>
  )
}
