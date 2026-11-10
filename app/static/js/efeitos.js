// Efeitos visuais. Nada aqui é necessário para o sistema funcionar:
// se este arquivo falhar, as páginas continuam iguais, só sem a tigela animada.
//
// A tigela 3D: um <canvas data-tigela> recebe uma tigela desenhada em
// "curvas de nível" (anéis horizontais + meridianos), com a sopa ondulando e
// o vapor subindo. É 3D de verdade, feito à mão: cada ponto (x, y, z) é girado
// e projetado com perspectiva. Sem biblioteca.
"use strict";

(() => {
  const reduzir = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  function tigela(canvas) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let largura = 0, altura = 0, cor = "#000";
    let visivel = true;
    let rodando = false;
    const inicio = performance.now();

    // ponteiro: a tigela inclina um pouco na direção do mouse
    let alvoX = 0, alvoY = 0, mouseX = 0, mouseY = 0;
    window.addEventListener("pointermove", (e) => {
      alvoX = (e.clientX / window.innerWidth - .5) * 2;
      alvoY = (e.clientY / window.innerHeight - .5) * 2;
    }, { passive: true });

    function medir() {
      const caixa = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      largura = caixa.width;
      altura = caixa.height;
      canvas.width = Math.max(1, Math.round(largura * dpr));
      canvas.height = Math.max(1, Math.round(altura * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cor = getComputedStyle(canvas).color;
      if (!rodando) desenhar(reduzir ? 4000 : performance.now() - inicio);
    }

    // ---------- geometria (unidade: raio da boca da tigela = 1) ----------
    const BOCA_Y = .12;              // altura da borda
    const SOPA_Y = -.04;             // nível da sopa
    const PHI0 = .2;                 // ângulo do fundo (não fecha num ponto)

    // perfil da parede: t = 0 no fundo, 1 na borda
    function parede(t) {
      const phi = PHI0 + t * (Math.PI / 2 - PHI0);
      return { r: Math.sin(phi), y: BOCA_Y - Math.cos(phi) * .8 };
    }
    // raio da tigela na altura da sopa
    const raioSopa = Math.sin(Math.acos((BOCA_Y - SOPA_Y) / .8));
    const fundo = parede(0);

    // ---------- projeção ----------
    let rot = 0, incl = .5, cx = 0, cy = 0, escala = 1;

    function projetar(x, y, z) {
      const cr = Math.cos(rot), sr = Math.sin(rot);
      const x1 = x * cr + z * sr;
      const z1 = -x * sr + z * cr;
      const ci = Math.cos(incl), si = Math.sin(incl);
      const y2 = y * ci + z1 * si;
      const z2 = -y * si + z1 * ci;
      const p = 3.4 / (3.4 + z2); // perspectiva
      return [cx + x1 * p * escala, cy - y2 * p * escala, z2];
    }

    // Traços agrupados por "profundidade": o que está atrás fica mais claro.
    const NIVEIS = 6;
    let baldes;
    function segmento(a, b) {
      const z = (a[2] + b[2]) / 2;
      const perto = Math.min(1, Math.max(0, (1.1 - z) / 2.2));
      const i = Math.min(NIVEIS - 1, Math.floor(perto * NIVEIS));
      baldes[i].moveTo(a[0], a[1]);
      baldes[i].lineTo(b[0], b[1]);
    }

    // desenha um anel horizontal; fracao < 1 desenha só parte (animação de entrada)
    function anel(r, y, fracao = 1, ondula = null) {
      const passos = 96;
      const ate = Math.round(passos * fracao);
      let anterior = null;
      for (let k = 0; k <= ate; k++) {
        const a = (k / passos) * Math.PI * 2;
        const dy = ondula ? ondula(a) : 0;
        const p = projetar(Math.cos(a) * r, y + dy, Math.sin(a) * r);
        if (anterior) segmento(anterior, p);
        anterior = p;
      }
    }

    function desenhar(ms) {
      const t = ms / 1000;
      if (!largura || !altura) return;
      ctx.clearRect(0, 0, largura, altura);

      escala = Math.min(largura * .36, altura * .4);
      cx = largura / 2;
      cy = altura * .6;

      mouseX += (alvoX - mouseX) * .05;
      mouseY += (alvoY - mouseY) * .05;
      rot = t * .22 + mouseX * .5;
      incl = .48 + mouseY * .14 + Math.sin(t * .6) * .03;

      // entrada: as linhas vão sendo "traçadas" no primeiro segundo e meio
      const entrada = reduzir ? 1 : 1 - Math.pow(1 - Math.min(1, t / 1.8), 3);

      baldes = Array.from({ length: NIVEIS }, () => new Path2D());

      // anéis da parede (as curvas de nível)
      const ANEIS = 12;
      for (let i = 0; i <= ANEIS; i++) {
        const { r, y } = parede(i / ANEIS);
        anel(r, y, Math.min(1, entrada * 1.4 - i * .02));
      }
      // espessura da borda
      anel(1.05, BOCA_Y + .01, entrada);

      // meridianos: são eles que deixam a rotação visível
      const MERIDIANOS = 28;
      const fatias = 22;
      for (let m = 0; m < MERIDIANOS; m++) {
        const a = (m / MERIDIANOS) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        const ate = Math.round(fatias * entrada);
        let anterior = null;
        for (let k = 0; k <= ate; k++) {
          const { r, y } = parede(k / fatias);
          const p = projetar(ca * r, y, sa * r);
          if (anterior) segmento(anterior, p);
          anterior = p;
        }
        if (ate === fatias) segmento(projetar(ca, BOCA_Y, sa), projetar(ca * 1.05, BOCA_Y + .01, sa * 1.05));
      }

      // pé da tigela
      const pe = .36, peBaixo = fundo.y - .12;
      anel(pe, fundo.y - .02, entrada);
      anel(pe * 1.05, peBaixo, entrada);
      for (let m = 0; m < 12; m++) {
        const a = (m / 12) * Math.PI * 2;
        segmento(projetar(Math.cos(a) * pe, fundo.y - .02, Math.sin(a) * pe),
                 projetar(Math.cos(a) * pe * 1.05, peBaixo, Math.sin(a) * pe * 1.05));
      }

      // a sopa: anéis concêntricos que ondulam, como um mapa topográfico
      const ONDAS = 6;
      for (let i = 1; i <= ONDAS; i++) {
        const r = raioSopa * (i / ONDAS) * .985;
        const fase = t * 1.6 - i * .9;
        anel(r, SOPA_Y, entrada, (a) => Math.sin(fase + a * 3) * .012 * (i / ONDAS) + Math.sin(fase * .7) * .01);
      }

      ctx.lineWidth = 1;
      ctx.lineCap = "round";
      ctx.strokeStyle = cor;
      for (let i = 0; i < NIVEIS; i++) {
        ctx.globalAlpha = .12 + (i / (NIVEIS - 1)) * .78;
        ctx.stroke(baldes[i]);
      }

      // vapor: três fios que sobem, ondulam e somem
      ctx.setLineDash([10, 9]);
      ctx.lineDashOffset = -t * 22;
      ctx.lineWidth = 1.3;
      [-.32, 0, .32].forEach((base, f) => {
        const passos = 34;
        let anterior = null;
        for (let k = 0; k <= passos; k++) {
          const s = k / passos;
          const y = SOPA_Y + .14 + s * 1.15;
          const desvio = Math.sin(s * 6 - t * 1.8 + f * 2.1) * .09 * (.3 + s);
          const p = projetar(base + desvio, y, Math.sin(t * .9 + f) * .05);
          if (anterior) {
            ctx.globalAlpha = Math.max(0, (1 - s) * .75 * entrada);
            ctx.beginPath();
            ctx.moveTo(anterior[0], anterior[1]);
            ctx.lineTo(p[0], p[1]);
            ctx.stroke();
          }
          anterior = p;
        }
      });
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    function quadro() {
      if (!visivel || document.hidden) { rodando = false; return; }
      desenhar(performance.now() - inicio);
      requestAnimationFrame(quadro);
    }

    function ligar() {
      if (reduzir || rodando || !visivel || document.hidden) return;
      rodando = true;
      requestAnimationFrame(quadro);
    }

    // Só anima enquanto está na tela (economiza bateria do celular/notebook)
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(([entrada]) => {
        visivel = entrada.isIntersecting;
        ligar();
      }).observe(canvas);
    }
    document.addEventListener("visibilitychange", ligar);

    if ("ResizeObserver" in window) new ResizeObserver(medir).observe(canvas);
    else window.addEventListener("resize", medir);

    medir();
    ligar();
  }

  document.querySelectorAll("canvas[data-tigela]").forEach((c) => {
    try { tigela(c); } catch (e) { console.warn("Tigela não desenhada:", e); }
  });
})();
