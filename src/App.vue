<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { diagnosePanic, SAMPLE_PANIC } from './lib/diagnose.js'
import { scanImage, scanVideoFrame } from './lib/qr.js'

const mode = ref('camera')
const input = ref('')
const result = ref(null)
const error = ref('')
const notice = ref('')
const fileName = ref('')
const busy = ref(false)
const cameraActive = ref(false)
const cameraBusy = ref(false)
const video = ref(null)
const reportPanel = ref(null)
const filePicker = ref(null)
const visibleDetails = ref(false)
const copied = ref('')
const sampleQrUrl = `${import.meta.env.BASE_URL}sample-panic-qr.png`
const compactExample = 'AUP1;v=14;e=0x0;ip=0x1041F2;sp=0x3FEEB0;a=0x0'
const registerNames = ['RIP', 'RSP', 'CR2', 'RFLAGS', 'CS', 'SS', 'RAX', 'RBX', 'RCX', 'RDX', 'RSI', 'RDI', 'RBP', 'R8', 'R9', 'R10', 'R11', 'R12', 'R13', 'R14', 'R15']
const registers = computed(() => result.value ? registerNames.filter((name) => result.value.fields[name]).map((name) => ({ name, value: result.value.fields[name] })) : [])
let stream = null
let frameId = null
let frameAt = 0
let frameCanvas = null
let scanComplete = false
let copyTimer = null

function clearMessages() { error.value = ''; notice.value = '' }

function explain(text, origin = 'Pasted report') {
  clearMessages()
  try {
    input.value = text
    result.value = diagnosePanic(text)
    notice.value = `Decoded from ${origin.toLowerCase()}`
    visibleDetails.value = false
    stopCamera()
    if (window.matchMedia('(max-width: 990px)').matches) {
      void nextTick(() => reportPanel.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }
  } catch (cause) {
    error.value = cause?.message || 'Could not decode the panic report.'
  }
}

function loadSample() {
  mode.value = 'paste'
  explain(SAMPLE_PANIC, 'sample kernel panic')
}

function reset() {
  stopCamera()
  input.value = ''
  result.value = null
  fileName.value = ''
  visibleDetails.value = false
  clearMessages()
}

function setMode(value) {
  if (mode.value === value) return
  mode.value = value
  clearMessages()
}

function stopCamera() {
  cameraActive.value = false
  scanComplete = true
  if (frameId !== null) cancelAnimationFrame(frameId)
  frameId = null
  if (stream) {
    stream.getTracks().forEach((track) => track.stop())
    stream = null
  }
  if (video.value) video.value.srcObject = null
}

function scanFrame(time) {
  if (!stream || !cameraActive.value || scanComplete) return
  if (time - frameAt > 150 && video.value?.readyState >= 2) {
    frameAt = time
    try {
      const data = scanVideoFrame(video.value, frameCanvas)
      if (data) {
        scanComplete = true
        explain(data, 'camera QR code')
        return
      }
    } catch (cause) {
      error.value = `Camera frame error: ${cause.message}`
      stopCamera()
      return
    }
  }
  frameId = requestAnimationFrame(scanFrame)
}

async function startCamera() {
  clearMessages()
  stopCamera()
  cameraBusy.value = true
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera scanning requires HTTPS or localhost and a browser with camera access. Use image upload instead.')
    }
    await nextTick()
    const live = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    })
    // Camera could have been closed or the user could have changed tabs while permission was pending.
    if (mode.value !== 'camera') {
      live.getTracks().forEach((track) => track.stop())
      return
    }
    stream = live
    frameCanvas = document.createElement('canvas')
    scanComplete = false
    video.value.srcObject = live
    await video.value.play()
    cameraActive.value = true
    frameAt = 0
    frameId = requestAnimationFrame(scanFrame)
  } catch (cause) {
    stopCamera()
    if (cause?.name === 'NotAllowedError') {
      error.value = 'Camera access was denied. Allow camera permission for this site, or upload a QR image.'
    } else if (cause?.name === 'NotFoundError') {
      error.value = 'No camera was found. Use image upload or paste the report.'
    } else {
      error.value = cause?.message || 'The camera could not be started.'
    }
  } finally { cameraBusy.value = false }
}

watch(mode, (next) => { if (next !== 'camera') stopCamera() })
onBeforeUnmount(() => { stopCamera(); if (copyTimer) clearTimeout(copyTimer) })

async function useImage(file) {
  if (!file) return
  clearMessages()
  busy.value = true
  fileName.value = file.name
  try {
    const payload = await scanImage(file)
    if (!payload) throw new Error('No QR code was detected. Try a sharper screenshot with the whole QR code visible and a clear border.')
    explain(payload, `image ${file.name}`)
  } catch (cause) {
    error.value = cause?.message || 'The image could not be scanned.'
  } finally {
    busy.value = false
    if (filePicker.value) filePicker.value.value = ''
  }
}

function onChoose(event) { void useImage(event.target.files?.[0]) }
function onDrop(event) { void useImage(event.dataTransfer?.files?.[0]) }

async function copyText(text, type) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable in this browser.')
    await navigator.clipboard.writeText(text)
    copied.value = type
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => { copied.value = '' }, 1800)
  } catch (cause) { error.value = `Could not copy: ${cause.message}` }
}

function downloadReport() {
  if (!result.value) return
  const blob = new Blob([result.value.report], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'australis-panic-report.txt'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>

<template>
  <div class="site-shell">
    <div class="ambient ambient-a" aria-hidden="true"></div>
    <div class="ambient ambient-b" aria-hidden="true"></div>

    <header class="site-header wrap">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 42 42" fill="none"><path d="m21 2 6.2 12.8L40 21l-12.8 6.2L21 40l-6.2-12.8L2 21l12.8-6.2L21 2Z" fill="currentColor"/><circle cx="21" cy="21" r="4.5" fill="#0b1019"/></svg>
        </div>
        <div><span class="brand-name">AUSTRALIS<span class="brand-dot">.</span></span><span class="brand-sub">SYSTEM DIAGNOSTICS</span></div>
      </div>
      <div class="header-right"><span class="pulse-dot"></span><span>100% on-device</span><span class="header-version">V1.0</span></div>
    </header>

    <main class="wrap">
      <section class="hero">
        <div class="eyebrow"><span class="eyebrow-line"></span> CRASH RECOVERY TOOLKIT <span class="eyebrow-number">/ 001</span></div>
        <h1>Decode the crash.<br /><span>Understand the cause.</span></h1>
        <p>Turn cryptic Australis OS kernel panics into clear, actionable explanations. Scan a QR code, upload a screenshot, or paste your crash report.</p>
        <div class="hero-tags"><span><span class="small-check">✓</span> No accounts</span><span><span class="small-check">✓</span> No uploads</span><span><span class="small-check">✓</span> Works offline after first visit</span></div>
      </section>

      <section class="workspace" aria-label="Panic decoder">
        <div class="panel input-panel">
          <div class="panel-heading"><div><div class="section-label">01 / INPUT</div><h2>Capture a panic</h2><p>Choose how you'd like to provide the diagnostic data.</p></div><div class="corner-glyph">⌜</div></div>
          <div class="mode-switch" role="tablist" aria-label="Input method">
            <button type="button" role="tab" :aria-selected="mode === 'camera'" :class="{ active: mode === 'camera' }" @click="setMode('camera')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="6" width="18" height="14" rx="2"/><path d="m8 6 1.5-3h5L16 6"/><circle cx="12" cy="13" r="3.5"/></svg>Camera
            </button>
            <button type="button" role="tab" :aria-selected="mode === 'upload'" :class="{ active: mode === 'upload' }" @click="setMode('upload')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 16V3m-5 5 5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>Upload
            </button>
            <button type="button" role="tab" :aria-selected="mode === 'paste'" :class="{ active: mode === 'paste' }" @click="setMode('paste')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="5" width="14" height="16" rx="2"/><path d="M9 5.5V3h6v2.5M9 12h6m-6 4h6"/></svg>Paste text
            </button>
          </div>

          <div class="input-body">
            <div v-show="mode === 'camera'" class="camera-content" role="tabpanel">
              <div class="scanner-surface" :class="{ live: cameraActive }">
                <video ref="video" autoplay playsinline muted :class="{ visible: cameraActive }"></video>
                <div v-if="!cameraActive" class="scanner-empty">
                  <div class="scan-icon"><svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4"><path d="M8 32V15a7 7 0 0 1 7-7h17M68 8h17a7 7 0 0 1 7 7v17M92 68v17a7 7 0 0 1-7 7H68M32 92H15a7 7 0 0 1-7-7V68"/><rect x="27" y="27" width="15" height="15"/><path d="M58 27h15v15H58zM27 58h15v15H27zM58 58h8m-8 8v7m8-7h7v7"/></svg></div>
                  <span>READY TO SCAN</span><small>Position a panic QR code within the frame</small>
                </div>
                <div class="scanner-reticle" v-show="cameraActive" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
                <div class="scanner-live" v-if="cameraActive"><span class="live-dot"></span> LIVE CAMERA</div>
              </div>
              <button v-if="!cameraActive" class="primary-btn full" type="button" :disabled="cameraBusy" @click="startCamera">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3"/></svg>{{ cameraBusy ? 'Requesting camera…' : 'Start camera' }} <span class="button-arrow">↗</span>
              </button>
              <button v-else class="outline-btn full" type="button" @click="stopCamera">Stop camera</button>
              <p class="helper-text">Camera access is only used for scanning. Nothing is recorded or sent anywhere.</p>
            </div>

            <div v-show="mode === 'upload'" role="tabpanel">
              <div class="dropzone" role="button" tabindex="0" @click="filePicker?.click()" @keydown.enter.prevent="filePicker?.click()" @keydown.space.prevent="filePicker?.click()" @dragenter.prevent @dragover.prevent @drop.prevent="onDrop">
                <div class="upload-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 16V3m-5 5 5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg></div>
                <strong>{{ busy ? 'Scanning image…' : 'Drop your QR screenshot here' }}</strong><span>or click to choose a file</span><small>PNG, JPG, WebP · Maximum 12 MB</small>
                <div class="choose-label">Browse files <span>↗</span></div>
              </div>
              <input ref="filePicker" type="file" class="visually-hidden" accept="image/*" aria-label="Upload a QR code image" @change="onChoose" />
              <p class="helper-text">Your image is decoded locally and never leaves this device. {{ fileName ? `Last selected: ${fileName}` : '' }}</p>
            </div>

            <div v-show="mode === 'paste'" class="paste-content" role="tabpanel">
              <div class="textarea-top"><label for="panic-text">PANIC PAYLOAD</label><span>TEXT / JSON / AUP1</span></div>
              <textarea id="panic-text" v-model="input" spellcheck="false" placeholder="*** AUSTRALIS KERNEL PANIC ***&#10;VECTOR  =0x000000000000000E&#10;ERROR   =0x0000000000000000&#10;RIP     =0x00000000001041F2&#10;CR2     =0x0000000000000000" @keydown.ctrl.enter="explain(input)" @keydown.meta.enter="explain(input)"></textarea>
              <div class="paste-counter">{{ input.length.toLocaleString() }} / 65,536 characters</div>
              <button class="primary-btn full" type="button" :disabled="!input.trim()" @click="explain(input)">Analyse panic <span class="button-arrow">↗</span></button>
              <p class="helper-text">Paste the raw COM1 log, decoded QR text, or a structured report. Press Ctrl + Enter to analyse.</p>
            </div>
          </div>

          <div v-if="error" class="error-message" role="alert"><span>!</span>{{ error }}</div>
          <div class="panel-bottom"><span class="shield-mark">◈</span><span>PRIVATE BY DESIGN</span><span class="bottom-right">CLIENT-SIDE PROCESSING</span></div>
        </div>

        <div ref="reportPanel" class="panel result-panel">
          <div class="panel-heading results-heading"><div><div class="section-label">02 / ANALYSIS</div><h2>Diagnostic report</h2><p>Understand what went wrong and where to investigate.</p></div><button class="plain-reset" v-if="result" type="button" @click="reset">Clear ↗</button></div>
          <template v-if="!result">
            <div class="result-empty">
              <div class="radar"><div class="radar-ring r1"></div><div class="radar-ring r2"></div><div class="radar-ring r3"></div><span class="radar-cross">✳</span></div>
              <span class="waiting-status"><span class="waiting-dot"></span> AWAITING DIAGNOSTIC DATA</span>
              <h3>No crash analysed yet</h3><p>Your decoded panic explanation will appear here, with technical evidence and suggested next steps.</p>
              <button class="text-link" type="button" @click="loadSample">Try a sample kernel panic <span>↗</span></button>
            </div>
          </template>
          <template v-else>
            <div class="result-filled" aria-live="polite">
              <div class="result-state" :class="result.valid ? 'state-panic' : 'state-unknown'"><span class="status-glyph">{{ result.valid ? '!' : '?' }}</span>{{ result.valid ? 'PANIC DATA DECODED' : 'UNRECOGNISED INPUT' }}<span class="state-vector" v-if="result.vector !== null">VECTOR {{ result.vector }}</span></div>
              <h3 class="diagnosis-title">{{ result.title }}</h3>
              <p class="diagnosis-summary">{{ result.summary }}</p>
              <div class="certainty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 10v6m0-9h.01"/></svg>{{ result.certainty }}</div>
              <div class="result-divider"></div>
              <div class="results-subheading"><span>EVIDENCE</span><small>{{ result.findings.length }} FINDINGS</small></div>
              <div class="findings" v-if="result.findings.length">
                <div v-for="(item, index) in result.findings" :key="index" class="finding"><span>{{ item.label }}</span><strong>{{ item.value }}</strong></div>
              </div>
              <div class="results-subheading next-steps-heading"><span>RECOMMENDED CHECKS</span></div>
              <ol class="actions"><li v-for="(action, index) in result.actions" :key="index">{{ action }}</li></ol>
              <button class="details-toggle" type="button" :aria-expanded="visibleDetails" @click="visibleDetails = !visibleDetails"><span>Advanced details & raw payload</span><span>{{ visibleDetails ? '−' : '+' }}</span></button>
              <div v-if="visibleDetails" class="advanced-details">
                <div class="registers" v-if="registers.length"><div v-for="item in registers" :key="item.name"><span>{{ item.name }}</span><code>{{ item.value }}</code></div></div>
                <div class="raw-top"><span>ORIGINAL PAYLOAD</span><button type="button" @click="copyText(result.raw, 'raw')">{{ copied === 'raw' ? 'Copied ✓' : 'Copy raw' }}</button></div>
                <pre class="raw-data">{{ result.raw }}</pre>
              </div>
              <div class="result-buttons"><button class="secondary-btn" type="button" @click="copyText(result.report, 'report')">{{ copied === 'report' ? 'Copied ✓' : 'Copy report' }}</button><button class="secondary-btn" type="button" @click="downloadReport">↓ Download .txt</button></div>
              <p class="disclaimer">Diagnostic interpretations are evidence-based suggestions, not proof of the underlying code defect.</p>
            </div>
          </template>
          <div class="panel-bottom"><span class="shield-mark">◇</span><span>{{ result ? result.source.toUpperCase() : 'READY FOR INPUT' }}</span><span class="bottom-right">AUSTRALIS / X86-64</span></div>
        </div>
      </section>

      <section class="lower-section">
        <div class="info-card"><div class="mini-label">03 / THE FORMAT</div><div class="info-grid"><div><h2>Made for the Australis kernel.</h2><p>Already understands the existing <code>*** AUSTRALIS KERNEL PANIC ***</code> serial and framebuffer report. When you add QR rendering to the panic screen, use this compact, versioned format to keep the code easy to scan.</p><a href="https://github.com/Aurora-softwares/Australis-OS/blob/Development/tests/kernel/panic_boot_smoke.py" target="_blank" rel="noopener noreferrer" class="external-link">See existing panic test ↗</a></div><div class="code-example"><div class="code-top"><span><i class="code-dot"></i> EXAMPLE QR TEXT</span><button type="button" @click="copyText(compactExample, 'example')">{{ copied === 'example' ? 'Copied ✓' : 'Copy ↗' }}</button></div><code>{{ compactExample }}</code><div class="code-desc">AUP1 · vector · error bits · instruction pointer · stack pointer · fault address<br /><a :href="sampleQrUrl" target="_blank" rel="noopener noreferrer" class="sample-qr-link">Open a sample QR code ↗</a></div></div></div></div>
        <div class="privacy-strip"><div class="privacy-icon">✳</div><div><strong>Your crashes stay yours.</strong><p>No API key, server, account, AI upload, or analytics. QR decoding and explanations run inside the browser.</p></div><span class="secure-status"><span></span> LOCAL ONLY</span></div>
      </section>
    </main>

    <footer class="site-footer wrap"><span>✳ AUSTRALIS OS <span class="muted">/ PANIC DECODER</span></span><span>BUILT FOR CLARITY, NOT GUESSWORK.</span><a href="https://github.com/Aurora-softwares/Australis-OS" target="_blank" rel="noopener noreferrer">OS SOURCE ↗</a></footer>
  </div>
</template>
