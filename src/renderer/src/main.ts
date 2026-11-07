import { createApp } from 'vue'
import App from './App.vue'
import './styles.less'

createApp(App).mount('#app')

document.addEventListener('focusin', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
    window.chiyo.setEditing(true)
  }
})
document.addEventListener('focusout', () => {
  setTimeout(() => {
    const element = document.activeElement
    window.chiyo.setEditing(
      element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement,
    )
  }, 0)
})
