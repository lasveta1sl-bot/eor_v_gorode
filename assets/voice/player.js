/* Teacher recordings only. Deliberately no browser speech synthesis or inferred word splicing. */
(() => {
  'use strict';
  const bank = window.VG_VOICE_DATA;
  if (!bank || !bank.audio) return;
  const normalize = text => String(text).normalize('NFC').replace(/\u0301/g, '').replace(/[\[\]]/g, '').toLowerCase().replace(/ё/g, 'е').replace(/[^а-я0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  const byId = new Map(Object.values(bank.audio).filter(Boolean).map(entry => [entry.id, entry]));
  const labelText = text => String(text).normalize('NFC').replace(/[\[\]]/g, '').replace(/\s+/g, ' ').trim();
  function resolve(text) {
    const label = labelText(text);
    const explicit = Object.prototype.hasOwnProperty.call(bank.aliases || {}, label) ? bank.aliases[label] : null;
    const keys = explicit !== null ? (Array.isArray(explicit) ? explicit : [explicit]) : [normalize(label)];
    if (!keys.length) return null;
    const entries = keys.map(key => bank.audio[key] || byId.get(key));
    return entries.every(entry => entry && entry.id && typeof entry.src === 'string' && entry.src.length) ? entries : null;
  }
  let audio, panel, currentLabel, status, pause, speed, close, stopButton;
  let generation = 0, currentButton = null, rate = 1, playingEntries = [], position = 0;
  let observer, scheduled = false, main;
  function updateButtons() {
    pause.disabled = !audio.src || audio.ended;
    pause.textContent = audio.paused ? 'Продолжить' : 'Пауза';
    pause.setAttribute('aria-label', audio.paused ? 'Продолжить запись' : 'Приостановить запись');
    speed.textContent = rate === 1 ? 'Медленно 0,85×' : 'Обычная скорость';
    speed.setAttribute('aria-pressed', String(rate !== 1));
  }
  function stop({hide = false} = {}) {
    generation++;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    playingEntries = [];
    position = 0;
    if (currentButton) {
      currentButton.classList.remove('vg-playing');
      currentButton.removeAttribute('aria-pressed');
    }
    currentButton = null;
    status.textContent = 'Остановлено';
    if (hide) panel.hidden = true;
    updateButtons();
  }
  async function playEntry(ownGeneration) {
    if (generation !== ownGeneration || !playingEntries[position]) return;
    const entry = playingEntries[position];
    audio.src = entry.src;
    audio.playbackRate = rate;
    audio.preservesPitch = true;
    audio.onended = () => {
      if (generation !== ownGeneration) return;
      if (++position < playingEntries.length) playEntry(ownGeneration);
      else {
        status.textContent = 'Запись закончилась';
        if (currentButton) currentButton.classList.remove('vg-playing');
        updateButtons();
      }
    };
    try {
      await audio.play();
      if (generation !== ownGeneration) return;
      status.textContent = rate === 1 ? 'Слушаем' : 'Слушаем медленно';
      if (currentButton) currentButton.classList.add('vg-playing');
    } catch (error) {
      if (generation !== ownGeneration) return;
      status.textContent = 'Не удалось воспроизвести запись. Нажмите на динамик ещё раз.';
      if (currentButton) currentButton.classList.remove('vg-playing');
    }
    updateButtons();
  }
  function play(text, button) {
    const entries = resolve(text);
    if (!entries) return false;
    stop();
    panel.hidden = false;
    currentLabel.textContent = labelText(text);
    currentButton = button || null;
    playingEntries = entries;
    position = 0;
    status.textContent = 'Открываем запись';
    playEntry(generation);
    return true;
  }
  function spokenText(element) {
    const copy = element.cloneNode(true);
    copy.querySelectorAll('.vg-sound,.chinese,.zh,[lang^="zh"]').forEach(node => node.remove());
    return labelText(copy.textContent);
  }
  function addSound(element, text, after = false) {
    if (!text || element.dataset.vgAudio === text || !resolve(text)) return;
    // In the overview a map branch is already a button. Keep that grid untouched;
    // its focused article can carry independent sound controls after opening.
    if (element.closest('button')) return;
    element.dataset.vgAudio = text;
    const button = soundButton(text);
    if (after) element.after(button);
    else element.append(button);
  }
  function soundButton(text) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'vg-sound';
    button.setAttribute('aria-label', 'Слушать: ' + text);
    button.title = 'Слушать: ' + text;
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 4V5L7 9H3Z" fill="currentColor"/><path d="M16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
    button.addEventListener('click', event => {event.preventDefault(); event.stopPropagation(); play(text, button);});
    button.addEventListener('keydown', event => {
      if ([' ', 'Enter', 'ArrowLeft', 'ArrowRight'].includes(event.key)) event.stopPropagation();
    });
    return button;
  }
  function scan() {
    scheduled = false;
    observer.disconnect();
    document.querySelectorAll('.tile .word,.tile .ex,.tile .new-meaning,.models p,.models h2,.deck .bigword,.deck .meaning,.deck .example,.scheme-card p,.pattern-example,.case-example p,.verb-pair p,.dialogue p,.role-row p,.grammar-table td,.grammar-note,.replacement')
      .forEach(element => addSound(element, spokenText(element)));
    document.querySelectorAll('.sourcecard img').forEach(img => {
      const text = (img.getAttribute('alt') || '').replace(/^Исходная карточка:\s*/, '');
      addSound(img, labelText(text), true);
    });
    observer.observe(main, {subtree: true, childList: true});
  }
  function start() {
    main = document.getElementById('main');
    if (!main) return;
    audio = document.createElement('audio');
    audio.id = 'vg-teacher-audio';
    audio.preload = 'none';
    audio.setAttribute('playsinline', '');
    document.body.append(audio);
    panel = document.createElement('aside');
    panel.id = 'vg-voice-panel';
    panel.hidden = true;
    panel.setAttribute('aria-label', 'Прослушивание записи');
    panel.innerHTML = '<div class="vg-voice-copy"><strong id="vg-voice-label"></strong><span id="vg-voice-status" role="status" aria-live="polite"></span></div><div class="vg-voice-actions"><button type="button" id="vg-voice-pause">Пауза</button><button type="button" id="vg-voice-speed" aria-pressed="false">Медленно 0,85×</button><button type="button" id="vg-voice-stop">Стоп</button><button type="button" id="vg-voice-close" aria-label="Закрыть проигрыватель">×</button></div>';
    document.body.append(panel);
    currentLabel = panel.querySelector('#vg-voice-label');
    status = panel.querySelector('#vg-voice-status');
    pause = panel.querySelector('#vg-voice-pause');
    speed = panel.querySelector('#vg-voice-speed');
    stopButton = panel.querySelector('#vg-voice-stop');
    close = panel.querySelector('#vg-voice-close');
    pause.addEventListener('click', async () => {
      if (!audio.src) return;
      if (audio.paused) {
        const ownGeneration = generation;
        try {await audio.play(); if (generation === ownGeneration) status.textContent = rate === 1 ? 'Слушаем' : 'Слушаем медленно';}
        catch (_) {if (generation === ownGeneration) status.textContent = 'Не удалось продолжить запись. Нажмите на динамик ещё раз.';}
      } else {audio.pause(); status.textContent = 'Пауза';}
      updateButtons();
    });
    speed.addEventListener('click', () => {rate = rate === 1 ? .85 : 1; audio.playbackRate = rate; audio.preservesPitch = true; updateButtons();});
    stopButton.addEventListener('click', () => stop());
    close.addEventListener('click', () => stop({hide: true}));
    audio.addEventListener('play', updateButtons);
    audio.addEventListener('pause', updateButtons);
    audio.addEventListener('error', () => {if (audio.getAttribute('src')) {status.textContent = 'Запись недоступна. Нажмите на динамик ещё раз.'; updateButtons();}});
    const navigationSelector = '[data-topic],[data-mode],[data-group],[data-node],[data-scheme],[data-table],[data-case],[data-open],#mapBtn,#grammarBtn,#prev,#next,#reveal,#core,#schemeHome,#schemePrev,#schemeNext';
    document.addEventListener('click', event => {
      if (event.target.closest(navigationSelector) && !event.target.closest('.vg-sound')) stop({hide: true});
    }, true);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') stop({hide: true});
      else if (!event.target.closest('#vg-voice-panel,.vg-sound') && ['ArrowLeft','ArrowRight',' '].includes(event.key)) stop({hide: true});
    }, true);
    window.addEventListener('pagehide', () => stop({hide: true}));
    observer = new MutationObserver(() => {
      stop({hide: true});
      if (!scheduled) {scheduled = true; requestAnimationFrame(scan);}
    });
    scan();
    updateButtons();
  }
  window.VG_VOICE = {play, stop, resolve, normalize};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true});
  else start();
})();
