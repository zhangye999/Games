<template>
  <div id="app">
    <div class="header">
      <nav>
        <router-link to="/" class="header-button"><img src="" alt=""></router-link>
        <router-link to="/" class="header-button">首页</router-link>
        <router-link to="/game" class="header-button">开始游戏</router-link>
      </nav>
      <div>
        <div>
          <input type="text" id="game-search" placeholder="搜索桌游">
        </div>
        <div>
          <div><img src="" alt=""></div>
        </div>
      </div>
      <nav>
        <router-link to="" class="header-button" id="setting"><img src="/src/assets/SettingIcon.png" alt=""></router-link>
        <router-link to="" class="header-button">登录 Login</router-link>
        <router-link to="" class="header-button" id="header-profile-photo"><img src="" alt=""></router-link>
      </nav>
    </div>
    <router-view />
  </div>
</template>

<script>
export default {
  name: 'App',
};
</script>

<style>
#app{
  display: block;
  padding: 0;
  width: 100vw;
  height: 100vh;
  margin: 0;
}
.header{
  display: flex;
  width: 100vw;
  justify-content: space-between;
  background: linear-gradient(rgb(158, 137, 99),rgb(103, 72, 41));
  display: flex;
  height: 60px;
  margin: 0;
  padding: 10px;
  gap: 10px;
}
nav {
  display: flex;
  margin: 0;
  gap: 10px;
  font-size: 14px;
  padding-top: 8px;
}
.header-button{
  color: white;
  font-weight: bold;
  -webkit-text-stroke: 0.3px rgb(109, 89, 64);
}
#game-search{
  height: 40px;
  width: 30vw;
  font-size: 14px;
  padding: 0 0 0 0.8vw;
  margin-top: -0.1vh;
  border: 0.2vw solid rgb(137, 115, 87);
  border-radius: 0.5em;
}
#setting{
  width: 20px;
  padding: 0;
}
#setting img{
  width: 100%;
}
</style>
