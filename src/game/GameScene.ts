import Phaser from 'phaser';
// ИЗМЕНЕНО: все константы теперь импортируются из config.ts
import {
  PLAYER, FIELD, COIN, ENEMY, CATS, TEXTS, FONT, COLORS,
  COIN_PICKUP_RADIUS_SQ, ENEMY_HIT_RADIUS_SQ,
} from './settings';

type Enemy = {
  image: Phaser.GameObjects.Image;
  heading: number;
  turnSpeed: number;
  speedMultiplier: number;
  orbitAngle: number;
  orbitRadius: number;
  orbitSpeed: number;
};

type Keys = Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;

export class GameScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Image;
  private target!: Phaser.GameObjects.Arc;
  private enemies: Enemy[] = []; // первый элемент — главный кот
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Keys;
  private pauseKey!: Phaser.Input.Keyboard.Key;
  private scoreText!: Phaser.GameObjects.Text;
  private pauseText!: Phaser.GameObjects.Text;
  private pauseButton!: Phaser.GameObjects.Text;
  private phaseText!: Phaser.GameObjects.Text;
  private gameTimerText!: Phaser.GameObjects.Text;
  private score = 0;
  private elapsedTime = 0;
  private shownSecond = -1;
  private extraCats = 0; // сколько котов уже добавлено по очкам
  private isPaused = false;
  private isGameOver = false;

  constructor() {
    super('GameScene');
  }

  // Пути к картинкам остаются здесь: они считаются относительно этого файла
  preload(): void {
    this.load.image('player', new URL('./1.jpg', import.meta.url).href);
    this.load.image('enemy', new URL('./2.jpg', import.meta.url).href);
    this.load.image('phaseCat3', new URL('./3.png', import.meta.url).href);
    this.load.image('phaseCat4', new URL('./4.png', import.meta.url).href);
  }

  // ИЗМЕНЕНО: шрифт и размер берутся из FONT
  private text(x: number, y: number, str: string, size: number, color: string, extra = {}) {
    return this.add.text(x, y, str, {
      fontFamily: FONT.family,
      fontSize: `${size}px`,
      color,
      ...extra,
    });
  }

  create(): void {
    const { width, height } = this.scale;

    // Сброс состояния после Restart
    this.score = 0;
    this.elapsedTime = 0;
    this.shownSecond = -1;
    this.extraCats = 0;
    this.isPaused = false;
    this.isGameOver = false;
    this.time.paused = false;
    this.enemies = [];

    // ИЗМЕНЕНО: тексты, размеры и цвета из config.ts
    this.text(width / 2, 28, TEXTS.title, FONT.size.title, COLORS.white).setOrigin(0.5, 0);

    this.player = this.add.image(width / 2, height / 2, 'player').setDisplaySize(PLAYER.size, PLAYER.size);
    this.target = this.add.circle(width * COIN.startXRatio, height * COIN.startYRatio, COIN.radius, COIN.color);
    this.phaseText = this.text(width / 2, 104, TEXTS.moreCats, FONT.size.message, COLORS.message)
      .setOrigin(0.5, 0)
      .setDepth(1)
      .setVisible(false);
    this.pauseText = this.text(width / 2, height / 2, TEXTS.pause, FONT.size.pause, COLORS.white, {
      align: 'center',
      backgroundColor: COLORS.pauseBg,
      padding: { x: 20, y: 16 },
    })
      .setOrigin(0.5)
      .setDepth(1)
      .setVisible(false);
    this.pauseButton = this.text(width - 32, 32, 'Ⅱ', FONT.size.pauseButton, COLORS.white, {
      backgroundColor: COLORS.pauseButtonBg,
      padding: { x: 12, y: 8 },
    })
      .setOrigin(0.5)
      .setDepth(2)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.togglePause());

    this.addEnemy(ENEMY.startX, ENEMY.startY, 'enemy', 0); // главный кот

    this.scoreText = this.text(24, height - 48, TEXTS.score(0), FONT.size.hud, COLORS.white);
    this.gameTimerText = this.text(width - 24, height - 48, TEXTS.timer('00', '00'), FONT.size.hud, COLORS.white)
      .setOrigin(1, 0);

    if (!this.input.keyboard) throw new Error('Keyboard input is unavailable.');

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as Keys;
    this.pauseKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P);
  }

  update(_time: number, delta: number): void {
    if (this.isGameOver) return;
    if (Phaser.Input.Keyboard.JustDown(this.pauseKey)) this.togglePause();
    if (this.isPaused) return;

    const seconds = delta / 1000;
    this.elapsedTime += delta;
    this.updateTimerText();
    this.movePlayer(seconds);
    this.checkTarget();
    this.moveEnemies(seconds);
    this.checkEnemyHit();
  }

  // setText только когда сменилась секунда
  private updateTimerText(): void {
    const total = Math.floor(this.elapsedTime / 1000);
    if (total === this.shownSecond) return;
    this.shownSecond = total;
    const mm = Math.floor(total / 60).toString().padStart(2, '0');
    const ss = (total % 60).toString().padStart(2, '0');
    this.gameTimerText.setText(TEXTS.timer(mm, ss));
  }

  private movePlayer(seconds: number): void {
    const dx = Number(this.cursors.right.isDown || this.wasd.right.isDown)
      - Number(this.cursors.left.isDown || this.wasd.left.isDown);
    const dy = Number(this.cursors.down.isDown || this.wasd.down.isDown)
      - Number(this.cursors.up.isDown || this.wasd.up.isDown);

    if (dx || dy) {
      const length = Math.hypot(dx, dy);
      this.player.x += (dx / length) * PLAYER.speed * seconds;
      this.player.y += (dy / length) * PLAYER.speed * seconds;
    }

    // Не даём игроку выйти за экран
    const half = this.player.displayWidth / 2;
    this.player.x = Phaser.Math.Clamp(this.player.x, half, this.scale.width - half);
    this.player.y = Phaser.Math.Clamp(this.player.y, FIELD.hudTop + half, this.scale.height - half);
  }

  private addEnemy(x: number, y: number, texture: string, orbitRadius: number): void {
    const image = this.add.image(x, y, texture).setDisplaySize(ENEMY.size, ENEMY.size);
    // ИЗМЕНЕНО: диапазоны случайных значений берутся из ENEMY
    this.enemies.push({
      image,
      heading: Phaser.Math.Angle.Between(x, y, this.player.x, this.player.y)
        + Phaser.Math.FloatBetween(-ENEMY.headingNoise, ENEMY.headingNoise),
      turnSpeed: Phaser.Math.FloatBetween(ENEMY.turnSpeed.min, ENEMY.turnSpeed.max),
      speedMultiplier: Phaser.Math.FloatBetween(ENEMY.speedMultiplier.min, ENEMY.speedMultiplier.max),
      orbitAngle: Phaser.Math.FloatBetween(0, Math.PI * 2),
      orbitRadius,
      orbitSpeed: Phaser.Math.FloatBetween(ENEMY.orbitSpeed.min, ENEMY.orbitSpeed.max),
    });
  }

  // Появление кота по очкам (вызывается из checkTarget)
  private spawnCat(): void {
    const { width, height } = this.scale;
    const m = CATS.spawnMargin; // ИЗМЕНЕНО: отступ из конфига
    const bottom = height - m;
    const sideY = Math.max(CATS.spawnMinY, Math.min(height / 2, bottom));
    // Выбираем угол, самый далёкий от игрока и остальных котов
    const candidates = [[m, sideY], [width - m, sideY], [m, bottom], [width / 2, bottom], [width - m, bottom]];
    const others = [this.player, ...this.enemies.map((e) => e.image)];
    const nearest = ([x, y]: number[]) =>
      Math.min(...others.map((o) => Phaser.Math.Distance.Squared(x, y, o.x, o.y)));
    const [x, y] = candidates.reduce((best, c) => (nearest(c) > nearest(best) ? c : best));

    this.addEnemy(
      x, y,
      CATS.textures[this.extraCats % CATS.textures.length], // ИЗМЕНЕНО: текстуры из конфига
      Phaser.Math.Between(ENEMY.extraOrbitRadius.min, ENEMY.extraOrbitRadius.max),
    );
    this.extraCats += 1;

    this.phaseText.setVisible(true);
    this.time.delayedCall(CATS.messageMs, () => this.phaseText.setVisible(false));
  }

  private moveEnemies(seconds: number): void {
    const baseSpeed = ENEMY.startSpeed + this.score * ENEMY.speedPerCoin;
    for (const e of this.enemies) {
      e.orbitAngle += e.orbitSpeed * seconds;
      const targetX = this.player.x + Math.cos(e.orbitAngle) * e.orbitRadius;
      const targetY = this.player.y + Math.sin(e.orbitAngle) * e.orbitRadius;
      const desired = Phaser.Math.Angle.Between(e.image.x, e.image.y, targetX, targetY);
      const maxTurn = e.turnSpeed * seconds;
      e.heading += Phaser.Math.Clamp(Phaser.Math.Angle.Wrap(desired - e.heading), -maxTurn, maxTurn);
      const speed = Math.min(ENEMY.maxSpeed, baseSpeed * e.speedMultiplier);
      e.image.x += Math.cos(e.heading) * speed * seconds;
      e.image.y += Math.sin(e.heading) * speed * seconds;
    }
  }

  private togglePause(): void {
    this.isPaused = !this.isPaused;
    this.time.paused = this.isPaused;
    this.pauseText.setVisible(this.isPaused);
    this.pauseButton.setText(this.isPaused ? '▶' : 'Ⅱ');
  }

  private checkTarget(): void {
    const distSq = Phaser.Math.Distance.Squared(this.player.x, this.player.y, this.target.x, this.target.y);
    if (distSq > COIN_PICKUP_RADIUS_SQ) return;

    this.score += 1;
    this.scoreText.setText(TEXTS.score(this.score));
    // ИЗМЕНЕНО: отступы появления монеты из COIN
    this.target.setPosition(
      Phaser.Math.Between(COIN.marginX, this.scale.width - COIN.marginX),
      Phaser.Math.Between(COIN.marginTop, this.scale.height - COIN.marginBottom),
    );

    // Новый кот при достижении порога очков
    if (this.extraCats < CATS.scores.length && this.score >= CATS.scores[this.extraCats]) this.spawnCat();
  }

  private checkEnemyHit(): void {
    const hit = this.enemies.some(({ image }) =>
      Phaser.Math.Distance.Squared(this.player.x, this.player.y, image.x, image.y) < ENEMY_HIT_RADIUS_SQ);
    if (hit) this.gameOver();
  }

  private gameOver(): void {
    this.isGameOver = true;
    const { width, height } = this.scale;

    this.text(width / 2, height / 2, TEXTS.gameOver(this.score), FONT.size.gameOver, COLORS.gameOver, {
      align: 'center',
    }).setOrigin(0.5);

    this.input.keyboard?.once('keydown-SPACE', () => this.scene.restart());
    this.input.once('pointerdown', () => this.scene.restart());
  }
}