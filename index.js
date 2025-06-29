const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys')
const fs = require('fs')
const path = require('path')
const P = require('pino')
const { File } = require('megajs')

// Session Downloader (ARSL~ Fix)
async function downloadSession() {
  const sessionDir = path.join(__dirname, 'sessions')
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true })
  }

  const credsPath = path.join(sessionDir, 'creds.json')
  if (fs.existsSync(credsPath)) return true

  if (!global.config.SESSION_ID.startsWith('ARSL~')) {
    console.log('❌ Invalid ARSL~ session format')
    return false
  }

  try {
    console.log('⬇️ Downloading ARSL~ session...')
    const fileId = global.config.SESSION_ID.replace('ARSL~', '')
    const file = File.fromURL(`https://mega.nz/file/${fileId}`)
    
    const buffer = await new Promise((resolve, reject) => {
      file.download((err, data) => err ? reject(err) : resolve(data))
    })
    
    fs.writeFileSync(credsPath, buffer)
    console.log('✅ Session downloaded!')
    return true
  } catch (error) {
    console.error('❌ Download failed:', error.message)
    return false
  }
}

// Main Connection
async function connectToWhatsApp() {
  global.config = require('./config') // Load config
  
  try {
    // Try ARSL~ session first
    if (global.config.SESSION_ID?.startsWith('ARSL~')) {
      await downloadSession()
    }

    const { state, saveCreds } = await useMultiFileAuthState('sessions')
    const { version } = await fetchLatestBaileysVersion()

    const bot = makeWASocket({
      auth: state,
      version,
      printQRInTerminal: true,
      logger: P({ level: 'silent' })
    })

    bot.ev.on('connection.update', async (update) => {
      const { connection, qr, lastDisconnect } = update
      
      if (connection === 'close') {
        if (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut) {
          console.log('♻️ Reconnecting...')
          setTimeout(connectToWhatsApp, 5000)
        } else {
          console.log('❌ Session expired, delete sessions folder and restart')
        }
      }

      if (connection === 'open') {
        console.log('✅ Connected using ARSL~ session!')
        bot.sendMessage(bot.user.id, { text: 'Arslan-XD Activated!' })
      }
    })

    bot.ev.on('creds.update', saveCreds)

  } catch (error) {
    console.error('❌ Connection failed:', error.message)
    setTimeout(connectToWhatsApp, 10000)
  }
}

connectToWhatsApp()
