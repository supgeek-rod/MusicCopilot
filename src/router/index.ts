import { createRouter, createWebHashHistory } from 'vue-router'
import AlbumPage from '@/views/AlbumPage.vue'
import ArtistPage from '@/views/ArtistPage.vue'
import DownloadsView from '@/views/DownloadsView.vue'
import FnosCollectionView from '@/views/FnosCollectionView.vue'
import LibraryView from '@/views/LibraryView.vue'
import SearchView from '@/views/SearchView.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/search' },
    { path: '/search', name: 'search', component: SearchView },
    { path: '/library', name: 'library', component: LibraryView },
    // fnOS 音乐库二级合集页（专辑/歌手/流派/歌单的曲目列表）
    {
      path: '/library/collection/:kind(album|artist|genre|playlist)/:guid',
      name: 'library-collection',
      component: FnosCollectionView,
      props: true,
    },
    { path: '/downloads', name: 'downloads', component: DownloadsView },
    { path: '/artist/:plug/:id', name: 'artist', component: ArtistPage },
    { path: '/album/:plug/:id', name: 'album', component: AlbumPage },
    { path: '/:pathMatch(.*)*', redirect: '/search' },
  ],
})

export default router
