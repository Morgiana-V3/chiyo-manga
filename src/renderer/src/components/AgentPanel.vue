<script setup lang="ts">
import { ref } from 'vue'
import { Check, X, Plug, Copy } from 'lucide-vue-next'
import { state, run, notice } from '../editor'
const configuration = ref(false)
async function adopt(id: string, accepted: boolean): Promise<void> {
  await run(async () => {
    state.value = await window.chiyo.proposal(id, accepted)
  })
}
async function copyConfiguration(): Promise<void> {
  await run(async () => {
    await navigator.clipboard.writeText(state.value?.runtime.mcpConfig ?? '')
    notice.value = '已复制 MCP 配置'
  })
}
</script>

<template>
  <section class="agent-panel">
    <div class="section-heading">
      <h2>AI 协作</h2>
      <button
        class="icon-button"
        title="MCP 连接配置"
        aria-label="MCP 连接配置"
        @click="configuration = !configuration"
      >
        <Plug :size="16" />
      </button>
    </div>
    <div
      v-if="configuration"
      class="connection-settings"
    >
      <h3>连接外部 Agent</h3>
      <p class="muted">将配置添加到 MCP 客户端。连接时保持 Chiyo 打开。</p>
      <pre>{{ state?.runtime.mcpConfig }}</pre>
      <button @click="copyConfiguration"><Copy :size="14" />复制配置</button>
    </div>
    <div
      v-if="!state?.proposals.length"
      class="empty-state small"
    >
      <p>暂无待处理方案</p>
      <button @click="configuration = true">连接 MCP Agent</button>
    </div>
    <article
      v-for="proposal in [...(state?.proposals ?? [])].reverse()"
      :key="proposal.id"
      class="proposal"
    >
      <div class="proposal-heading">
        <strong>{{ proposal.title }}</strong
        ><span>{{
          { pending: '待采纳', adopted: '已执行', rejected: '已拒绝' }[proposal.status]
        }}</span>
      </div>
      <p>{{ proposal.reason }}</p>
      <small>{{ proposal.actions.length }} 个步骤 · 来源版本 {{ proposal.revision }}</small>
      <div
        v-if="proposal.status === 'pending'"
        class="button-row"
      >
        <button
          class="primary"
          :disabled="state?.busy"
          @click="adopt(proposal.id, true)"
        >
          <Check :size="14" />采纳并执行</button
        ><button
          :disabled="state?.busy"
          @click="adopt(proposal.id, false)"
        >
          <X :size="14" />拒绝
        </button>
      </div>
    </article>
    <h3 class="activity-title">操作记录</h3>
    <ol class="activity-list">
      <li
        v-for="activity in [...(state?.activities ?? [])].reverse().slice(0, 30)"
        :key="activity.id"
        :class="activity.status"
      >
        <span class="activity-dot" />
        <div>
          <p>{{ activity.message }}</p>
          <small
            >{{ activity.source }} ·
            {{ new Date(activity.time).toLocaleTimeString('zh-CN', { hour12: false }) }} · v{{
              activity.revision
            }}</small
          >
        </div>
      </li>
    </ol>
  </section>
</template>
