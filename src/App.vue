<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { diagnosePanic, SAMPLE_PANIC } from './lib/diagnose.js'
import { AU1_PAGE_FAULT_EXAMPLE } from './lib/au1.js'
import { publicDiagnosis } from './lib/public-diagnosis.js'
import { issueSearchPage, newIssueUrl, searchPublicIssues } from './lib/issues.js'
import { scanImage, scanVideoFrame } from './lib/qr.js'
import { lookupSource } from './lib/source-lookup.js'
import { lookupKnownIssue } from './lib/known-issues.js'
import { assessReport } from './lib/validation.js'
import { DEFAULT_CONTEXT, recoveryPlan } from './lib/recovery.js'
import { safeDiagnosticText, technicalDiagnosticText } from './lib/reports.js'

const mode = ref('camera')
const theme = ref('auto')
const input = ref('')
const result = ref(null)
const error = ref('')
const fileName = ref('')
const busy = ref(false)
const cameraActive = ref(false)
const cameraBusy = ref(false)
const video = ref(null)
const filePicker = ref(null)
const reportPanel = ref(null)
const copied = ref(false)
const issueStatus = ref('idle')
const issueError = ref('')
const relatedIssues = ref([])
const sourceReport = ref(null)
const sourceStatus = ref('idle')
const includePublicSource = ref(false)
const context = ref({ ...DEFAULT_CONTEXT })
const approvedIssue = ref(false)
const distinctIssue = ref(false)
const privateExportApproved = ref(false)
const knownResult = ref({ status: 'idle', match: null })
const knownStatus = ref('idle')
const plain = computed(() => result.value ? publicDiagnosis(result.value) : null)
const newIssue = computed(() => newIssueUrl(result.value, sourceReport.value, includePublicSource.value, context.value))
const assessment = computed(() => assessReport(result.value))
const hasIdentifiedException = computed(() => Number.isInteger(result.value?.vector) && ((result.value.vector >= 0 && result.value.vector <= 31) || result.value.vector === 255))
const recoverySteps = computed(() => recoveryPlan(result.value, context.value))
const safeExport = computed(() => safeDiagnosticText(result.value, context.value, knownResult.value))
const issuePreview = computed(() => newIssue.value ? new URL(newIssue.value).searchParams.get('body') : '')
const searchPage = computed(() => issueSearchPage(result.value))
const sampleQrUrl = `${import.meta.env.BASE_URL}sample-panic-qr.png`
const au1SampleUrl = `${import.meta.env.BASE_URL}sample-au1-qr.png`
const au1CrashSampleUrl = `${import.meta.env.BASE_URL}sample-au1-crash-qr.png`

let stream = null
let frameId = null
let frameAt = 0
let frameCanvas = null
let scanComplete = false
let lookupAbort = null
let lookupNumber = 0
let sourceAbort = null
let sourceNumber = 0
let knownAbort = null
let knownNumber = 0
let copyTimer = null

onMounted(() => {
  try {
    const saved = localStorage.getItem('australis-theme')
    if (['auto', 'light', 'dark'].includes(saved)) theme.value = saved
  } catch { /* Preference storage is optional. */ }
  document.documentElement.dataset.theme = theme.value
})

function chooseTheme(value) {
  if (!['auto', 'light', 'dark'].includes(value)) return
  theme.value = value
  document.documentElement.dataset.theme = value
  try { localStorage.setItem('australis-theme', value) } catch { /* Optional. */ }
}

function resetIssueLookup() {
  approvedIssue.value = false
  distinctIssue.value = false
  lookupNumber++
  lookupAbort?.abort()
  lookupAbort = null
  issueStatus.value = 'idle'
  relatedIssues.value = []
  issueError.value = ''
}

function resetSource() {
  sourceNumber++
  sourceAbort?.abort()
  sourceAbort = null
  sourceReport.value = null
  sourceStatus.value = 'idle'
  includePublicSource.value = false
}

function resetKnownIssue() {
  knownNumber++
  knownAbort?.abort()
  knownAbort = null
  knownResult.value = { status: 'idle', match: null }
  knownStatus.value = 'idle'
}

async function findKnownIssue(report) {
  resetKnownIssue()
  if (!report?.valid) return
  const requestNumber = ++knownNumber
  const controller = new AbortController()
  knownAbort = controller
  knownStatus.value = 'loading'
  try {
    const match = await lookupKnownIssue(report, fetch, import.meta.env.BASE_URL, controller.signal)
    if (requestNumber !== knownNumber) return
    knownResult.value = match
    knownStatus.value = match.status
  } catch {
    if (requestNumber !== knownNumber) return
    knownResult.value = { status: 'unavailable', match: null }
    knownStatus.value = 'unavailable'
  } finally {
    if (requestNumber === knownNumber) knownAbort = null
  }
}


async function findSource(report) {
  resetSource()
  if (!report?.valid) return
  const requestNumber = ++sourceNumber
  const controller = new AbortController()
  sourceAbort = controller
  sourceStatus.value = 'loading'
  try {
    const lookup = await lookupSource(report, fetch, import.meta.env.BASE_URL, controller.signal)
    if (requestNumber !== sourceNumber) return
    sourceReport.value = lookup
    sourceStatus.value = lookup.status
  } catch {
    if (requestNumber !== sourceNumber) return
    sourceStatus.value = 'error'
  } finally {
    if (requestNumber === sourceNumber) sourceAbort = null
  }
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

function explain(text) {
  error.value = ''
  resetIssueLookup()
  resetSource()
  resetKnownIssue()
  context.value = { ...DEFAULT_CONTEXT }
  privateExportApproved.value = false
  try {
    result.value = diagnosePanic(text)
    void findSource(result.value)
    void findKnownIssue(result.value)
    input.value = text
    stopCamera()
    if (window.matchMedia('(max-width: 800px)').matches) {
      void nextTick(() => reportPanel.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }
  } catch (cause) {
    result.value = null
    error.value = cause?.message || 'This report could not be read.'
  }
}

function goToPaste() {
  setMode('paste')
  void nextTick(() => document.getElementById('scan-heading')?.scrollIntoView({ behavior: 'smooth' }))
}

function trySample() {
  mode.value = 'paste'
  explain(SAMPLE_PANIC)
}

function tryAu1Sample() {
  mode.value = 'paste'
  explain(AU1_PAGE_FAULT_EXAMPLE)
}

function reset() {
  stopCamera()
  resetIssueLookup()
  resetSource()
  resetKnownIssue()
  context.value = { ...DEFAULT_CONTEXT }
  privateExportApproved.value = false
  input.value = ''
  result.value = null
  fileName.value = ''
  error.value = ''
}

function setMode(value) {
  if (!['camera', 'upload', 'paste'].includes(value)) return
  mode.value = value
  error.value = ''
}

function scanFrame(time) {
  if (!stream || !cameraActive.value || scanComplete) return
  if (time - frameAt > 150 && video.value?.readyState >= 2) {
    frameAt = time
    try {
      const payload = scanVideoFrame(video.value, frameCanvas)
      if (payload) {
        scanComplete = true
        explain(payload)
        return
      }
    } catch {
      error.value = 'We could not scan the camera image. Try uploading a photo instead.'
      stopCamera()
      return
    }
  }
  frameId = requestAnimationFrame(scanFrame)
}

async function startCamera() {
  error.value = ''
  stopCamera()
  cameraBusy.value = true
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera access needs HTTPS or localhost. You can upload a picture instead.')
    }
    await nextTick()
    const live = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    })
    if (mode.value !== 'camera' || !video.value) {
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
    if (cause?.name === 'NotAllowedError') error.value = 'Camera permission was denied. Allow camera access or use an image instead.'
    else if (cause?.name === 'NotFoundError') error.value = 'No camera was found. Upload a picture or paste the report instead.'
    else error.value = cause?.message || 'The camera could not be opened.'
  } finally { cameraBusy.value = false }
}

watch(mode, (next) => { if (next !== 'camera') stopCamera() })
// A changed draft always requires another explicit review.
watch([context, includePublicSource], () => { approvedIssue.value = false }, { deep: true })
onBeforeUnmount(() => {
  stopCamera()
  resetIssueLookup()
  resetSource()
  resetKnownIssue()
  if (copyTimer) clearTimeout(copyTimer)
})

async function useImage(file) {
  if (!file) return
  error.value = ''
  fileName.value = file.name
  busy.value = true
  try {
    const payload = await scanImage(file)
    if (!payload) throw new Error('No QR code found. Try a clearer image showing all four corners of the code.')
    explain(payload)
  } catch (cause) { error.value = cause?.message || 'Could not read this image.' }
  finally {
    busy.value = false
    if (filePicker.value) filePicker.value.value = ''
  }
}

function onChoose(event) { void useImage(event.target.files?.[0]) }
function onDrop(event) { void useImage(event.dataTransfer?.files?.[0]) }

async function checkIssues() {
  if (!result.value?.valid || issueStatus.value === 'loading') return
  resetIssueLookup()
  issueStatus.value = 'loading'
  const myLookup = ++lookupNumber
  const controller = new AbortController()
  lookupAbort = controller
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const items = await searchPublicIssues(result.value, fetch, controller.signal)
    if (myLookup !== lookupNumber) return
    relatedIssues.value = items
    issueStatus.value = items.length ? 'found' : 'none'
  } catch (cause) {
    if (myLookup !== lookupNumber) return
    issueStatus.value = 'error'
    issueError.value = controller.signal.aborted
      ? 'The request timed out. You can search GitHub directly.'
      : (cause?.message || 'GitHub search is unavailable right now.')
  } finally {
    clearTimeout(timeout)
    if (myLookup === lookupNumber) lookupAbort = null
  }
}

async function copySummary() {
  if (!result.value?.valid) return
  const report = safeExport.value
  try {
    await navigator.clipboard.writeText(report)
    copied.value = true
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => { copied.value = false }, 1800)
  } catch { error.value = 'Copying is unavailable. Try using your browser’s copy option.' }
}

function downloadText(filename, contents) {
  const blob = new Blob([contents], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function exportSafe() {
  if (!result.value?.valid) return
  downloadText('australis-crash-summary.txt', safeExport.value)
}
function exportPrivate() {
  if (!result.value?.valid || !privateExportApproved.value) return
  downloadText('australis-crash-private-technical.txt', technicalDiagnosticText(result.value, context.value, knownResult.value))
  privateExportApproved.value = false
}
</script>

<template>
  <div class="site">
    <header class="site-header container">
      <a class="identity" href="#top" aria-label="Australis diagnostics home" @click="reset">
        <span class="identity-symbol" aria-hidden="true"><svg viewBox="0 0 36 36" fill="none"><path d="M18 2 34 18 18 34 2 18 18 2Z" stroke="currentColor" stroke-width="2.2"/><path d="M18 10 26 18 18 26 10 18l8-8Z" fill="currentColor"/></svg></span>
        <span><strong>Australis</strong><small>Crash diagnostics</small></span>
      </a>
      <div class="top-controls">
        <a class="help-nav" href="#how-to">How to use</a>
        <div class="theme-control" role="group" aria-label="Appearance">
          <button type="button" :aria-pressed="theme === 'auto'" :class="{ selected: theme === 'auto' }" @click="chooseTheme('auto')">Auto</button>
          <button type="button" :aria-pressed="theme === 'light'" :class="{ selected: theme === 'light' }" @click="chooseTheme('light')">Light</button>
          <button type="button" :aria-pressed="theme === 'dark'" :class="{ selected: theme === 'dark' }" @click="chooseTheme('dark')">Dark</button>
        </div>
      </div>
    </header>

    <main id="top" class="container">
      <section class="intro" aria-labelledby="page-title">
        <span class="eyebrow"><span class="brand-dot"></span> FREE, PRIVATE DIAGNOSTICS</span>
        <h1 id="page-title">Understand what went wrong.</h1>
        <p>Australis OS has stopped unexpectedly? Scan the QR code on your screen to find out what happened and what to do next.</p>
      </section>

      <div class="main-grid">
        <section class="card input-card" aria-labelledby="scan-heading">
          <div class="card-header">
            <span class="step-number">01</span>
            <div><h2 id="scan-heading">Scan your error</h2><p>Choose the easiest way to provide the crash details.</p></div>
          </div>

          <div class="tabs" role="tablist" aria-label="Choose input method">
            <button id="tab-camera" role="tab" type="button" :aria-selected="mode === 'camera'" aria-controls="panel-camera" :class="{ active: mode === 'camera' }" @click="setMode('camera')">Camera</button>
            <button id="tab-upload" role="tab" type="button" :aria-selected="mode === 'upload'" aria-controls="panel-upload" :class="{ active: mode === 'upload' }" @click="setMode('upload')">Upload image</button>
            <button id="tab-paste" role="tab" type="button" :aria-selected="mode === 'paste'" aria-controls="panel-paste" :class="{ active: mode === 'paste' }" @click="setMode('paste')">Paste text</button>
          </div>

          <div v-show="mode === 'camera'" id="panel-camera" role="tabpanel" aria-labelledby="tab-camera" class="input-area">
            <div class="scan-preview" :class="{ 'is-live': cameraActive }">
              <video ref="video" :class="{ visible: cameraActive }" autoplay playsinline muted aria-label="Live QR code scanner"></video>
              <div v-if="!cameraActive" class="scan-placeholder">
                <svg class="qr-placeholder" viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="M7 24V7h17M40 7h17v17M57 40v17H40M24 57H7V40" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/><path d="M19 19h11v11H19zM34 19h11v11H34zM19 34h11v11H19zM34 34h5m-5 6h11v5" stroke="currentColor" stroke-width="2.8"/></svg>
                <strong>Point your camera at the QR code</strong>
                <span>Keep the entire code inside the frame.</span>
              </div>
              <span v-else class="camera-live"><span></span> Scanning…</span>
            </div>
            <button v-if="!cameraActive" type="button" class="button button-primary full" :disabled="cameraBusy" @click="startCamera">{{ cameraBusy ? 'Opening camera…' : 'Start scanning' }} <span aria-hidden="true">→</span></button>
            <button v-else type="button" class="button button-subtle full" @click="stopCamera">Stop camera</button>
            <p class="field-note">Camera permission is only requested when you start scanning.</p>
          </div>

          <div v-show="mode === 'upload'" id="panel-upload" role="tabpanel" aria-labelledby="tab-upload" class="input-area">
            <div class="dropzone" role="button" tabindex="0" aria-label="Choose QR code image" @click="filePicker?.click()" @keydown.enter.prevent="filePicker?.click()" @keydown.space.prevent="filePicker?.click()" @dragover.prevent @dragenter.prevent @drop.prevent="onDrop">
              <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="6" y="6" width="36" height="36" rx="8"/><path d="m13 32 9-10 6 6 5-6 6 10M15 16h.01" stroke-linecap="round"/></svg>
              <strong>{{ busy ? 'Reading image…' : 'Choose a QR code image' }}</strong>
              <span>Click to browse, or drag a screenshot here.</span>
              <span class="file-hint">PNG, JPG, WebP or PGM · up to 12 MB</span>
            </div>
            <input ref="filePicker" type="file" accept="image/png,image/jpeg,image/webp,image/*,.pgm,image/x-portable-graymap,application/x-portable-graymap" class="visually-hidden" aria-label="Upload QR code screenshot" @change="onChoose" />
            <p class="field-note">{{ fileName ? `Selected: ${fileName}` : 'Your image is decoded on your device. It is not uploaded.' }}</p>
          </div>

          <div v-show="mode === 'paste'" id="panel-paste" role="tabpanel" aria-labelledby="tab-paste" class="input-area">
            <label class="input-label" for="panic-text">Paste the error message or QR code text</label>
            <textarea id="panic-text" v-model="input" maxlength="65536" spellcheck="false" placeholder="Paste the panic message shown by Australis OS…" @keydown.ctrl.enter="explain(input)" @keydown.meta.enter="explain(input)"></textarea>
            <button class="button button-primary full" type="button" :disabled="!input.trim()" @click="explain(input)">Explain error <span aria-hidden="true">→</span></button>
            <p class="field-note">You can also paste the text from the kernel's serial output or the full QR generator test log.</p>
          </div>

          <div v-if="error" class="notice-error" role="alert">{{ error }}</div>
          <div class="sample-row">Don't have a QR code yet? <button type="button" class="text-button" @click="tryAu1Sample">Try an AU1 example →</button></div>
        </section>

        <section ref="reportPanel" class="card diagnosis-card" aria-labelledby="result-heading">
          <div class="card-header result-header">
            <span class="step-number">02</span>
            <div><h2 id="result-heading">Your results</h2><p>A straightforward explanation of the problem.</p></div>
            <button v-if="result" class="clear-button" type="button" @click="reset">Clear</button>
          </div>

          <div v-if="!result" class="result-empty">
            <span class="result-icon" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2"><circle cx="24" cy="24" r="18"/><path d="M24 14v12m0 7v1" stroke-linecap="round"/></svg></span>
            <h3>Ready when you are</h3>
            <p>Once you scan or paste an error, we'll explain what it means and help you check for existing reports.</p>
          </div>
          <div v-else-if="!result.valid" class="result-content" aria-live="polite">
            <span class="status status-muted">{{ result.format === 'AU1' ? 'Australis QR recognised' : 'Could not identify a panic' }}</span>
            <h3>{{ plain.title }}</h3>
            <p class="explanation">{{ plain.description }}</p>
            <p class="guidance">{{ plain.guidance }}</p>
            <button type="button" class="button button-subtle" @click="reset">{{ result.inputStatus === 'test' ? 'Scan a real crash' : 'Try again' }}</button>
          </div>
          <div v-else class="result-content" aria-live="polite">
            <span class="status status-warning"><span></span> Kernel panic detected</span>
            <div v-if="assessment.level !== 'complete'" class="quality-warning" role="status">
              <strong>{{ assessment.title }}</strong>
              <p>{{ assessment.explanation }}</p>
              <p>{{ assessment.next }}</p>
              <button class="text-button" type="button" @click="reset">Scan again →</button>
            </div>
            <h3>{{ plain.title }}</h3>
            <p class="explanation">{{ plain.description }}</p>
            <div class="confidence-grid" aria-label="Diagnostic confidence">
              <div><span class="confidence-dot" :class="{ established: hasIdentifiedException }"></span><strong>{{ hasIdentifiedException ? 'Identified' : 'Incomplete' }}</strong><p>{{ hasIdentifiedException ? 'The exception reported by the kernel.' : 'Not enough information to identify a CPU exception.' }}</p></div>
              <div><span class="confidence-dot possible"></span><strong>Possible</strong><p>The underlying cause still needs investigation.</p></div>
              <div><span class="confidence-dot known" :class="{ established: knownStatus === 'matched' }"></span><strong>Known issue</strong><p>{{ knownStatus === 'matched' ? 'A curated crash signature matches.' : 'No confirmed matching record yet.' }}</p></div>
            </div>
            <div v-if="knownStatus === 'matched'" class="known-issue" aria-live="polite">
              <span class="status status-success">{{ knownResult.match.status === 'resolved' ? 'Resolved issue' : knownResult.match.status === 'investigating' ? 'Under investigation' : 'Documented issue' }}</span>
              <h4>{{ knownResult.match.title }}</h4>
              <p>{{ knownResult.match.summary }}</p>
              <p v-if="knownResult.match.recovery"><strong>Published guidance:</strong> {{ knownResult.match.recovery }}</p>
              <a :href="knownResult.match.url" target="_blank" rel="noopener noreferrer">Read verified GitHub issue #{{ knownResult.match.issue }} ↗</a>
              <p class="field-note">This is a maintainer-curated signature match, not independent proof of the same root cause.</p>
            </div>
            <p v-else-if="knownStatus === 'loading'" class="source-note" role="status">Checking published crash signatures…</p>
            <p v-else class="source-note">{{ knownStatus === 'not-enough-data' ? 'A precise known-issue match needs a kernel build ID and code-base address. General diagnosis still works without them.' : 'No verified known-issue match was established.' }}</p>

            <section class="recovery-questionnaire" aria-labelledby="recovery-heading">
              <h4 id="recovery-heading">Help us suggest the next steps <span class="optional-tag">optional</span></h4>
              <p class="field-note">Choose answers if you know them. Nothing is sent to GitHub unless you review a report.</p>
              <div class="questions">
                <label>When did it happen?
                  <select v-model="context.stage"><option value="unknown">I'm not sure</option><option value="startup">During startup</option><option value="running">After startup</option></select>
                </label>
                <label>What were you doing?
                  <select v-model="context.activity"><option value="unknown">I'm not sure</option><option value="launching">Opening an application</option><option value="other">Something else</option></select>
                </label>
                <label>Has it happened before?
                  <select v-model="context.recurrence"><option value="unknown">I'm not sure</option><option value="first">This is the first time</option><option value="repeated">Yes, more than once</option></select>
                </label>
              </div>
            </section>
            <div class="answer-box"><strong>Recommended next steps</strong>
              <ol class="recovery-steps"><li v-for="(step, index) in recoverySteps" :key="index">{{ step }}</li></ol>
            </div>
            <p class="accuracy-note">Confirmed exception ≠ confirmed underlying cause. Restarting does not fix a recurring bug.</p>

            <section class="source-lookup" aria-labelledby="source-heading">
              <div class="source-heading">
                <h4 id="source-heading">Source code lookup</h4>
                <span v-if="sourceStatus === 'matched'" class="source-indicator">Source matched</span>
              </div>
              <p v-if="sourceStatus === 'loading'" class="source-note" role="status">Looking for an exact public kernel build map…</p>
              <template v-else-if="sourceStatus === 'matched'">
                <p class="source-note">A public source location was found for this build. This identifies a code location, not necessarily the cause of the crash.</p>
                <a class="source-link" :href="sourceReport.location.url" target="_blank" rel="noopener noreferrer">{{ sourceReport.location.file }}:{{ sourceReport.location.line }} ↗</a>
                <span class="field-note">{{ sourceReport.location.precision === 'line' ? 'Line-level mapping' : 'Function-level mapping (approximate location)' }}</span>
                <details class="source-preview"><summary>View public source excerpt</summary><pre>{{ sourceReport.location.snippet.map((line, i) => `${sourceReport.location.snippetStart + i}: ${line}`).join('\n') }}</pre></details>
              </template>
              <p v-else-if="sourceStatus === 'no-build'" class="source-note">Source lookup isn't available for this report yet. A kernel build identifier is needed to match code safely; an OS release version is not required.</p>
              <p v-else-if="sourceStatus === 'no-base'" class="source-note">A matching build was found, but its runtime code address is missing. Australis will need to include a code-base address in the QR code.</p>
              <p v-else-if="sourceStatus === 'no-rip'" class="source-note">The report doesn't contain an instruction address, so source code cannot be identified.</p>
              <p v-else-if="sourceStatus === 'not-found'" class="source-note">No source range matched this instruction. We won't guess which function caused the crash.</p>
              <p v-else class="source-note">No verified public source map is available for this build yet. Normal diagnosis still works.</p>
            </section>

            <section class="issue-lookup" aria-labelledby="issue-heading">
              <div class="issue-top"><span class="step-number small">03</span><div><h4 id="issue-heading">Has this been reported?</h4><p>Find potentially related reports on GitHub.</p></div></div>
              <p class="privacy-inline"><span aria-hidden="true">◈</span> Your category-only GitHub search starts only when you press the button. No raw memory addresses or QR contents are transmitted.</p>
              <p v-if="knownStatus === 'matched'" class="field-note">There is already a curated issue for this crash signature. Please read it before opening a duplicate.</p>
              <button class="button button-secondary full" type="button" :disabled="issueStatus === 'loading'" @click="checkIssues">
                {{ issueStatus === 'loading' ? 'Checking GitHub…' : issueStatus === 'idle' ? 'Check existing issues' : 'Check again' }}
                <span v-if="issueStatus !== 'loading'" aria-hidden="true">↗</span>
              </button>

              <div v-if="issueStatus === 'found'" class="lookup-result" aria-live="polite">
                <strong>Potentially related reports</strong>
                <p>These mention the same type of error. They aren't necessarily the same bug.</p>
                <ul class="issues-list"><li v-for="item in relatedIssues" :key="item.number"><a :href="item.url" target="_blank" rel="noopener noreferrer">#{{ item.number }} · {{ item.title }} <span aria-hidden="true">↗</span></a><span class="issue-state">{{ item.state }}</span></li></ul>
                <p class="field-note">Check an issue's details before deciding whether to add a comment or report a new problem.</p>
              </div>
              <div v-else-if="issueStatus === 'none'" class="lookup-result" aria-live="polite"><strong>No matching public issues found</strong><p>That doesn't guarantee the problem has never been reported. You can create a new report below.</p></div>
              <div v-else-if="issueStatus === 'error'" class="lookup-result" role="status"><strong>Search couldn't be completed</strong><p>{{ issueError }}</p></div>

              <div v-if="issueStatus !== 'idle' && sourceStatus === 'matched'" class="issue-source-option">
                <label class="share-source-label"><input v-model="includePublicSource" type="checkbox" /> Include the matched <strong>public source code excerpt</strong> in my GitHub issue</label>
                <p class="field-note">Optional. You'll review the text on GitHub before publishing. Only public, commit-pinned source code is included — never raw crash data.</p>
              </div>
              <div v-if="issueStatus !== 'idle'" class="issue-preview">
                <strong>Review your draft before opening GitHub</strong>
                <p class="field-note">GitHub issues are public. Only the category, your questionnaire choices, and any source excerpt you explicitly approved appear below.</p>
                <pre>{{ issuePreview }}</pre>
                <label class="share-source-label"><input v-model="approvedIssue" type="checkbox" /> I have reviewed this public issue text and checked for existing reports.</label>
                <label v-if="knownStatus === 'matched'" class="share-source-label known-override"><input v-model="distinctIssue" type="checkbox" /> I read the linked known issue and believe this is a different problem.</label>
              </div>
              <div v-if="issueStatus !== 'idle'" class="issue-footer">
                <a :href="searchPage" target="_blank" rel="noopener noreferrer">Browse GitHub issues ↗</a>
                <a v-if="newIssue && approvedIssue && (knownStatus !== 'matched' || distinctIssue)" class="button button-primary" :href="newIssue" target="_blank" rel="noopener noreferrer">Open GitHub issue draft →</a>
                <span v-else class="field-note">{{ knownStatus === 'matched' && !distinctIssue ? 'Please review the already-documented issue before opening another.' : 'Review and tick the checkbox above to continue.' }}</span>
              </div>
            </section>

            <details class="details-panel">
              <summary>Technical details (optional) <span aria-hidden="true">⌄</span></summary>
              <div class="details-body">
                <p>Visible only on this device. Do not post this entire report publicly without reviewing it.</p>
                <dl><div><dt>Exception</dt><dd>{{ result.vector ?? 'Not available' }}</dd></div><div v-if="result.fields.RIP"><dt>Instruction pointer</dt><dd><code>{{ result.fields.RIP }}</code></dd></div><div v-if="result.fields.ERROR"><dt>Error code</dt><dd><code>{{ result.fields.ERROR }}</code></dd></div></dl>
                <pre>{{ result.raw }}</pre>
              </div>
            </details>
            <section class="report-exports" aria-label="Save diagnostic results">
              <h4>Save your results</h4>
              <p class="field-note">Safe reports omit private crash data. You can choose a separate private export for debugging.</p>
              <div class="export-actions"><button class="button button-secondary" type="button" @click="exportSafe">Download safe report (.txt)</button><button class="button button-subtle" type="button" @click="copySummary">{{ copied ? 'Copied ✓' : 'Copy summary' }}</button></div>
              <details class="private-export"><summary>Export private technical report (advanced)</summary>
                <p>This export includes raw panic text, addresses and registers. Do not publish it without examining and redacting sensitive details.</p>
                <label class="share-source-label"><input v-model="privateExportApproved" type="checkbox" /> I understand this file contains technical crash data.</label>
                <button class="button button-subtle" type="button" :disabled="!privateExportApproved" @click="exportPrivate">Download private report (.txt)</button>
              </details>
            </section>
          </div>
        </section>
      </div>

      <section id="how-to" class="instructions" aria-labelledby="instructions-heading">
        <div class="instructions-heading"><span class="eyebrow">QUICK GUIDE</span><h2 id="instructions-heading">How to use the decoder</h2><p>No account or installation needed.</p></div>
        <div class="guide-grid">
          <div class="guide-item"><span>1</span><h3>Find the QR code</h3><p>When Australis displays an error screen, look for its diagnostic QR code.</p></div>
          <div class="guide-item"><span>2</span><h3>Scan or upload it</h3><p>Open this website on your phone and scan the code. You can also upload a picture, the kernel’s PGM test image, or paste the message.</p></div>
          <div class="guide-item"><span>3</span><h3>Follow the next steps</h3><p>Answer optional recovery questions, save a safe summary, or check GitHub for existing reports before creating a new one.</p></div>
        </div>
        <div class="guide-tip"><strong>No QR code?</strong> Use the <button type="button" class="text-button" @click="goToPaste">Paste text</button> option, or <a :href="sampleQrUrl" target="_blank" rel="noopener noreferrer">view an example QR code</a> to try the scanner. Try <a :href="au1CrashSampleUrl" target="_blank" rel="noopener noreferrer">a complete AU1 crash example</a> (synthetic data), or <a :href="au1SampleUrl" target="_blank" rel="noopener noreferrer">the zero-filled QR generator test</a>.</div>
      </section>
    </main>

    <footer class="site-footer container"><span>© Australis OS · Crash diagnostics</span><span>Decoded locally · GitHub lookup is optional</span><a href="https://github.com/Aurora-softwares/Australis-OS/issues" target="_blank" rel="noopener noreferrer">Support & issues ↗</a></footer>
  </div>
</template>
