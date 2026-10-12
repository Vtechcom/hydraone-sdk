export default defineAppConfig({
  ui: {
    colors: {
      primary: 'green',
      neutral: 'neutral'
    },
    footer: {
      slots: {
        root: 'border-t border-default',
        left: 'text-sm text-muted'
      }
    }
  },
  seo: {
    siteName: 'HydraOne SDK'
  },
  header: {
    title: 'HydraOne SDK',
    to: '/',
    logo: {
      alt: 'HydraOne SDK',
      light: '/logo.png',
      dark: '/logo.png'
    },
    search: true,
    colorMode: true,
    links: [{
      'icon': 'i-simple-icons-github',
      'to': 'https://github.com/Vtechcom/hydraone-sdk',
      'target': '_blank',
      'aria-label': 'HydraOne SDK on GitHub'
    }, {
      'icon': 'i-simple-icons-discord',
      'to': 'https://discord.com/invite/eZKRyQnbea',
      'target': '_blank',
      'aria-label': 'HydraOne SDK on Discord'
    }, {
      'icon': 'i-simple-icons-x',
      'to': 'https://x.com/VtechcomLabs',
      'target': '_blank',
      'aria-label': 'Vtechcom Labs on X'
    }]
  },
  footer: {
    credits: `© ${new Date().getFullYear()} HydraOne SDK • Built by Vtechcom Labs`,
    colorMode: false,
    links: [{
      'icon': 'i-simple-icons-github',
      'to': 'https://github.com/Vtechcom/hydraone-sdk',
      'target': '_blank',
      'aria-label': 'HydraOne SDK on GitHub'
    }, {
      'icon': 'i-simple-icons-npm',
      'to': 'https://www.npmjs.com/package/@hydraone/sdk',
      'target': '_blank',
      'aria-label': '@hydraone/sdk on npm'
    }, {
      'icon': 'i-simple-icons-discord',
      'to': 'https://discord.com/invite/eZKRyQnbea',
      'target': '_blank',
      'aria-label': 'HydraOne SDK on Discord'
    }, {
      'icon': 'i-simple-icons-telegram',
      'to': 'https://telegram.me/+LeuWUO7YjGYyZmJl',
      'target': '_blank',
      'aria-label': 'HydraOne SDK on Telegram'
    }, {
      'icon': 'i-simple-icons-x',
      'to': 'https://x.com/VtechcomLabs',
      'target': '_blank',
      'aria-label': 'Vtechcom Labs on X'
    }]
  },
  toc: {
    title: 'Table of Contents',
    bottom: {
      title: 'Community',
      edit: 'https://github.com/Vtechcom/hydraone-sdk/edit/main/apps/docs/content',
      links: [{
        icon: 'i-lucide-star',
        label: 'Star on GitHub',
        to: 'https://github.com/Vtechcom/hydraone-sdk',
        target: '_blank'
      }, {
        icon: 'i-simple-icons-discord',
        label: 'Join our Discord',
        to: 'https://discord.com/invite/eZKRyQnbea',
        target: '_blank'
      }]
    }
  }
})
