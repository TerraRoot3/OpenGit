import { createRouter, createWebHashHistory } from 'vue-router'
import GitProject from '../components/git/GitProject.vue'
import RemoteRepo from '../components/git/RemoteRepo.vue'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: GitProject
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
