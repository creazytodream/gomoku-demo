/**
 * main.js — 主控制器
 *
 * 职责：
 *  1. 初始化 Board / Game / AI 实例
 *  2. 绑定鼠标事件（点击落子、移动预览）
 *  3. 绑定控制按钮（悔棋、重置、模式切换）
 *  4. 协调渲染与逻辑的交互
 *  5. 控制胜利弹窗显示
 */

(function () {
  'use strict';

  // ========================================
  // 初始化模块实例
  // ========================================
  const canvas = document.getElementById('gomokuCanvas');
  const board = new Board(canvas);
  const game = new Game(board.SIZE);
  const ai = new AI(game);

  // ========================================
  // 对战模式：'pvp' 双人 | 'pve' 人机
  // ========================================
  let gameMode = 'pvp';

  // AI 思考中标志（防止玩家在 AI 落子期间操作）
  let aiThinking = false;

  // 上次悬停格子（用于清除旧预览）
  let hoverCell = null;

  // ========================================
  // DOM 引用
  // ========================================
  const turnText    = document.getElementById('turnText');
  const stepCount   = document.getElementById('stepCount');
  const btnUndo     = document.getElementById('btnUndo');
  const btnRestart  = document.getElementById('btnRestart');
  const btnTwoPlayer= document.getElementById('btnTwoPlayer');
  const btnVsAI     = document.getElementById('btnVsAI');
  const modalOverlay= document.getElementById('modalOverlay');
  const modalTitle  = document.getElementById('modalTitle');
  const modalDesc   = document.getElementById('modalDesc');
  const modalSteps  = document.getElementById('modalSteps');
  const modalIcon   = document.getElementById('modalIcon');
  const modalRestart= document.getElementById('modalRestart');
  const turnStoneIcon = document.querySelector('.stone-icon');
  const difficultySelect = document.getElementById('difficultySelect');

  // 难度名称映射
  const levelNames = {
    easy: '简单', hard: '困难', nightmare: '噩梦'
  };

  // ========================================
  // 首次渲染棋盘
  // ========================================
  board.drawBoard();

  // ========================================
  // Canvas 点击事件 — 落子
  // ========================================
  canvas.addEventListener('click', (e) => {
    // 游戏结束或 AI 思考中，不响应
    if (game.isOver || aiThinking) return;

    // 人机模式下，只允许玩家（黑方）操作
    if (gameMode === 'pve' && game.currentPlayer !== 1) return;

    const { offsetX, offsetY } = e;
    const cell = board.pixelToIndex(offsetX, offsetY);
    if (!cell) return;

    const placed = _doPlace(cell.row, cell.col);

    // 人机模式：仅落子成功后才触发 AI（BUG-FIX: 原来无论成功与否都触发）
    if (gameMode === 'pve' && placed && !game.isOver) {
      _triggerAI();
    }
  });

  // ========================================
  // Canvas 鼠标移动 — 落子预览
  // ========================================
  canvas.addEventListener('mousemove', (e) => {
    if (game.isOver || aiThinking) return;
    if (gameMode === 'pve' && game.currentPlayer !== 1) return;

    const { offsetX, offsetY } = e;
    const cell = board.pixelToIndex(offsetX, offsetY);

    // 如果悬停格子没有变化，跳过重绘
    if (
      cell &&
      hoverCell &&
      cell.row === hoverCell.row &&
      cell.col === hoverCell.col
    ) return;

    hoverCell = cell;

    // 重绘棋盘 + 现有棋子（清除旧预览）
    _redrawAll();

    // 绘制新预览（空格子才显示）
    if (cell && game.board[cell.row][cell.col] === 0) {
      board.drawPreview(cell.row, cell.col, game.currentPlayer);
    }
  });

  // ========================================
  // 鼠标离开 — 清除预览
  // ========================================
  canvas.addEventListener('mouseleave', () => {
    hoverCell = null;
    _redrawAll();
  });

  // ========================================
  // 悔棋按钮
  // ========================================
  btnUndo.addEventListener('click', () => {
    if (aiThinking) return;

    // 人机模式一次撤销两步（玩家+AI 各一步）
    const twoSteps = (gameMode === 'pve');
    const success = game.undo(twoSteps);

    if (success) {
      _redrawAll();
      _updatePanel();
      // 隐藏可能存在的弹窗
      _hideModal();
    }
  });

  // ========================================
  // 重新开始按钮
  // ========================================
  btnRestart.addEventListener('click', _restart);
  modalRestart.addEventListener('click', _restart);

  // ========================================
  // 模式切换
  // ========================================
  btnTwoPlayer.addEventListener('click', () => {
    if (gameMode === 'pvp') return;
    gameMode = 'pvp';
    btnTwoPlayer.classList.add('active');
    btnVsAI.classList.remove('active');
    _restart();
  });

  btnVsAI.addEventListener('click', () => {
    if (gameMode === 'pve') return;
    gameMode = 'pve';
    btnVsAI.classList.add('active');
    btnTwoPlayer.classList.remove('active');
    _restart();
  });

  // 难度选择事件绑定
  difficultySelect.addEventListener('change', () => {
    const level = difficultySelect.value;
    game.setDifficulty(level);
    ai.setDifficulty(level);
    _restart();
  });

  // ========================================
  // 内部函数
  // ========================================

  /**
   * 执行落子并更新视图
   * @returns {boolean} 落子是否成功
   */
  function _doPlace(row, col) {
    const result = game.place(row, col);
    if (!result.success) return false;  // BUG-FIX: 落子失败明确返回 false

    _redrawAll();
    _updatePanel();

    if (result.winner !== null) {
      // 延迟一帧，让棋子先渲染完再显示高亮和弹窗
      requestAnimationFrame(() => {
        if (result.winStones.length > 0) {
          board.drawWinHighlight(result.winStones);
        }
        setTimeout(() => _showModal(result.winner), 300);
      });
    }

    return true;  // BUG-FIX: 落子成功返回 true
  }

  /**
   * 触发 AI 落子（使用 setTimeout 让 UI 先刷新，给用户反馈感）
   */
  function _triggerAI() {
    aiThinking = true;
    canvas.style.cursor = 'wait';
    _updatePanel();

    setTimeout(() => {
      const move = ai.getBestMove();
      if (move) {
        _doPlace(move.row, move.col);
      }
      aiThinking = false;
      canvas.style.cursor = 'crosshair';
      _updatePanel();
    }, 80); // 80ms 延迟：体感更自然，不会感觉卡顿
  }

  /**
   * 重绘所有棋子（不含预览）
   */
  function _redrawAll() {
    board.drawBoard();

    const lastMove = game.getLastMove();

    for (let r = 0; r < game.SIZE; r++) {
      for (let c = 0; c < game.SIZE; c++) {
        const val = game.board[r][c];
        if (val !== 0) {
          const isLast = lastMove && lastMove.row === r && lastMove.col === c;
          board.drawStone(r, c, val, isLast);
        }
      }
    }

    // 游戏结束时重绘胜利高亮
    if (game.isOver && game.winStones.length > 0) {
      board.drawWinHighlight(game.winStones);
    }
  }

  /**
   * 更新难度选择器状态
   * @param {string} level
   */
  function _updateDifficultyUI(level) {
    difficultySelect.value = level;
  }

  /**
   * 显示升级提示的胜利弹窗
   * @param {string} currentLevel
   * @param {string} nextLevel
   */
  function _showLevelUpModal(currentLevel, nextLevel) {
    modalIcon.textContent = '🎉';
    modalTitle.textContent = '🎉 恭喜过关！';
    modalDesc.innerHTML = `即将进入「${levelNames[nextLevel]}」模式`;
    modalRestart.textContent = '开始挑战';
    modalRestart.onclick = () => {
      _hideModal();
      _restart();
      _updateDifficultyUI(nextLevel);
    };
    modalOverlay.classList.add('visible');
  }

  /**
   * 显示大师通关弹窗
   */
  function _showMasterModal() {
    modalIcon.textContent = '🏆';
    modalTitle.textContent = '🏆 你是五子棋大师！';
    modalDesc.innerHTML = '恭喜通关全部难度！';
    modalRestart.textContent = '再来一局';
    modalRestart.onclick = () => {
      _hideModal();
      _restart();
    };
    modalOverlay.classList.add('visible');
  }

  /**
   * 更新控制面板显示
   */
  function _updatePanel() {
    const step = game.getStepCount();
    stepCount.textContent = step;

    if (game.isOver) {
      turnText.textContent = '游戏结束';
      turnStoneIcon.className = 'stone-icon';
      btnUndo.disabled = false;
      return;
    }

    if (aiThinking) {
      turnText.textContent = 'AI 思考中...';
      turnStoneIcon.className = 'stone-icon white-stone';
      btnUndo.disabled = true;
      return;
    }

    const isBlack = game.currentPlayer === 1;
    turnText.textContent = isBlack ? '黑方落子' : '白方落子';
    turnStoneIcon.className = `stone-icon ${isBlack ? 'black-stone' : 'white-stone'}`;

    // 有历史记录才能悔棋
    btnUndo.disabled = game.history.length === 0;
  }

  /**
   * 显示胜利弹窗
   * @param {number} winner - 1=黑胜, 2=白胜, 0=平局
   */
  function _showModal(winner) {
    const steps = game.getStepCount();
    modalSteps.textContent = steps;

    if (winner === 0) {
      modalIcon.textContent = '🤝';
      modalTitle.textContent = '平局！';
      modalDesc.innerHTML = `共下了 <span id="modalSteps">${steps}</span> 步`;
    } else if (winner === 1) {
      modalIcon.textContent = '🎉';
      modalTitle.textContent = gameMode === 'pve' ? '玩家获胜！' : '黑方获胜！';
      modalDesc.innerHTML = `共下了 <span id="modalSteps">${steps}</span> 步`;

      // 人机模式下玩家获胜后自动升级难度
      if (gameMode === 'pve') {
        const currentLevel = game.getDifficulty();
        const nextLevel = game.getNextDifficulty();

        if (nextLevel) {
          // 自动升级难度
          game.setDifficulty(nextLevel);
          ai.setDifficulty(nextLevel);
          _updateDifficultyUI(nextLevel);

          setTimeout(() => {
            _hideModal();
            _showLevelUpModal(currentLevel, nextLevel);
          }, 100);
          return;
        } else {
          setTimeout(() => {
            _hideModal();
            _showMasterModal();
          }, 100);
          return;
        }
      }
    } else {
      modalIcon.textContent = gameMode === 'pve' ? '🤖' : '🎉';
      modalTitle.textContent = gameMode === 'pve' ? 'AI 获胜！' : '白方获胜！';
      modalDesc.innerHTML = `共下了 <span id="modalSteps">${steps}</span> 步`;
    }

    modalOverlay.classList.add('visible');
  }

  /**
   * 隐藏弹窗
   */
  function _hideModal() {
    modalOverlay.classList.remove('visible');
  }

  /**
   * 重新开始游戏
   */
  function _restart() {
    aiThinking = false;
    canvas.style.cursor = 'crosshair';
    hoverCell = null;
    game.reset();
    board.drawBoard();
    _updatePanel();
    _hideModal();
  }

  // 初始化面板状态
  _updatePanel();
  _updateDifficultyUI(game.getDifficulty());

})();
