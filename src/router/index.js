import { createRouter, createWebHashHistory } from 'vue-router'
import RemoteRepo from '../components/git/RemoteRepo.vue'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: RemoteRepo
  },
  {
    path: '/init',
    name: 'Initialization',
    component: RemoteRepo
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
