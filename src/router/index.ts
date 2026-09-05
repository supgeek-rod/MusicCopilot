import { createRouter, createWebHashHistory } from 'vue-router'
import AlbumPage from '@/views/AlbumPage.vue'
import ArtistPage from '@/views/ArtistPage.vue'
import DownloadsView from '@/views/DownloadsView.vue'
import SearchView from '@/views/SearchView.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/search' },
    { path: '/search', name: 'search', component: SearchView },
    { path: '/downloads', name: 'downloads', component: DownloadsView },
    { path: '/artist/:plug/:id', name: 'artist', component: ArtistPage },
    { path: '/album/:plug/:id', name: 'album', component: AlbumPage },
    { path: '/:pathMatch(.*)*', redirect: '/search' },
  ],
})

export default router
