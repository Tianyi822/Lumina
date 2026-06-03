import { useEffect, useRef, useState } from 'react'
import type { ContainerStats } from '@renderer/types/lab'
import { computeByteRate } from '../containerIoFormatters'

const MAX_HISTORY_POINTS = 40

export interface IoRateSample {
  timestamp: number
  upper: number
  lower: number
}

export interface IoRates {
  upper: number | null
  lower: number | null
}

interface PrevSnapshot {
  containerId: string
  timestamp: number
  rxBytes: number
  txBytes: number
  readBytes: number
  writeBytes: number
}

function appendSample(samples: IoRateSample[], sample: IoRateSample): IoRateSample[] {
  const next = [...samples, sample]
  if (next.length <= MAX_HISTORY_POINTS) return next
  return next.slice(next.length - MAX_HISTORY_POINTS)
}

const EMPTY_RATES: IoRates = { upper: null, lower: null }

export interface UseContainerIoHistoryReturn {
  networkSeries: IoRateSample[]
  blockSeries: IoRateSample[]
  networkRates: IoRates
  blockRates: IoRates
}

export function useContainerIoHistory(
  stats: ContainerStats | null | undefined,
  containerId: string
): UseContainerIoHistoryReturn {
  const [networkSeries, setNetworkSeries] = useState<IoRateSample[]>([])
  const [blockSeries, setBlockSeries] = useState<IoRateSample[]>([])
  const [networkRates, setNetworkRates] = useState<IoRates>(EMPTY_RATES)
  const [blockRates, setBlockRates] = useState<IoRates>(EMPTY_RATES)
  const prevRef = useRef<PrevSnapshot | null>(null)

  useEffect(() => {
    prevRef.current = null
    setNetworkSeries([])
    setBlockSeries([])
    setNetworkRates(EMPTY_RATES)
    setBlockRates(EMPTY_RATES)
  }, [containerId])

  useEffect(() => {
    if (!stats) {
      setNetworkRates(EMPTY_RATES)
      setBlockRates(EMPTY_RATES)
      return
    }

    const now = Date.now()
    const prev = prevRef.current

    if (!prev || prev.containerId !== containerId) {
      prevRef.current = {
        containerId,
        timestamp: now,
        rxBytes: stats.network.rxBytes,
        txBytes: stats.network.txBytes,
        readBytes: stats.blockIO.readBytes,
        writeBytes: stats.blockIO.writeBytes
      }
      setNetworkRates(EMPTY_RATES)
      setBlockRates(EMPTY_RATES)
      return
    }

    const deltaMs = now - prev.timestamp
    if (deltaMs <= 0) return

    const rxRate = computeByteRate(prev.rxBytes, stats.network.rxBytes, deltaMs)
    const txRate = computeByteRate(prev.txBytes, stats.network.txBytes, deltaMs)
    const readRate = computeByteRate(prev.readBytes, stats.blockIO.readBytes, deltaMs)
    const writeRate = computeByteRate(prev.writeBytes, stats.blockIO.writeBytes, deltaMs)

    const sample: IoRateSample = {
      timestamp: now,
      upper: 0,
      lower: 0
    }

    setNetworkRates({ upper: txRate, lower: rxRate })
    setBlockRates({ upper: writeRate, lower: readRate })
    setNetworkSeries((current) =>
      appendSample(current, { ...sample, upper: txRate, lower: rxRate })
    )
    setBlockSeries((current) =>
      appendSample(current, { ...sample, upper: writeRate, lower: readRate })
    )

    prevRef.current = {
      containerId,
      timestamp: now,
      rxBytes: stats.network.rxBytes,
      txBytes: stats.network.txBytes,
      readBytes: stats.blockIO.readBytes,
      writeBytes: stats.blockIO.writeBytes
    }
  }, [stats, containerId])

  return {
    networkSeries,
    blockSeries,
    networkRates,
    blockRates
  }
}
