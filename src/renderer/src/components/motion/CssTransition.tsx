import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement, RefCallback } from 'react'

type TransitionPhase =
  | 'enter-from'
  | 'enter-to'
  | 'leave-from'
  | 'leave-to'
  | 'appear-from'
  | 'appear-to'

type TransitionKind = 'enter' | 'leave' | 'appear'
type TransitionKey = string | number

interface TransitionRenderState {
  className: string
  ref: RefCallback<HTMLElement>
}

interface SwitchTransitionRenderState extends TransitionRenderState {
  transitionKey: string
}

interface GroupTransitionRenderState<T> extends TransitionRenderState {
  item: T
  index: number
  transitionKey: string
  isLeaving: boolean
}

interface CssTransitionProps {
  show: boolean
  name: string
  appear?: boolean
  children: (state: TransitionRenderState) => ReactElement
}

interface CssSwitchTransitionProps {
  transitionKey: string
  name: string
  appear?: boolean
  children: (state: SwitchTransitionRenderState) => ReactElement
}

interface CssTransitionGroupProps<T> {
  items: T[]
  name: string
  appear?: boolean
  getKey: (item: T) => TransitionKey
  children: (state: GroupTransitionRenderState<T>) => ReactElement
}

interface RenderItem<T> {
  key: string
  item: T
  index: number
  phase: TransitionPhase | null
}

function joinClasses(classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

function getTransitionKind(phase: TransitionPhase): TransitionKind {
  if (phase.startsWith('leave')) return 'leave'
  if (phase.startsWith('appear')) return 'appear'
  return 'enter'
}

function getTransitionClassName(
  name: string,
  phase: TransitionPhase | null,
  useAppearClasses = false
): string {
  if (!phase) return ''

  const kind = getTransitionKind(phase)
  const classKind = kind === 'appear' && !useAppearClasses ? 'enter' : kind
  const edge = phase.endsWith('from') ? 'from' : 'to'

  return `${name}-${classKind}-active ${name}-${classKind}-${edge}`
}

function parseCssTime(value: string): number {
  const trimmed = value.trim()
  if (!trimmed) return 0
  const numberValue = Number.parseFloat(trimmed)
  if (!Number.isFinite(numberValue)) return 0
  return trimmed.endsWith('ms') ? numberValue : numberValue * 1000
}

function parseTimeList(value: string): number[] {
  return value.split(',').map(parseCssTime)
}

function getMaxTimedPropertyMs(durations: number[], delays: number[]): number {
  if (durations.length === 0) return 0

  return durations.reduce((max, duration, index) => {
    const delay = delays[index] ?? delays[delays.length - 1] ?? 0
    return Math.max(max, duration + delay)
  }, 0)
}

function getElementTransitionTimeoutMs(element: HTMLElement | null): number {
  if (!element) return 0

  const styles = window.getComputedStyle(element)
  const transitionMs = getMaxTimedPropertyMs(
    parseTimeList(styles.transitionDuration),
    parseTimeList(styles.transitionDelay)
  )
  const animationMs = getMaxTimedPropertyMs(
    parseTimeList(styles.animationDuration),
    parseTimeList(styles.animationDelay)
  )

  const timeout = Math.max(transitionMs, animationMs)
  return timeout > 0 ? timeout + 40 : 0
}

function clearTimer(timer: number | null): void {
  if (timer !== null) {
    window.clearTimeout(timer)
  }
}

function clearFrame(frame: number | null): void {
  if (frame !== null) {
    window.cancelAnimationFrame(frame)
  }
}

function getToPhase(phase: TransitionPhase): TransitionPhase {
  if (phase === 'enter-from') return 'enter-to'
  if (phase === 'leave-from') return 'leave-to'
  if (phase === 'appear-from') return 'appear-to'
  return phase
}

export function CssTransition({
  show,
  name,
  appear = false,
  children
}: CssTransitionProps): ReactElement | null {
  const [mounted, setMounted] = useState(show)
  const [phase, setPhase] = useState<TransitionPhase | null>(show && appear ? 'enter-from' : null)
  const elementRef = useRef<HTMLElement | null>(null)
  const timerRef = useRef<number | null>(null)
  const frameRef = useRef<number | null>(null)
  const shouldEnterRef = useRef(show && appear)

  const setElementRef = useCallback<RefCallback<HTMLElement>>((node) => {
    elementRef.current = node
  }, [])

  const clearScheduledWork = useCallback((): void => {
    clearTimer(timerRef.current)
    clearFrame(frameRef.current)
    timerRef.current = null
    frameRef.current = null
  }, [])

  const finishTransition = useCallback(
    (nextMounted: boolean): void => {
      clearScheduledWork()
      setPhase(null)
      setMounted(nextMounted)
    },
    [clearScheduledWork]
  )

  const runTransition = useCallback(
    (fromPhase: TransitionPhase, shouldRemainMounted: boolean): void => {
      clearScheduledWork()
      setPhase(fromPhase)

      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null
        setPhase(getToPhase(fromPhase))

        frameRef.current = window.requestAnimationFrame(() => {
          frameRef.current = null
          const timeout = getElementTransitionTimeoutMs(elementRef.current)
          timerRef.current = window.setTimeout(() => finishTransition(shouldRemainMounted), timeout)
        })
      })
    },
    [clearScheduledWork, finishTransition]
  )

  useEffect(() => {
    if (show) {
      if (!mounted) {
        shouldEnterRef.current = true
        setMounted(true)
      }
      return
    }

    if (mounted) {
      runTransition('leave-from', false)
    }
  }, [mounted, runTransition, show])

  useEffect(() => {
    if (!mounted || !shouldEnterRef.current) return

    shouldEnterRef.current = false
    runTransition('enter-from', true)
  }, [mounted, runTransition])

  useEffect(() => clearScheduledWork, [clearScheduledWork])

  if (!mounted) return null

  return children({
    className: getTransitionClassName(name, phase),
    ref: setElementRef
  })
}

export function CssSwitchTransition({
  transitionKey,
  name,
  appear = false,
  children
}: CssSwitchTransitionProps): ReactElement {
  const [displayedKey, setDisplayedKey] = useState(transitionKey)
  const [phase, setPhase] = useState<TransitionPhase | null>(appear ? 'enter-from' : null)
  const elementRef = useRef<HTMLElement | null>(null)
  const timerRef = useRef<number | null>(null)
  const frameRef = useRef<number | null>(null)
  const pendingKeyRef = useRef<string | null>(null)
  const isLeavingRef = useRef(false)
  const shouldRunInitialAppearRef = useRef(appear)

  const setElementRef = useCallback<RefCallback<HTMLElement>>((node) => {
    elementRef.current = node
  }, [])

  const clearScheduledWork = useCallback((): void => {
    clearTimer(timerRef.current)
    clearFrame(frameRef.current)
    timerRef.current = null
    frameRef.current = null
  }, [])

  const finishEnter = useCallback((): void => {
    clearScheduledWork()
    setPhase(null)
  }, [clearScheduledWork])

  const runEnter = useCallback((): void => {
    clearScheduledWork()
    setPhase('enter-from')

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null
      setPhase('enter-to')

      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null
        const timeout = getElementTransitionTimeoutMs(elementRef.current)
        timerRef.current = window.setTimeout(finishEnter, timeout)
      })
    })
  }, [clearScheduledWork, finishEnter])

  const finishLeave = useCallback((): void => {
    const nextKey = pendingKeyRef.current
    if (!nextKey) {
      isLeavingRef.current = false
      finishEnter()
      return
    }

    clearScheduledWork()
    pendingKeyRef.current = null
    isLeavingRef.current = false
    setDisplayedKey(nextKey)
    runEnter()
  }, [clearScheduledWork, finishEnter, runEnter])

  const runLeave = useCallback((): void => {
    clearScheduledWork()
    isLeavingRef.current = true
    setPhase('leave-from')

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null
      setPhase('leave-to')

      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null
        const timeout = getElementTransitionTimeoutMs(elementRef.current)
        timerRef.current = window.setTimeout(finishLeave, timeout)
      })
    })
  }, [clearScheduledWork, finishLeave])

  useEffect(() => {
    if (!shouldRunInitialAppearRef.current) return
    shouldRunInitialAppearRef.current = false
    runEnter()
  }, [runEnter])

  useEffect(() => {
    if (transitionKey === displayedKey) return

    pendingKeyRef.current = transitionKey
    if (!isLeavingRef.current) {
      runLeave()
    }
  }, [displayedKey, runLeave, transitionKey])

  useEffect(() => clearScheduledWork, [clearScheduledWork])

  return children({
    transitionKey: displayedKey,
    className: getTransitionClassName(name, phase),
    ref: setElementRef
  })
}

export function CssTransitionGroup<T>({
  items,
  name,
  appear = false,
  getKey,
  children
}: CssTransitionGroupProps<T>): ReactElement[] {
  const [renderItems, setRenderItems] = useState<RenderItem<T>[]>(
    items.map((item, index) => ({
      key: String(getKey(item)),
      item,
      index,
      phase: appear ? 'appear-from' : null
    }))
  )
  const itemRefs = useRef(new Map<string, HTMLElement>())
  const timersRef = useRef(new Map<string, number>())
  const framesRef = useRef(new Map<string, number>())
  const scheduledKeysRef = useRef(new Set<string>())

  const clearItemWork = useCallback((key: string): void => {
    const timer = timersRef.current.get(key) ?? null
    const frame = framesRef.current.get(key) ?? null
    clearTimer(timer)
    clearFrame(frame)
    timersRef.current.delete(key)
    framesRef.current.delete(key)
    scheduledKeysRef.current.delete(key)
  }, [])

  const finishItemTransition = useCallback(
    (key: string, phase: TransitionPhase): void => {
      clearItemWork(key)

      setRenderItems((current) => {
        if (phase === 'leave-from') {
          return current.filter((item) => item.key !== key)
        }

        return current.map((item) => (item.key === key ? { ...item, phase: null } : item))
      })
    },
    [clearItemWork]
  )

  const scheduleItemTransition = useCallback(
    (key: string, phase: TransitionPhase): void => {
      if (!phase.endsWith('from') || scheduledKeysRef.current.has(key)) return

      scheduledKeysRef.current.add(key)
      const frame = window.requestAnimationFrame(() => {
        framesRef.current.delete(key)
        setRenderItems((current) =>
          current.map((item) => (item.key === key ? { ...item, phase: getToPhase(phase) } : item))
        )

        const timeoutFrame = window.requestAnimationFrame(() => {
          framesRef.current.delete(key)
          const timeout = getElementTransitionTimeoutMs(itemRefs.current.get(key) ?? null)
          const timer = window.setTimeout(() => finishItemTransition(key, phase), timeout)
          timersRef.current.set(key, timer)
        })
        framesRef.current.set(key, timeoutFrame)
      })
      framesRef.current.set(key, frame)
    },
    [finishItemTransition]
  )

  useEffect(() => {
    setRenderItems((current) => {
      const nextKeys = new Set(items.map((item) => String(getKey(item))))
      const currentByKey = new Map(current.map((item) => [item.key, item]))
      const nextRenderItems: RenderItem<T>[] = items.map((item, index) => {
        const key = String(getKey(item))
        const existing = currentByKey.get(key)

        if (!existing) {
          return { key, item, index, phase: 'enter-from' }
        }

        if (existing.phase?.startsWith('leave')) {
          clearItemWork(key)
          return { key, item, index, phase: 'enter-from' }
        }

        return { ...existing, item, index }
      })

      const leavingItems = current
        .filter((item) => !nextKeys.has(item.key))
        .map((item) =>
          item.phase?.startsWith('leave') ? item : { ...item, phase: 'leave-from' as const }
        )

      return [...nextRenderItems, ...leavingItems]
    })
  }, [clearItemWork, getKey, items])

  useEffect(() => {
    renderItems.forEach((item) => {
      if (item.phase?.endsWith('from')) {
        scheduleItemTransition(item.key, item.phase)
      }
    })
  }, [renderItems, scheduleItemTransition])

  useEffect(() => {
    const timers = timersRef.current
    const frames = framesRef.current
    const scheduledKeys = scheduledKeysRef.current

    return () => {
      Array.from(timers.values()).forEach((timer) => clearTimer(timer))
      Array.from(frames.values()).forEach((frame) => clearFrame(frame))
      timers.clear()
      frames.clear()
      scheduledKeys.clear()
    }
  }, [])

  return renderItems.map((renderItem) =>
    children({
      item: renderItem.item,
      index: renderItem.index,
      transitionKey: renderItem.key,
      isLeaving: renderItem.phase?.startsWith('leave') ?? false,
      className: joinClasses([
        getTransitionClassName(name, renderItem.phase, true),
        renderItem.phase?.startsWith('leave') && `${name}-leave-position`
      ]),
      ref: (node) => {
        if (node) {
          itemRefs.current.set(renderItem.key, node)
        } else {
          itemRefs.current.delete(renderItem.key)
        }
      }
    })
  )
}
