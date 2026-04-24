/**
 * ai.js — AI 对战策略模块
 *
 * 策略：启发式评分（Heuristic Scoring）
 * 遍历所有空位，对每个空位计算：
 *   - 己方落子后的得分（进攻）
 *   - 对手落子后的得分（防守）
 * 取两者最大值，选出总分最高的位置落子。
 *
 * 棋型评分表：
 *   五连 (FIVE)      → 100000（必胜，立即落子）
 *   活四 (LIVE_FOUR) →  10000（下一步必胜）
 *   冲四 (RUSH_FOUR) →   1000（需要封堵）
 *   活三 (LIVE_THREE)→    500（有威胁）
 *   眠三 (DEAD_THREE)→    100
 *   活二 (LIVE_TWO)  →     50
 *   眠二 (DEAD_TWO)  →     10
 */

class AI {
  /**
   * @param {Game} game - 游戏逻辑实例（共享状态）
   */
  constructor(game) {
    this.game = game;

    // AI 执白（player = 2），玩家执黑（player = 1）
    this.AI_PLAYER = 2;
    this.HUMAN_PLAYER = 1;

    // 四个方向向量
    this.DIRECTIONS = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ];

    // 棋型评分
    this.SCORE = {
      FIVE:       100000,
      LIVE_FOUR:   10000,
      RUSH_FOUR:    1000,
      LIVE_THREE:    500,
      DEAD_THREE:    100,
      LIVE_TWO:       50,
      DEAD_TWO:       10,
    };

    // 难度配置：评分倍率、搜索半径、防守系数
    this.DIFFICULTY_CONFIG = {
      easy:       { scoreMultiplier: 0.5, searchRange: 2, defenseFactor: 1.2 },
      hard:       { scoreMultiplier: 2.0, searchRange: 3, defenseFactor: 0.8 },
      nightmare:  { scoreMultiplier: 10.0, searchRange: 5, defenseFactor: 0.5 },
    };

    // 默认简单难度
    this.currentConfig = { ...this.DIFFICULTY_CONFIG.easy };
  }

  /**
   * 设置 AI 难度
   * @param {string} level - 'easy' | 'medium' | 'hard'
   */
  setDifficulty(level) {
    if (this.DIFFICULTY_CONFIG[level]) {
      this.currentConfig = { ...this.DIFFICULTY_CONFIG[level] };
    }
  }

  /**
   * 获取当前难度
   * @returns {string}
   */
  getDifficulty() {
    const configs = Object.entries(this.DIFFICULTY_CONFIG);
    for (const [name, cfg] of configs) {
      if (cfg.scoreMultiplier === this.currentConfig.scoreMultiplier
        && cfg.searchRange === this.currentConfig.searchRange
        && cfg.defenseFactor === this.currentConfig.defenseFactor) {
        return name;
      }
    }
    return 'medium';
  }

  /**
   * 计算 AI 的最佳落子位置
   * @returns {{ row: number, col: number } | null}
   */
  getBestMove() {
    const board = this.game.board;
    const SIZE = this.game.SIZE;
    const { searchRange, defenseFactor } = this.currentConfig;

    let bestScore = -Infinity;
    let bestMove = null;

    const candidates = this._getCandidates(board, SIZE, searchRange);

    // 如果候选为空（棋盘全空），下天元
    if (candidates.length === 0) {
      const center = Math.floor(SIZE / 2);
      return { row: center, col: center };
    }

    for (const { row, col } of candidates) {
      if (board[row][col] !== 0) continue;

      // 模拟 AI 落子，计算进攻分
      board[row][col] = this.AI_PLAYER;
      const attackScore = this._evaluatePoint(board, row, col, this.AI_PLAYER, SIZE);
      board[row][col] = 0;

      // 模拟对手落子，计算防守分
      board[row][col] = this.HUMAN_PLAYER;
      const defenseScore = this._evaluatePoint(board, row, col, this.HUMAN_PLAYER, SIZE);
      board[row][col] = 0;

      const totalScore = Math.max(attackScore, defenseScore * defenseFactor);

      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestMove = { row, col };
      }
    }

    return bestMove;
  }

  // ========================================
  // 私有方法
  // ========================================

  /**
   * 评估在 (row, col) 落 player 子后，该位置的总得分
   * 四个方向的得分之和
   * @private
   */
  _evaluatePoint(board, row, col, player, SIZE) {
    let totalScore = 0;

    for (const [dr, dc] of this.DIRECTIONS) {
      const score = this._evaluateDirection(board, row, col, player, dr, dc, SIZE);
      totalScore += score;
    }

    return totalScore * this.currentConfig.scoreMultiplier;
  }

  /**
   * 评估某方向上的棋型
   * @private
   */
  _evaluateDirection(board, row, col, player, dr, dc, SIZE) {
    // 统计正、负方向的连续同色数，以及两端是否开放
    let count = 1; // 包含当前落子
    let openEnds = 0;

    // 正方向
    let blocked1 = false;
    for (let step = 1; step <= 4; step++) {
      const r = row + dr * step;
      const c = col + dc * step;
      if (!this._inBound(r, c, SIZE)) { blocked1 = true; break; }
      if (board[r][c] === player) { count++; }
      else if (board[r][c] === 0) { openEnds++; break; }
      else { blocked1 = true; break; }
    }

    // 负方向
    let blocked2 = false;
    for (let step = 1; step <= 4; step++) {
      const r = row - dr * step;
      const c = col - dc * step;
      if (!this._inBound(r, c, SIZE)) { blocked2 = true; break; }
      if (board[r][c] === player) { count++; }
      else if (board[r][c] === 0) { openEnds++; break; }
      else { blocked2 = true; break; }
    }

    // 默认：若正或负方向没有碰到边界或对方棋子，端点是开放的
    if (!blocked1 && openEnds < 2) openEnds++;
    if (!blocked2 && openEnds < 2) openEnds++;

    return this._scorePattern(count, openEnds);
  }

  /**
   * 根据连续数和开放端数量，返回棋型分数
   * @param {number} count  - 连续同色棋子数（含当前落点）
   * @param {number} opens  - 开放端数量（0/1/2）
   * @private
   */
  _scorePattern(count, opens) {
    const S = this.SCORE;

    if (count >= 5) return S.FIVE;

    if (count === 4) {
      return opens >= 2 ? S.LIVE_FOUR : S.RUSH_FOUR;
    }

    if (count === 3) {
      return opens >= 2 ? S.LIVE_THREE : S.DEAD_THREE;
    }

    if (count === 2) {
      return opens >= 2 ? S.LIVE_TWO : S.DEAD_TWO;
    }

    return 0;
  }

  /**
   * 获取候选落子位置：已落棋子周围 searchRange 格内的所有空位
   * 减少遍历量，提升性能
   * @param {number[][]} board
   * @param {number} SIZE
   * @param {number} searchRange
   * @returns {Array<{row:number, col:number}>}
   * @private
   */
  _getCandidates(board, SIZE, searchRange = 2) {
    const visited = new Set();
    const candidates = [];

    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (board[r][c] === 0) continue;

        for (let dr = -searchRange; dr <= searchRange; dr++) {
          for (let dc = -searchRange; dc <= searchRange; dc++) {
            const nr = r + dr;
            const nc = c + dc;
            const key = `${nr},${nc}`;

            if (
              this._inBound(nr, nc, SIZE)
              && board[nr][nc] === 0
              && !visited.has(key)
            ) {
              visited.add(key);
              candidates.push({ row: nr, col: nc });
            }
          }
        }
      }
    }

    return candidates;
  }

  /**
   * 坐标是否在棋盘范围内
   * @private
   */
  _inBound(row, col, SIZE) {
    return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
  }
}
