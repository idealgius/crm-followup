/* =====================================================================
   BI — pagina della macro-sezione (Gruppo Autoscala CRM)
   ---------------------------------------------------------------------
   Si apre dalla card "BI" della home (MacroHome.openBI). Tre capitoli:
     01 Consegne    -> "Entra" apre l'area Consegne (Tempistiche / Analisi)
     02 Stock       -> prossimamente (pedana con i loghi dei marchi)
     03 Commerciale -> prossimamente (abitacolo digitale: lead, vendite, noleggio)
   I capitoli scorrono da soli (pausa con il mouse sopra), il cambio e' una
   lama di luce che attraversa il palco. Le animazioni girano solo mentre
   la pagina e' visibile (start/stop). Stili in /css/bi-home.css (prefisso bh-).
   ===================================================================== */
(function () {
    let root = null, scene = null;

    function template() {
        return `
<div class="bh-page">
 <div class="bh-frame" id="bh-frame"><div class="bh-stagewrap" id="bh-sw">
  <div class="bh-card">
    <div class="bh-hd"><small>BUSINESS INTELLIGENCE</small><h1>BI</h1></div>
    <div class="bh-av" id="bh-av">GP</div>

    <nav class="bh-rail">
      <button class="bh-ch" data-c="0" type="button" style="--c:#f4a83a"><span class="bh-n">01</span><span class="bh-t">Consegne</span><span class="bh-d">Tempistiche, analisi e verifiche</span><span class="bh-bar"><i></i></span></button>
      <button class="bh-ch" data-c="1" type="button" style="--c:#3fcfae"><span class="bh-n">02</span><span class="bh-t">Stock</span><span class="bh-d">Prossimamente</span><span class="bh-bar"><i></i></span></button>
      <button class="bh-ch" data-c="2" type="button" style="--c:#ff7a1a"><span class="bh-n">03</span><span class="bh-t">Commerciale</span><span class="bh-d">Prossimamente</span><span class="bh-bar"><i></i></span></button>
      <ul class="bh-sub" id="bh-sub"></ul>
    </nav>
    <button class="bh-enter" type="button" id="bh-enter">Entra <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="#111" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    <button class="bh-back" type="button">← Home</button>

    <div class="bh-stage" id="bh-stage">
      <div class="bh-spot"></div><div class="bh-floor"></div>

      <!-- CONSEGNE -->
      <div class="bh-scene" data-s="0">
        <div class="bh-cap"><i></i>Consegna al cliente</div>
        <div class="bh-k3" id="bh-k3"><div class="bh-body" id="bh-k3b"><img src="/img/macro/ich-x-k3.png" alt=""><img class="bh-refl" src="/img/macro/ich-x-k3.png" alt="">
          <span class="bh-bl" style="left:28%;top:36%;width:18%;height:22%"></span><span class="bh-bl" style="left:12%;top:38%;width:9%;height:16%"></span></div></div>
        <div class="bh-ho" id="bh-ho"><img class="bh-hand bh-cli" id="bh-cli" src="/img/macro/mano-cliente-3d.png" alt=""><div class="bh-fsh" id="bh-fsh"></div><div class="bh-fob" id="bh-fob"><svg viewBox="0 0 120 110" xmlns="http://www.w3.org/2000/svg" class="fob-svg">
  <defs>
    <linearGradient id="bhfobside" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b3f47"/><stop offset="1" stop-color="#15171b"/></linearGradient>
    <radialGradient id="bhfobtop" cx="30%" cy="20%" r="90%"><stop offset="0" stop-color="#8a909b"/><stop offset=".45" stop-color="#5a5f69"/><stop offset="1" stop-color="#34373e"/></radialGradient>
    <linearGradient id="bhfobpan" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1e25"/><stop offset=".5" stop-color="#08090c"/><stop offset="1" stop-color="#030405"/></linearGradient>
    <linearGradient id="bhfobgl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".45" stop-color="#fff" stop-opacity=".06"/><stop offset=".46" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <linearGradient id="bhfobrim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6d737e"/><stop offset="1" stop-color="#1a1c21"/></linearGradient>
    <filter id="bhfobgrain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="2" seed="4" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  0 0 0 .07 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
    <filter id="bhfobglow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation=".7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <radialGradient id="bhfobp" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#e2f9ff" stop-opacity=".95"/><stop offset="1" stop-color="#5fd0ff" stop-opacity="0"/></radialGradient>
    <clipPath id="bhfobpc"><path d="M34,16 L86,16 Q88,16 89.5,17.5 L102,30 Q104,32 104,34 L104,64 Q104,66 102,68 L89.5,80.5 Q88,82 86,82 L34,82 Q32,82 30.5,80.5 L18,68 Q16,66 16,64 L16,34 Q16,32 18,30 L30.5,17.5 Q32,16 34,16 Z"/></clipPath>
  </defs>
  <!-- spessore (fianco) -->
  <path d="M30,6 Q27,6 25,8 L8,25 Q6,27 6,30 L6,68 Q6,71 8,73 L25,90 Q27,92 30,92 L90,92 Q93,92 95,90 L112,73 Q114,71 114,68 L114,30 Q114,27 112,25 L95,8 Q93,6 90,6 Z" transform="translate(0,9)" fill="url(#bhfobside)"/>
  <path d="M30,6 Q27,6 25,8 L8,25 Q6,27 6,30 L6,68 Q6,71 8,73 L25,90 Q27,92 30,92 L90,92 Q93,92 95,90 L112,73 Q114,71 114,68 L114,30 Q114,27 112,25 L95,8 Q93,6 90,6 Z" transform="translate(0,4.5)" fill="#2a2d33"/>
  <!-- asola portachiavi sul fianco -->
  <rect x="44" y="96" width="32" height="7" rx="2.5" fill="#0d0e11"/>
  <!-- faccia superiore opaca -->
  <path d="M30,6 Q27,6 25,8 L8,25 Q6,27 6,30 L6,68 Q6,71 8,73 L25,90 Q27,92 30,92 L90,92 Q93,92 95,90 L112,73 Q114,71 114,68 L114,30 Q114,27 112,25 L95,8 Q93,6 90,6 Z" fill="url(#bhfobtop)"/>
  <path d="M30,6 Q27,6 25,8 L8,25 Q6,27 6,30 L6,68 Q6,71 8,73 L25,90 Q27,92 30,92 L90,92 Q93,92 95,90 L112,73 Q114,71 114,68 L114,30 Q114,27 112,25 L95,8 Q93,6 90,6 Z" fill="#000" filter="url(#bhfobgrain)"/>
  <path d="M30,6 Q27,6 25,8 L8,25 Q6,27 6,30 L6,68 Q6,71 8,73 L25,90 Q27,92 30,92 L90,92 Q93,92 95,90 L112,73 Q114,71 114,68 L114,30 Q114,27 112,25 L95,8 Q93,6 90,6 Z" fill="none" stroke="#a9afb9" stroke-opacity=".55" stroke-width="1"/>
  <!-- inserto nero lucido con bordo smussato -->
  <path d="M34,16 L86,16 Q88,16 89.5,17.5 L102,30 Q104,32 104,34 L104,64 Q104,66 102,68 L89.5,80.5 Q88,82 86,82 L34,82 Q32,82 30.5,80.5 L18,68 Q16,66 16,64 L16,34 Q16,32 18,30 L30.5,17.5 Q32,16 34,16 Z" transform="translate(0,1.2)" fill="#000" opacity=".6"/>
  <path d="M34,16 L86,16 Q88,16 89.5,17.5 L102,30 Q104,32 104,34 L104,64 Q104,66 102,68 L89.5,80.5 Q88,82 86,82 L34,82 Q32,82 30.5,80.5 L18,68 Q16,66 16,64 L16,34 Q16,32 18,30 L30.5,17.5 Q32,16 34,16 Z" fill="url(#bhfobpan)" stroke="url(#bhfobrim)" stroke-width="1.4"/>
  <g clip-path="url(#bhfobpc)">
    <!-- fughe tra i 4 tasti -->
    <path d="M60,16 V82 M16,49 H104" stroke="#000" stroke-width="2.2"/>
    <path d="M61.2,16 V82 M16,50.2 H104" stroke="#2b2f37" stroke-width=".7"/>
    <!-- riflesso -->
    <path d="M10,10 H112 L112,30 L10,62 Z" fill="url(#bhfobgl)"/>
  </g>
  <g fill="none" stroke="#f1f5fa" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" filter="url(#bhfobglow)">
    <!-- alto sx: chiudi -->
    <g transform="translate(40,33)"><rect x="-4.5" y="-1" width="9" height="7" rx="1.5"/><path d="M-2.3,-1 v-2.3 a2.3,2.3 0 0 1 4.6,0 v2.3"/></g>
    <!-- alto dx: bagagliaio (auto con portellone aperto) -->
    <g transform="translate(80,34)"><path d="M-8,4 H8 M-7,4 V1 L-4,-3 H2.5 L5,0.5"/><path d="M5,0.5 L9,-4.5"/><path d="M-7,1 H7"/></g>
    <!-- basso sx: avvio a distanza -->
    <g transform="translate(40,66)"><path d="M-4.2,1.8 a4.6,4.6 0 1 0 4.4,-6"/><path d="M-0.5,-6.8 l2.2,2.2 l-2.7,1.5"/></g>
    <!-- basso dx: apri -->
    <g transform="translate(81,66)"><rect x="-4.5" y="-1" width="9" height="7" rx="1.5"/><path d="M-2.3,-1 v-2.3 a2.3,2.3 0 0 1 4.6,-.5"/></g>
  </g>
  <!-- led centrale -->
  <rect x="53" y="47.2" width="14" height="3.6" rx="1.8" fill="#15181e" stroke="#3a3f48" stroke-width=".5"/>
  <rect class="k-led" x="55" y="48.3" width="10" height="1.4" rx=".7" fill="#ff5a5a" opacity="0"/>
  <circle class="k-press" cx="81" cy="66" r="14" fill="url(#bhfobp)" opacity="0"/>
</svg></div><img class="bh-hand bh-con" id="bh-con" src="/img/macro/mano-consulente-3d.png" alt=""></div>
        <div class="bh-ok" id="bh-okb"><i><svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></i>Consegnata</div>
      </div>

      <!-- STOCK -->
      <div class="bh-scene" data-s="1">
        <div class="bh-cap"><i></i>I nostri marchi · prossimamente</div>
        <div class="bh-disc"></div>
        <div class="bh-turn"><div class="bh-ring" id="bh-ring"></div></div>
        <div class="bh-chip"><i></i>Prossimamente</div>
      </div>
      <!-- COMMERCIALE (grafica provvisoria, da definire) -->
      <div class="bh-scene" data-s="2">
        <div class="bh-cap"><i></i>Lead, vendite e noleggio · prossimamente</div>
        <div class="bh-ck" id="bh-ck">
          <!-- parabrezza notturno -->
          <div class="bh-ck-sky"><svg viewBox="0 0 750 140" preserveAspectRatio="none"><path d="M0,110 L60,92 L120,100 L190,78 L260,96 L330,84 L410,102 L480,86 L560,98 L640,80 L750,96 L750,140 L0,140 Z" fill="#1b1e2a"/></svg></div>
          <!-- plancia con display curvo -->
          <div class="bh-ck-dash">
            <div class="bh-ck-disp">
              <div class="bh-ck-p">
                <small>LEAD · OGGI</small><b data-n="38">0</b><em class="bh-up">▲ 12% vs ieri</em>
                <svg class="bh-ck-spark" viewBox="0 0 160 40"><path d="M0,32 L20,28 L40,30 L60,20 L80,24 L100,14 L120,18 L140,8 L160,10" /></svg>
              </div>
              <div class="bh-ck-g">
                <svg viewBox="0 0 220 130"><defs><linearGradient id="bh-ckg" x1="0" x2="1"><stop offset="0" stop-color="#ff7a1a"/><stop offset="1" stop-color="#ffd27a"/></linearGradient></defs>
                  <path d="M20,118 A90,90 0 0 1 200,118" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="12" stroke-linecap="round"/>
                  <path class="bh-ck-arc" d="M20,118 A90,90 0 0 1 200,118" fill="none" stroke="url(#bh-ckg)" stroke-width="12" stroke-linecap="round"/>
                  <g class="bh-ck-ticks"></g>
                  <line class="bh-ck-needle" x1="110" y1="118" x2="110" y2="40" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
                  <circle cx="110" cy="118" r="7" fill="#ff7a1a"/></svg>
                <div class="bh-ck-gv"><b data-n="78">0</b><span>%</span></div><small>OBIETTIVO DEL MESE</small>
              </div>
              <div class="bh-ck-r">
                <div class="bh-ck-p2"><small>VENDITE · MESE</small><b data-n="142">0</b>
                  <div class="bh-ck-bars"><i style="--h:40%"></i><i style="--h:62%"></i><i style="--h:55%"></i><i style="--h:80%"></i><i style="--h:100%"></i></div></div>
                <div class="bh-ck-p2"><small>NOLEGGIO · MESE</small><b data-n="27">0</b>
                  <div class="bh-ck-bars bh-rent"><i style="--h:30%"></i><i style="--h:45%"></i><i style="--h:70%"></i><i style="--h:60%"></i><i style="--h:90%"></i></div></div>
              </div>
            </div>
            <div class="bh-ck-strip"></div>
          </div>
          <!-- tunnel centrale con tasti e manopola -->
          <div class="bh-ck-console">
            <div class="bh-ck-keys"></div>
            <div class="bh-ck-knob"><span></span></div>
          </div>
          <!-- volante -->
          <svg class="bh-ck-wheel" viewBox="0 0 300 300"><circle cx="150" cy="150" r="128" fill="none" stroke="#0c0d10" stroke-width="26"/><circle cx="150" cy="150" r="128" fill="none" stroke="rgba(255,122,26,.35)" stroke-width="1.5"/>
            <path d="M40,170 C80,150 220,150 260,170 L250,200 C210,182 90,182 50,200 Z" fill="#0f1014"/><circle cx="150" cy="168" r="34" fill="#111216" stroke="rgba(255,255,255,.08)"/></svg>
          <!-- luci ambiente sui sedili -->
          <span class="bh-ck-seat bh-l"></span><span class="bh-ck-seat bh-r"></span>
        </div>
              </div>
      <div class="bh-beam" id="bh-beam"></div>
    </div>
  </div>
 </div></div>
</div>

`;
    }

  function initScene() {
  const $ = id => document.getElementById(id);
  let active = false;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sw = $('bh-sw');
  function scale() { sw.style.setProperty('--k', ($('bh-frame').clientWidth / 1100).toFixed(4)); }
  addEventListener('resize', () => { if (active) scale(); });

  const CH = [
    { acc: '#f4a83a', tint: 'rgba(244,168,58,.28)', sub: [['Tempistiche consegne'], ['Analisi avanzamento'], ['Verifiche e quadratura']] },
    { acc: '#3fcfae', tint: 'rgba(63,207,174,.26)', sub: [['Vetture in stock', 'In arrivo'], ['Per marchio e modello', 'In arrivo'], ['Giacenza', 'In arrivo']], off: true },
    { acc: '#ff7a1a', tint: 'rgba(255,106,26,.18)', sub: [['Lead e Origine', 'In arrivo'], ['Vendite', 'In arrivo'], ['Noleggio', 'In arrivo']], off: true }
  ];
  const DUR = 9000;
  let cur = -1, timer = null, paused = false;
  let trT = null;
  // porta le scene allo stato finale (solo quella corrente visibile): annulla transizioni a meta'
  function settle() {
    clearTimeout(trT); trT = null;
    document.querySelectorAll('#biPage .bh-scene').forEach(s => {
      s.classList.remove('bh-hide', 'bh-reveal');
      s.classList.toggle('bh-on', cur >= 0 && +s.dataset.s === cur);
    });
  }
  let go = function (i, first) {
    if (i === cur) return;
    settle();
    const c = CH[i];
    sw.style.setProperty('--acc', c.acc); sw.style.setProperty('--tint', c.tint);
    document.querySelectorAll('#biPage .bh-ch').forEach(b => { b.classList.remove('bh-on'); if (+b.dataset.c === i) { void b.offsetWidth; b.classList.add('bh-on'); b.style.setProperty('--dur', DUR + 'ms'); } });
    $('bh-enter').classList.toggle('bh-off', !!c.off);
    $('bh-enter').firstChild.textContent = c.off ? 'In arrivo ' : 'Entra ';
    const sub = $('bh-sub'); sub.innerHTML = c.sub.map((s, k) => `<li data-sub="${i}|${k}"><i></i><span>${s[0]}</span>${s[1] ? `<em>${s[1]}</em>` : ''}</li>`).join('');
    [...sub.children].forEach((li, k) => setTimeout(() => li.classList.add('bh-in'), 250 + k * 90));
    const scenes = document.querySelectorAll('#biPage .bh-scene');
    if (first) { scenes.forEach(s => s.classList.toggle('bh-on', +s.dataset.s === i)); }
    else {
      const oldS = scenes[cur], newS = scenes[i];
      $('bh-beam').classList.remove('bh-go'); void $('bh-beam').offsetWidth; $('bh-beam').classList.add('bh-go');
      if (oldS) oldS.classList.add('bh-hide');
      newS.classList.add('bh-on', 'bh-reveal');
      trT = setTimeout(settle, 950);
    }
    cur = i;
  };
  function restart() { clearInterval(timer); if (active && !paused && !reduce) timer = setInterval(() => go((cur + 1) % CH.length), DUR); }
  document.querySelectorAll('#biPage .bh-ch').forEach(b => b.addEventListener('click', () => { go(+b.dataset.c); restart(); }));
  $('bh-frame').addEventListener('pointerenter', () => { paused = true; sw.classList.add('bh-paused'); clearInterval(timer); });
  $('bh-frame').addEventListener('pointerleave', () => { paused = false; sw.classList.remove('bh-paused'); restart(); });

  /* ---------- STOCK: pedana girevole con i loghi ---------- */
  // loghi dei marchi (cartella /img/marchi), nell'ordine dei piu' venduti
  const LOGHI = ["/img/marchi/peugeot.png", "/img/marchi/citroen.png", "/img/marchi/fiat.png", "/img/marchi/dr.png", "/img/marchi/bmw.png", "/img/marchi/volkswagen.png", "/img/marchi/audi.png", "/img/marchi/mg.png", "/img/marchi/sportequipe.png", "/img/marchi/ich-x.png", "/img/marchi/dacia.png", "/img/marchi/toyota.png", "/img/marchi/ford.png", "/img/marchi/kia.png", "/img/marchi/alfa-romeo.png", "/img/marchi/byd.png", "/img/marchi/opel.png", "/img/marchi/nissan.png"];
  const ring = $('bh-ring'), N = LOGHI.length, R = 270;
  LOGHI.forEach((src, i) => {
    const d = document.createElement('div'); d.className = 'bh-plq';
    d.style.transform = `rotateY(${i * 360 / N}deg) translateZ(${R}px)`;
    d.innerHTML = `<img src="${src}" alt="">`; ring.appendChild(d);
  });
  // La rotazione della pedana e' in CSS (bh-spin) e parte al caricamento, senza legame con il
  // capitolo: Stock risultava sfasato e si fermava con il mouse sopra. Qui la riportiamo a 0
  // ogni volta che il capitolo diventa attivo e la forziamo in play: con play() esplicito
  // animation-play-state (es. regola .bh-paused) non la ferma piu', come per le altre scene.
  const stockScene = document.querySelector('#biPage .bh-scene[data-s="1"]');
  function stockSpin() {
    if (reduce || !stockScene || !stockScene.getAnimations) return;
    stockScene.getAnimations({ subtree: true }).forEach(a => {
      if (a.animationName === 'bh-spin') { a.currentTime = 0; a.play(); }
    });
  }

  /* ---------- CONSEGNE: passaggio della chiave ---------- */
  const ho = $('bh-ho'), cli = $('bh-cli'), con = $('bh-con'), fob = $('bh-fob'), fsh = $('bh-fsh'), okb = $('bh-okb');
  const press = fob.querySelector('.k-press'), led = fob.querySelector('.k-led');
  const blinks = document.querySelectorAll('#biPage .bh-k3 .bh-bl'), k3b = $('bh-k3b');
  const waves = [0, 1, 2].map(() => { const w = document.createElement('span'); w.className = 'bh-wave'; ho.appendChild(w); return w; });
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x)), ease = t => 1 - Math.pow(1 - t, 3), eio = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const seg = (t, a, b) => clamp((t - a) / (b - a)), lerp = (a, b, t) => a + (b - a) * t;
  const PALM = { x: .388, y: .487 }, TIP = { x: .184, y: .146 }, POS = { x: 30, y: 170 }, P_T = 7.4;
  let lastSettle = -1;
  function frame(now) {
    if (!active) return;
    requestAnimationFrame(frame);
    if (cur !== 0 || reduce) return;
    const t = (now / 1000) % P_T;
    const pw = cli.offsetWidth, ph = cli.offsetHeight, gw = con.offsetWidth, gh = con.offsetHeight, fw = fob.offsetWidth;
    if (!pw || !gw) return;
    const up = ease(seg(t, .5, 1.4)) - ease(seg(t, 6.7, 7.3));
    const dip = Math.sin(Math.PI * seg(t, 2.72, 3.15)) * 7, hold = Math.sin(Math.PI * seg(t, 3.2, 6.5)) * -2;
    const py = POS.y + lerp(70, 0, up) + dip + hold, prot = lerp(8, 0, up) + dip * .4;
    cli.style.transformOrigin = '70% 90%'; cli.style.transform = `translate(${POS.x}px, ${py}px) rotate(${prot}deg)`; cli.style.opacity = clamp(up * 2.5);
    const P = { x: POS.x + PALM.x * pw, y: py + PALM.y * ph };
    const tip = { x: (1 - TIP.x) * gw, y: (1 - TIP.y) * gh }, target = { x: P.x + 4, y: P.y - 70 }, start = { x: target.x + 40, y: target.y - 210 };
    const inT = eio(seg(t, .25, 1.75)), down = eio(seg(t, 1.75, 2.4)), out = eio(seg(t, 2.75, 3.7));
    let fx = lerp(start.x, target.x, inT), fy = lerp(start.y, target.y, inT) + down * 24; fx = lerp(fx, start.x, out); fy = lerp(fy, start.y, out);
    const tilt = lerp(-14, 0, inT) + down * 6 - out * 12;
    con.style.transformOrigin = '0 0';
    con.style.transform = `translate(${fx - tip.x}px, ${fy - tip.y}px) translate(${tip.x}px, ${tip.y}px) rotate(${tilt}deg) translate(${-tip.x}px, ${-tip.y}px) translate(${gw / 2}px, ${gh / 2}px) rotate(180deg) translate(${-gw / 2}px, ${-gh / 2}px)`;
    con.style.opacity = Math.min(seg(t, .25, .75), 1 - seg(t, 3.2, 3.7));
    let cx, cy, rot, sy = 1;
    if (t < 2.5) { const s = Math.exp(-2 * Math.max(0, t - .3)) * Math.sin(8 * t) * 14; cx = fx; cy = fy + 14; rot = -22 + s + tilt * .5; fsh.style.opacity = 0; }
    else { const f = ease(seg(t, 2.5, 2.8)), b = Math.sin(Math.PI * seg(t, 2.8, 3.02)) * -5;
      cx = lerp(fx, P.x, f); cy = lerp(fy + 14, P.y - 8, f) + b; rot = lerp(-22, -16, f) + prot * .6; sy = lerp(1, .8, f);
      fsh.style.opacity = f * .9; fsh.style.transform = `translate(${P.x - 31}px, ${P.y + 10}px)`; }
    const fade = 1 - seg(t, 6.6, 7.0);
    fob.style.transform = `translate(${cx - fw / 2}px, ${cy - fw / 2}px) rotate(${rot}deg) scaleY(${sy})`;
    fob.style.opacity = (t < .25 ? 0 : 1) * fade; fsh.style.opacity = parseFloat(fsh.style.opacity || 0) * fade;
    const pr = Math.sin(Math.PI * seg(t, 3.9, 4.35)); press.style.opacity = pr; led.style.opacity = pr;
    const k = parseFloat(getComputedStyle(sw).getPropertyValue('--k')) || 1;
    const car = $('bh-k3').getBoundingClientRect(), s = ho.getBoundingClientRect();
    const tx = (car.left - s.left + car.width * .3) / k, ty = (car.top - s.top + car.height * .45) / k;
    waves.forEach((w, i) => { const q = seg(t, 4.05 + i * .18, 4.95 + i * .18); w.style.opacity = q > 0 && q < 1 ? (1 - q) * .9 : 0;
      w.style.left = lerp(P.x, tx, q) + 'px'; w.style.top = lerp(P.y - 16, ty, q) + 'px'; w.style.transform = `scale(${.6 + q * 1.4})`; });
    const bl = Math.max(Math.sin(Math.PI * seg(t, 4.75, 5.1)), Math.sin(Math.PI * seg(t, 5.25, 5.6)));
    blinks.forEach(x => x.style.opacity = bl);
    const cyc = Math.floor(now / 1000 / P_T);
    if (t > 4.75 && lastSettle !== cyc) { lastSettle = cyc; k3b.classList.remove('bh-settle'); void k3b.offsetWidth; k3b.classList.add('bh-settle'); }
    okb.classList.toggle('bh-show', t > 5.3 && t < 6.9);
  }
  // COMMERCIALE: la sequenza riparte ogni 7 secondi mentre il capitolo e' attivo
  const cm = $('bh-ck');
  // tasti della console che si accendono a turno
  const keys = cm.querySelector('.bh-ck-keys'); for (let i = 0; i < 12; i++) keys.appendChild(document.createElement('i'));
  setInterval(() => { if (!active || cur !== 2) return; const k = keys.children; [...k].forEach(x => x.classList.remove('bh-lit')); for (let j = 0; j < 3; j++) k[Math.floor(Math.random() * k.length)].classList.add('bh-lit'); }, 900);
  const count = () => cm.querySelectorAll('[data-n]').forEach(el => { const n = +el.dataset.n; let v = 0; const st = Math.max(1, Math.round(n / 40));
    const iv = setInterval(() => { v = Math.min(n, v + st); el.textContent = v; if (v >= n) clearInterval(iv); }, 30); });
  const cmRun = () => { cm.classList.remove('bh-run'); void cm.offsetWidth; cm.classList.add('bh-run'); count(); };
  setInterval(() => { if (active && cur === 2 && !reduce) cmRun(); }, 9000);
  const go0 = go; go = function (i, f) { go0(i, f); if (i === 2) cmRun(); else if (i === 1) stockSpin(); };
  // Avvio/arresto: tutto gira solo mentre la pagina BI e' visibile
  function start() {
    scale(); active = true; paused = false; settle();
    if (cur < 0) go(0, true); else if (cur === 2) cmRun(); else if (cur === 1) stockSpin();
    restart();
    if (!reduce) requestAnimationFrame(frame);
  }
  function stop() { active = false; clearInterval(timer); }
  return { start, stop };
  }


    function build() {
        if (root) return;
        root = document.createElement('div');
        root.id = 'biPage';
        root.style.display = 'none';
        root.innerHTML = template();
        const nav = document.querySelector('#mainApp .navbar');
        if (nav && nav.parentNode) nav.parentNode.insertBefore(root, nav.nextSibling);
        else document.getElementById('mainApp').appendChild(root);
        // azioni
        root.addEventListener('click', e => {
            if (e.target.closest('#bh-enter')) {
                if (!e.target.closest('#bh-enter').classList.contains('bh-off')) openTab('tempi');
                return;
            }
            if (e.target.closest('.bh-back')) { if (window.MacroHome) MacroHome.show(); return; }
            const li = e.target.closest('[data-sub]');
            if (li) {
                const [c, k] = li.dataset.sub.split('|').map(Number);
                if (c === 0) openTab(k === 1 ? 'analisi' : 'tempi');
            }
        });
        scene = initScene();
    }
    // apre l'area Consegne sulla scheda richiesta
    function openTab(tab) {
        if (!window.MacroHome) return;
        MacroHome.openConsegne();
        if (tab === 'analisi') setTimeout(() => { const b = document.querySelector('.cg-tab[data-tab="analisi"]'); if (b) b.click(); }, 60);
    }
    function initials() {
        const n = (typeof currentUser !== 'undefined' && currentUser && currentUser.fullName) || '';
        return n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || 'BI';
    }
    function show() {
        build();
        root.style.display = 'block';
        const av = document.getElementById('bh-av'); if (av) av.textContent = initials();
        if (scene) scene.start();
    }
    function hide() {
        if (root) root.style.display = 'none';
        if (scene) scene.stop();
    }
    window.BIHome = { show, hide };
})();