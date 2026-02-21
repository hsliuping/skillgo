import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "Agent Skills CN",
  description: "中文 Agent Skills 文档与示例库",
  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '技能库', link: '/skills/' },
      { text: '关于', link: '/about' }
    ],

    sidebar: [
      {
        text: '介绍',
        items: [
          { text: '什么是 Skills?', link: '/about' },
          { text: '快速开始', link: '/getting-started' }
        ]
      },
      {
        text: '技能列表',
        items: [
          { text: 'Hello World', link: '/skills/hello-world/SKILL' }
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/vuejs/vitepress' }
    ]
  }
})
