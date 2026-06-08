import { create } from 'zustand'

export type LabTerminalBackend = 'ssh'

export interface LabTerminalSessionConfig {
  key: string
  labId: string
  backend: LabTerminalBackend
  targetId: string
  title: string
  subtitle?: string
}

interface LabTerminalSessionStore {
  sessions: Record<string, LabTerminalSessionConfig>
  visibleSessionKey: string | null
  anchorElement: HTMLElement | null
  ensureSession: (config: LabTerminalSessionConfig) => void
  removeSession: (key: string) => void
  removeSessionsByLabId: (labId: string) => void
  setVisibleSession: (key: string | null, anchor?: HTMLElement | null) => void
  clearAnchor: () => void
}

export const useLabTerminalSessionStore = create<LabTerminalSessionStore>((set) => ({
  sessions: {},
  visibleSessionKey: null,
  anchorElement: null,

  ensureSession: (config) => {
    set((state) => {
      const existing = state.sessions[config.key]
      if (
        existing &&
        existing.labId === config.labId &&
        existing.backend === config.backend &&
        existing.targetId === config.targetId &&
        existing.title === config.title &&
        existing.subtitle === config.subtitle
      ) {
        return state
      }
      return {
        sessions: {
          ...state.sessions,
          [config.key]: config
        }
      }
    })
  },

  removeSession: (key) => {
    set((state) => {
      if (!state.sessions[key]) {
        return state
      }
      const nextSessions = { ...state.sessions }
      delete nextSessions[key]
      const clearingVisible = state.visibleSessionKey === key
      return {
        sessions: nextSessions,
        visibleSessionKey: clearingVisible ? null : state.visibleSessionKey,
        anchorElement: clearingVisible ? null : state.anchorElement
      }
    })
  },

  removeSessionsByLabId: (labId) => {
    set((state) => {
      const keysToRemove = Object.values(state.sessions)
        .filter((session) => session.labId === labId)
        .map((session) => session.key)
      if (keysToRemove.length === 0) {
        return state
      }
      const nextSessions = { ...state.sessions }
      for (const key of keysToRemove) {
        delete nextSessions[key]
      }
      const clearingVisible =
        state.visibleSessionKey !== null && keysToRemove.includes(state.visibleSessionKey)
      return {
        sessions: nextSessions,
        visibleSessionKey: clearingVisible ? null : state.visibleSessionKey,
        anchorElement: clearingVisible ? null : state.anchorElement
      }
    })
  },

  setVisibleSession: (key, anchor = null) => {
    set((state) => {
      const nextAnchor = anchor ?? null
      if (state.visibleSessionKey === key && state.anchorElement === nextAnchor) {
        return state
      }
      return {
        visibleSessionKey: key,
        anchorElement: nextAnchor
      }
    })
  },

  clearAnchor: () => {
    set((state) => {
      if (state.visibleSessionKey === null && state.anchorElement === null) {
        return state
      }
      return {
        visibleSessionKey: null,
        anchorElement: null
      }
    })
  }
}))
