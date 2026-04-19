import { createRouter, createWebHistory } from 'vue-router';
import Index from '../views/PlayBoardGameIndex/PlayBoardGameIndex.vue';
import Game from '../views/SelectGame/SelectGame.vue';
import IncanGoldIndex from '../views/IncanGoldIndex/IncanGoldIndex.vue';
import IncanGoldGame from '../views/IncanGoldGame/IncanGoldGame.vue'; // 游戏界面
import DaTreasureIndex from '../views/DaTreasureIndex/DaTreasureIndex.vue';
import DaTreasureGame from '../views/DaTreasureGame/DaTreasureGame.vue';

const routes = [
  { path: '/', name: 'Index', component: Index },
  { path: '/game', name: 'Game', component: Game },
  { path: '/IncanGoldIndex', name: 'IncanGoldIndex', component: IncanGoldIndex },
  { 
    path: '/IncanGoldGame/:roomId', 
    name: 'IncanGoldGame', 
    component: IncanGoldGame, 
    props: true // 确保 roomId 被作为组件的 props 传递
  },
  { path: '/DaTreasureIndex', name: 'DaTreasureIndex', component: DaTreasureIndex },
  {
    path: '/DaTreasureGame/:roomId',
    name: 'DaTreasureGame',
    component: DaTreasureGame,
    props: true,
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
