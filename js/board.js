/**
 * board.js — 棋盘渲染模块
 *
 * 职责：纯渲染，不含任何游戏逻辑。
 * 对外暴露 Board 类，由 main.js 实例化后传入 game.js 使用。
 */

class Board {
  /**
   * @param {HTMLCanvasElement} canvas - 目标 Canvas 元素
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // ---- 棋盘参数 ----
    this.SIZE = 15;          // 15×15 格（16×16 交叉点）
    this.CELL = 40;          // 每格像素大小
    this.PADDING = 30;       // 棋盘四周留白

    // Canvas 总尺寸 = 14 个格子 × 40px + 2 × 30px 边距
    // 注意：15线 = 14个间距，所以总宽 = (SIZE-1)*CELL + 2*PADDING
    const total = (this.SIZE - 1) * this.CELL + 2 * this.PADDING;
    canvas.width = total;
    canvas.height = total;

    // 棋子半径（略小于格子一半，留出间隙）
    this.STONE_RADIUS = this.CELL * 0.44;

    // 星位坐标（行、列，0-based）
    this.STAR_POINTS = [
      [3, 3], [3, 11],
      [7, 7],             // 天元
      [11, 3], [11, 11],
    ];
  }

  /**
   * 将棋格索引 (row, col) 转换为 Canvas 像素坐标
   * @param {number} row
   * @param {number} col
   * @returns {{ x: number, y: number }}
   */
  indexToPixel(row, col) {
    return {
      x: this.PADDING + col * this.CELL,
      y: this.PADDING + row * this.CELL,
    };
  }

  /**
   * 将鼠标像素坐标转换为最近的棋格索引
   * @param {number} px - canvas 内的像素 x
   * @param {number} py - canvas 内的像素 y
   * @returns {{ row: number, col: number } | null}  超出范围返回 null
   */
  pixelToIndex(px, py) {
    // 换算到相对于第一条线的偏移
    const col = Math.round((px - this.PADDING) / this.CELL);
    const row = Math.round((py - this.PADDING) / this.CELL);

    // 超出棋盘范围
    if (row < 0 || row >= this.SIZE || col < 0 || col >= this.SIZE) {
      return null;
    }

    // 鼠标必须在格点吸附范围内（半格以内）
    const { x, y } = this.indexToPixel(row, col);
    const dist = Math.sqrt((px - x) ** 2 + (py - y) ** 2);
    if (dist > this.CELL * 0.5) {
      return null;
    }

    return { row, col };
  }

  // ========================================
  // 绘制方法
  // ========================================

  /**
   * 清空画布并重新绘制棋盘背景 + 网格 + 星位
   */
  drawBoard() {
    const { ctx, canvas, PADDING, CELL, SIZE } = this;

    // 背景色（原木色）
    ctx.fillStyle = '#DEB887';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 外边框阴影感
    ctx.shadowColor = 'rgba(0,0,0,0.2)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    // 绘制网格线
    ctx.beginPath();
    ctx.strokeStyle = '#8B6914';
    ctx.lineWidth = 1;

    for (let i = 0; i < SIZE; i++) {
      const pos = PADDING + i * CELL;

      // 横线
      ctx.moveTo(PADDING, pos);
      ctx.lineTo(PADDING + (SIZE - 1) * CELL, pos);

      // 竖线
      ctx.moveTo(pos, PADDING);
      ctx.lineTo(pos, PADDING + (SIZE - 1) * CELL);
    }
    ctx.stroke();

    // 关闭阴影（避免影响棋子渲染）
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // 绘制外边框加粗
    ctx.beginPath();
    ctx.strokeStyle = '#5C4000';
    ctx.lineWidth = 2;
    ctx.strokeRect(
      PADDING, PADDING,
      (SIZE - 1) * CELL,
      (SIZE - 1) * CELL
    );
    ctx.stroke();

    // 绘制星位
    this._drawStarPoints();
  }

  /**
   * 绘制单颗棋子
   * @param {number} row
   * @param {number} col
   * @param {number} player - 1 黑方，2 白方
   * @param {boolean} isLast - 是否为最后一颗（显示标记）
   */
  drawStone(row, col, player, isLast = false) {
    const { ctx } = this;
    const { x, y } = this.indexToPixel(row, col);
    const r = this.STONE_RADIUS;

    // 棋子阴影
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 3;

    // 棋子主体（径向渐变产生立体感）
    const gradient = ctx.createRadialGradient(
      x - r * 0.3, y - r * 0.3, r * 0.1,   // 高光起点（左上角偏移）
      x, y, r                                 // 棋子中心
    );

    if (player === 1) {
      // 黑子：从深灰到纯黑
      gradient.addColorStop(0, '#5a5a5a');
      gradient.addColorStop(1, '#0a0a0a');
    } else {
      // 白子：从纯白到浅灰
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(1, '#c0c0c0');
    }

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    // 关闭阴影
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // 最后落子标记：小红点
    if (isLast) {
      ctx.beginPath();
      ctx.arc(x, y, r * 0.25, 0, Math.PI * 2);
      ctx.fillStyle = player === 1 ? '#ff4444' : '#cc0000';
      ctx.fill();
    }
  }

  /**
   * 绘制鼠标悬停预览（半透明棋子）
   * @param {number} row
   * @param {number} col
   * @param {number} player
   */
  drawPreview(row, col, player) {
    const { ctx } = this;
    const { x, y } = this.indexToPixel(row, col);
    const r = this.STONE_RADIUS;

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = player === 1
      ? 'rgba(10, 10, 10, 0.35)'
      : 'rgba(240, 240, 240, 0.55)';
    ctx.fill();
  }

  /**
   * 绘制胜利连线高亮
   * @param {Array<{row:number, col:number}>} stones - 五颗连线棋子位置
   */
  drawWinHighlight(stones) {
    const { ctx } = this;

    stones.forEach(({ row, col }) => {
      const { x, y } = this.indexToPixel(row, col);

      // 金色光晕
      ctx.beginPath();
      ctx.arc(x, y, this.STONE_RADIUS * 1.1, 0, Math.PI * 2);
      ctx.strokeStyle = '#f5c518';
      ctx.lineWidth = 3;
      ctx.stroke();
    });
  }

  // ========================================
  // 私有方法
  // ========================================

  /**
   * 绘制棋盘星位（实心圆点）
   * @private
   */
  _drawStarPoints() {
    const { ctx, STAR_POINTS } = this;

    STAR_POINTS.forEach(([row, col]) => {
      const { x, y } = this.indexToPixel(row, col);
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#5C4000';
      ctx.fill();
    });
  }
}
