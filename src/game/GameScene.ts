import Phaser from 'phaser';

const PLAYER_SPEED = 275;
const ENEMY_START_SPEED = 90;
const ENEMY_SPEED_PER_COIN = 8;
const ENEMY_MAX_SPEED = 230;
const PHASE_MESSAGE_MS = 3_000;
// ИЗМЕНЕНО: пороги очков, при которых появляется 2-й и 3-й кот (вместо таймеров фаз)
const CAT_SCORES = [3, 7];
const CAT_TEXTURES = ['phaseCat4', 'phaseCat3'];
const HUD_TOP = 110;
const COIN_PICKUP_RADIUS_SQ = 42 * 42;
const ENEMY_HIT_RADIUS_SQ = 40 * 40;

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
  private enemies: Enemy[] = []; // ИЗМЕНЕНО: один массив, первый элемент — главный кот
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
  private extraCats = 0; // ИЗМЕНЕНО: сколько котов уже добавлено по очкам
  private isPaused = false;
  private isGameOver = false;

  constructor() {
    super('GameScene');
  }

  preload(): void {
    this.load.image('player', new URL('./1.jpg', import.meta.url).href);
    this.load.image('enemy', new URL('./2.jpg', import.meta.url).href);
    this.load.image('phaseCat3', new URL('./3.png', import.meta.url).href);
    this.load.image('phaseCat4', new URL('./4.png', import.meta.url).href);
  }

  // ИЗМЕНЕНО: общий помощник для текстов, чтобы не повторять стиль
  private text(x: number, y: number, str: string, size: number, color: string, extra = {}) {
    return this.add.text(x, y, str, {
      fontFamily: 'system-ui, sans-serif',
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

    this.text(width / 2, 28, 'Собирай сыр и убегай от кошки!', 24, '#ffffff').setOrigin(0.5, 0);

    this.player = this.add.image(width / 2, height / 2, 'player').setDisplaySize(63, 63);
    this.target = this.add.circle(width * 0.72, height * 0.52, 18, 0xfacc15);
    this.phaseText = this.text(width / 2, 104, 'Котов стало больше, берегитесь!', 24, '#fca5a5')
      .setOrigin(0.5, 0)
      .setDepth(1)
      .setVisible(false);
    this.pauseText = this.text(width / 2, height / 2, 'ПАУЗА\nP или кнопка в углу — продолжить', 30, '#ffffff', {
      align: 'center',
      backgroundColor: '#000000aa',
      padding: { x: 20, y: 16 },
    })
      .setOrigin(0.5)
      .setDepth(1)
      .setVisible(false);
    this.pauseButton = this.text(width - 32, 32, 'Ⅱ', 28, '#ffffff', {
      backgroundColor: '#334155',
      padding: { x: 12, y: 8 },
    })
      .setOrigin(0.5)
      .setDepth(2)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.togglePause());

    this.addEnemy(60, 160, 'enemy', 0); // главный кот

    this.scoreText = this.text(24, height - 48, 'Score: 0', 22, '#ffffff');
    this.gameTimerText = this.text(width - 24, height - 48, 'Время: 00:00', 22, '#ffffff').setOrigin(1, 0);

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
    this.gameTimerText.setText(`Время: ${mm}:${ss}`);
  }

  private movePlayer(seconds: number): void {
    const dx = Number(this.cursors.right.isDown || this.wasd.right.isDown)
      - Number(this.cursors.left.isDown || this.wasd.left.isDown);
    const dy = Number(this.cursors.down.isDown || this.wasd.down.isDown)
      - Number(this.cursors.up.isDown || this.wasd.up.isDown);

    if (dx || dy) {
      const length = Math.hypot(dx, dy);
      this.player.x += (dx / length) * PLAYER_SPEED * seconds;
      this.player.y += (dy / length) * PLAYER_SPEED * seconds;
    }

    // Не даём игроку выйти за экран
    const half = this.player.displayWidth / 2;
    this.player.x = Phaser.Math.Clamp(this.player.x, half, this.scale.width - half);
    this.player.y = Phaser.Math.Clamp(this.player.y, HUD_TOP + half, this.scale.height - half);
  }

  private addEnemy(x: number, y: number, texture: string, orbitRadius: number): void {
    const image = this.add.image(x, y, texture).setDisplaySize(105, 105);
    this.enemies.push({
      image,
      heading: Phaser.Math.Angle.Between(x, y, this.player.x, this.player.y)
        + Phaser.Math.FloatBetween(-0.7, 0.7),
      turnSpeed: Phaser.Math.FloatBetween(1.4, 2.6),
      speedMultiplier: Phaser.Math.FloatBetween(0.85, 1.15),
      orbitAngle: Phaser.Math.FloatBetween(0, Math.PI * 2),
      orbitRadius,
      orbitSpeed: Phaser.Math.FloatBetween(-0.8, 0.8),
    });
  }

  // ИЗМЕНЕНО: появление кота по очкам (вызывается из checkTarget)
  private spawnCat(): void {
    const { width, height } = this.scale;
    const bottom = height - 60;
    const sideY = Math.max(140, Math.min(height / 2, bottom));
    // Выбираем угол, самый далёкий от игрока и остальных котов
    const candidates = [[60, sideY], [width - 60, sideY], [60, bottom], [width / 2, bottom], [width - 60, bottom]];
    const others = [this.player, ...this.enemies.map((e) => e.image)];
    const nearest = ([x, y]: number[]) =>
      Math.min(...others.map((o) => Phaser.Math.Distance.Squared(x, y, o.x, o.y)));
    const [x, y] = candidates.reduce((best, c) => (nearest(c) > nearest(best) ? c : best));

    this.addEnemy(x, y, CAT_TEXTURES[this.extraCats % 2], Phaser.Math.Between(25, 70));
    this.extraCats += 1;

    // Сообщение на 3 секунды (delayedCall учитывает паузу, т.к. time.paused)
    this.phaseText.setVisible(true);
    this.time.delayedCall(PHASE_MESSAGE_MS, () => this.phaseText.setVisible(false));
  }

  private moveEnemies(seconds: number): void {
    const baseSpeed = ENEMY_START_SPEED + this.score * ENEMY_SPEED_PER_COIN;
    for (const e of this.enemies) {
      e.orbitAngle += e.orbitSpeed * seconds;
      const targetX = this.player.x + Math.cos(e.orbitAngle) * e.orbitRadius;
      const targetY = this.player.y + Math.sin(e.orbitAngle) * e.orbitRadius;
      const desired = Phaser.Math.Angle.Between(e.image.x, e.image.y, targetX, targetY);
      const maxTurn = e.turnSpeed * seconds;
      e.heading += Phaser.Math.Clamp(Phaser.Math.Angle.Wrap(desired - e.heading), -maxTurn, maxTurn);
      const speed = Math.min(ENEMY_MAX_SPEED, baseSpeed * e.speedMultiplier);
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
    this.scoreText.setText(`Score: ${this.score}`);
    this.target.setPosition(
      Phaser.Math.Between(60, this.scale.width - 60),
      Phaser.Math.Between(140, this.scale.height - 80),
    );

    // ИЗМЕНЕНО: новый кот при достижении порога очков (3 и 7)
    if (this.extraCats < CAT_SCORES.length && this.score >= CAT_SCORES[this.extraCats]) this.spawnCat();
  }

  private checkEnemyHit(): void {
    const hit = this.enemies.some(({ image }) =>
      Phaser.Math.Distance.Squared(this.player.x, this.player.y, image.x, image.y) < ENEMY_HIT_RADIUS_SQ);
    if (hit) this.gameOver();
  }

  private gameOver(): void {
    this.isGameOver = true;
    const { width, height } = this.scale;

    this.text(width / 2, height / 2, `GAME OVER\nScore: ${this.score}\n\nПробел или клик — заново`, 32, '#f87171', {
      align: 'center',
    }).setOrigin(0.5);

    this.input.keyboard?.once('keydown-SPACE', () => this.scene.restart());
    this.input.once('pointerdown', () => this.scene.restart());
  }
}