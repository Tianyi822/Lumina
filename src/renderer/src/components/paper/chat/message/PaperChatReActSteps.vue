<script setup lang="ts">
import { computed } from 'vue'
import type { ReActIteration, ReActStep } from '@renderer/types'
import PaperChatToolCallPanel from './PaperChatToolCallPanel.vue'
import ReactPhaseUnit from './ReactPhaseUnit.vue'
import { useReactSteps } from './useReactSteps'

import '@renderer/styles/paperChatReactSteps.css'

const props = defineProps<{
  steps?: ReActStep[]
  iterations?: ReActIteration[]
  isStreaming?: boolean
}>()

const {
  isExpanded,
  hasContent,
  useIterationMode,
  toolCount,
  toolStats,
  legacyToolItems,
  phaseUnits,
  hasTaskGroups,
  taskGroups,
  toggleExpand,
  toggleReasoning,
  isReasoningExpanded,
  getPhaseLabel
} = useReactSteps({
  steps: computed(() => props.steps),
  iterations: computed(() => props.iterations),
  isStreaming: computed(() => props.isStreaming)
})
</script>

<template>
  <div v-if="hasContent" class="paper-chat-react-steps">
    <button
      class="paper-chat-react-steps__header"
      type="button"
      :aria-expanded="isExpanded"
      @click="toggleExpand"
    >
      <div class="paper-chat-react-steps__header-left">
        <span class="paper-chat-react-steps__title">分阶段推理</span>
        <span class="paper-chat-react-steps__badge"> {{ toolCount }} 次工具调用 </span>
        <span v-if="isStreaming" class="paper-chat-react-steps__streaming-indicator">
          <span class="paper-chat-react-steps__pulse-dot"></span>
          进行中
        </span>
      </div>

      <div class="paper-chat-react-steps__header-right">
        <span v-if="toolStats.success > 0" class="paper-chat-react-steps__stat-badge success"
          >✓ {{ toolStats.success }}</span
        >
        <span v-if="toolStats.failed > 0" class="paper-chat-react-steps__stat-badge error"
          >✗ {{ toolStats.failed }}</span
        >
        <span class="paper-chat-react-steps__expand-icon" :class="{ expanded: isExpanded }">▶</span>
      </div>
    </button>

    <Transition name="paper-chat-react-expand">
      <div v-if="isExpanded" class="paper-chat-react-steps__content">
        <template v-if="useIterationMode">
          <!-- Plan 模式：按任务分组 -->
          <div v-if="hasTaskGroups" class="paper-chat-react-steps__phase-timeline">
            <div
              v-for="group in taskGroups"
              :key="`task-${group.taskNumber}`"
              class="paper-chat-react-steps__task-group"
            >
              <div class="paper-chat-react-steps__task-divider">
                <span class="paper-chat-react-steps__task-divider-label">
                  任务 {{ group.taskNumber }}
                </span>
              </div>
              <TransitionGroup name="paper-chat-react-phase" tag="div">
                <ReactPhaseUnit
                  v-for="unit in group.units"
                  :key="unit.key"
                  :unit="unit"
                  :is-streaming="!!isStreaming"
                  :reasoning-expanded="isReasoningExpanded(unit)"
                  :phase-label="getPhaseLabel(unit)"
                  @toggle-reasoning="toggleReasoning"
                />
              </TransitionGroup>
            </div>
          </div>

          <!-- 非 Plan 模式：扁平阶段列表 -->
          <div v-else class="paper-chat-react-steps__phase-timeline">
            <TransitionGroup name="paper-chat-react-phase" tag="div">
              <ReactPhaseUnit
                v-for="unit in phaseUnits"
                :key="unit.key"
                :unit="unit"
                :is-streaming="!!isStreaming"
                :reasoning-expanded="isReasoningExpanded(unit)"
                :phase-label="getPhaseLabel(unit)"
                @toggle-reasoning="toggleReasoning"
              />
            </TransitionGroup>
          </div>
        </template>

        <template v-else>
          <div class="paper-chat-react-steps__legacy-timeline">
            <TransitionGroup
              name="paper-chat-react-tool"
              tag="div"
              class="paper-chat-react-steps__tool-list-inner"
            >
              <PaperChatToolCallPanel
                v-for="(item, index) in legacyToolItems"
                :key="item.id"
                :tool-call="item"
                :index="index"
              />
            </TransitionGroup>
          </div>
        </template>
      </div>
    </Transition>
  </div>
</template>
