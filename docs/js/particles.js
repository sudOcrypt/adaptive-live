// Particle background: subtle, tough gold particles (performance-optimized)
(function () {
    const canvas = document.getElementById('particles');
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    let width, height, particles = [];

    const prefersReducedMotion =
        !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

    // Animation state
    let rafId = 0;
    let running = true;

    // Idle throttling
    const IDLE_MS = 10000;
    let idleTimer = 0;
    let idleMode = false;

    // In idle, we update less frequently + emit less
    let frameSkip = prefersReducedMotion ? 3 : 0;          // 0 = full rate, 1 = half, 2 = 1/3 ...
    let frameCounter = 0;

    // Podium rect caching (avoid layout thrash from getBoundingClientRect in hot loops)
    let podRect = null;
    let podRectDirty = true;
    let podRectRefreshTimer = 0;

    function markActive() {
        // Restore full rate immediately on interaction
        clearTimeout(idleTimer);
        if (idleMode) {
            idleMode = false;
            frameSkip = prefersReducedMotion ? 3 : 0;
        }
        idleTimer = setTimeout(() => {
            idleMode = true;
            frameSkip = prefersReducedMotion ? 4 : 2; // ~1/3 rate normally, ~1/5 if reduced-motion
        }, IDLE_MS);
    }

    // A few events that represent "activity"
    ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"].forEach(evt => {
        window.addEventListener(evt, markActive, { passive: true });
    });
    markActive();

    function resize() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
        podRectDirty = true;
    }
    window.addEventListener('resize', resize, { passive: true });
    resize();

    function rand(min, max) { return Math.random() * (max - min) + min; }

    function desiredParticleCount() {
        // Reduce particle density noticeably in reduced motion / idle
        const base = Math.round((width * height) / 60000);
        const min = 30;
        if (prefersReducedMotion) return Math.max(min, Math.round(base * 0.45));
        if (idleMode) return Math.max(min, Math.round(base * 0.55));
        return Math.max(min, base);
    }

    function createParticles(count = desiredParticleCount()) {
        particles = [];
        for (let i = 0; i < count; i++) {
            const size = rand(1.8, 6.5);
            particles.push({
                x: rand(0, width),
                y: rand(0, height),
                vx: rand(-0.25, 0.25),
                vy: rand(-0.15, -0.6),
                size,
                life: rand(8, 20),
                ttl: 0,
                rot: rand(0, Math.PI * 2),
                rotSpeed: rand(-0.02, 0.02),
                hue: rand(40, 48), // gold-y hue
                alpha: rand(0.08, 0.22)
            });
        }
    }
    createParticles();

    function refreshPodRect() {
        if (!podRectDirty) return;
        const pod = document.getElementById('pod-1');
        if (!pod) {
            podRect = null;
            podRectDirty = false;
            return;
        }
        podRect = pod.getBoundingClientRect();
        podRectDirty = false;
    }

    // Mark rect dirty on things that can move layout (but don’t read rect immediately)
    window.addEventListener("scroll", () => { podRectDirty = true; }, { passive: true });

    // Periodic rect refresh (cheap) so sparkles stay attached even without scroll/resize events
    podRectRefreshTimer = window.setInterval(() => { podRectDirty = true; }, 1200);

    // Emit a few brighter, golden particles from the #1 podium to create "elite" status
    const ELITE_MAX = 300;

    function emitElite(count = 3) {
        // Disable nonessential effects in reduced motion; also stop elite bursts during idle.
        if (prefersReducedMotion || idleMode) return;

        refreshPodRect();
        if (!podRect) return;

        // avoid runaway particle growth
        if (particles.length > ELITE_MAX) return;

        const rect = podRect;
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;

        for (let i = 0; i < count; i++) {
            const size = rand(2.5, 6.5);
            particles.push({
                x: cx + rand(-rect.width * 0.25, rect.width * 0.25),
                y: cy + rand(-rect.height * 0.1, rect.height * 0.1),
                vx: rand(-0.6, 0.6),
                vy: rand(-0.6, -1.25),
                size,
                life: rand(4, 10),
                ttl: 0,
                rot: rand(0, Math.PI * 2),
                rotSpeed: rand(-0.04, 0.04),
                hue: rand(38, 50),
                alpha: rand(0.22, 0.7)
            });
        }
    }

    function emitSparkles(count = 2) {
        // Disable nonessential effects in reduced motion; also stop sparkles during idle.
        if (prefersReducedMotion || idleMode) return;

        refreshPodRect();
        if (!podRect) return;

        const rect = podRect;
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;

        for (let i = 0; i < count; i++) {
            particles.push({
                x: cx + rand(-rect.width * 0.35, rect.width * 0.35),
                y: cy + rand(-rect.height * 0.2, rect.height * 0.2),
                vx: rand(-0.4, 0.4),
                vy: rand(-0.4, -0.9),
                size: rand(0.9, 2.4),
                life: rand(2.5, 6),
                ttl: 0,
                rot: rand(0, Math.PI * 2),
                rotSpeed: rand(-0.06, 0.06),
                hue: rand(40, 50),
                alpha: rand(0.25, 0.7)
            });
        }
    }

    // Intervals (kept, but emission functions self-throttle in idle/reduced-motion)
    const eliteInterval = window.setInterval(() => {
        emitElite(Math.round(rand(1, 3)));
    }, 450);

    const sparkleInterval = window.setInterval(() => {
        emitSparkles(Math.round(rand(1, 3)));
    }, 220);

    function drawParticle(p) {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);

        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size * 2);
        g.addColorStop(0, `hsla(${p.hue}, 80%, 65%, 1)`);
        g.addColorStop(0.5, `hsla(${p.hue}, 70%, 55%, 0.6)`);
        g.addColorStop(1, `rgba(0,0,0,0)`);

        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function reconcileParticleCount() {
        const target = desiredParticleCount();
        const n = particles.length;

        if (n === target) return;

        // Prefer trimming rather than full rebuild (avoid spikes)
        if (n > target) {
            particles.length = target;
            return;
        }

        // Add gently up to target
        const add = Math.min(40, target - n);
        for (let i = 0; i < add; i++) {
            const size = rand(1.8, 6.5);
            particles.push({
                x: rand(0, width),
                y: rand(0, height),
                vx: rand(-0.25, 0.25),
                vy: rand(-0.15, -0.6),
                size,
                life: rand(8, 20),
                ttl: 0,
                rot: rand(0, Math.PI * 2),
                rotSpeed: rand(-0.02, 0.02),
                hue: rand(40, 48),
                alpha: rand(0.08, 0.22)
            });
        }
    }

    function step() {
        if (!running) return;

        // Throttle updates in idle / reduced-motion by skipping frames
        frameCounter++;
        if (frameSkip > 0 && (frameCounter % (frameSkip + 1)) !== 0) {
            rafId = requestAnimationFrame(step);
            return;
        }

        // keep particle count appropriate without rebuilding whole system
        reconcileParticleCount();

        ctx.clearRect(0, 0, width, height);

        // Use local vars (tiny perf win) and avoid additional DOM reads
        const w = width, h = height;

        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];

            p.x += p.vx;
            p.y += p.vy;
            p.rot += p.rotSpeed;

            // reduce per-frame math under reduced motion / idle
            const ttlStep = (idleMode || prefersReducedMotion) ? 0.02 : 0.01;
            p.ttl += ttlStep;

            // gentle wobble (skip wobble if reduced motion to reduce CPU)
            if (!prefersReducedMotion) {
                p.vx += Math.sin(p.ttl + i) * 0.0008;
            }

            if (p.y < -40 || p.x < -40 || p.x > w + 40 || p.ttl > p.life) {
                p.x = rand(-20, w + 20);
                p.y = h + rand(10, 80);
                p.vx = rand(-0.25, 0.25);
                p.vy = rand(-0.15, -0.6);
                p.ttl = 0;
                p.life = rand(8, 20);
                p.size = rand(1.8, 6.5);
                p.alpha = rand(0.06, 0.22);
            }

            drawParticle(p);
        }

        rafId = requestAnimationFrame(step);
    }

    function start() {
        if (running) return;
        running = true;
        frameCounter = 0;
        rafId = requestAnimationFrame(step);
    }

    function stop() {
        running = false;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = 0;
    }

    // Page Visibility API: pause when hidden, resume when visible
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            stop();
        } else {
            markActive();
            start();
        }
    });

    rafId = requestAnimationFrame(step);

    // recreate scaled particle count on big resize (debounced)
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            createParticles(desiredParticleCount());
            podRectDirty = true;
        }, 300);
    }, { passive: true });

    // Cleanup on unload (defensive)
    window.addEventListener("beforeunload", () => {
        stop();
        clearInterval(eliteInterval);
        clearInterval(sparkleInterval);
        clearInterval(podRectRefreshTimer);
        clearTimeout(idleTimer);
    });
})();
