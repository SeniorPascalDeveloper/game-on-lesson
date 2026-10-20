import Phaser from 'phaser';

const PLAYER_SPEED = 275;

// НОВОЕ: настройки врага (удобно подкручивать сложность)
const ENEMY_START_SPEED = 90;  // скорость врага в начале, px/сек
const ENEMY_SPEED_PER_COIN = 8; // на сколько врач ускоряется за каждую монету
const ENEMY_MAX_SPEED = 230;   // меньше скорости игрока, чтобы можно было убежать
const FIRST_PHASE_DELAY_MS = 30_000;
const PHASE_DURATION_MS = 20_000;
const PHASE_MESSAGE_MS = 3_000;
const CAT_SPAWN_DELAY_MIN_MS = 15_000;
const CAT_SPAWN_DELAY_MAX_MS = 20_000;
const SECOND_PHASE_SCORE = 3;
const THIRD_PHASE_SCORE = 7;

type EnemyMovement = {
  heading: number;
  turnSpeed: number;
  speedMultiplier: number;
  orbitAngle: number;
  orbitRadius: number;
  orbitSpeed: number;
};

type PhaseEnemy = {
  image: Phaser.GameObjects.Image;
  movement: EnemyMovement;
};

/**
 * Игрок собирает монеты, чтобы получать очки,
 * пока ему мешает красный квадрат, который гонится за ним.
 */
export class GameScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Image;
  private target!: Phaser.GameObjects.Arc;
  private enemy!: Phaser.GameObjects.Image; // НОВОЕ: преследователь
  private enemyMovement!: EnemyMovement;
  private phaseEnemies: PhaseEnemy[] = [];
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private pauseKey!: Phaser.Input.Keyboard.Key;
  private scoreText!: Phaser.GameObjects.Text;
  private pauseText!: Phaser.GameObjects.Text;
  private pauseButton!: Phaser.GameObjects.Text;
  private phaseText!: Phaser.GameObjects.Text;
  private gameTimerText!: Phaser.GameObjects.Text;
  private score = 0;
  private elapsedTime = 0;
  private isPaused = false;
  private isGameOver = false; // НОВОЕ: состояние поражения
  private isPhaseActive = false;
  private phaseNumber = 0;
  private phaseTimer = FIRST_PHASE_DELAY_MS;
  private phaseMessageTimer = 0;
  private phaseSpawnTimer = 0;
  private pendingPhaseCats = 0;

  constructor() {
    super('GameScene');
  }

  preload(): void {
    this.load.image('player', new URL('./1.jpg', import.meta.url).href);
    this.load.image('enemy', new URL('./2.jpg', import.meta.url).href);
    this.load.image('phaseCat3', new URL('./3.png', import.meta.url).href);
    this.load.image('phaseCat4', new URL('./4.png', import.meta.url).href);
  }

  create(): void {
    const { width, height } = this.scale;

    // НОВОЕ: сброс состояния, иначе после Restart останутся старые значения
    this.score = 0;
    this.elapsedTime = 0;
    this.isPaused = false;
    this.isGameOver = false;
    this.time.paused = false;
    this.isPhaseActive = false;
    this.phaseNumber = 0;
    this.phaseTimer = FIRST_PHASE_DELAY_MS;
    this.phaseMessageTimer = 0;
    this.phaseSpawnTimer = 0;
    this.pendingPhaseCats = 0;
    this.phaseEnemies = [];

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
    this.phaseText = this.add
      .text(width / 2, 104, 'Котов стало больше, берегитесь!', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '24px',
        color: '#fca5a5',
      })
      .setOrigin(0.5, 0)
      .setDepth(1)
      .setVisible(false);
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
    this.enemyMovement = this.createEnemyMovement(this.enemy, 0);

    this.scoreText = this.add.text(24, height - 48, 'Score: 0', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '22px',
      color: '#ffffff',
    });
    this.gameTimerText = this.add
      .text(width - 24, height - 48, 'Время: 00:00', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '22px',
        color: '#ffffff',
      })
      .setOrigin(1, 0);

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
    this.elapsedTime += delta;
    const totalSeconds = Math.floor(this.elapsedTime / 1000);
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const remainingSeconds = (totalSeconds % 60).toString().padStart(2, '0');
    this.gameTimerText.setText(`Время: ${minutes}:${remainingSeconds}`);
    this.updatePhase(delta);
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
    this.moveEnemies(seconds);
    this.checkEnemyHit();
  }

  private updatePhase(delta: number): void {
    if (this.phaseMessageTimer > 0) {
      this.phaseMessageTimer -= delta;
      if (this.phaseMessageTimer <= 0) this.phaseText.setVisible(false);
    }

    if (this.isPhaseActive) {
      if (this.pendingPhaseCats > 0) {
        this.phaseSpawnTimer -= delta;
        if (this.phaseSpawnTimer <= 0) this.spawnNextPhaseCat();
      }

      this.phaseTimer -= delta;
      if (this.phaseTimer > 0) return;

      this.phaseEnemies.forEach(({ image }) => image.destroy());
      this.phaseEnemies = [];
      this.pendingPhaseCats = 0;
      this.isPhaseActive = false;
      this.phaseTimer = 0;
      return;
    }

    if (this.phaseNumber === 0) {
      this.phaseTimer -= delta;
      if (this.phaseTimer > 0) return;
    } else if (
      (this.phaseNumber === 1 && this.score < SECOND_PHASE_SCORE) ||
      (this.phaseNumber === 2 && this.score < THIRD_PHASE_SCORE)
    ) {
      return;
    }

    this.phaseNumber += 1;
    this.isPhaseActive = true;
    this.pendingPhaseCats = this.phaseNumber - 1;
    this.phaseTimer = PHASE_DURATION_MS + this.pendingPhaseCats * CAT_SPAWN_DELAY_MAX_MS;
    this.phaseMessageTimer = PHASE_MESSAGE_MS;
    this.phaseText.setVisible(true);
    this.spawnNextPhaseCat();
  }

  private spawnNextPhaseCat(): void {
    const spawnedCount = this.phaseNumber - this.pendingPhaseCats;
    const texture = spawnedCount % 2 === 0 ? 'phaseCat3' : 'phaseCat4';
    this.phaseEnemies.push(this.createPhaseEnemy(texture));
    this.pendingPhaseCats -= 1;
    this.phaseSpawnTimer = this.pendingPhaseCats > 0
      ? Phaser.Math.Between(CAT_SPAWN_DELAY_MIN_MS, CAT_SPAWN_DELAY_MAX_MS)
      : 0;
  }

  private createEnemyMovement(enemy: Phaser.GameObjects.Image, orbitRadius: number): EnemyMovement {
    return {
      heading: Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y)
        + Phaser.Math.FloatBetween(-0.7, 0.7),
      turnSpeed: Phaser.Math.FloatBetween(1.4, 2.6),
      speedMultiplier: Phaser.Math.FloatBetween(0.85, 1.15),
      orbitAngle: Phaser.Math.FloatBetween(0, Math.PI * 2),
      orbitRadius,
      orbitSpeed: Phaser.Math.FloatBetween(-0.8, 0.8),
    };
  }

  private createPhaseEnemy(texture: string): PhaseEnemy {
    const position = this.findPhaseEnemyPosition();
    const image = this.add.image(position.x, position.y, texture).setDisplaySize(105, 105);
    return {
      image,
      movement: this.createEnemyMovement(image, Phaser.Math.Between(25, 70)),
    };
  }

  private findPhaseEnemyPosition(): Phaser.Math.Vector2 {
    const { width, height } = this.scale;
    const margin = 60;
    const top = 140;
    const bottom = height - margin;
    const sideY = Math.max(top, Math.min(height / 2, bottom));
    const candidates = [
      new Phaser.Math.Vector2(margin, sideY),
      new Phaser.Math.Vector2(width - margin, sideY),
      new Phaser.Math.Vector2(margin, bottom),
      new Phaser.Math.Vector2(width / 2, bottom),
      new Phaser.Math.Vector2(width - margin, bottom),
    ];
    const existing = [this.player, ...this.phaseEnemies.map(({ image }) => image)];
    return candidates.reduce((best, candidate) => {
      const candidateDistance = Math.min(
        ...existing.map((enemy) => Phaser.Math.Distance.Between(candidate.x, candidate.y, enemy.x, enemy.y)),
      );
      const bestDistance = Math.min(
        ...existing.map((enemy) => Phaser.Math.Distance.Between(best.x, best.y, enemy.x, enemy.y)),
      );
      return candidateDistance > bestDistance ? candidate : best;
    });
  }

  private moveEnemies(seconds: number): void {
    this.moveEnemyTowardsPlayer(this.enemy, this.enemyMovement, seconds);
    this.phaseEnemies.forEach(({ image, movement }) => {
      this.moveEnemyTowardsPlayer(image, movement, seconds);
    });
  }

  private moveEnemyTowardsPlayer(
    enemy: Phaser.GameObjects.Image,
    movement: EnemyMovement,
    seconds: number,
  ): void {
    movement.orbitAngle += movement.orbitSpeed * seconds;
    const targetX = this.player.x + Math.cos(movement.orbitAngle) * movement.orbitRadius;
    const targetY = this.player.y + Math.sin(movement.orbitAngle) * movement.orbitRadius;
    const desiredHeading = Phaser.Math.Angle.Between(enemy.x, enemy.y, targetX, targetY);
    const angleDifference = Phaser.Math.Angle.Wrap(desiredHeading - movement.heading);
    movement.heading += Phaser.Math.Clamp(
      angleDifference,
      -movement.turnSpeed * seconds,
      movement.turnSpeed * seconds,
    );
    const speed = Math.min(
      ENEMY_MAX_SPEED,
      (ENEMY_START_SPEED + this.score * ENEMY_SPEED_PER_COIN) * movement.speedMultiplier,
    );
    enemy.x += Math.cos(movement.heading) * speed * seconds;
    enemy.y += Math.sin(movement.heading) * speed * seconds;
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

  private checkEnemyHit(): void {
    if (this.didEnemyHit(this.enemy)) {
      this.gameOver();
      return;
    }

    for (const { image } of this.phaseEnemies) {
      if (this.didEnemyHit(image)) {
        this.gameOver();
        return;
      }
    }
  }

  private didEnemyHit(enemy: Phaser.GameObjects.Image): boolean {
    const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
    return distance < 40;
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