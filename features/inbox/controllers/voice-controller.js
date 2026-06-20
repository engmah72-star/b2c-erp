/**
 * features/inbox/controllers/voice-controller.js
 * ━━━ VOICE CONTROLLER — الرسائل الصوتية ━━━
 * Manages voice recording, playback, and upload.
 */

/**
 * @param {Object} deps
 * @param {Object} deps.storage - Firebase Storage
 * @param {Function} deps.ref
 * @param {Function} deps.uploadBytes
 * @param {Function} deps.getDownloadURL
 * @param {Function} deps.toast
 * @param {Function} deps.$ - getElementById shortcut
 * @param {Function} deps.sendMessage - (payload) => Promise
 * @param {Function} deps.getActiveConvId - () => string|null
 */
export function createVoiceController(deps) {
  const { storage, ref, uploadBytes, getDownloadURL, toast, $, sendMessage, getActiveConvId } = deps;

  let recorder = null;
  let chunks = [];
  let startTime = 0;
  let timerInt = null;
  let currentAudio = null;

  async function startRecording() {
    if (recorder) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = [];
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const duration = Math.floor((Date.now() - startTime) / 1000);
        stream.getTracks().forEach(t => t.stop());
        restoreComposer();
        if (blob.size > 0 && duration >= 1) {
          await uploadVoice(blob, duration);
        }
        recorder = null;
      };
      startTime = Date.now();
      recorder.start();
      showRecordingUI();
    } catch (e) {
      toast('❌ تعذّر الوصول للميكروفون', 'err');
      recorder = null;
    }
  }

  function stopRecording() {
    if (recorder && recorder.state === 'recording') {
      recorder.stop();
    }
  }

  function cancelRecording() {
    if (recorder && recorder.state === 'recording') {
      chunks = [];
      recorder.onstop = () => { recorder = null; restoreComposer(); };
      recorder.stop();
    }
  }

  function showRecordingUI() {
    const composer = $('composer'); if (!composer) return;
    composer.dataset._origHtml = composer.innerHTML;
    composer.innerHTML = `
      <button type="button" class="ib-iconbtn" onclick="cancelVoice()">🗑</button>
      <div class="ib-voice-record-ui">
        <span class="ib-voice-dot"></span>
        <span class="ib-voice-time" id="rec-time">0:00</span>
        <span style="color:var(--ws-text-dim);font-size:var(--fs-base)">اضغط الميكروفون مرة أخرى لإرسال…</span>
      </div>
      <button type="button" class="ib-send" onclick="stopVoice()">▶</button>`;
    if (timerInt) clearInterval(timerInt);
    timerInt = setInterval(() => {
      const s = Math.floor((Date.now() - startTime) / 1000);
      const t = $('rec-time'); if (t) t.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    }, 500);
  }

  function restoreComposer() {
    if (timerInt) { clearInterval(timerInt); timerInt = null; }
    const composer = $('composer'); if (!composer) return;
    if (composer.dataset._origHtml) { composer.innerHTML = composer.dataset._origHtml; delete composer.dataset._origHtml; }
  }

  async function uploadVoice(blob, duration) {
    const convId = getActiveConvId();
    if (!convId) return;
    toast('جاري رفع الرسالة الصوتية…', '');
    try {
      const path = `chat/${convId}/voice/${Date.now()}.webm`;
      const r = ref(storage, path);
      await uploadBytes(r, blob);
      const url = await getDownloadURL(r);
      await sendMessage({ type: 'voice', attachments: [{ url, name: 'voice.webm', size: blob.size, mime: 'audio/webm', duration }] });
    } catch (e) { toast('❌ ' + e.message, 'err'); }
  }

  function togglePlayback(btn, url) {
    if (currentAudio) {
      currentAudio.pause();
      if (currentAudio._btn) currentAudio._btn.textContent = '▶';
      if (currentAudio._fill) currentAudio._fill.style.width = '0%';
      if (currentAudio.src === url) { currentAudio = null; return; }
    }
    const a = new Audio(url);
    currentAudio = a;
    a._btn = btn;
    const fill = btn.parentElement.querySelector('.ib-voice-progress-fill');
    a._fill = fill;
    a.play().then(() => { btn.textContent = '⏸'; }).catch(_ => {});
    a.ontimeupdate = () => { if (fill && a.duration) fill.style.width = (a.currentTime / a.duration * 100) + '%'; };
    a.onended = () => { btn.textContent = '▶'; if (fill) fill.style.width = '0%'; currentAudio = null; };
  }

  return {
    startRecording,
    stopRecording,
    cancelRecording,
    togglePlayback,
  };
}
