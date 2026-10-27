const { app, BrowserWindow, ipcMain, shell, screen, dialog } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')
const { execFile } = require('node:child_process')

// Let the built-in HD channels start playing as soon as the TV is switched on.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

let mainWindow = null
let fullscreenBounds = null
let fullscreenAlwaysOnTop = false

/* ===== Persisted data ===== */
function storePath() {
  return path.join(app.getPath('userData'), 'retro-tv-data.json')
}

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(storePath(), 'utf8'))
  } catch (err) {
    if (err && err.code !== 'ENOENT') console.warn('Store read failed:', err.message)
    return null
  }
}

function writeStore(data) {
  if (!data || typeof data !== 'object') return false
  try {
    const file = storePath()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    // Write to a temp file first so a failed write never truncates the real store.
    const tmp = `${file}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
    fs.renameSync(tmp, file)
    return true
  } catch (err) {
    console.warn('Store write failed:', err.message)
    return false
  }
}

ipcMain.handle('store:load', () => readStore())
ipcMain.handle('store:save', (_event, data) => writeStore(data))
// Synchronous variant used on unload so the last change is never lost.
ipcMain.on('store:save-sync', (event, data) => {
  event.returnValue = writeStore(data)
})

ipcMain.handle('dialog:pick-media', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const result = await dialog.showOpenDialog(win, {
    title: '选择视频或音乐文件',
    buttonLabel: '添加',
    properties: ['openFile', 'multiSelections'],
    filters: [
      {
        name: '视频 / 音乐',
        extensions: ['mp4', 'webm', 'ogv', 'ogg', 'mov', 'mkv', 'avi', 'm4v', 'mp3', 'wav', 'flac', 'm4a', 'aac', 'opus', 'wma']
      },
      { name: '所有文件', extensions: ['*'] }
    ]
  })
  return result.canceled ? [] : result.filePaths
})

/* ===== Media audio fallback (MKV AC3/DTS -> AAC) ===== */
const FFMPEG_BIN = process.env.RETRO_TV_FFMPEG || 'ffmpeg'
const FFPROBE_BIN = process.env.RETRO_TV_FFPROBE || 'ffprobe'
// Codecs Chromium can decode inside a media element.
const BROWSER_AUDIO_CODECS = new Set([
  'aac', 'mp3', 'mp2', 'opus', 'vorbis', 'flac',
  'pcm_s16le', 'pcm_s24le', 'pcm_s32le', 'pcm_u8', 'pcm_f32le'
])
const mediaProbeCache = new Map()
const mediaPending = new Map()

function runProcess(bin, args, timeout) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { windowsHide: true, timeout, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        err.stderr = String(stderr || '')
        reject(err)
      } else {
        resolve(String(stdout || ''))
      }
    })
  })
}

function mediaCacheDir() {
  const dir = path.join(app.getPath('userData'), 'media-cache')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

async function readAudioCodecs(file) {
  const out = await runProcess(
    FFPROBE_BIN,
    ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index,codec_name', '-of', 'json', file],
    20000
  )
  const data = JSON.parse(out || '{}')
  return Array.isArray(data.streams) ? data.streams.map((s) => String(s.codec_name || '')) : []
}

async function buildMkvAudio(key, file) {
  let codecs = []
  try {
    codecs = await readAudioCodecs(file)
  } catch (err) {
    // No ffprobe: let Chromium try the original file.
    return { ok: true, path: file }
  }
  if (!codecs.length) return { ok: true, path: file, noAudio: true }
  if (codecs.every((c) => BROWSER_AUDIO_CODECS.has(c))) return { ok: true, path: file }

  const hash = crypto.createHash('sha1').update(key).digest('hex')
  const dir = mediaCacheDir()
  const target = path.join(dir, `${hash}.mkv`)
  try {
    if (fs.existsSync(target) && fs.statSync(target).size > 0) {
      return { ok: true, path: target, transcoded: true, codecs }
    }
  } catch (err) {}

  const tmp = path.join(dir, `${hash}.part.mkv`)
  try {
    await runProcess(FFMPEG_BIN, [
      '-y', '-v', 'error',
      '-i', file,
      '-map', '0:v:0?',
      '-map', '0:a:0',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-f', 'matroska',
      tmp
    ], 300000)
    fs.renameSync(tmp, target)
    return { ok: true, path: target, transcoded: true, codecs }
  } catch (err) {
    try { fs.unlinkSync(tmp) } catch (e) {}
    const missing = err && (err.code === 'ENOENT' || /ENOENT/.test(String(err.message || '')))
    return {
      ok: false,
      path: file,
      codecs,
      message: missing ? '未找到 ffmpeg，MKV 音频无法转换' : 'MKV 音频转换失败'
    }
  }
}

function prepareMkvAudio(file) {
  if (!file || typeof file !== 'string') return Promise.resolve({ ok: true, path: file })
  if (!/\.mkv$/i.test(file)) return Promise.resolve({ ok: true, path: file })
  let stat
  try {
    stat = fs.statSync(file)
  } catch (err) {
    return Promise.resolve({ ok: true, path: file })
  }
  const key = `${file}|${stat.size}|${Math.floor(stat.mtimeMs)}`
  if (mediaProbeCache.has(key)) return Promise.resolve(mediaProbeCache.get(key))
  if (mediaPending.has(key)) return mediaPending.get(key)

  const job = buildMkvAudio(key, file)
    .then((result) => {
      mediaProbeCache.set(key, result)
      mediaPending.delete(key)
      return result
    })
    .catch((err) => {
      mediaPending.delete(key)
      console.warn('MKV audio preparation failed:', err.message)
      return { ok: false, path: file, message: 'MKV 音频处理失败' }
    })
  mediaPending.set(key, job)
  return job
}

ipcMain.handle('media:prepare', (_event, file) => prepareMkvAudio(file))

function setWindowFullscreen(win, next) {
  const enabled = Boolean(next)
  if (enabled === Boolean(fullscreenBounds)) return enabled

  if (enabled) {
    fullscreenBounds = win.getBounds()
    fullscreenAlwaysOnTop = win.isAlwaysOnTop()
    const display = screen.getDisplayMatching(fullscreenBounds)
    // Native setFullScreen() is not supported by transparent windows on Windows,
    // so fill the display ourselves and restore the bounds afterwards.
    win.setAlwaysOnTop(true, 'screen-saver')
    win.setBounds(display.bounds, false)
  } else {
    const bounds = fullscreenBounds
    fullscreenBounds = null
    if (bounds) win.setBounds(bounds, false)
    win.setAlwaysOnTop(fullscreenAlwaysOnTop)
  }

  if (!win.isDestroyed()) {
    win.webContents.send('window:fullscreen-changed', enabled)
  }
  return enabled
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 1024,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    maximizable: false,
    fullscreenable: true,
    autoHideMenuBar: true,
    title: '复古电视模拟器 | Retro TV',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Keep the static/noise animation running while the window is in the background.
      backgroundThrottling: false
    }
  })

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // Dropping a file or clicking an external link must never replace the app page.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentUrl = mainWindow.webContents.getURL()
    if (!currentUrl || url === currentUrl) return
    event.preventDefault()
    if (/^https?:/i.test(url)) shell.openExternal(url)
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    fullscreenBounds = null
  })
}

ipcMain.handle('window:set-fullscreen', (event, value) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return false
  const next = typeof value === 'boolean' ? value : !fullscreenBounds
  return setWindowFullscreen(win, next)
})

ipcMain.handle('window:get-fullscreen', () => Boolean(fullscreenBounds))

ipcMain.handle('window:minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) win.minimize()
})

ipcMain.handle('window:close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) win.close()
})

ipcMain.handle('window:toggle-always-on-top', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return false
  const next = !win.isAlwaysOnTop()
  win.setAlwaysOnTop(next)
  return next
})

ipcMain.handle('window:get-always-on-top', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  return win ? win.isAlwaysOnTop() : false
})

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
