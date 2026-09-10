import { createRouter, createWebHashHistory } from 'vue-router'
import AlbumPage from '@/views/AlbumPage.vue'
import ArtistPage from '@/views/ArtistPage.vue'
import DownloadsView from '@/views/DownloadsView.vue'
import FnosCollectionView from '@/views/FnosCollectionView.vue'
import LibraryHealthView from '@/views/LibraryHealthView.vue'
import LibraryView from '@/views/LibraryView.vue'
import SearchView from '@/views/SearchView.vue'
import SettingsView from '@/views/SettingsView.vue'

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
    // 音乐库体检（scraper 刮削工具后台，scraper.enabled 时显示入口）
    { path: '/library/health', name: 'library-health', component: LibraryHealthView },
    { path: '/downloads', name: 'downloads', component: DownloadsView },
    { path: '/settings', name: 'settings', component: SettingsView },
    { path: '/artist/:plug/:id', name: 'artist', component: ArtistPage },
    { path: '/album/:plug/:id', name: 'album', component: AlbumPage },
    { path: '/:pathMatch(.*)*', redirect: '/search' },
  ],
})

export default router
