---
layout: home

hero:
  name: MusicCopilot
  text: 音乐搜索、试听与下载客户端
  tagline: 基于 Vue 3 + TypeScript + shadcn-vue 的 Web 客户端，对接 SQ Music 自部署后端——在线试听、服务器下载队列与浏览器直链下载，可安装为 PWA。
  actions:
    - theme: brand
      text: 快速开始
      link: /getting-started
    - theme: alt
      text: 功能说明
      link: /features
    - theme: alt
      text: 查看源码
      link: https://github.com/supgeek-rod/MusicCopilot

features:
  - icon: 🔍
    title: 歌曲搜索
    details: 酷我音源搜索、联想词防抖、搜索历史、分页与音质徽标，关键词同步进 URL，可分享、可刷新恢复。
  - icon: ▶️
    title: 在线试听
    details: 底部迷你播放条流式播放高音质直链，播放队列跨页面持久，支持整张专辑、歌手全部歌曲连播。
  - icon: 🎤
    title: 歌手 / 专辑 / 歌词
    details: 歌手主页与专辑详情页，LRC 歌词弹窗，富文本简介净化后折叠展示。
  - icon: ⬇️
    title: 双通道下载
    details: 服务器下载队列（可选音质、进度可视、批量管理）与浏览器直链保存并行；一键下载整张或歌手全部专辑。
  - icon: 🔔
    title: 任务管理与完成通知
    details: 下载任务页 5 秒轮询、状态徽标、批量重试/删除；全局 toast 在任意页面提醒任务完成。
  - icon: 📱
    title: PWA 与深色模式
    details: 可安装到桌面 / 手机主屏，静态资源预缓存 + 封面图缓存；深浅色主题一键切换。
---

<style>
:root {
  --vp-home-hero-name-color: transparent;
  --vp-home-hero-name-background: -webkit-linear-gradient(120deg, #7c3aed, #d946ef);
}
</style>
