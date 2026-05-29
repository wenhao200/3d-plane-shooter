// THREE loaded via global script tag

// ============================================================
// CONSTANTS
// ============================================================
const CONFIG = {
    playerSpeed: 10,
    playerBoundary: { xMin: -9, xMax: 9, yMin: -5, yMax: 6 },
    bulletSpeed: 35,
    fireRate: 150,           // ms between shots
    enemySpawnBase: 2000,    // base spawn interval ms
    enemySpawnMin: 400,      // minimum spawn interval ms
    enemySpeedBase: 5,
    enemySpeedMax: 15,
    eliteSpawnChance: 0.15,
    maxLives: 3,
    invincibleDuration: 2000,
    powerUpDropChance: 0.25,
    fireLevelMax: 3,
    difficultyRampTime: 120, // seconds to reach max difficulty
};

// ============================================================
// UTILITY
// ============================================================
function lerp(a, b, t) { return a + (b - a) * t; }

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function rand(min, max) { return Math.random() * (max - min) + min; }

function randInt(min, max) { return Math.floor(rand(min, max + 1)); }

// ============================================================
// SCENE SETUP
// ============================================================
let scene, camera, renderer;
let clock = new THREE.Clock();

function initScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a4e);
    scene.fog = new THREE.Fog(0x1a1a4e, 30, 60);

    // Camera
    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 8, 14);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    document.getElementById('game-container').appendChild(renderer.domElement);

    // Lights
    const ambient = new THREE.AmbientLight(0x4466aa, 0.5);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffeedd, 2.0);
    sun.position.set(10, 20, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 1024;
    sun.shadow.mapSize.height = 1024;
    scene.add(sun);

    const fill = new THREE.DirectionalLight(0x88bbff, 0.6);
    fill.position.set(-10, 5, -10);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0x4488ff, 0.4);
    rim.position.set(0, -5, -10);
    scene.add(rim);

    // Resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Focus renderer canvas so keyboard events work
    renderer.domElement.setAttribute('tabindex', '0');
    renderer.domElement.focus();
}

// ============================================================
// BACKGROUND: STARS & CLOUDS
// ============================================================
const clouds = [];

function createStars() {
    const starsGeo = new THREE.BufferGeometry();
    const starCount = 1000;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i++) {
        positions[i] = rand(-60, 60);
    }
    starsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const starsMat = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.15,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
    });
    const stars = new THREE.Points(starsGeo, starsMat);
    stars.position.y = 15;
    scene.add(stars);

    // More distant small stars
    const tinyGeo = new THREE.BufferGeometry();
    const tinyCount = 2000;
    const tPos = new Float32Array(tinyCount * 3);
    for (let i = 0; i < tinyCount * 3; i++) {
        tPos[i] = rand(-80, 80);
    }
    tinyGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
    const tinyMat = new THREE.PointsMaterial({
        color: 0xaaccff,
        size: 0.05,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
    });
    const tinyStars = new THREE.Points(tinyGeo, tinyMat);
    tinyStars.position.y = 25;
    scene.add(tinyStars);
}

function createCloud() {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
        color: 0xeeeeff,
        transparent: true,
        opacity: 0.15,
        roughness: 1,
        metalness: 0,
    });
    const count = randInt(3, 6);
    for (let i = 0; i < count; i++) {
        const size = rand(1.5, 3.5);
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(size, 7, 7), mat);
        sphere.position.set(rand(-3, 3), rand(-0.5, 0.5), rand(-1, 1));
        sphere.scale.y = 0.5;
        group.add(sphere);
    }
    group.position.set(rand(-30, 30), rand(-3, 10), rand(-25, -5));
    const speed = rand(0.3, 0.8);
    scene.add(group);
    clouds.push({ mesh: group, speed, resetZ: rand(20, 30) });
}

function initClouds(count = 15) {
    for (let i = 0; i < count; i++) createCloud();
}

function updateClouds(delta) {
    for (const c of clouds) {
        c.mesh.position.z += c.speed * delta;
        if (c.mesh.position.z > c.resetZ) {
            c.mesh.position.z = rand(-30, -20);
            c.mesh.position.x = rand(-30, 30);
            c.mesh.position.y = rand(-3, 10);
        }
    }
}

// ============================================================
// PLAYER PLANE (CARTON STYLE)
// ============================================================
class Player {
    constructor() {
        this.mesh = this._createPlane();
        this.mesh.position.set(0, 0, 0);
        scene.add(this.mesh);

        // Engine glow
        this.engineGlow = this._createEngineGlow();
        this.mesh.add(this.engineGlow);

        // State
        this.position = new THREE.Vector3(0, 0, 0);
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.lives = CONFIG.maxLives;
        this.fireLevel = 1;
        this.invincible = false;
        this.invincibleTimer = 0;
        this.hitFlashTimer = 0;
        this.lastShotTime = 0;
        this.targetTilt = 0;

        // Propeller animation
        this.propeller = null;
        this._findPropeller();
    }

    _createPlane() {
        const group = new THREE.Group();

        // Colors
        const bodyColor = 0xFF6B35;
        const wingColor = 0xFF9A3C;
        const accentColor = 0x4FC3F7;

        // Fuselage (body)
        const bodyGeo = new THREE.CylinderGeometry(0.35, 0.4, 1.6, 10);
        bodyGeo.rotateX(Math.PI / 2);
        const bodyMat = new THREE.MeshStandardMaterial({
            color: bodyColor,
            roughness: 0.3,
            metalness: 0.1,
        });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.castShadow = true;
        group.add(body);

        // Nose cone
        const noseGeo = new THREE.ConeGeometry(0.35, 0.4, 10);
        noseGeo.rotateX(-Math.PI / 2);
        const noseMat = new THREE.MeshStandardMaterial({
            color: 0xFF8A50,
            roughness: 0.2,
            metalness: 0.2,
        });
        const nose = new THREE.Mesh(noseGeo, noseMat);
        nose.position.set(0, 0, 1.0);
        group.add(nose);

        // Main wings (simple rounded boxes)
        const wingMat = new THREE.MeshStandardMaterial({
            color: wingColor,
            roughness: 0.4,
            metalness: 0.1,
        });
        const wingGeo = new THREE.BoxGeometry(1.8, 0.06, 0.45);
        // Round the edges with a small bevel feel
        const wingLeft = new THREE.Mesh(wingGeo, wingMat);
        wingLeft.position.set(0, -0.12, 0.2);
        wingLeft.castShadow = true;
        group.add(wingLeft);

        const wingRight = new THREE.Mesh(wingGeo, wingMat);
        wingRight.position.set(0, 0.12, 0.2);
        group.add(wingRight);

        // Wing tip accents
        const tipMat = new THREE.MeshStandardMaterial({ color: 0xFFD54F, roughness: 0.5 });
        for (const sign of [-1, 1]) {
            for (const ySign of [-1, 1]) {
                const tip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.15, 0.08), tipMat);
                tip.position.set(sign * 0.92, ySign * 0.12, 0.25);
                group.add(tip);
            }
        }

        // Wing tips
        const tipMat = new THREE.MeshStandardMaterial({ color: 0xFFD54F, roughness: 0.5 });
        const tipGeo = new THREE.BoxGeometry(0.04, 0.15, 0.08);
        for (const sign of [-1, 1]) {
            for (const ySign of [-1, 1]) {
                const tip = new THREE.Mesh(tipGeo, tipMat);
                tip.position.set(sign * 1.05, ySign * 0.12, 0.25);
                group.add(tip);
            }
        }

        // Horizontal stabilizer (tail wings)
        const tailGeo = new THREE.BoxGeometry(0.4, 0.03, 0.15);
        const tailMat = new THREE.MeshStandardMaterial({ color: wingColor, roughness: 0.4 });
        for (const sign of [-1, 1]) {
            const tail = new THREE.Mesh(tailGeo, tailMat);
            tail.position.set(sign * 0.25, 0, -0.75);
            group.add(tail);
        }

        // Vertical stabilizer
        const vtailGeo = new THREE.BoxGeometry(0.03, 0.35, 0.2);
        vtailGeo.translate(0, 0.175, 0);
        const vtail = new THREE.Mesh(vtailGeo, new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.3 }));
        vtail.position.set(0, 0.05, -0.75);
        group.add(vtail);

        // Cockpit (transparent dome)
        const cockpitGeo = new THREE.SphereGeometry(0.18, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
        const cockpitMat = new THREE.MeshStandardMaterial({
            color: accentColor,
            transparent: true,
            opacity: 0.65,
            roughness: 0.1,
            metalness: 0.3,
        });
        const cockpit = new THREE.Mesh(cockpitGeo, cockpitMat);
        cockpit.position.set(0, 0.12, 0.35);
        cockpit.scale.set(1, 0.5, 0.8);
        group.add(cockpit);

        // Propeller (will be animated)
        const propGroup = new THREE.Group();
        const propMat = new THREE.MeshStandardMaterial({
            color: 0x555555,
            roughness: 0.6,
            metalness: 0.2,
        });
        for (const sign of [-1, 1]) {
            const blade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.4, 0.08), propMat);
            blade.position.set(0, sign * 0.2, 0);
            propGroup.add(blade);
        }
        // Hub
        const hub = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), propMat);
        propGroup.add(hub);
        propGroup.position.set(0, 0, 1.25);
        this.propeller = propGroup;
        group.add(propGroup);

        // Landing gear (cute little wheels)
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
        const wheelGeo = new THREE.SphereGeometry(0.06, 6, 6);
        for (const sign of [-1, 1]) {
            for (const z of [-0.5, 0.3]) {
                const wheel = new THREE.Mesh(wheelGeo, wheelMat);
                wheel.position.set(sign * 0.2, -0.2, z);
                wheel.scale.set(0.8, 0.6, 0.8);
                group.add(wheel);
            }
        }

        return group;
    }

    _createEngineGlow() {
        const glowGeo = new THREE.PlaneGeometry(0.25, 0.35);
        const glowMat = new THREE.MeshBasicMaterial({
            color: 0xff8833,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.position.set(0, 0, -0.85);
        return glow;
    }

    _findPropeller() {
        // Propeller is already set during _createPlane
    }

    update(delta, keys, time) {
        // Movement
        let moveX = 0, moveY = 0;
        if (keys['KeyW'] || keys['ArrowUp']) moveY = 1;
        if (keys['KeyS'] || keys['ArrowDown']) moveY = -1;
        if (keys['KeyA'] || keys['ArrowLeft']) moveX = -1;
        if (keys['KeyD'] || keys['ArrowRight']) moveX = 1;

        // Normalize diagonal
        if (moveX !== 0 && moveY !== 0) {
            const len = Math.SQRT1_2;
            moveX *= len;
            moveY *= len;
        }

        const speed = CONFIG.playerSpeed;
        this.velocity.x = moveX * speed;
        this.velocity.y = moveY * speed;

        this.position.x += this.velocity.x * delta;
        this.position.y += this.velocity.y * delta;

        // Boundaries
        this.position.x = clamp(this.position.x, CONFIG.playerBoundary.xMin, CONFIG.playerBoundary.xMax);
        this.position.y = clamp(this.position.y, CONFIG.playerBoundary.yMin, CONFIG.playerBoundary.yMax);

        // Smooth mesh follow
        this.mesh.position.lerp(this.position, 0.15);

        // Tilt on movement
        this.targetTilt = lerp(this.targetTilt, -moveX * 0.3, 0.1);
        this.mesh.rotation.z = lerp(this.mesh.rotation.z, this.targetTilt, 5 * delta);
        this.mesh.rotation.x = lerp(this.mesh.rotation.x, -moveY * 0.15, 5 * delta);

        // Bobbing
        this.mesh.position.y += Math.sin(time * 3) * 0.003;

        // Propeller spin
        if (this.propeller) {
            this.propeller.rotation.z += delta * 60;
        }

        // Invincibility
        if (this.invincible) {
            this.invincibleTimer -= delta * 1000;
            this.mesh.visible = Math.floor(this.invincibleTimer / 100) % 2 === 0;
            if (this.invincibleTimer <= 0) {
                this.invincible = false;
                this.mesh.visible = true;
            }
        }
    }

    shoot(time) {
        if (time - this.lastShotTime < CONFIG.fireRate) return null;
        this.lastShotTime = time;
        const pos = this.mesh.position.clone();
        pos.z += 0.8;
        const bullets = [];

        if (this.fireLevel === 1) {
            bullets.push({ x: pos.x, y: pos.y, z: pos.z, dx: 0, dy: 0 });
        } else if (this.fireLevel === 2) {
            bullets.push({ x: pos.x - 0.25, y: pos.y, z: pos.z, dx: -0.3, dy: 0 });
            bullets.push({ x: pos.x + 0.25, y: pos.y, z: pos.z, dx: 0.3, dy: 0 });
        } else if (this.fireLevel >= 3) {
            bullets.push({ x: pos.x, y: pos.y, z: pos.z, dx: 0, dy: 0 });
            bullets.push({ x: pos.x - 0.3, y: pos.y - 0.1, z: pos.z, dx: -0.3, dy: -0.1 });
            bullets.push({ x: pos.x + 0.3, y: pos.y + 0.1, z: pos.z, dx: 0.3, dy: 0.1 });
        }
        return bullets;
    }

    takeDamage() {
        if (this.invincible) return false;
        this.lives--;
        this.invincible = true;
        this.invincibleTimer = CONFIG.invincibleDuration;
        return true;
    }

    reset() {
        this.position.set(0, 0, 0);
        this.mesh.position.set(0, 0, 0);
        this.lives = CONFIG.maxLives;
        this.fireLevel = 1;
        this.invincible = true;
        this.invincibleTimer = CONFIG.invincibleDuration;
        this.mesh.visible = true;
    }
}

// ============================================================
// BULLETS
// ============================================================
const playerBullets = [];
const enemyBullets = [];

function createPlayerBullet(x, y, z, dx, dy) {
    const geo = new THREE.SphereGeometry(0.08, 6, 6);
    const mat = new THREE.MeshBasicMaterial({
        color: 0xffee44,
        transparent: true,
        opacity: 0.9,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    scene.add(mesh);

    // Glow
    const glowGeo = new THREE.SphereGeometry(0.12, 6, 6);
    const glowMat = new THREE.MeshBasicMaterial({
        color: 0xffaa00,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    mesh.add(glow);

    playerBullets.push({
        mesh,
        velocity: new THREE.Vector3(dx, dy, CONFIG.bulletSpeed),
        lifetime: 0,
        maxLifetime: 2.5,
    });
}

function createEnemyBullet(x, y, z, targetX, targetY) {
    const geo = new THREE.SphereGeometry(0.1, 6, 6);
    const mat = new THREE.MeshBasicMaterial({
        color: 0xff3333,
        transparent: true,
        opacity: 0.9,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    scene.add(mesh);

    const dir = new THREE.Vector3(targetX - x, targetY - y, -z).normalize();
    const speed = 12;

    enemyBullets.push({
        mesh,
        velocity: dir.multiplyScalar(speed),
        lifetime: 0,
        maxLifetime: 4,
    });
}

function updateBullets(delta) {
    // Player bullets
    for (let i = playerBullets.length - 1; i >= 0; i--) {
        const b = playerBullets[i];
        b.mesh.position.add(b.velocity.clone().multiplyScalar(delta));
        b.lifetime += delta;
        // Glow pulse
        const scale = 1 + Math.sin(b.lifetime * 20) * 0.3;
        b.mesh.children[0]?.scale.setScalar(scale);

        if (b.lifetime > b.maxLifetime || b.mesh.position.z > 25 || Math.abs(b.mesh.position.x) > 15 || Math.abs(b.mesh.position.y) > 12) {
            scene.remove(b.mesh);
            playerBullets.splice(i, 1);
        }
    }

    // Enemy bullets
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i];
        b.mesh.position.add(b.velocity.clone().multiplyScalar(delta));
        b.lifetime += delta;

        if (b.lifetime > b.maxLifetime || b.mesh.position.z > 10 || Math.abs(b.mesh.position.x) > 15 || Math.abs(b.mesh.position.y) > 12) {
            scene.remove(b.mesh);
            enemyBullets.splice(i, 1);
        }
    }
}

function clearAllBullets() {
    for (const b of playerBullets) scene.remove(b.mesh);
    for (const b of enemyBullets) scene.remove(b.mesh);
    playerBullets.length = 0;
    enemyBullets.length = 0;
}

// ============================================================
// ENEMIES
// ============================================================
const enemies = [];

function createEnemyModel(isElite) {
    const group = new THREE.Group();

    if (isElite) {
        // Elite enemy - bigger, darker, more menacing
        const bodyColor = 0x8B2252;
        const wingColor = 0x6B1540;
        const accentColor = 0xFF4444;

        // Body
        const bodyGeo = new THREE.CylinderGeometry(0.5, 0.6, 2.0, 10);
        bodyGeo.rotateX(Math.PI / 2);
        const bodyMat = new THREE.MeshStandardMaterial({
            color: bodyColor,
            roughness: 0.4,
            metalness: 0.3,
        });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.castShadow = true;
        group.add(body);

        // Nose
        const noseGeo = new THREE.ConeGeometry(0.5, 0.5, 10);
        noseGeo.rotateX(Math.PI / 2);
        const nose = new THREE.Mesh(noseGeo, bodyMat);
        nose.position.set(0, 0, -1.2);
        group.add(nose);

        // Wings
        const wingMat = new THREE.MeshStandardMaterial({ color: wingColor, roughness: 0.5, metalness: 0.2 });
        const wingGeo = new THREE.BoxGeometry(2.4, 0.06, 0.6);
        const wings = new THREE.Mesh(wingGeo, wingMat);
        wings.position.y = -0.1;
        group.add(wings);

        // Wing accents
        const accMat = new THREE.MeshStandardMaterial({ color: accentColor, emissive: accentColor, emissiveIntensity: 0.3 });
        for (const sign of [-1, 1]) {
            const tip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.1), accMat);
            tip.position.set(sign * 1.3, -0.1, 0);
            group.add(tip);
        }

        // Cockpit
        const cockpitMat = new THREE.MeshStandardMaterial({
            color: 0xff0000,
            emissive: 0xff0000,
            emissiveIntensity: 0.2,
            transparent: true,
            opacity: 0.6,
        });
        const cockpitGeo = new THREE.SphereGeometry(0.25, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
        const cockpit = new THREE.Mesh(cockpitGeo, cockpitMat);
        cockpit.position.set(0, 0.15, -0.4);
        cockpit.scale.set(1, 0.4, 0.8);
        group.add(cockpit);

        // Tail
        const tailMat = new THREE.MeshStandardMaterial({ color: wingColor });
        for (const sign of [-1, 1]) {
            const tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.2), tailMat);
            tail.position.set(sign * 0.35, 0, 1.0);
            group.add(tail);
        }
        const vtail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.4, 0.3), new THREE.MeshStandardMaterial({ color: bodyColor }));
        vtail.position.set(0, 0.1, 1.0);
        group.add(vtail);

        // Glow ring
        const ringGeo = new THREE.TorusGeometry(0.6, 0.03, 8, 20);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xff3333,
            transparent: true,
            opacity: 0.4,
            blending: THREE.AdditiveBlending,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.z = -0.3;
        ring.rotation.x = Math.PI / 2;
        group.add(ring);

    } else {
        // Normal enemy - small, cute red plane
        const bodyMat = new THREE.MeshStandardMaterial({
            color: 0xE53935,
            roughness: 0.4,
            metalness: 0.1,
        });
        const wingMat = new THREE.MeshStandardMaterial({
            color: 0xC62828,
            roughness: 0.5,
        });

        // Body
        const bodyGeo = new THREE.CylinderGeometry(0.25, 0.3, 1.2, 8);
        bodyGeo.rotateX(Math.PI / 2);
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.castShadow = true;
        group.add(body);

        // Nose
        const nose = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.3, 8), bodyMat);
        nose.rotateX(Math.PI / 2);
        nose.position.set(0, 0, -0.7);
        group.add(nose);

        // Wings
        const wingGeo = new THREE.BoxGeometry(1.2, 0.04, 0.3);
        const wings = new THREE.Mesh(wingGeo, wingMat);
        group.add(wings);

        // Tail
        const tailMat = new THREE.MeshStandardMaterial({ color: 0xC62828 });
        for (const sign of [-1, 1]) {
            const tail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.1), tailMat);
            tail.position.set(sign * 0.15, 0, 0.6);
            group.add(tail);
        }

        // Cockpit (simple)
        const cockpitMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.3,
        });
        const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), cockpitMat);
        cockpit.position.set(0, 0.08, -0.2);
        cockpit.scale.set(1, 0.4, 0.6);
        group.add(cockpit);
    }

    return group;
}

function spawnEnemy(gameTime) {
    const difficulty = Math.min(gameTime / CONFIG.difficultyRampTime, 1);
    const isElite = Math.random() < CONFIG.eliteSpawnChance * (1 + difficulty);

    const mesh = createEnemyModel(isElite);
    const x = rand(CONFIG.playerBoundary.xMin + 1, CONFIG.playerBoundary.xMax - 1);
    const y = rand(CONFIG.playerBoundary.yMin + 1, CONFIG.playerBoundary.yMax - 1);
    const z = rand(-30, -18);
    mesh.position.set(x, y, z);
    mesh.rotation.x = Math.PI; // face toward player
    scene.add(mesh);

    // Speed scales with difficulty
    const speed = CONFIG.enemySpeedBase + difficulty * (CONFIG.enemySpeedMax - CONFIG.enemySpeedBase);
    const speedMult = isElite ? 0.6 : 1;

    // HP scales with game time
    const hp = isElite ? 2 + Math.floor(difficulty * 3) : 1;

    enemies.push({
        mesh,
        isElite,
        hp,
        maxHp: hp,
        speed: speed * speedMult,
        wobblePhase: rand(0, Math.PI * 2),
        shootTimer: isElite ? rand(1, 3) : 0,
    });
}

function updateEnemies(delta, gameTime, playerPos) {
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        // Move toward player
        e.mesh.position.z += e.speed * delta;

        // Wobble
        if (!e.isElite) {
            e.wobblePhase += delta * 3;
            e.mesh.position.x += Math.sin(e.wobblePhase) * delta * 0.5;
        }

        // Elite shoot logic
        if (e.isElite) {
            e.shootTimer -= delta;
            if (e.shootTimer <= 0 && e.mesh.position.z < -3) {
                const pos = e.mesh.position;
                createEnemyBullet(pos.x, pos.y, pos.z, playerPos.x, playerPos.y);
                e.shootTimer = rand(1.5, 3) * (1 - Math.min(gameTime / CONFIG.difficultyRampTime, 1) * 0.3);
            }
        }

        // Remove if past player
        if (e.mesh.position.z > 8) {
            scene.remove(e.mesh);
            enemies.splice(i, 1);
        }
    }
}

// ============================================================
// POWER-UPS
// ============================================================
const powerups = [];

function spawnPowerup(x, y, z) {
    const type = Math.random() < 0.6 ? 'fire' : 'health';
    const group = new THREE.Group();

    if (type === 'fire') {
        // Fire power-up - floating orange cube with glow
        const geo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
        const mat = new THREE.MeshStandardMaterial({
            color: 0xFF6B00,
            emissive: 0xFF4400,
            emissiveIntensity: 0.5,
            roughness: 0.3,
            metalness: 0.2,
        });
        const cube = new THREE.Mesh(geo, mat);
        cube.rotation.x = Math.PI / 4;
        cube.rotation.z = Math.PI / 4;
        group.add(cube);

        // Glow
        const glowGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        const glowMat = new THREE.MeshBasicMaterial({
            color: 0xff6600,
            transparent: true,
            opacity: 0.2,
            blending: THREE.AdditiveBlending,
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        group.add(glow);

        // "F" letter (simple cross bars)
        const fMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const bar1 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.04), fMat);
        bar1.position.set(0, 0.08, 0.05);
        group.add(bar1);
        const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.04), fMat);
        bar2.position.set(-0.07, 0, 0.05);
        group.add(bar2);
        const bar3 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.04, 0.04), fMat);
        bar3.position.set(0, -0.06, 0.05);
        group.add(bar3);

    } else {
        // Health power-up - green cross/heart
        const mat = new THREE.MeshStandardMaterial({
            color: 0x00E676,
            emissive: 0x00C853,
            emissiveIntensity: 0.4,
            roughness: 0.3,
            metalness: 0.2,
        });

        // Cross shape
        const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.35, 0.1), mat);
        group.add(vBar);
        const hBar = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.1, 0.1), mat);
        group.add(hBar);

        // Glow
        const glowGeo = new THREE.SphereGeometry(0.3, 8, 8);
        const glowMat = new THREE.MeshBasicMaterial({
            color: 0x00ff66,
            transparent: true,
            opacity: 0.15,
            blending: THREE.AdditiveBlending,
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        group.add(glow);
    }

    group.position.set(x, y, z);

    // Small bounce toward player
    group.position.z += 1;

    scene.add(group);
    powerups.push({
        mesh: group,
        type,
        lifetime: 0,
        maxLifetime: 8,
        speed: 1.5,
    });
}

function updatePowerups(delta, playerPos) {
    for (let i = powerups.length - 1; i >= 0; i--) {
        const p = powerups[i];
        // Float toward player slowly
        p.mesh.position.z += p.speed * delta;
        // Bobbing + rotation
        p.lifetime += delta;
        p.mesh.position.y += Math.sin(p.lifetime * 4) * delta * 0.2;
        p.mesh.rotation.y += delta * 2;
        p.mesh.rotation.x = Math.sin(p.lifetime * 3) * 0.2;

        // Remove if expired or past player
        if (p.lifetime > p.maxLifetime || p.mesh.position.z > 8) {
            scene.remove(p.mesh);
            powerups.splice(i, 1);
        }
    }
}

function clearAllPowerups() {
    for (const p of powerups) scene.remove(p.mesh);
    powerups.length = 0;
}

// ============================================================
// PARTICLE SYSTEM
// ============================================================
const particles = [];

function createExplosion(position, color = 0xff6600, count = 20) {
    for (let i = 0; i < count; i++) {
        const size = rand(0.05, 0.15);
        const geo = new THREE.BoxGeometry(size, size, size);
        const mat = new THREE.MeshBasicMaterial({
            color: new THREE.Color().setHSL(0.05 + Math.random() * 0.1, 1, 0.5 + Math.random() * 0.4),
            transparent: true,
            blending: THREE.AdditiveBlending,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(position);

        const dir = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
        const speed = rand(3, 8);

        scene.add(mesh);
        particles.push({
            mesh,
            velocity: dir.multiplyScalar(speed),
            lifetime: 0,
            maxLifetime: rand(0.5, 1.2),
            spin: rand(-10, 10),
        });
    }

    // Flash
    const flashGeo = new THREE.SphereGeometry(0.5, 8, 8);
    const flashMat = new THREE.MeshBasicMaterial({
        color: 0xffffaa,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
    });
    const flash = new THREE.Mesh(flashGeo, flashMat);
    flash.position.copy(position);
    scene.add(flash);
    particles.push({
        mesh: flash,
        velocity: new THREE.Vector3(0, 0, 0),
        lifetime: 0,
        maxLifetime: 0.2,
        isFlash: true,
    });
}

function updateParticles(delta) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.mesh.position.add(p.velocity.clone().multiplyScalar(delta));
        p.lifetime += delta;

        if (p.isFlash) {
            p.mesh.scale.setScalar(1 + p.lifetime * 3);
            p.mesh.material.opacity = 0.8 * (1 - p.lifetime / p.maxLifetime);
        } else {
            p.velocity.multiplyScalar(0.97);
            p.mesh.rotation.x += p.spin * delta;
            p.mesh.rotation.y += p.spin * delta;
            const life = p.lifetime / p.maxLifetime;
            p.mesh.scale.setScalar(1 - life * 0.5);
            p.mesh.material.opacity = 1 - life;
        }

        if (p.lifetime >= p.maxLifetime) {
            scene.remove(p.mesh);
            particles.splice(i, 1);
        }
    }
}

function clearAllParticles() {
    for (const p of particles) scene.remove(p.mesh);
    particles.length = 0;
}

// ============================================================
// COLLISION DETECTION
// ============================================================
function checkCollisions(player) {
    const playerPos = player.mesh.position;
    const killCount = { normal: 0, elite: 0 };
    let playerHit = false;
    let droppedPowerups = [];

    // Player bullets vs enemies
    for (let bi = playerBullets.length - 1; bi >= 0; bi--) {
        const b = playerBullets[bi];
        for (let ei = enemies.length - 1; ei >= 0; ei--) {
            const e = enemies[ei];
            const dist = b.mesh.position.distanceTo(e.mesh.position);
            const hitRadius = e.isElite ? 0.8 : 0.5;
            if (dist < hitRadius) {
                // Hit!
                scene.remove(b.mesh);
                playerBullets.splice(bi, 1);

                e.hp--;
                if (e.hp <= 0) {
                    // Destroy enemy
                    createExplosion(e.mesh.position, e.isElite ? 0xff3333 : 0xff6600, e.isElite ? 35 : 20);
                    scene.remove(e.mesh);
                    enemies.splice(ei, 1);

                    if (e.isElite) {
                        killCount.elite++;
                        // Elite always drops something
                        droppedPowerups.push({
                            x: e.mesh.position.x,
                            y: e.mesh.position.y,
                            z: e.mesh.position.z,
                        });
                    } else {
                        killCount.normal++;
                        // Chance to drop
                        if (Math.random() < CONFIG.powerUpDropChance) {
                            droppedPowerups.push({
                                x: e.mesh.position.x,
                                y: e.mesh.position.y,
                                z: e.mesh.position.z,
                            });
                        }
                    }
                }
                break;
            }
        }
    }

    // Enemy bullets vs player
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i];
        const dist = b.mesh.position.distanceTo(playerPos);
        if (dist < 0.6) {
            scene.remove(b.mesh);
            enemyBullets.splice(i, 1);
            if (!playerHit) {
                playerHit = player.takeDamage();
            }
        }
    }

    // Enemies vs player
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        const dist = e.mesh.position.distanceTo(playerPos);
        const hitRadius = e.isElite ? 1.0 : 0.7;
        if (dist < hitRadius) {
            createExplosion(e.mesh.position, 0xff6600, 15);
            scene.remove(e.mesh);
            enemies.splice(i, 1);
            if (!playerHit) {
                playerHit = player.takeDamage();
            }
        }
    }

    // Powerups vs player
    for (let i = powerups.length - 1; i >= 0; i--) {
        const p = powerups[i];
        const dist = p.mesh.position.distanceTo(playerPos);
        if (dist < 1.0) {
            if (p.type === 'fire') {
                player.fireLevel = Math.min(player.fireLevel + 1, CONFIG.fireLevelMax);
                createExplosion(p.mesh.position, 0xff8800, 10);
            } else {
                player.lives = Math.min(player.lives + 1, CONFIG.maxLives);
                createExplosion(p.mesh.position, 0x00ff66, 10);
            }
            scene.remove(p.mesh);
            powerups.splice(i, 1);
        }
    }

    return { killCount, playerHit, droppedPowerups };
}

// ============================================================
// UI MANAGER
// ============================================================
const ui = {
    scoreValue: document.getElementById('score-value'),
    fireValue: document.getElementById('fire-value'),
    livesValue: document.getElementById('lives-value'),
    finalScore: document.getElementById('final-score-value'),
    killCount: document.getElementById('kill-count'),
    survivalTime: document.getElementById('survival-time'),
    maxFireLevel: document.getElementById('max-fire-level'),
    menuScreen: document.getElementById('menu-screen'),
    gameoverScreen: document.getElementById('gameover-screen'),
    hud: document.getElementById('hud'),
    comboDisplay: document.getElementById('combo-display'),
    comboValue: document.getElementById('combo-value'),
};

function updateHUD(score, lives, fireLevel, combo) {
    ui.scoreValue.textContent = score;
    ui.livesValue.textContent = '❤️'.repeat(Math.max(0, lives));
    ui.fireValue.textContent = '★'.repeat(fireLevel) + '☆'.repeat(CONFIG.fireLevelMax - fireLevel);

    if (combo > 1) {
        ui.comboDisplay.classList.remove('hidden');
        ui.comboValue.textContent = combo;
    } else {
        ui.comboDisplay.classList.add('hidden');
    }
}

function showMenu() {
    ui.menuScreen.classList.remove('hidden');
    ui.gameoverScreen.classList.add('hidden');
    ui.hud.classList.add('hidden');
}

function showPlaying() {
    ui.menuScreen.classList.add('hidden');
    ui.gameoverScreen.classList.add('hidden');
    ui.hud.classList.remove('hidden');
}

function showGameOver(score, kills, survivalSeconds, maxFire) {
    ui.menuScreen.classList.add('hidden');
    ui.gameoverScreen.classList.remove('hidden');
    ui.hud.classList.add('hidden');
    ui.finalScore.textContent = score;
    ui.killCount.textContent = kills;
    ui.survivalTime.textContent = `${Math.floor(survivalSeconds)}s`;
    const fireNames = ['', 'Lv.1', 'Lv.2', 'Lv.3'];
    ui.maxFireLevel.textContent = fireNames[maxFire] || 'Lv.3';
}

// ============================================================
// GAME STATE & MAIN LOOP
// ============================================================
const State = { MENU: 0, PLAYING: 1, GAME_OVER: 2 };
let gameState = State.MENU;
let game;
let keys = {};

class Game {
    constructor() {
        this.score = 0;
        this.kills = 0;
        this.eliteKills = 0;
        this.gameTime = 0;
        this.combo = 0;
        this.comboTimer = 0;
        this.lastEnemySpawn = 0;
        this.maxFireLevelReached = 1;
        this.player = new Player();
        this.cameraTarget = new THREE.Vector3(0, 8, 14);
    }

    start() {
        this.score = 0;
        this.kills = 0;
        this.eliteKills = 0;
        this.gameTime = 0;
        this.combo = 0;
        this.comboTimer = 0;
        this.lastEnemySpawn = 0;
        this.maxFireLevelReached = 1;

        clearAllBullets();
        clearAllPowerups();
        clearAllParticles();
        for (const e of enemies) scene.remove(e.mesh);
        enemies.length = 0;

        this.player.reset();
        showPlaying();
        gameState = State.PLAYING;
    }

    update(delta, time) {
        if (gameState !== State.PLAYING) return;

        this.gameTime += delta;

        // Player update
        this.player.update(delta, keys, time);

        // Shooting
        if (keys['Space'] && gameState === State.PLAYING) {
            const bullets = this.player.shoot(time * 1000);
            if (bullets) {
                for (const b of bullets) {
                    createPlayerBullet(b.x, b.y, b.z, b.dx, b.dy);
                }
            }
        }

        // Camera follow
        const pp = this.player.mesh.position;
        const targetX = pp.x * 0.3;
        const targetY = pp.y * 0.3 + 7;
        const targetZ = pp.z + 12;
        camera.position.x = lerp(camera.position.x, targetX, 3 * delta);
        camera.position.y = lerp(camera.position.y, targetY, 3 * delta);
        camera.position.z = lerp(camera.position.z, targetZ, 3 * delta);
        camera.lookAt(pp.x * 0.2, pp.y * 0.3, -2);

        // Spawn enemies
        const difficulty = Math.min(this.gameTime / CONFIG.difficultyRampTime, 1);
        const spawnInterval = CONFIG.enemySpawnBase - difficulty * (CONFIG.enemySpawnBase - CONFIG.enemySpawnMin);
        if (time * 1000 - this.lastEnemySpawn > spawnInterval) {
            spawnEnemy(this.gameTime);
            this.lastEnemySpawn = time * 1000;
        }

        // Update subsystems
        updateEnemies(delta, this.gameTime, this.player.position);
        updateBullets(delta);
        updatePowerups(delta, this.player.position);
        updateParticles(delta);
        updateClouds(delta);

        // Collisions
        const result = checkCollisions(this.player);

        // Handle drops
        for (const drop of result.droppedPowerups) {
            spawnPowerup(drop.x, drop.y, drop.z);
        }

        // Score
        const killScore = result.killCount.normal * 10 + result.killCount.elite * 50;
        if (killScore > 0) {
            this.combo++;
            this.comboTimer = 2;
            this.score += killScore * (1 + Math.floor(this.combo / 5) * 0.5);
        } else {
            this.comboTimer -= delta;
            if (this.comboTimer <= 0 && this.combo > 1) {
                this.combo = 0;
            }
        }

        // Time bonus
        this.score += delta * 0.5;

        this.kills += result.killCount.normal + result.killCount.elite;
        this.eliteKills += result.killCount.elite;
        this.maxFireLevelReached = Math.max(this.maxFireLevelReached, this.player.fireLevel);

        // HUD
        updateHUD(Math.floor(this.score), this.player.lives, this.player.fireLevel, this.combo);

        // Game over check
        if (this.player.lives <= 0) {
            this.gameOver();
        }
    }

    gameOver() {
        gameState = State.GAME_OVER;

        // Big explosion on player
        createExplosion(this.player.mesh.position, 0xff8800, 40);
        this.player.mesh.visible = false;

        setTimeout(() => {
            showGameOver(
                Math.floor(this.score),
                this.kills,
                this.gameTime,
                this.maxFireLevelReached
            );
        }, 800);
    }

    reset() {
        clearAllBullets();
        clearAllPowerups();
        clearAllParticles();
        for (const e of enemies) scene.remove(e.mesh);
        enemies.length = 0;
        this.player.reset();
    }
}

// ============================================================
// INPUT HANDLING
// ============================================================
function setupInput() {
    // Keyboard: listen on window
    window.addEventListener('keydown', function(e) {
        const code = e.code;
        const key = e.key;
        keys[code] = true;

        // Space = start game / shoot / restart
        if (code === 'Space' || key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            tryStartGame();
        }

        if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD'].includes(code)) {
            e.preventDefault();
        }
    });

    window.addEventListener('keyup', function(e) {
        keys[e.code] = false;
    });

    // Click anywhere to start when in menu/game-over
    document.addEventListener('click', function(e) {
        tryStartGame();
    });

    function tryStartGame() {
        if (gameState === State.MENU) {
            console.log('Starting game...');
            game.start();
        } else if (gameState === State.GAME_OVER) {
            console.log('Restarting game...');
            game.start();
        }
    }

    // Expose for HTML onclick
    window._startGame = tryStartGame;
}

// ============================================================
// GAME LOOP
// ============================================================
function animate() {
    requestAnimationFrame(animate);

    const delta = Math.min(clock.getDelta(), 0.05);
    const time = clock.elapsedTime;

    if (gameState === State.MENU) {
        // Demo mode - animate camera
        camera.position.x = Math.sin(time * 0.3) * 3;
        camera.position.y = 8 + Math.sin(time * 0.2) * 0.5;
        camera.lookAt(0, 0, -2);

        updateClouds(delta);
        updateParticles(delta);
    }

    if (gameState === State.PLAYING) {
        game.update(delta, time);
    }

    if (gameState === State.GAME_OVER) {
        // Continue updating visual effects
        updateClouds(delta);
        updateParticles(delta);
    }

    renderer.render(scene, camera);
}

// ============================================================
// INIT
// ============================================================
function boot() {
    try {
        initScene();
        createStars();
        initClouds(20);
        game = new Game();
        setupInput();
        showMenu();

        // Start game loop
        animate();

        // Log success
        console.log('✈️ 3D Plane Shooter loaded!');
        console.log('🎮 SPACE or Click anywhere to start');
    } catch (err) {
        console.error('Boot Error:', err);
        document.body.innerHTML = '<div style="color:white;padding:40px;text-align:center;font-family:sans-serif;font-size:20px;"><h1>游戏加载失败</h1><p style="color:red">' + err.message + '</p></div>';
    }
}

// Run after DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}
