import DefaultTheme from 'vitepress/theme'
import SkillCard from '../components/SkillCard.vue'
import './style.css' 

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('SkillCard', SkillCard)
  }
}
