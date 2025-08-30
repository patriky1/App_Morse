(() => {
  // ====== Dados ======
  const MAP = {
    'A':'.-','B':'-...','C':'-.-.','D':'-..','E':'.','F':'..-.','G':'--.','H':'....','I':'..','J':'.---','K':'-.-','L':'.-..','M':'--','N':'-.','O':'---','P':'.--.','Q':'--.-','R':'.-.','S':'...','T':'-','U':'..-','V':'...-','W':'.--','X':'-..-','Y':'-.--','Z':'--..',
    '0':'-----','1':'.----','2':'..---','3':'...--','4':'....-','5':'.....','6':'-....','7':'--...','8':'---..','9':'----.',
    '.':'.-.-.-', ',':'--..--', '?':'..--..', "'":'.----.', '!':'-.-.--', '/':'-..-.', '(':'-.--.', ')':'-.--.-', '&':'.-...', ':':'---...', ';':'-.-.-.', '=':'-...-', '+':'.-.-.', '-':'-....-', '_':'..--.-', '"':'.-..-.', '$':'...-..-', '@':'.--.-.', 'Á':'.--.-', 'Ä':'.-.-', 'É':'..-..', 'Ñ':'--.--', 'Ö':'---.', 'Ü':'..--'
  };
  const REVERSE = Object.fromEntries(Object.entries(MAP).map(([k,v])=>[v,k]));

  // ====== Utils ======
  const $ = sel => document.querySelector(sel);
  const el = id => document.getElementById(id);
  const log = (msg) => { const out = el('log'); out.textContent = (msg + '\n' + out.textContent).slice(0, 4000); };
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); log('Copiado para a área de transferência.'); } catch(e){ log('Falha ao copiar: '+e.message) } };
  const clamp01 = x => Math.max(0, Math.min(1, x));

  // ---- Normalizações ----
  const normalizeText = s =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();

  // aceita ., ·, • e - – — como pontos/traços; normaliza separadores
  const normalizeMorse = s => s
    .replace(/[•·]/g, '.')
    .replace(/[—–]/g, '-')
    .replace(/[|]+/g, '/')
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/[^\.\-\/\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // ====== Conversão Texto ⇄ Morse ======
  function textToMorse(str){
    const clean = normalizeText(str);
    return clean
      .split(/\s+/)
      .map(word => word.split('').map(ch => MAP[ch] || '').filter(Boolean).join(' '))
      .filter(Boolean)
      .join(' / ');
  }
  function morseToText(code){
    const norm = normalizeMorse(code);
    if(!norm) return '';
    return norm
      .split(/\s*\/\s*/)
      .map(word => word.trim().split(/\s+/).map(seq => REVERSE[seq] || '�').join(''))
      .join(' ');
  }

  // ====== Áudio (WebAudio) + LED ======
  const led = el('led');
  let actx = null, osc = null, gain = null;

  function ensureAudio(){
    if(!actx) actx = new (window.AudioContext || window.webkitAudioContext)({latencyHint:'interactive'});
    if(!gain){
      gain = actx.createGain();
      gain.gain.value = 0.00001;
      gain.connect(actx.destination);
    }
    if(!osc){
      osc = actx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = Number(el('freq').value);
      osc.connect(gain);
      osc.start();
    }
  }
  async function armAudioOnFirstGesture(){
    try{
      ensureAudio();
      if(actx.state !== 'running') await actx.resume();
    }catch(e){ log('Áudio bloqueado pelo navegador: '+e.message); }
  }
  function tone(on){
    ensureAudio();
    const now = actx.currentTime;
    gain.gain.cancelScheduledValues(now);
    const target = on ? Number(el('vol').value) : 0.00001;
    gain.gain.exponentialRampToValueAtTime(Math.max(target, 0.00001), now + 0.012);
    led.classList.toggle('on', !!on);
  }

  el('freq').addEventListener('input', e => {
    el('freqVal').textContent = e.target.value;
    ensureAudio(); osc.frequency.setValueAtTime(Number(e.target.value), actx?.currentTime || 0);
  }, {passive:true});
  el('vol').addEventListener('input', e => {
    const v = Number(e.target.value);
    el('volVal').textContent = v.toFixed(2);
    if(gain) gain.gain.setValueAtTime(clamp01(v), actx?.currentTime || 0);
  }, {passive:true});
  el('wpm').addEventListener('input', e => { el('wpmVal').textContent = e.target.value; }, {passive:true});

  document.addEventListener('visibilitychange', () => { if(document.hidden){ stopPlayback(); tone(false);} });

  // ====== Player ======
  let playing = false, abortPlay = false;

  const unitFromWPM = wpm => 1200 / Number(wpm); // ms
  const seqToTokens = (seq) => {
    const tokens = [];
    for(const ch of seq){
      if(ch === '.') tokens.push({on:1, off:1});
      else if(ch === '-') tokens.push({on:3, off:1});
      else if(ch === ' ') tokens.push({gap:2});
      else if(ch === '/') tokens.push({gap:6});
    }
    return tokens;
  };

  async function playSeq(seq){
    const normalized = normalizeMorse(seq || '');
    if(!normalized) return;
    const unit = unitFromWPM(el('wpm').value);
    const tokens = seqToTokens(normalized + ' ');
    const wait = ms => new Promise(r => setTimeout(r, ms));

    abortPlay = false; playing = true;
    try{
      await armAudioOnFirstGesture();
      for(const tk of tokens){
        if(abortPlay) break;
        if(tk.on){
          tone(true); await wait(tk.on * unit);
          tone(false); await wait(tk.off * unit);
        } else if(tk.gap){
          await wait(tk.gap * unit);
        }
      }
    } finally {
      playing = false; abortPlay = false; tone(false);
    }
  }

  function stopPlayback(){ abortPlay = true; }

  // ====== UI Conversor ======
  const plain = el('plain');
  const morse = el('morse');

  el('toMorse').addEventListener('click', () => { morse.value = textToMorse(plain.value); });
  el('toText').addEventListener('click', () => { morse.value = normalizeMorse(morse.value); plain.value = morseToText(morse.value); });
  el('clearText').addEventListener('click', () => { plain.value = ''; });
  el('clearMorse').addEventListener('click', () => { morse.value = ''; });

  el('playAudio').addEventListener('click', async () => {
    const seq = morse.value.trim() || textToMorse(plain.value);
    if(!seq){ log('Nada para reproduzir.'); return; }
    el('playAudio').disabled = true;
    log('Reproduzindo...');
    await playSeq(seq);
    el('playAudio').disabled = false;
    if(!abortPlay) log('Concluído.');
  });
  el('stopAudio').addEventListener('click', () => { stopPlayback(); tone(false); });

  // ====== Manipulador ======
  const key    = el('key');
  const keyLed = el('keyLed');
  const keyState = el('keyState');
  const capture = el('capture');
  const captureText = el('captureText');
  const meterFill = el('meterFill');

  let keyDownAt = 0, keyUpAt = 0;
  let captureSeq = '';
  let letterTimer = null, wordTimer = null;

  const unitMs = () => unitFromWPM(el('wpm').value);
  const updateMeter = p => { meterFill.style.width = (Math.max(0, Math.min(100, p*100))).toFixed(2)+'%'; };

  function startKey(){
    clearTimeout(letterTimer);
    clearTimeout(wordTimer);
    letterTimer = wordTimer = null;

    armAudioOnFirstGesture();
    tone(true);
    key.classList.add('active');
    key.setAttribute('aria-pressed', 'true');
    keyLed.classList.add('on');
    keyState.textContent = 'Transmitindo';
    keyDownAt = performance.now();
  }
  function stopKey(){
    tone(false);
    key.classList.remove('active');
    key.setAttribute('aria-pressed', 'false');
    keyLed.classList.remove('on');
    keyState.textContent = 'Solto';
    keyUpAt = performance.now();

    const press = keyUpAt - keyDownAt;
    const u = unitMs();
    const dotDashThreshold = Number(el('thDotDash').value) * u; // ponto < th, traço >= th
    captureSeq += (press < dotDashThreshold ? '.' : '-');
    renderCapture();
    scheduleGapDetection();
  }

  // Dois timers: 1.5s letra, 3.5s palavra
  function scheduleGapDetection(){
    clearTimeout(letterTimer);
    clearTimeout(wordTimer);

    letterTimer = setTimeout(() => {
      if (!/\s$/.test(captureSeq) && !/\s\/\s$/.test(captureSeq)) {
        captureSeq += ' ';
        renderCapture();
      }
    }, 1500);

    wordTimer = setTimeout(() => {
      if (/\s\/\s$/.test(captureSeq)) return;
      if (/\s$/.test(captureSeq)) {
        captureSeq = captureSeq.replace(/\s+$/, ' / ');
      } else {
        captureSeq += ' / ';
      }
      renderCapture();
    }, 3500);
  }

  function renderCapture(){
    const trimmed = captureSeq.trim();
    capture.textContent = trimmed || '(vazio)';
    captureText.textContent = trimmed ? morseToText(trimmed) : '(vazio)';
  }

  // Eventos do manipulador
  const downEv = e => {
    if(e.type === 'keydown'){
      if(e.code !== 'Space' || e.repeat) return;
      e.preventDefault();
    }
    if(playing) stopPlayback();
    startKey();
  };
  const upEv = e => {
    if(e.type === 'keyup'){
      if(e.code !== 'Space') return;
      e.preventDefault();
    }
    stopKey();
  };

  key.addEventListener('mousedown', downEv);
  window.addEventListener('mouseup', upEv);
  window.addEventListener('touchstart', e => { e.preventDefault(); downEv(e); }, {passive:false});
  window.addEventListener('touchend',   e => { e.preventDefault(); upEv(e);   }, {passive:false});
  window.addEventListener('keydown', downEv);
  window.addEventListener('keyup',   upEv);

  // Visual: meter
  const loop = () => {
    if(key.classList.contains('active')){
      const dur = performance.now() - keyDownAt;
      updateMeter(dur / (unitMs()*7));
    } else updateMeter(0);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // Sliders thresholds UI
  el('thDotDash').addEventListener('input', e => el('thVal').textContent = Number(e.target.value).toFixed(1), {passive:true});
  el('thLetter').disabled = true;
  el('thLetterVal').textContent = '1.5s';
  el('thWord').addEventListener('input',   e => el('thWordVal').textContent   = Number(e.target.value).toFixed(1), {passive:true});

  // Limpar captura
  el('clearCapture').addEventListener('click', () => { captureSeq=''; renderCapture(); });

  // Tabela de referência
  const table = el('table');
  const entries = Object.entries(MAP).sort((a,b)=>a[0].localeCompare(b[0]));
  const frag = document.createDocumentFragment();
  for(const [ch, seq] of entries){
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className='cell';
    cell.title='Clique para copiar';
    cell.innerHTML = `<span>${ch}</span><b class="mono">${seq.replace(/-/g,'–').replace(/\./g,'·')}</b>`;
    cell.addEventListener('click', ()=> copy(seq));
    frag.appendChild(cell);
  }
  table.appendChild(frag);

  // Acessibilidade: foco no manipulador
  setTimeout(()=>{ try{ el('key').focus(); }catch{} }, 300);

  // Preenchimento inicial
  el('plain').value = 'SOS precisamos de ajuda';
  el('morse').value = textToMorse(el('plain').value);

  // Limpeza ao sair
  window.addEventListener('beforeunload', () => {
    clearTimeout(letterTimer);
    clearTimeout(wordTimer);
    try{ osc?.disconnect(); gain?.disconnect(); }catch{}
  });
})();
