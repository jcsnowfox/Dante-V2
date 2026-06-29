(() => {
  "use strict";

  function initCallDante() {
    const root = document.querySelector("[data-call-client]");
    if (!root) return;

    const companionId = root.dataset.companionId || "dante";
    const callsEnabled = root.dataset.callsEnabled === "true";
    const debug = root.dataset.debug === "true" || new URLSearchParams(window.location.search).has("debugCall");
    const $ = (id) => document.getElementById(id);
    const els = {
      status: $("call-status"), error: $("call-error"), diag: $("call-diagnostics"), transcript: $("call-transcript"),
      start: $("call-start"), end: $("call-end"), mute: $("call-mute"), pause: $("call-pause"), hands: $("call-hands-free"),
      pttMode: $("call-ptt-mode"), ptt: $("call-ptt"), typed: $("call-typed"), sendTyped: $("call-send-typed"), replay: $("call-replay"), spinner: $("call-spinner"),
    };
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let sessionId = "", mode = "typed", recognition = null, paused = false, muted = false, loading = false, pressing = false;
    let finalSpeech = "", silenceTimer = null, lastText = "", lastAudioUrl = "";

    function log(...args) { if (debug) console.log("[Call Dante]", ...args); }
    function setStatus(value) { if (els.status) els.status.textContent = value; root.dataset.callState = value; log("status", value); }
    function showError(message) { if (!els.error) return; els.error.textContent = message || ""; els.error.hidden = !message; if (message) console.error("[Call Dante]", message); }
    function appendTurn(who, text) { if (!els.transcript || !text) return; const row = document.createElement("p"); row.className = `call-turn call-turn--${who.toLowerCase()}`; row.textContent = `${who}: ${text}`; els.transcript.appendChild(row); els.transcript.scrollTop = els.transcript.scrollHeight; }
    function setLoading(value) { loading = Boolean(value); if (els.spinner) els.spinner.hidden = !loading; [els.start, els.sendTyped, els.end].forEach((button) => { if (button) button.disabled = loading; }); }
    function updateControls() {
      if (els.replay) els.replay.disabled = !lastText && !lastAudioUrl;
      if (els.mute) { els.mute.textContent = muted ? "Unmute mic" : "Mute mic"; els.mute.classList.toggle("is-active", muted); }
      if (els.pause) { els.pause.textContent = paused ? "Resume listening" : "Pause listening"; els.pause.classList.toggle("is-active", paused); }
      if (els.hands) els.hands.classList.toggle("is-active", mode === "hands_free");
      if (els.pttMode) els.pttMode.classList.toggle("is-active", mode === "push_to_talk");
    }
    async function api(action, body = {}) {
      const response = await fetch(`/api/call/${encodeURIComponent(companionId)}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) throw new Error(payload.error || `Call API ${action} failed (${response.status})`);
      return payload;
    }
    async function diagnostics() { try { const data = await api("diagnostics"); if (els.diag) els.diag.textContent = `Calls ${data.callsEnabled ? "enabled" : "disabled"} · STT ${data.sttProvider} · TTS ${data.ttsProvider} · Kokoro ${data.kokoroConfigured ? "configured" : "fallback ready"} · Browser STT ${SpeechRecognition ? "available" : "unavailable"}`; } catch (error) { showError(error.message); } }
    async function ensureSession() { if (sessionId) return sessionId; setLoading(true); try { const data = await api("start"); sessionId = data.sessionId; setStatus(data.status || "idle"); return sessionId; } finally { setLoading(false); } }
    function stopRecognition() { if (recognition) { try { recognition.stop(); } catch (_error) {} } }
    function makeRecognition() {
      if (!SpeechRecognition) return null;
      const rec = new SpeechRecognition(); rec.lang = "en-US"; rec.continuous = true; rec.interimResults = true; finalSpeech = "";
      rec.onstart = () => setStatus(mode === "hands_free" ? "listening" : "recording");
      rec.onerror = (event) => { showError(`Speech recognition error: ${event.error || "unknown"}`); setStatus("error"); };
      rec.onresult = (event) => { setStatus("transcribing"); for (let i = event.resultIndex; i < event.results.length; i += 1) { if (event.results[i].isFinal) finalSpeech += `${event.results[i][0].transcript} `; } if (mode === "hands_free") { clearTimeout(silenceTimer); silenceTimer = setTimeout(() => { const text = finalSpeech.trim(); finalSpeech = ""; if (text && !paused && !muted) sendUtterance(text, "hands_free"); }, 950); } };
      rec.onend = () => { if (mode === "hands_free" && !paused && !muted) setTimeout(() => { try { rec.start(); } catch (_error) {} }, 350); };
      return rec;
    }
    function speakFallback(text) { if (!text || !window.speechSynthesis) return; const utterance = new SpeechSynthesisUtterance(text); utterance.onend = () => setStatus(paused ? "paused" : "idle"); window.speechSynthesis.cancel(); window.speechSynthesis.speak(utterance); }
    function playReply(data) {
      lastText = data.replyText || ""; lastAudioUrl = ""; updateControls();
      if (data.audio && (data.audio.audioBase64 || data.audio.data)) {
        const mime = data.audioMimeType || data.audio.contentType || data.audio.mimeType || "audio/mpeg";
        lastAudioUrl = `data:${mime};base64,${data.audio.audioBase64 || data.audio.data}`;
        const audio = new Audio(lastAudioUrl); audio.onended = () => setStatus(paused ? "paused" : "idle"); audio.onerror = () => speakFallback(lastText); setStatus("speaking"); audio.play().catch(() => speakFallback(lastText));
      } else { speakFallback(lastText); }
      updateControls();
    }
    async function sendUtterance(text, sourceMode = mode) { text = String(text || "").trim(); if (!text) return; showError(""); await ensureSession(); setLoading(true); setStatus("thinking"); appendTurn("You", text); try { const data = await api("message", { sessionId, text, mode: sourceMode }); appendTurn("Dante", data.replyText || ""); playReply(data); } catch (error) { showError(error.message); setStatus("error"); } finally { setLoading(false); } }

    els.start?.addEventListener("click", () => ensureSession().catch((error) => showError(error.message)));
    els.end?.addEventListener("click", async () => { try { if (sessionId) await api("end", { sessionId }); sessionId = ""; stopRecognition(); setStatus("idle"); } catch (error) { showError(error.message); } });
    els.mute?.addEventListener("click", () => { muted = !muted; if (muted) stopRecognition(); updateControls(); setStatus(muted ? "muted" : "idle"); });
    els.pause?.addEventListener("click", () => { paused = !paused; if (paused) stopRecognition(); updateControls(); setStatus(paused ? "paused" : "idle"); });
    els.hands?.addEventListener("click", async () => { if (!SpeechRecognition) return showError("Hands-free speech recognition is not available in this browser. Type a message instead."); await ensureSession(); mode = "hands_free"; paused = false; muted = false; recognition = makeRecognition(); recognition.start(); updateControls(); });
    els.pttMode?.addEventListener("click", async () => { await ensureSession(); mode = "push_to_talk"; stopRecognition(); setStatus("idle"); updateControls(); });
    function startPress() { if (pressing) return; pressing = true; mode = "push_to_talk"; updateControls(); if (!SpeechRecognition) { els.typed?.focus(); return showError("Browser speech recognition is unavailable; typed fallback is ready."); } recognition = makeRecognition(); recognition.start(); }
    function endPress() { if (!pressing) return; pressing = false; if (!SpeechRecognition) return; stopRecognition(); setTimeout(() => sendUtterance(finalSpeech.trim(), "push_to_talk"), 250); }
    els.ptt?.addEventListener("pointerdown", (event) => { event.preventDefault(); startPress(); });
    els.ptt?.addEventListener("pointerup", (event) => { event.preventDefault(); endPress(); });
    els.ptt?.addEventListener("pointercancel", endPress);
    els.ptt?.addEventListener("click", () => { if (!SpeechRecognition) els.typed?.focus(); });
    els.sendTyped?.addEventListener("click", () => { const text = els.typed?.value || ""; if (els.typed) els.typed.value = ""; sendUtterance(text, "typed"); });
    els.typed?.addEventListener("keydown", (event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") els.sendTyped?.click(); });
    els.replay?.addEventListener("click", () => { if (lastAudioUrl) new Audio(lastAudioUrl).play().catch(() => speakFallback(lastText)); else speakFallback(lastText); });

    if (!callsEnabled) showError("Calls are disabled on the server. Set CALLS_ENABLED=true and redeploy.");
    else if (!SpeechRecognition) showError("SpeechRecognition is unavailable here; typed fallback still works.");
    updateControls(); diagnostics(); setStatus("idle"); log("client ready", { companionId, callsEnabled, hasSpeechRecognition: Boolean(SpeechRecognition) });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initCallDante);
  else initCallDante();
})();
