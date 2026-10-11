   (() => {
     const API = "https://api.github.com/repos/VirajSinghChadha/Quickpebble/releases/latest";
     const FALLBACK = "https://github.com/VirajSinghChadha/Quickpebble/releases/latest";
     const PATTERNS = { "mac-arm": /_aarch64\.dmg$/, "mac-intel": /_x64\.dmg$/, win: /_x64-setup\.exe$/, "win-msi": /_x64_en-US\.msi$/ };
     const apply = (release) => {
       for (const el of document.querySelectorAll("[data-dl]")) {
         const asset = release.assets.find((a) => PATTERNS[el.dataset.dl]?.test(a.name));
         el.href = asset ? asset.browser_download_url : FALLBACK;
       }
       for (const el of document.querySelectorAll("[data-version]")) el.textContent = release.tag_name.replace(/^v/, "");
     };
     let cached = null;
     try { cached = JSON.parse(sessionStorage.getItem("qp_release") || "null"); } catch {}
     if (cached) apply(cached);
     fetch(API, { headers: { Accept: "application/vnd.github+json" } })
       .then((r) => (r.ok ? r.json() : Promise.reject()))
       .then((release) => {
         const slim = { tag_name: release.tag_name, assets: release.assets.map((a) => ({ name: a.name, browser_download_url: a.browser_download_url })) };
         try { sessionStorage.setItem("qp_release", JSON.stringify(slim)); } catch {}
         apply(slim);
       })
       .catch(() => {});
     const ua = navigator.userAgent;
     const mine = /Windows/.test(ua) ? "win" : /Mac/.test(ua) ? "mac-arm" : null;
     if (mine) document.querySelector(`[data-dl="${mine}"]`)?.classList.add("recommended");
   })();

(() => {
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const system = matchMedia('(prefers-color-scheme: dark)');
  const toggle = document.querySelector('#theme-toggle');
  const colors = ['#087f9d','#0891b2','#16a34a','#ea580c','#7c3aed','#e11d48','#374151','#0d9488','#f97316','#4f46e5'];
  const ends = ['#16875a','#2563eb','#0891b2','#e11d48','#2563eb','#7c3aed','#6b7280','#7c3aed','#ec4899','#06b6d4'];
  const names = ['Pebble','Ocean','Forest','Sunset','Lavender','Rose','Graphite','Aurora','Sunrise','Twilight'];
  const choices = { light:0, dark:0 };
  const mode = () => root.dataset.theme || (system.matches ? 'dark' : 'light');
  const recolor = () => {
    const n = choices[mode()]; root.style.setProperty('--accent',colors[n]); root.style.setProperty('--accent2',ends[n]);
    document.querySelectorAll('[data-swatch]').forEach(b => b.setAttribute('aria-pressed',String(Number(b.dataset.swatch)===n)));
    document.querySelector('#theme-name').textContent = `${names[n]} · Try a color above to recolor this page.`;
    toggle.setAttribute('aria-label',`Switch to ${mode()==='dark'?'light':'dark'} theme`);
  };
  toggle.addEventListener('click',()=>{root.dataset.theme=mode()==='dark'?'light':'dark';try{localStorage.setItem('qp_site_theme',root.dataset.theme)}catch{}recolor()});
  system.addEventListener('change',recolor);
  document.querySelectorAll('[data-swatch]').forEach(b=>b.addEventListener('click',()=>{choices[mode()]=Number(b.dataset.swatch);recolor()}));
  recolor();
  const nav = document.querySelector('.nav'), menu = document.querySelector('.menu');
  const closeMenu = () => {nav.classList.remove('open');menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','Open menu')};
  menu.addEventListener('click',()=>{const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'Close menu':'Open menu')});
  document.addEventListener('keydown',e=>{if(e.key==='Escape' && nav.classList.contains('open')){closeMenu();menu.focus()}});
  nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeMenu));
  const reveals=document.querySelectorAll('.rv');
  if ('IntersectionObserver' in window && !reduced.matches) {
    const reveal=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');reveal.unobserve(e.target)}}),{threshold:.12,rootMargin:'0px 0px -6% 0px'});
    reveals.forEach((el,i)=>{el.style.transitionDelay=`${i%3*65}ms`;reveal.observe(el)});
    setTimeout(()=>reveals.forEach(el=>el.classList.add('in')),4000);
  } else reveals.forEach(el=>el.classList.add('in'));
  const steps=[...document.querySelectorAll('[data-step]')];
  const activate = index => { steps.forEach((s,i)=>s.classList.toggle('active',i===index));document.querySelectorAll('[data-shot]').forEach((s,i)=>s.classList.toggle('active',i===index)); };
  if ('IntersectionObserver' in window) {
    const tour=new IntersectionObserver(entries=>{const active=entries.find(e=>e.isIntersecting);if(active)activate(Number(active.target.dataset.step))},{rootMargin:'-45% 0px -45% 0px'});steps.forEach(s=>tour.observe(s));
    const sectionNav=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){nav.querySelectorAll('nav a').forEach(a=>{if(a.hash==='#'+e.target.id)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current')})}}),{rootMargin:'-45% 0px -54% 0px'});
    document.querySelectorAll('section[id]').forEach(s=>sectionNav.observe(s));
  }
  const back=document.querySelector('.back-top');let pending=false;
  const paint=()=>{pending=false;const extent=document.documentElement.scrollHeight-innerHeight;root.style.setProperty('--p',extent>0?scrollY/extent:0);nav.classList.toggle('compact',scrollY>document.querySelector('.hero').offsetHeight-80);back.classList.toggle('visible',scrollY>innerHeight*1.2)};
  addEventListener('scroll',()=>{if(!pending){pending=true;requestAnimationFrame(paint)}},{passive:true});addEventListener('resize',paint);paint();
  back.addEventListener('click',()=>{scrollTo({top:0,behavior:reduced.matches?'instant':'smooth'});document.querySelector('.brand').focus({preventScroll:true})});
  document.querySelectorAll('[data-copy]').forEach(button=>button.addEventListener('click',async()=>{const text=document.getElementById(button.dataset.copy).textContent;try{await navigator.clipboard.writeText(text);button.textContent='Copied!';document.querySelector('#copy-status').textContent='Copied to clipboard.';setTimeout(()=>button.textContent='Copy',2000)}catch{button.textContent='Select to copy';const range=document.createRange();range.selectNodeContents(document.getElementById(button.dataset.copy));const selection=getSelection();selection.removeAllRanges();selection.addRange(range);document.querySelector('#copy-status').textContent='Copy unavailable. The text is selected so you can copy it manually.'}}));
  document.querySelector('#year').textContent=new Date().getFullYear();
  const qr=document.querySelector('#qr');
  if(typeof QRCode!=='undefined') new QRCode(qr,{text:document.querySelector('#ltc').textContent,width:170,height:170,colorDark:'#172236',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
  else qr.textContent='QR unavailable. Copy the address instead.';
})();
