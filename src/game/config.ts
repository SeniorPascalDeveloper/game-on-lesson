import Phaser from 'phaser';
import { GameScene } from './GameScene';
import { GAME } from './settings'; // ИЗМЕНЕНО: размеры и фон из settings.ts

export function createGame(parent: string): Phaser.Game {
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent,
    width: GAME.width,                       // ИЗМЕНЕНО
    height: GAME.height,                     // ИЗМЕНЕНО
    backgroundColor: GAME.backgroundColor,   // ИЗМЕНЕНО
    scene: [GameScene],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  };

  return new Phaser.Game(config);
}