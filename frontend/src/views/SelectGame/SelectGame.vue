<template>
    <div id="select-game-content">
        <div id="select-game">
            <div>选择游戏</div>
        </div>
        <div id="game-list">
            <div id="incan-gold" class="board-game-box" @click="handleSelectIncanGold">
                <div class="board-game-icon">
                    <img src="/src/assets/IncanGoldBox.png" alt="" class="board-game-icon-image">
                </div>
                <div class="board-game-title">
                    <div>印加宝藏</div>
                </div>
            </div>

            <div id="da-treasure" class="board-game-box" @click="handleSelectDaTreasure">
                <div class="board-game-icon">
                    <img src="/src/assets/IncanGoldBox.png" alt="" class="board-game-icon-image">
                </div>
                <div class="board-game-title">
                    <p>大A宝藏</p>
                </div>
            </div>

            <div id="incan-gold" class="board-game-box">
                <div class="board-game-icon">
                    <img src="/src/assets/IncanGoldBox.png" alt="" class="board-game-icon-image">
                </div>
                <div class="board-game-title">
                    <p>印加宝藏</p>
                </div>
            </div>

            <div id="incan-gold" class="board-game-box">
                <div class="board-game-icon">
                    <img src="/src/assets/IncanGoldBox.png" alt="" class="board-game-icon-image">
                </div>
                <div class="board-game-title">
                    <p>印加宝藏</p>
                </div>
            </div>

            <div id="incan-gold" class="board-game-box">
                <div class="board-game-icon">
                    <img src="/src/assets/IncanGoldBox.png" alt="" class="board-game-icon-image">
                </div>
                <div class="board-game-title">
                    <p>印加宝藏</p>
                </div>
            </div>

            <div id="incan-gold" class="board-game-box">
                <div class="board-game-icon">
                    <img src="/src/assets/IncanGoldBox.png" alt="" class="board-game-icon-image">
                </div>
                <div class="board-game-title">
                    <p>印加宝藏</p>
                </div>
            </div>

            <div id="incan-gold" class="board-game-box">
                <div class="board-game-icon">
                    <img src="/src/assets/IncanGoldBox.png" alt="" class="board-game-icon-image">
                </div>
                <div class="board-game-title">
                    <p>印加宝藏</p>
                </div>
            </div>

            <div id="incan-gold" class="board-game-box">
                <div class="board-game-icon">
                    <img src="/src/assets/IncanGoldBox.png" alt="" class="board-game-icon-image">
                </div>
                <div class="board-game-title">
                    <p>印加宝藏</p>
                </div>
            </div>
            <div id="incan-gold" class="board-game-box">
                <div class="board-game-icon">
                    <img src="/src/assets/IncanGoldBox.png" alt="" class="board-game-icon-image">
                </div>
                <div class="board-game-title">
                    <p>印加宝藏</p>
                </div>
            </div>

            <div id="incan-gold" class="board-game-box">
                <div class="board-game-icon">
                    <img src="/src/assets/IncanGoldBox.png" alt="" class="board-game-icon-image">
                </div>
                <div class="board-game-title">
                    <p>印加宝藏</p>
                </div>
            </div>
      </div>
    </div>
  </template>
  
  <script>
    import { SelectIncanGold, SelectDaTreasure } from './SelectGame.js';
    export default {
        name: 'Game',
        methods: {
            handleSelectIncanGold() {
                SelectIncanGold(this.$router);
            },
            handleSelectDaTreasure() {
                SelectDaTreasure(this.$router);
            },
        }
    };
  </script>

<style>
    @import './SelectGame.css';
</style>