/**
 * game.js — 游戏逻辑模块
 *
 * 职责：维护棋盘状态、落子规则、胜负判断、悔棋逻辑。
 * 不直接操作 DOM 或 Canvas，所有渲染通过回调通知外部。
 */

class Game {
  /**
   * @param {number} size - 棋盘大小（默认 15）
   */
  constructor(size = 15) {
    this.SIZE = size;

    // 棋盘二维数组：0=空, 1=黑方, 2=白方
    this.board = this._createEmptyBoard();

    // 落子历史，用于悔棋：[{row, col, player}]
    this.history = [];

    // 当前落子方：1=黑(先手), 2=白
    this.currentPlayer = 1;

    // 游戏是否结束
    this.isOver = false;

    // 获胜的五颗棋子位置，供高亮显示
    this.winStones = [];

    // 难度系统
    this.currentDifficulty = 'easy';

    this.DIFFICULTY_LEVELS = ['easy', 'hard', 'nightmare'];
    this.DIFFICULTY_CONFIG = {
      easy:       { scoreMultiplier: 0.5, searchRange: 2, defenseFactor: 1.2 },
      hard:       { scoreMultiplier: 2.0, searchRange: 3, defenseFactor: 0.8 },
      nightmare:  { scoreMultiplier: 100.0, searchRange: 10, defenseFactor: 0.3 },
    };

    // 四个检测方向：[行步长, 列步长]
    this.DIRECTIONS = [
      [0, 1],   // 水平
      [1, 0],   // 垂直
      [1, 1],   // 正斜线 ↘
      [1, -1],  // 反斜线 ↙
    ];
  }

  // ========================================
  // 公开方法
  // ========================================

  /**
   * 重置游戏到初始状态
   */
  reset() {
    this.board = this._createEmptyBoard();
    this.history = [];
    this.currentPlayer = 1;
    this.isOver = false;
    this.winStones = [];
  }

  /**
   * 设置游戏难度
   * @param {string} level
   */
  setDifficulty(level) {
    if (this.DIFFICULTY_LEVELS.includes(level)) {
      this.currentDifficulty = level;
    }
  }

  /**
   * 获取当前难度
   * @returns {string}
   */
  getDifficulty() {
    return this.currentDifficulty;
  }

  /**
   * 获取下一难度（用于自动升级）
   * @returns {string|null}
   */
  getNextDifficulty() {
    const currentIndex = this.DIFFICULTY_LEVELS.indexOf(this.currentDifficulty);
    if (currentIndex < this.DIFFICULTY_LEVELS.length - 1) {
      return this.DIFFICULTY_LEVELS[currentIndex + 1];
    }
    return null;
  }

  /**
   * 尝试在指定位置落子
   * @param {number} row
   * @param {number} col
   * @returns {{ success: boolean, winner: number|null, winStones: Array }}
   */
  place(row, col) {
    // 游戏已结束或位置已有棋子，拒绝落子
    if (this.isOver || this.board[row][col] !== 0) {
      return { success: false, winner: null, winStones: [] };
    }

    // 落子
    this.board[row][col] = this.currentPlayer;
    this.history.push({ row, col, player: this.currentPlayer });

    // 检测胜负
    const winResult = this._checkWin(row, col, this.currentPlayer);
    if (winResult.length > 0) {
      this.isOver = true;
      this.winStones = winResult;
      return {
        success: true,
        winner: this.currentPlayer,
        winStones: winResult,
      };
    }

    // 检测平局（棋盘落满）
    if (this._isBoardFull()) {
      this.isOver = true;
      return { success: true, winner: 0, winStones: [] }; // 0 = 平局
    }

    // 切换回合
    this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;

    return { success: true, winner: null, winStones: [] };
  }

  /**
   * 悔棋：撤销最后一步（人机模式下撤销两步）
   * @param {boolean} twoSteps - 是否撤销两步（人机模式）
   * @returns {boolean} 是否成功悔棋
   */
  undo(twoSteps = false) {
    const stepsToUndo = twoSteps ? 2 : 1;

    if (this.history.length < stepsToUndo) {
      return false; // 没有足够的历史可以撤销
    }

    for (let i = 0; i < stepsToUndo; i++) {
      const last = this.history.pop();
      this.board[last.row][last.col] = 0;
      this.currentPlayer = last.player; // 恢复到那一步的玩家
    }

    // 悔棋后游戏肯定未结束
    this.isOver = false;
    this.winStones = [];

    return true;
  }

  /**
   * 获取当前棋盘快照（只读副本，供 AI 使用）
   * @returns {number[][]}
   */
  getBoardSnapshot() {
    return this.board.map(row => [...row]);
  }

  /**
   * 判断某位置是否为空且在棋盘范围内
   * @param {number} row
   * @param {number} col
   * @returns {boolean}
   */
  isValidEmpty(row, col) {
    return row >= 0 && row < this.SIZE
      && col >= 0 && col < this.SIZE
      && this.board[row][col] === 0;
  }

  /**
   * 获取最后一步落子信息
   * @returns {{ row: number, col: number, player: number } | null}
   */
  getLastMove() {
    return this.history.length > 0
      ? this.history[this.history.length - 1]
      : null;
  }

  /**
   * 获取当前步数
   * @returns {number}
   */
  getStepCount() {
    return this.history.length;
  }

  // ========================================
  // 胜负判断
  // ========================================

  /**
   * 检查落子 (row, col) 后 player 是否获胜
   * @param {number} row
   * @param {number} col
   * @param {number} player
   * @returns {Array<{row:number, col:number}>} 获胜的五颗棋子坐标，未胜返回空数组
   * @private（但 ai.js 也会调用）
   */
  _checkWin(row, col, player) {
    for (const [dr, dc] of this.DIRECTIONS) {
      const line = this._getLine(row, col, player, dr, dc);
      if (line.length >= 5) {
        // 返回连续的五颗（从 line 中取前五）
        return line.slice(0, 5);
      }
    }
    return [];
  }

  /**
   * 从 (row, col) 出发，在 (dr, dc) 方向统计同色连续棋子（含自身）
   * 向正方向和负方向各延伸，合并为一条连线。
   * @returns {Array<{row:number, col:number}>}
   * @private
   */
  _getLine(row, col, player, dr, dc) {
    const stones = [{ row, col }];

    // 正方向延伸
    for (let step = 1; step < 5; step++) {
      const r = row + dr * step;
      const c = col + dc * step;
      if (!this._inBound(r, c) || this.board[r][c] !== player) break;
      stones.push({ row: r, col: c });
    }

    // 负方向延伸
    for (let step = 1; step < 5; step++) {
      const r = row - dr * step;
      const c = col - dc * step;
      if (!this._inBound(r, c) || this.board[r][c] !== player) break;
      stones.unshift({ row: r, col: c });
    }

    return stones;
  }

  // ========================================
  // 私有工具方法
  // ========================================

  /**
   * 创建空棋盘二维数组
   * @returns {number[][]}
   * @private
   */
  _createEmptyBoard() {
    return Array.from({ length: this.SIZE }, () => new Array(this.SIZE).fill(0));
  }

  /**
   * 判断坐标是否在棋盘范围内
   * @private
   */
  _inBound(row, col) {
    return row >= 0 && row < this.SIZE && col >= 0 && col < this.SIZE;
  }

  /**
   * 判断棋盘是否已满（平局检测）
   * @private
   */
  _isBoardFull() {
    for (let r = 0; r < this.SIZE; r++) {
      for (let c = 0; c < this.SIZE; c++) {
        if (this.board[r][c] === 0) return false;
      }
    }
    return true;
  }
}
