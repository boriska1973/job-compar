/* JobCompare – shared app logic (no external libs) */
window.JobCompare = (function(){
  const KEY = "jobcompare_v1";

  /* ---------- Helpers ---------- */
  const $ = (sel, ctx=document) => ctx.querySelector(sel);
  const $$ = (sel, ctx=document) => [...ctx.querySelectorAll(sel)];
  const toast = (msg="Saved") => {
    const t = $("#toast"); if(!t) return;
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(()=>t.classList.remove("show"),1400);
  };
  const clamp = (n,min,max)=>Math.max(min,Math.min(max,n));
  const money = n => isNaN(n) ? "—" : "$" + Math.round(n).toLocaleString();

  const fieldIds = [
    "a_title","a_loc","a_salary","a_bonus","a_equity","a_coli","a_commute","a_remote","a_vac","a_health","a_growth","a_culture",
    "b_title","b_loc","b_salary","b_bonus","b_equity","b_coli","b_commute","b_remote","b_vac","b_health","b_growth","b_culture",
    "w_comp","w_commute","w_growth","w_culture","w_benefits","time_value"
  ];

  function getState(ctx=document){
    const o = {};
    fieldIds.forEach(id=>{
      const el = $("#"+id, ctx);
      if(el) o[id] = el.value;
    });
    return o;
  }
  function setState(data, ctx=document){
    fieldIds.forEach(id=>{
      if(data[id] !== undefined){
        const el = $("#"+id, ctx);
        if(el) el.value = data[id];
      }
    });
    syncWeightLabels(ctx);
  }

  function saveState(data){ localStorage.setItem(KEY, JSON.stringify(data)); }
  function loadState(){ try { return JSON.parse(localStorage.getItem(KEY)||"{}"); } catch { return {}; } }
  function resetState(){
    localStorage.removeItem(KEY);
  }

  /* ---------- Demo ---------- */
  function demoData(){
    return {
      a_title:"Frontend Engineer @ Bloomly", a_loc:"Brooklyn, NY", a_salary:125000, a_bonus:10000, a_equity:15000, a_coli:110,
      a_commute:35, a_remote:2, a_vac:15, a_health:4, a_growth:5, a_culture:4,
      b_title:"Full-stack Engineer @ Northbyte", b_loc:"Jersey City, NJ", b_salary:118000, b_bonus:20000, b_equity:10000, b_coli:98,
      b_commute:12, b_remote:3, b_vac:20, b_health:5, b_growth:4, b_culture:5,
      w_comp:40, w_commute:20, w_growth:20, w_culture:10, w_benefits:10, time_value:30
    };
  }

  /* ---------- Weights UI ---------- */
  function syncWeightLabels(ctx=document){
    const ids = ["w_comp","w_commute","w_growth","w_culture","w_benefits","time_value"];
    ids.forEach(id=>{
      const el = $("#"+id, ctx);
      if(!el) return;
      const val = el.value;
      const out = $("#"+id+"_val", ctx);
      if(out){
        out.textContent = id==="time_value" ? `$${val}` : `${val}%`;
      }
    });
  }

  /* ---------- Scoring ---------- */
  function computeOffer(prefix, ctx=document){
    const get = id => parseFloat($("#"+prefix+id, ctx)?.value || 0);
    const str = id => $("#"+prefix+id, ctx)?.value || "";
    const title = str("_title"), loc = str("_loc");

    const salary = get("_salary"), bonus = get("_bonus"), equity = get("_equity");
    const coli = clamp(get("_coli") || 100, 60, 200);
    const commuteMin = get("_commute"), remoteDays = clamp(get("_remote"),0,5);
    const vac = clamp(get("_vac"),0,40);
    const health = clamp(get("_health"),1,5);
    const growth = clamp(get("_growth"),1,5);
    const culture = clamp(get("_culture"),1,5);

    const grossComp = salary + bonus + equity;
    const compAdj = grossComp * (100/coli);

    const timeValue = parseFloat($("#time_value", ctx)?.value || 30);
    const onsiteDays = 5 - remoteDays;
    const annualWorkWeeks = 46;
    const annualCommuteMinutes = commuteMin * 2 * onsiteDays * annualWorkWeeks;
    const commuteCost = (annualCommuteMinutes/60) * timeValue;
    const compAfterCommute = Math.max(0, compAdj - commuteCost);

    const COMP_CAP = 200000;
    const compScore = clamp((compAfterCommute / COMP_CAP) * 100, 0, 100);

    const COMMUTE_CAP_MIN = 60;
    const commuteScore = clamp(100 - (commuteMin/COMMUTE_CAP_MIN)*70, 0, 100);
    const remoteScore = (remoteDays/5)*30;
    const flexScore = clamp(commuteScore + remoteScore, 0, 100);

    const growthScore = (growth-1)/4 * 100;
    const cultureScore = (culture-1)/4 * 100;

    const healthScore = (health-1)/4 * 70;
    const vacScore = clamp(vac/30 * 30, 0, 30);
    const benefitScore = clamp(healthScore + vacScore, 0, 100);

    return {
      title, loc,
      salary, bonus, equity, coli, commuteMin, remoteDays, vac, health, growth, culture,
      grossComp, compAdj, commuteCost, compAfterCommute,
      compScore, flexScore, growthScore, cultureScore, benefitScore
    };
  }

  function overallScore(ofr, ctx=document){
    const w = {
      comp: parseFloat($("#w_comp", ctx)?.value||0),
      commute: parseFloat($("#w_commute", ctx)?.value||0),
      growth: parseFloat($("#w_growth", ctx)?.value||0),
      culture: parseFloat($("#w_culture", ctx)?.value||0),
      benefits: parseFloat($("#w_benefits", ctx)?.value||0)
    };
    const total = Math.max(1, w.comp + w.commute + w.growth + w.culture + w.benefits);
    const score =
      (ofr.compScore * w.comp +
       ofr.flexScore * w.commute +
       ofr.growthScore * w.growth +
       ofr.cultureScore * w.culture +
       ofr.benefitScore * w.benefits) / total;
    return {score, weights:w, total};
  }

  /* ---------- Radar (no libs) ---------- */
  function drawRadar(canvas, A, B){
    const ctx = canvas.getContext("2d");
    const W = canvas.width = canvas.clientWidth * devicePixelRatio;
    const H = canvas.height = canvas.clientHeight * devicePixelRatio;
    const cx = W/2, cy = H/2, R = Math.min(W,H)/2 - 40*devicePixelRatio;

    const axes = [
      {key:"compScore",    label:"Comp"},
      {key:"flexScore",    label:"Flex"},
      {key:"growthScore",  label:"Growth"},
      {key:"cultureScore", label:"Culture"},
      {key:"benefitScore", label:"Benefits"}
    ];

    ctx.clearRect(0,0,W,H);
    ctx.save(); ctx.translate(cx,cy);
    ctx.lineWidth = 1*devicePixelRatio;

    for(let r=0.25; r<=1; r+=0.25){
      ctx.beginPath();
      for(let i=0;i<axes.length;i++){
        const ang = (i/axes.length)*Math.PI*2 - Math.PI/2;
        const x = Math.cos(ang)*R*r, y = Math.sin(ang)*R*r;
        i?ctx.lineTo(x,y):ctx.moveTo(x,y);
      }
      ctx.closePath(); ctx.strokeStyle="rgba(255,255,255,0.12)"; ctx.stroke();
    }

    axes.forEach((ax,i)=>{
      const ang = (i/axes.length)*Math.PI*2 - Math.PI/2;
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(Math.cos(ang)*R, Math.sin(ang)*R);
      ctx.strokeStyle="rgba(255,255,255,0.12)"; ctx.stroke();
      const x = Math.cos(ang)*(R+10*devicePixelRatio), y = Math.sin(ang)*(R+10*devicePixelRatio);
      ctx.save(); ctx.translate(x,y);
      ctx.textAlign = Math.cos(ang)>0.2?"left":(Math.cos(ang)<-0.2?"right":"center");
      ctx.fillStyle="rgba(255,255,255,.8)";
      ctx.font = `${12*devicePixelRatio}px system-ui, sans-serif`;
      ctx.fillText(ax.label,0,0); ctx.restore();
    });

    function shape(offer, fill, stroke){
      ctx.beginPath();
      axes.forEach((ax,i)=>{
        const pct = clamp(offer[ax.key],0,100)/100;
        const ang = (i/axes.length)*Math.PI*2 - Math.PI/2;
        const x = Math.cos(ang)*R*pct, y = Math.sin(ang)*R*pct;
        i?ctx.lineTo(x,y):ctx.moveTo(x,y);
      });
      ctx.closePath(); ctx.fillStyle=fill; ctx.strokeStyle=stroke; ctx.lineWidth=2*devicePixelRatio; ctx.fill(); ctx.stroke();
    }
    shape(A,"rgba(124,92,255,.18)","rgba(124,92,255,.95)");
    shape(B,"rgba(74,209,255,.18)","rgba(74,209,255,.95)");
    ctx.restore();
  }

  /* ---------- Confetti ---------- */
  function confetti(){
    const c = $("#confetti"); if(!c) return;
    const ctx = c.getContext("2d");
    const W = c.width = innerWidth*devicePixelRatio, H = c.height = innerHeight*devicePixelRatio;
    const pieces = Array.from({length:120},()=>({
      x: Math.random()*W, y: -Math.random()*H*0.2, r: 3+Math.random()*6,
      vy: 1+Math.random()*3, vx: (Math.random()-0.5)*2, rot: Math.random()*Math.PI, vr: (Math.random()-0.5)*0.3,
      col: Math.random()<0.5 ? "#7c5cff" : "#4ad1ff"
    }));
    let t=0;
    (function step(){
      ctx.clearRect(0,0,W,H);
      pieces.forEach(p=>{
        p.x+=p.vx; p.y+=p.vy; p.rot+=p.vr; p.vy+=0.02;
        ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot);
        ctx.fillStyle=p.col; ctx.fillRect(-p.r,-p.r,p.r*2,p.r*2); ctx.restore();
      });
      if((t++)<220) requestAnimationFrame(step); else ctx.clearRect(0,0,W,H);
    })();
  }

  /* ---------- Import/Export & Links ---------- */
  function exportJSON(data){
    const blob = new Blob([JSON.stringify(data,null,2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "jobcompare_export.json";
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }
  async function importJSONFile(file){
    const text = await file.text();
    return JSON.parse(text);
  }

  function encodeStateToUrl(data){
    const s = JSON.stringify(data);
    // base64 + URI safe
    const b64 = btoa(unescape(encodeURIComponent(s)));
    return `results.html?data=${encodeURIComponent(b64)}`;
  }
  function decodeStateFromUrl(){
    const q = new URLSearchParams(location.search);
    const d = q.get("data");
    if(!d) return null;
    try{
      const json = decodeURIComponent(d);
      const str = decodeURIComponent(escape(atob(json)));
      return JSON.parse(str);
    }catch(e){ return null; }
  }

  /* ---------- Pages ---------- */
  function initHome(){
    const input = $("#homeImport");
    if(input){
      input.addEventListener("change", async (e)=>{
        const f = e.target.files?.[0]; if(!f) return;
        try{
          const data = await importJSONFile(f);
          saveState(data);
          location.href = "compare.html";
        }catch{ toast("Import failed"); }
      });
    }
  }

  function initCompare(){
    const ctx = document;
    // Load state or demo if empty
    const state = Object.keys(loadState()).length ? loadState() : {};
    setState(state, ctx);

    // Bind live save
    fieldIds.forEach(id=>{
      const el = $("#"+id, ctx);
      if(!el) return;
      el.addEventListener("input", ()=>{
        saveState(getState(ctx));
        if(id.startsWith("w_") || id==="time_value") syncWeightLabels(ctx);
      });
      el.addEventListener("change", ()=>toast("Saved"));
    });

    $("#demoBtn")?.addEventListener("click", ()=>{
      const d = demoData(); setState(d, ctx); saveState(getState(ctx)); toast("Demo loaded");
    });

    $("#resetBtn")?.addEventListener("click", ()=>{
      resetState(); setState({}, ctx); toast("Reset");
    });

    $("#exportBtn")?.addEventListener("click", ()=>exportJSON(getState(ctx)));

    $("#importFile")?.addEventListener("change", async (e)=>{
      const f = e.target.files?.[0]; if(!f) return;
      try{
        const data = await importJSONFile(f);
        setState(data, ctx); saveState(getState(ctx)); toast("Imported");
      }catch{ toast("Import failed"); }
      e.target.value = "";
    });

    $("#compareBtn")?.addEventListener("click", ()=>{
      const data = getState(ctx);
      saveState(data);
      // Build shareable results URL
      location.href = encodeStateToUrl(data);
    });

    syncWeightLabels(ctx);
  }

  function initResults(){
    // Prefer URL data; fallback to localStorage
    const fromUrl = decodeStateFromUrl();
    const data = fromUrl || loadState();
    if(!data || !Object.keys(data).length){
      // Nothing to show
      $(".winner-title").textContent = "No data found";
      return;
    }

    // Temporary DOM to compute with same IDs
    // Or map values directly:
    function val(k){ return parseFloat(data[k]||0); }
    function sval(k){ return (data[k]||""); }

    // Fake a ctx object with querySelector
    const ctx = {
      querySelector: (sel)=>{
        const id = sel.replace("#","");
        return { value: data[id] ?? "" };
      }
    };

    const A = computeOffer("a", ctx);
    const B = computeOffer("b", ctx);
    const SA = overallScore(A, ctx), SB = overallScore(B, ctx);

    // Bars & labels
    const setBar = (id, pct)=>{ const el=$("#"+id); if(el) el.style.width = clamp(pct,0,100).toFixed(1)+"%"; };
    $("#labelA").textContent = A.title ? `A: ${A.title}` : "Offer A";
    $("#labelB").textContent = B.title ? `B: ${B.title}` : "Offer B";
    $("#compAText").textContent = `${money(A.compAfterCommute)} adj.`; $("#compBText").textContent = `${money(B.compAfterCommute)} adj.`;
    $("#flexAText").textContent = `${A.remoteDays} remote • ${A.commuteMin}m`; $("#flexBText").textContent = `${B.remoteDays} remote • ${B.commuteMin}m`;
    setBar("scoreA", SA.score); setBar("scoreB", SB.score);
    setBar("compA", A.compScore); setBar("compB", B.compScore);
    setBar("flexA", A.flexScore); setBar("flexB", B.flexScore);
    setBar("growthA", A.growthScore); setBar("growthB", B.growthScore);
    setBar("cultureA", A.cultureScore); setBar("cultureB", B.cultureScore);
    setBar("benefitA", A.benefitScore); setBar("benefitB", B.benefitScore);

    // Winner & reason
    const winA = SA.score >= SB.score;
    const win = winA ? {label: (A.title||"Offer A"), score: SA.score} : {label: (B.title||"Offer B"), score: SB.score};
    $("#winnerTitle").textContent = `${win.label} looks better`;
    $("#winnerScore").textContent = Math.round(win.score) + "/100";

    const diffs = [
      {k:"compScore", lab:"compensation"},
      {k:"flexScore", lab:"commute/flexibility"},
      {k:"growthScore", lab:"growth"},
      {k:"cultureScore", lab:"culture"},
      {k:"benefitScore", lab:"benefits"}
    ].map(x=>({lab:x.lab, d:(A[x.k]-B[x.k])})).sort((x,y)=>Math.abs(y.d)-Math.abs(x.d));
    const top = diffs[0]; const better = top.d>0 ? "Offer A" : "Offer B";
    $("#winnerReason").textContent = `${better} leads on ${top.lab}. Tweak weights if your priorities differ.`;

    // Radar
    drawRadar($("#radar"), A, B);

    // Print
    $("#printBtn")?.addEventListener("click", ()=>window.print());

    // Party
    confetti();
  }

  function initSave(){
    const data = decodeStateFromUrl() || loadState() || {};
    // Build link from current state if available
    const url = location.origin + location.pathname.replace(/save\.html$/,"") + encodeStateToUrl(data);
    $("#shareUrl").value = url;

    $("#copyBtn")?.addEventListener("click", ()=>{
      $("#shareUrl").select(); document.execCommand("copy"); toast("Link copied");
    });

    $("#exportBtn")?.addEventListener("click", ()=>exportJSON(data));

    $("#importFile")?.addEventListener("change", async (e)=>{
      const f = e.target.files?.[0]; if(!f) return;
      try{
        const newData = await importJSONFile(f);
        saveState(newData);
        $("#shareUrl").value = location.origin + location.pathname.replace(/save\.html$/,"") + encodeStateToUrl(newData);
        toast("Imported");
      }catch{ toast("Import failed"); }
      e.target.value = "";
    });
  }

  return { initHome, initCompare, initResults, initSave };
})();
