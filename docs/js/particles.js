// Particle background: subtle, tough gold particles
(function () {
    const canvas = document.getElementById('particles');
    const ctx = canvas.getContext('2d');
    let width, height, particles = [];

    function resize() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    function rand(min, max) { return Math.random() * (max - min) + min; }

    function createParticles(count = Math.round((width * height) / 60000)) {
        particles = [];
        for (let i = 0; i < Math.max(30, count); i++) {
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

    // Emit a few brighter, golden particles from the #1 podium to create "elite" status
    const ELITE_MAX = 300;
    function emitElite(count = 3) {
        const pod = document.getElementById('pod-1');
        if (!pod) return;
        // avoid runaway particle growth
        if (particles.length > ELITE_MAX) return;
        const rect = pod.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        for (let i = 0; i < count; i++) {
            const size = rand(2.5, 6.5);
            particles.push({
                x: cx + rand(-rect.width * 0.25, rect.width * 0.25),
                y: cy + rand(-rect.height * 0.1, rect.height * 0.1),
                vx: rand(-0.6, 0.6),
                vy: rand(-0.6, -1.25), // stronger upward motion
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

    // small sparkles near #1 to make the #1 spot more obvious (noticeable, not distracting)
    function emitSparkles(count = 2) {
        const pod = document.getElementById('pod-1');
        if (!pod) return;
        const rect = pod.getBoundingClientRect();
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

    // periodic small bursts from podium
    setInterval(() => {
        emitElite(Math.round(rand(1, 3)));
    }, 450);

    // more frequent small sparkles (makes #1 more prominent)
    setInterval(() => {
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

    function step() {
        ctx.clearRect(0, 0, width, height);
        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.rot += p.rotSpeed;
            p.ttl += 0.01;
            // gentle wobble
            p.vx += Math.sin(p.ttl + i) * 0.0008;
            // recycle when out of bounds or life exceeded
            if (p.y < -40 || p.x < -40 || p.x > width + 40 || p.ttl > p.life) {
                p.x = rand(-20, width + 20);
                p.y = height + rand(10, 80);
                p.vx = rand(-0.25, 0.25);
                p.vy = rand(-0.15, -0.6);
                p.ttl = 0;
                p.life = rand(8, 20);
                p.size = rand(1.8, 6.5);
                p.alpha = rand(0.06, 0.22);
            }
            drawParticle(p);
        }
        requestAnimationFrame(step);
    }
    requestAnimationFrame(step);

    // recreate scaled particle count on big resize
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => createParticles(), 300);
    });
})();