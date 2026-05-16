<script setup lang="ts">
import type { PhaseUnit } from './useReactSteps'
import PaperChatToolCallPanel from './PaperChatToolCallPanel.vue'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import PaperChatIterationPlaceholder from './PaperChatIterationPlaceholder.vue'

defineProps<{
  unit: PhaseUnit
  isStreaming: boolean
  reasoningExpanded: boolean
  phaseLabel: string
}>()

defineEmits<{
  'toggle-reasoning': [key: string]
}>()
</script>

<template>
  <section class="paper-chat-react-steps__phase" :class="{ active: unit.isActive }">
    <div class="paper-chat-react-steps__phase-rail">
      <span class="paper-chat-react-steps__phase-node" :class="{ active: unit.isActive }"></span>
    </div>

    <div class="paper-chat-react-steps__phase-main">
      <template v-if="unit.isActive && !unit.reasoning && unit.toolItems.length === 0">
        <PaperChatIterationPlaceholder :iteration="unit.iteration" :status="unit.status" />
      </template>

      <template v-else>
        <div class="paper-chat-react-steps__phase-meta">
          <span class="paper-chat-react-steps__phase-label">{{ phaseLabel }}</span>
          <span v-if="unit.toolItems.length > 0" class="paper-chat-react-steps__phase-count">
            {{ unit.toolItems.length }} 次工具调用
          </span>
          <span v-if="unit.isActive && isStreaming" class="paper-chat-react-steps__phase-streaming">
            <span class="paper-chat-react-steps__pulse-dot--small"></span>
            实时更新中
          </span>
        </div>

        <div
          v-if="unit.reasoning"
          class="paper-chat-react-steps__reasoning"
          :class="{ expanded: reasoningExpanded }"
        >
          <button
            class="paper-chat-react-steps__reasoning-header"
            type="button"
            :aria-expanded="reasoningExpanded"
            @click="$emit('toggle-reasoning', unit.key)"
          >
            <div class="paper-chat-react-steps__reasoning-header-left">
              <SvgIcon
                name="info"
                class="paper-chat-react-steps__reasoning-icon"
                :size="16"
              />
              <span class="paper-chat-react-steps__reasoning-label">思考</span>
            </div>
            <span
              class="paper-chat-react-steps__reasoning-arrow"
              :class="{ expanded: reasoningExpanded }"
              >▶</span
            >
          </button>

          <div
            class="paper-chat-react-steps__reasoning-body"
            :class="{ expanded: reasoningExpanded }"
          >
            <div class="paper-chat-react-steps__reasoning-content">
              <!-- eslint-disable vue/no-v-html -->
              <div
                class="paper-chat-react-steps__reasoning-text markdown-body"
                v-html="unit.reasoningHtml"
              ></div>
              <!-- eslint-enable vue/no-v-html -->
            </div>
          </div>
        </div>

        <div v-if="unit.toolItems.length > 0" class="paper-chat-react-steps__tool-list">
          <TransitionGroup
            name="paper-chat-react-tool"
            tag="div"
            class="paper-chat-react-steps__tool-list-inner"
          >
            <PaperChatToolCallPanel
              v-for="(item, index) in unit.toolItems"
              :key="item.id"
              :tool-call="item"
              :index="index"
            />
          </TransitionGroup>
        </div>

        <div
          v-if="unit.stepContent"
          class="paper-chat-react-steps__step-content"
          :class="`is-${unit.stepContent.tone}`"
        >
          <!-- eslint-disable vue/no-v-html -->
          <div
            class="paper-chat-react-steps__step-content-text markdown-body"
            v-html="unit.stepContentHtml"
          ></div>
          <!-- eslint-enable vue/no-v-html -->
        </div>
      </template>
    </div>
  </section>
</template>
