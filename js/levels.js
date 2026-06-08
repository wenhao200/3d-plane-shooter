/**
 * 3D Plane Shooter — 关卡系统 LevelManager
 * 
 * 设计原则:
 * - 用预设编队替换 RNG 随机刷怪
 * - 每关有明确的节奏弧: 热身 → 编队战 → 精英战 → Boss
 * - 环境过渡（背景色变化）传达"你在推进"
 * - Boss 战有阶段转换和攻击模式变化
 */
(function() {
'use strict';

// ============================================================
// 关卡定义
// ============================================================
const LEVELS = [
  // --- Level 1: 碧蓝初航 (训练关) ---
  {
    name: '碧蓝初航',
    subtitle: '训练关 · 学习基本作战',
    bgColor: 0x1a5e8a,
    fogNear: 20, fogFar: 55,
    bgCloudCount: 14,
    // 三幕式: 教学 → 编队 → 精英
    waves: [
      // 第一幕: 教学引导
      { formation: 'line',    count: 3,  elite: false, delay: 1.5,  msg: '' },
      { formation: 'line',    count: 3,  elite: false, delay: 2.5,  msg: '瞄准敌机，保持射击！' },
      { delay: 4.0, type: 'rest', msg: '前方发现敌机编队 →' },
      // 第二幕: 编队战
      { formation: 'v',       count: 5,  elite: false, delay: 2.0,  msg: '' },
      { formation: 'double_v',count: 8,  elite: false, delay: 2.5,  msg: '' },
      { formation: 'swarm',   count: 8,  elite: false, delay: 1.8,  msg: '蜂群来袭！灵活闪避！' },
      { delay: 3.0, type: 'rest', msg: '收集道具，准备迎战精英 →' },
      // 第三幕: 精英
      { formation: 'shield',  count: 4,  elite: true,  delay: 3.0,  msg: '⚠️ 精英敌机出现！' },
      { formation: 'pincer',  count: 4,  elite: false, delay: 2.0,  msg: '' },
      // 结尾
      { delay: 2.0, type: 'rest', msg: '关卡完成 ✓' },
    ],
  },

  // --- Level 2: 夕阳空战 (标准关) ---
  {
    name: '夕阳空战',
    subtitle: '标准战斗',
    bgColor: 0x8a5e1a,
    fogNear: 18, fogFar: 50,
    bgCloudCount: 16,
    waves: [
      { formation: 'line',    count: 4,  elite: false, delay: 1.0,  msg: '' },
      { formation: 'v',       count: 6,  elite: false, delay: 1.5,  msg: '' },
      { delay: 3.0, type: 'rest', msg: '更多敌机正在接近' },
      { formation: 'double_v',count: 10, elite: false, delay: 1.2,  msg: '' },
      { formation: 'shield',  count: 5,  elite: true,  delay: 2.0,  msg: '⚠️ 精英护卫队！' },
      { formation: 'pincer',  count: 6,  elite: false, delay: 1.5,  msg: '左右夹击！' },
      { formation: 'swarm',   count: 12, elite: false, delay: 1.0,  msg: '大蜂群！' },
      { delay: 3.0, type: 'rest', msg: '' },
      { formation: 'swarm',   count: 10, elite: true,  delay: 1.5,  msg: '⚠️ 注意！重型 Boss 出现！' },
      // Boss 战由特殊逻辑处理
      { delay: 0.5, type: 'boss_start', msg: '⚡ Boss 战开始！' },
    ],
  },

  // --- Level 3: 风暴来袭 (挑战关) ---
  {
    name: '风暴来袭',
    subtitle: '高阶挑战',
    bgColor: 0x2a1a3e,
    fogNear: 14, fogFar: 42,
    bgCloudCount: 10,
    waves: [
      { formation: 'line',    count: 5,  elite: false, delay: 0.8,  msg: '' },
      { formation: 'v',       count: 7,  elite: false, delay: 1.2,  msg: '' },
      { formation: 'shield',  count: 4,  elite: true,  delay: 1.5,  msg: '精英护卫现身前线' },
      { formation: 'pincer',  count: 6,  elite: false, delay: 1.2,  msg: '包围战术！' },
      { formation: 'swarm',   count: 14, elite: false, delay: 0.8,  msg: '大规模蜂群！' },
      { formation: 'double_v',count: 12, elite: true,  delay: 1.0,  msg: '双精英编队！' },
      { formation: 'shield',  count: 6,  elite: true,  delay: 1.5,  msg: '最后防线！' },
      { delay: 1.0, type: 'rest', msg: '' },
      { formation: 'swarm',   count: 8,  elite: true,  delay: 1.0,  msg: '⚠️ 最终 Boss 现身！' },
      { delay: 0.5, type: 'boss_start', msg: '⚡ 终极对决！' },
    ],
  },
];

// ============================================================
// 状态
// ============================================================
const LEVEL_PHASE = {
  IDLE: 0,
  LEVEL_INTRO: 1,
  SPAWNING: 2,
  WAVE_BREAK: 3,
  BOSS_INTRO: 4,
  BOSS_FIGHT: 5,
  LEVEL_COMPLETE: 6,
};

let state = {
  currentLevel: -1,
  currentWave: 0,
  phase: LEVEL_PHASE.IDLE,
  phaseTimer: 0,
  waveTimer: 0,
  spawnQueue: [],
  spawnTimer: 0,
  levelTime: 0,
  introDone: false,
  lastSpawnTime: 0,
  // Boss state
  boss: null,          // boss object
  bossHP: 0,
  bossMaxHP: 0,
  bossPhase: 0,        // current attack phase index
  bossAtkTimer: 0,
  bossDir: 1,
  bossSpawned: false,
  bossSummoned: false,
  // Completion
  levelCompleteTimer: 0,
  levelCompleteDone: false,
};

// References to game globals
let scene, playerMesh, enemies, bullets, eBullets, pups, particles, clouds;
let gameTime, elapsed;
let hudElements = {};

// ============================================================
// 编队生成
// ============================================================
function spawnFormation(pattern, count, isElite) {
  if (!scene || !enemies) return;
  
  const zStart = rand(-28, -20);
  const cx = 0, cy = rand(-1, 1);
  const spacing = 1.8;
  const vSpacing = 1.5;
  
  const positions = [];
  
  switch (pattern) {
    case 'line': {
      // 水平横排
      for (let i = 0; i < count; i++) {
        const x = cx + (i - Math.floor(count / 2)) * spacing;
        positions.push({ x: clamp(x, -8, 8), y: cy, z: zStart });
      }
      break;
    }
    case 'v': {
      // V 字编队
      let idx = 0;
      for (let row = 0; row < Math.ceil(count / 2); row++) {
        for (let side = -1; side <= 1; side += 2) {
          if (idx >= count) break;
          const x = side * (row + 0.5) * spacing * 0.7;
          const y = cy + row * vSpacing * 0.5;
          positions.push({ x: clamp(x, -8, 8), y: clamp(y, -4, 5), z: zStart - row * 1.5 });
          idx++;
        }
      }
      break;
    }
    case 'double_v': {
      // 双 V 字（上下交错）
      const mid = Math.floor(count / 2);
      for (let i = 0; i < count; i++) {
        const row = Math.floor(i / 3);
        const col = i % 3;
        const x = (col - 1) * spacing * 0.8;
        const yOffset = (i < mid ? -1.5 : 1.5);
        positions.push({
          x: clamp(x + (row * 0.5 * (i < mid ? 1 : -1)), -8, 8),
          y: clamp(cy + yOffset + row * 0.8, -4, 5),
          z: zStart - row * 1.2
        });
      }
      break;
    }
    case 'swarm': {
      // 蜂群散点
      for (let i = 0; i < count; i++) {
        positions.push({
          x: clamp(rand(-7, 7), -8, 8),
          y: clamp(rand(-3, 4), -4, 5),
          z: zStart + rand(-3, 3)
        });
      }
      break;
    }
    case 'pincer': {
      // 左右包夹
      const half = Math.ceil(count / 2);
      for (let i = 0; i < half; i++) {
        positions.push({ x: -8 + i * 2, y: cy + rand(-1, 1), z: zStart + i * 1.5 });
      }
      for (let i = 0; i < count - half; i++) {
        positions.push({ x: 8 - i * 2, y: cy + rand(-1, 1), z: zStart + i * 1.5 });
      }
      break;
    }
    case 'shield': {
      // 护卫阵型（精英居中，普通环绕）
      const eliteCount = isElite ? 1 : 0;
      const normCount = count - eliteCount;
      
      // 精英在中心稍后
      if (isElite) {
        positions.push({ x: cx, y: cy, z: zStart, isElite: true });
      }
      // 普通护卫环绕
      const angleStep = (Math.PI * 2) / Math.max(normCount, 1);
      for (let i = 0; i < normCount; i++) {
        const angle = i * angleStep;
        const r = 2.0;
        positions.push({
          x: clamp(cx + Math.cos(angle) * r, -8, 8),
          y: clamp(cy + Math.sin(angle) * r * 0.6, -4, 5),
          z: zStart + Math.sin(angle) * 1.5
        });
      }
      break;
    }
  }
  
  // 生成敌人
  const diff = Math.min((gameTime || 0) / 120, 1);
  for (const pos of positions) {
    const elite = pos.isElite === true;
    const mesh = makeEnemy(elite);
    mesh.position.set(pos.x, pos.y, pos.z);
    scene.add(mesh);
    
    const eSpeed = (elite ? 3 : 5) + diff * 8;
    const eHP = elite ? (2 + Math.floor(diff * 3)) : 1;
    
    enemies.push({
      mesh: mesh,
      elite: elite,
      hp: eHP,
      maxHp: eHP,
      speed: eSpeed,
      st: elite ? rand(1.5, 3) : 0,
      wb: rand(0, Math.PI * 2),
      isBoss: false,
      hitRadius: elite ? 1.5 : 1.0,
    });
  }
}

// ============================================================
// Boss 创建
// ============================================================
function createBoss(levelIdx) {
  if (!scene || !enemies) return;
  
  // 创建大型 Boss 模型
  const bossMesh = makeEnemy(true);  // 基于精英模型
  // 大幅放大
  bossMesh.scale.set(2.5, 2.5, 2.5);
  bossMesh.position.set(0, 1, -20);
  scene.add(bossMesh);
  
  // 添加光晕环
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xff3333,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.05, 8, 24), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, 0, -0.5);
  bossMesh.add(ring);
  
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.03, 8, 24), ringMat);
  ring2.rotation.x = Math.PI / 2 + 0.3;
  ring2.position.set(0, 0, -0.8);
  bossMesh.add(ring2);
  
  // Boss 数据
  const maxHP = 15 + levelIdx * 10;  // Lv1: 25, Lv2: 35, Lv3: 45
  const bossObj = {
    mesh: bossMesh,
    hp: maxHP,
    maxHP: maxHP,
    phase: 0,               // 0, 1, 2
    attackTimer: 2.0,
    direction: 1,
    moveSpeed: 1.2 + levelIdx * 0.2,
    targetZ: -11,
    // 攻击模式
    patterns: [
      { type: 'aimed', interval: 2.0 },
      { type: 'spread', interval: 1.5 },
      { type: 'spiral', interval: 1.0 },
    ],
    summonsDone: false,
    summonHP: Math.floor(maxHP * 0.4),  // 40% HP 时召唤
    levelIdx: levelIdx,
  };
  
  // 作为特殊敌人加入碰撞检测
  enemies.push({
    mesh: bossMesh,
    elite: true,
    isBoss: true,
    hp: maxHP,
    maxHp: maxHP,
    speed: 0,            // 由 LevelManager 控制移动
    st: 999,             // 禁止普通射击
    wb: 0,
    hitRadius: 3.0,
    bossRef: bossObj,
  });
  
  state.boss = bossObj;
  state.bossHP = maxHP;
  state.bossMaxHP = maxHP;
  state.bossPhase = 0;
  state.bossAtkTimer = 2.0;
  state.bossSpawned = true;
  state.bossSummoned = false;
}

function updateBoss(dt, playerPos) {
  const boss = state.boss;
  if (!boss) return;
  
  // 保持在目标 Z 距离
  const targetZ = boss.targetZ;
  boss.mesh.position.z += (targetZ - boss.mesh.position.z) * dt * 1.5;
  
  // 左右平移
  if (boss.mesh.position.x > 6) boss.direction = -1;
  else if (boss.mesh.position.x < -6) boss.direction = 1;
  boss.mesh.position.x += boss.direction * boss.moveSpeed * dt;
  
  // 上下浮动
  boss.mesh.position.y += Math.sin(Date.now() * 0.002 + boss.mesh.position.x * 0.5) * dt * 0.5;
  
  // 攻击
  boss.attackTimer -= dt;
  if (boss.attackTimer <= 0) {
    const pattern = boss.patterns[boss.phase];
    boss.attackTimer = pattern.interval;
    bossAttack(boss, pattern, playerPos);
  }
  
  // 阶段转换检测
  const hpRatio = boss.hp / boss.maxHP;
  if (hpRatio < 0.66 && boss.phase < 1) {
    boss.phase = 1;
    // 阶段转换特效
    burstGlow(boss.mesh.position.clone());
  }
  if (hpRatio < 0.33 && boss.phase < 2) {
    boss.phase = 2;
    burstGlow(boss.mesh.position.clone());
  }
  
  // 召唤检查
  if (!boss.summonsDone && hpRatio < 0.4) {
    boss.summonsDone = true;
    // 召唤 2 架小敌机
    for (let i = 0; i < 2; i++) {
      spawnFormation('line', 1, false);
    }
    showMessage('⚠️ Boss 召唤了护卫！');
  }
}

function bossAttack(boss, pattern, playerPos) {
  const pos = boss.mesh.position;
  const pp = playerPos || { x: 0, y: 0 };
  
  switch (pattern.type) {
    case 'aimed':
      // 瞄准射击
      addEBullet(pos.x, pos.y - 0.5, pos.z, pp.x, pp.y);
      break;
    case 'spread':
      // 散射
      addEBullet(pos.x, pos.y - 0.5, pos.z, pp.x - 1, pp.y);
      addEBullet(pos.x, pos.y - 0.5, pos.z, pp.x, pp.y);
      addEBullet(pos.x, pos.y - 0.5, pos.z, pp.x + 1, pp.y);
      break;
    case 'spiral':
      // 螺旋弹幕 — 4 方向
      const angles = [0, Math.PI/4, Math.PI/2, 3*Math.PI/4, Math.PI, 5*Math.PI/4, 3*Math.PI/2, 7*Math.PI/4];
      for (const a of angles) {
        const tx = pp.x + Math.cos(a + Date.now() * 0.003) * 3;
        const ty = pp.y + Math.sin(a + Date.now() * 0.003) * 3;
        addEBullet(pos.x, pos.y, pos.z, tx, ty);
      }
      break;
  }
}

function burstGlow(position) {
  // 阶段转换爆发特效
  if (typeof explodeAt === 'function') {
    explodeAt(position, 25);
  }
}

// ============================================================
// 消息系统
// ============================================================
let msgTimeout = null;

function showMessage(text) {
  const el = document.getElementById('level-msg');
  if (!el) return;
  el.textContent = text;
  el.classList.remove('hidden');
  el.style.opacity = '1';
  
  if (msgTimeout) clearTimeout(msgTimeout);
  msgTimeout = setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.classList.add('hidden'), 500);
  }, 2500);
}

function showLevelIntro(levelIdx) {
  const level = LEVELS[levelIdx];
  if (!level) return;
  
  const el = document.getElementById('level-announce');
  if (!el) return;
  
  const nameEl = document.getElementById('level-name');
  const subEl = document.getElementById('level-subtitle');
  if (nameEl) nameEl.textContent = `关卡 ${levelIdx + 1}: ${level.name}`;
  if (subEl) subEl.textContent = level.subtitle;
  
  el.classList.remove('hidden');
  
  setTimeout(() => {
    el.classList.add('hidden');
  }, 2500);
  
  // 更新 HUD 关卡指示
  const hudEl = document.getElementById('level-indicator');
  if (hudEl) {
    hudEl.textContent = `关卡 ${levelIdx + 1}: ${level.name}`;
  }
}

// ============================================================
// 环境过渡
// ============================================================
function changeBackground(targetColor) {
  if (!scene) return;
  
  // 使用过渡动画（在 update 中做 lerp）
  state.targetBgColor = targetColor;
  if (state.currentBgColor === undefined) {
    state.currentBgColor = targetColor;
    if (scene.background) {
      state.currentBgColor = scene.background.getHex();
    }
  }
}

function updateBackground(dt) {
  if (!scene || state.targetBgColor === undefined) return;
  if (state.currentBgColor === state.targetBgColor) return;
  
  // 颜色 lerp
  const c1 = new THREE.Color(state.currentBgColor);
  const c2 = new THREE.Color(state.targetBgColor);
  c1.lerp(c2, dt * 1.5);
  state.currentBgColor = c1.getHex();
  scene.background = c1;
  
  // 雾也跟随
  if (scene.fog) {
    scene.fog.color.copy(c1);
  }
}

// ============================================================
// 核心 API
// ============================================================
const LevelManager = {
  // 初始化：传入游戏模块引用
  init(refs) {
    scene = refs.scene;
    playerMesh = refs.playerMesh;
    enemies = refs.enemies;
    bullets = refs.bullets;
    eBullets = refs.eBullets;
    pups = refs.pups;
    particles = refs.particles;
    clouds = refs.clouds;
  },
  
  // 游戏开始时调用
  startGame() {
    state.currentLevel = 0;
    state.currentWave = 0;
    state.phase = LEVEL_PHASE.LEVEL_INTRO;
    state.phaseTimer = 0;
    state.waveTimer = 0;
    state.spawnQueue = [];
    state.spawnTimer = 0;
    state.levelTime = 0;
    state.boss = null;
    state.bossSpawned = false;
    state.levelCompleteTimer = 0;
    state.levelCompleteDone = false;
    state.currentBgColor = undefined;
    state.targetBgColor = undefined;
    
    // 隐藏 Boss HP 条
    const bossBar = document.getElementById('boss-hp-container');
    if (bossBar) bossBar.classList.add('hidden');
    
    showLevelIntro(0);
    
    // 设置环境
    const level = LEVELS[0];
    if (level) {
      changeBackground(level.bgColor);
    }
  },
  
  // 每帧更新
  update(dt, elapsedTime, gameTimeValue, playerPos) {
    if (state.phase === LEVEL_PHASE.IDLE) return;
    
    elapsed = elapsedTime;
    gameTime = gameTimeValue;
    state.levelTime += dt;
    
    // 环境过渡
    updateBackground(dt);
    
    // Boss 更新
    if (state.boss && state.bossSpawned) {
      updateBoss(dt, playerPos);
    }
    
    switch (state.phase) {
      case LEVEL_PHASE.LEVEL_INTRO: {
        state.phaseTimer += dt;
        if (state.phaseTimer > 3.0) {
          state.phase = LEVEL_PHASE.SPAWNING;
          state.phaseTimer = 0;
        }
        break;
      }
      
      case LEVEL_PHASE.SPAWNING: {
        const level = LEVELS[state.currentLevel];
        if (!level || state.currentWave >= level.waves.length) {
          // 所有波次完成
          state.phase = LEVEL_PHASE.LEVEL_COMPLETE;
          state.levelCompleteTimer = 0;
          break;
        }
        
        const wave = level.waves[state.currentWave];
        
        // 休息波次
        if (wave.type === 'rest') {
          state.phase = LEVEL_PHASE.WAVE_BREAK;
          state.phaseTimer = 0;
          state.waveTimer = wave.delay || 3.0;
          if (wave.msg) showMessage(wave.msg);
          break;
        }
        
        // Boss 开始
        if (wave.type === 'boss_start') {
          state.phase = LEVEL_PHASE.BOSS_INTRO;
          state.phaseTimer = 0;
          if (wave.msg) showMessage(wave.msg);
          break;
        }
        
        // 常规编队
        state.spawnTimer += dt;
        if (state.spawnTimer >= (wave.delay || 1.5)) {
          state.spawnTimer = 0;
          spawnFormation(wave.formation, wave.count, wave.elite || false);
          if (wave.msg) showMessage(wave.msg);
          state.currentWave++;
        }
        break;
      }
      
      case LEVEL_PHASE.WAVE_BREAK: {
        state.phaseTimer += dt;
        // 检测是否所有敌人都被消灭
        const activeEnemies = enemies.filter(e => !e.isBoss).length;
        if (activeEnemies === 0 && state.phaseTimer > (state.waveTimer || 3.0)) {
          state.currentWave++;
          state.phase = LEVEL_PHASE.SPAWNING;
          state.spawnTimer = 0;
        }
        break;
      }
      
      case LEVEL_PHASE.BOSS_INTRO: {
        state.phaseTimer += dt;
        if (state.phaseTimer > 2.0) {
          createBoss(state.currentLevel);
          state.phase = LEVEL_PHASE.BOSS_FIGHT;
          // 显示 Boss HP 条
          const bossBar = document.getElementById('boss-hp-container');
          if (bossBar) {
            bossBar.classList.remove('hidden');
          }
        }
        break;
      }
      
      case LEVEL_PHASE.BOSS_FIGHT: {
        // 更新 Boss HP UI
        updateBossUI();
        
        // Boss 被击败检测
        if (state.boss && state.boss.hp <= 0) {
          state.phase = LEVEL_PHASE.LEVEL_COMPLETE;
          state.levelCompleteTimer = 0;
          // 隐藏 Boss HP 条
          const bossBar = document.getElementById('boss-hp-container');
          if (bossBar) bossBar.classList.add('hidden');
          
          // Boss 爆炸效果
          if (typeof explodeAt === 'function') {
            explodeAt(state.boss.mesh.position, 40);
            // 延迟第二次
            setTimeout(() => {
              if (state.boss && state.boss.mesh) {
                explodeAt(state.boss.mesh.position, 30);
                scene.remove(state.boss.mesh);
              }
            }, 300);
          }
          
          // 清除 Boss 引用
          setTimeout(() => {
            state.boss = null;
            state.bossSpawned = false;
          }, 500);
        }
        break;
      }
      
      case LEVEL_PHASE.LEVEL_COMPLETE: {
        state.levelCompleteTimer += dt;
        if (!state.levelCompleteDone) {
          state.levelCompleteDone = true;
          // Boss 或最后一个敌人都已清理
          const hasEnemies = enemies.some(e => !e.isBoss);
          if (!hasEnemies) {
            showMessage(`🏆 关卡 ${state.currentLevel + 1} 完成！`);
            
            // 关卡完成加分
            setTimeout(() => {
              // 检查是否有下一关
              if (state.currentLevel + 1 < LEVELS.length) {
                showMessage('正在进入下一关...');
                setTimeout(() => {
                  nextLevel();
                }, 2000);
              } else {
                showMessage('🎉 全部关卡通关！');
                // 返回无尽模式
                setTimeout(() => {
                  // 游戏通关后进入无尽模式
                  state.phase = LEVEL_PHASE.IDLE;
                  // 恢复 RNG 刷怪
                  window.useLevelSystem = false;
                  showMessage('进入无尽模式！挑战最高分！');
                }, 3000);
              }
            }, 1000);
          }
        }
        break;
      }
    }
  },
  
  // 获取当前关卡索引
  getCurrentLevel() {
    return state.currentLevel;
  },
  
  // 获取关卡进度 (0-1)
  getLevelProgress() {
    const level = LEVELS[state.currentLevel];
    if (!level) return 1;
    return state.currentWave / level.waves.length;
  },
  
  // 是否是 Boss 战
  isBossFight() {
    return state.phase === LEVEL_PHASE.BOSS_FIGHT;
  },
  
  // 获取 Boss HP
  getBossHP() {
    if (!state.boss) return null;
    return { current: state.boss.hp, max: state.bossMaxHP };
  },
};

// Boss HP UI 更新
function updateBossUI() {
  if (!state.boss) return;
  const fillEl = document.getElementById('boss-hp-fill');
  if (!fillEl) return;
  const ratio = state.boss.hp / state.bossMaxHP;
  fillEl.style.width = Math.max(0, ratio * 100) + '%';
  
  // 颜色随血量和阶段变化
  if (ratio > 0.66) {
    fillEl.style.background = 'linear-gradient(90deg, #4CAF50, #8BC34A)';
  } else if (ratio > 0.33) {
    fillEl.style.background = 'linear-gradient(90deg, #FF9800, #FFC107)';
  } else {
    fillEl.style.background = 'linear-gradient(90deg, #f44336, #FF5722)';
  }
}

function nextLevel() {
  state.currentLevel++;
  state.currentWave = 0;
  state.phase = LEVEL_PHASE.LEVEL_INTRO;
  state.phaseTimer = 0;
  state.spawnTimer = 0;
  state.levelTime = 0;
  state.levelCompleteDone = false;
  state.levelCompleteTimer = 0;
  
  // 清理剩余敌人
  for (let i = enemies.length - 1; i >= 0; i--) {
    scene.remove(enemies[i].mesh);
  }
  enemies.length = 0;
  
  // 关卡介绍
  const level = LEVELS[state.currentLevel];
  if (level) {
    changeBackground(level.bgColor);
  }
  showLevelIntro(state.currentLevel);
  
  // 恢复关卡系统控制
  window.useLevelSystem = true;
}

// ============================================================
// 工具函数
// ============================================================
function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }
function rand(mn, mx) { return Math.random() * (mx - mn) + mn; }

// 暴露全局
window.LevelManager = LevelManager;
window.LEVEL_PHASE = LEVEL_PHASE;

})();
