import { defineConfig } from 'vitepress'

// GitHub Pages 项目站点部署在仓库子路径下；本地预览根路径可用 DOCS_BASE=/ 覆盖
const base = process.env.DOCS_BASE ?? '/MusicCopilot/'

export default defineConfig({
  lang: 'zh-CN',
  title: 'MusicCopilot',
  description: '基于 Vue 3 + TypeScript 的音乐搜索、试听与下载客户端',
  base,
  lastUpdated: true,
  // 接口实测报告与功能看板含内网部署细节，仅保留在仓库内，不发布到站点
  srcExclude: ['**/api-test-report.md', '**/FNOS_LIBRARY_PLAN.md'],
  head: [['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}favicon.svg` }]],

  themeConfig: {
    nav: [
      { text: '指南', link: '/getting-started' },
      { text: '功能', link: '/features' },
      { text: '架构', link: '/architecture' },
      { text: '路线图', link: '/roadmap' },
    ],

    sidebar: [
      {
        text: '指南',
        items: [
          { text: '快速开始', link: '/getting-started' },
          { text: '配置说明', link: '/configuration' },
          { text: '部署指南', link: '/deployment' },
        ],
      },
      {
        text: '功能',
        items: [{ text: '功能说明', link: '/features' }],
      },
      {
        text: '深入',
        items: [
          { text: '架构设计', link: '/architecture' },
          { text: '开发路线图', link: '/roadmap' },
        ],
      },
    ],

    socialLinks: [{ icon: 'github', link: 'https://github.com/supgeek-rod/MusicCopilot' }],

    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
          modal: {
            noResultsText: '未找到相关结果',
            resetButtonTitle: '清除查询条件',
            displayDetails: '显示详细列表',
            footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' },
          },
        },
      },
    },

    outline: { level: [2, 3], label: '本页目录' },
    lastUpdated: { text: '最后更新于' },
    docFooter: { prev: '上一页', next: '下一页' },
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '目录',
    darkModeSwitchLabel: '外观',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式',

    footer: {
      message: 'MusicCopilot · 音乐搜索、试听与下载客户端',
      copyright: 'Copyright © 2026 supgeek-rod',
    },
  },
})
