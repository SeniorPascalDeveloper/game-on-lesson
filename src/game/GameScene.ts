import Phaser from 'phaser';

const PLAYER_SPEED = 260;

// НОВОЕ: настройки врага (удобно подкручивать сложность)
const ENEMY_START_SPEED = 90;  // скорость врага в начале, px/сек
const ENEMY_SPEED_PER_COIN = 8; // на сколько врач ускоряется за каждую монету
const ENEMY_MAX_SPEED = 230;   // меньше скорости игрока, чтобы можно было убежать

/**
 * Игрок собирает монеты, чтобы получать очки,
 * пока ему мешает красный квадрат, который гонится за ним.
 */
export class GameScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Image;
  private target!: Phaser.GameObjects.Arc;
  private enemy!: Phaser.GameObjects.Image; // НОВОЕ: преследователь
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private pauseKey!: Phaser.Input.Keyboard.Key;
  private scoreText!: Phaser.GameObjects.Text;
  private pauseText!: Phaser.GameObjects.Text;
  private pauseButton!: Phaser.GameObjects.Text;
  private score = 0;
  private isPaused = false;
  private isGameOver = false; // НОВОЕ: состояние поражения

  constructor() {
    super('GameScene');
  }

  preload(): void {
    this.load.image('player', new URL('./1.jpg', import.meta.url).href);
    this.load.image('enemy', new URL('./2.jpg', import.meta.url).href);
  }

  create(): void {
    const { width, height } = this.scale;

    // НОВОЕ: сброс состояния, иначе после Restart останутся старые значения
    this.score = 0;
    this.isPaused = false;
    this.isGameOver = false;
    this.time.paused = false;

    // ИЗМЕНЕНО: заголовок заменён на подсказку управления
    this.add
      .text(width / 2, 28, 'Собирай сыр и убегай от кошки!', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '24px',
        color: '#ffffff',
      })
      .setOrigin(0.5, 0);

    this.player = this.add.image(width / 2, height / 2, 'player').setDisplaySize(63, 63);
    this.target = this.add.circle(width * 0.72, height * 0.52, 18, 0xfacc15);
    this.pauseText = this.add
      .text(width / 2, height / 2, 'ПАУЗА\nP или кнопка в углу — продолжить', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '30px',
        color: '#ffffff',
        align: 'center',
        backgroundColor: '#000000aa',
        padding: { x: 20, y: 16 },
      })
      .setOrigin(0.5)
      .setDepth(1)
      .setVisible(false);
    this.pauseButton = this.add
      .text(width - 32, 32, 'Ⅱ', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '28px',
        color: '#ffffff',
        backgroundColor: '#334155',
        padding: { x: 12, y: 8 },
      })
      .setOrigin(0.5)
      .setDepth(2)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.togglePause());

    // НОВОЕ: враг появляется в левом верхнем углу, далеко от игрока
    this.enemy = this.add.image(60, 160, 'enemy').setDisplaySize(105, 105);

    this.scoreText = this.add.text(24, height - 48, 'Score: 0', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '22px',
      color: '#ffffff',
    });

    if (!this.input.keyboard) {
      throw new Error('Keyboard input is unavailable.');
    }

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
    this.pauseKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P);
  }

  update(_time: number, delta: number): void {
    if (this.isGameOver) return; // НОВОЕ: после поражения игра замирает
    if (Phaser.Input.Keyboard.JustDown(this.pauseKey)) this.togglePause();
    if (this.isPaused) return;

    const seconds = delta / 1000;
    let dx = 0;
    let dy = 0;

    if (this.cursors.left.isDown || this.wasd.left.isDown) dx -= 1;
    if (this.cursors.right.isDown || this.wasd.right.isDown) dx += 1;
    if (this.cursors.up.isDown || this.wasd.up.isDown) dy -= 1;
    if (this.cursors.down.isDown || this.wasd.down.isDown) dy += 1;

    if (dx !== 0 || dy !== 0) {
      const length = Math.hypot(dx, dy);
      this.player.x += (dx / length) * PLAYER_SPEED * seconds;
      this.player.y += (dy / length) * PLAYER_SPEED * seconds;
    }

    this.keepPlayerOnScreen();
    this.checkTarget();
    this.moveEnemy(seconds); // НОВОЕ: враг идёт к игроку
    this.checkEnemyHit();    // НОВОЕ: касание врага = проигрыш
  }

  private togglePause(): void {
    this.isPaused = !this.isPaused;
    this.time.paused = this.isPaused;
    this.pauseText.setVisible(this.isPaused);
    this.pauseButton.setText(this.isPaused ? '▶' : 'Ⅱ');
  }

  private keepPlayerOnScreen(): void {
    const half = this.player.displayWidth / 2;
    this.player.x = Phaser.Math.Clamp(this.player.x, half, this.scale.width - half);
    this.player.y = Phaser.Math.Clamp(this.player.y, 110 + half, this.scale.height - half);
  }

  private checkTarget(): void {
    const distance = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      this.target.x,
      this.target.y,
    );

    if (distance > 42) return;

    this.score += 1;
    this.scoreText.setText(`Score: ${this.score}`);

    this.target.setPosition(
      Phaser.Math.Between(60, this.scale.width - 60),
      Phaser.Math.Between(140, this.scale.height - 80),
    );
  }

  // НОВОЕ: враг движется по прямой к игроку, скорость растёт с очками
  private moveEnemy(seconds: number): void {
    const speed = Math.min(ENEMY_MAX_SPEED, ENEMY_START_SPEED + this.score * ENEMY_SPEED_PER_COIN);
    const angle = Phaser.Math.Angle.Between(
      this.enemy.x,
      this.enemy.y,
      this.player.x,
      this.player.y,
    );
    this.enemy.x += Math.cos(angle) * speed * seconds;
    this.enemy.y += Math.sin(angle) * speed * seconds;
  }

  // НОВОЕ: проверка касания врага
  private checkEnemyHit(): void {
    const distance = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      this.enemy.x,
      this.enemy.y,
    );

    if (distance < 40) this.gameOver();
  }

  // НОВОЕ: экран поражения и Restart
  private gameOver(): void {
    this.isGameOver = true;
    const { width, height } = this.scale;

    this.add
      .text(width / 2, height / 2, `GAME OVER\nScore: ${this.score}\n\nПробел или клик — заново`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '32px',
        color: '#f87171',
        align: 'center',
      })
      .setOrigin(0.5);

    this.input.keyboard?.once('keydown-SPACE', () => this.scene.restart());
    this.input.once('pointerdown', () => this.scene.restart());
  }
}