const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys')

const fs = require('fs')
const path = require('path')
const P = require('pino')
const { File } = require('megajs')
const qrcode = require('qrcode-terminal')
const config = require('./config') // Config.js se settings import karo

//===================SESSION HANDLER============================
async function setupSession() {
  const sessionDir = path.join(__dirname, 'sessions')
  const sessionFile = path.join(sessionDir, 'creds.json')

  try {
    // Create session directory if not exists
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true })
    }

    // Skip if session already exists
    if (fs.existsSync(sessionFile)) {
      console.log('ℹ️ Using existing session')
      return true
    }

    // Check if ARSL~ session ID available
    if (!config.SESSION_ID || !config.SESSION_ID.startsWith('ARSL~')) {
      console.log('⚠️ No valid ARSL~ session found in config.js')
      return false
    }

    // Download from MEGA.nz
    console.log('⬇️ Downloading session from MEGA...')
    const megaFileId = config.SESSION_ID.replace('ARSL~', '')
    const file = File.fromURL(`https://mega.nz/file/${megaFileId}`)
    
    const buffer = await new Promise((resolve, reject) => {
      file.download({ maxRetries: 3 }, (err, data) => {
        if (err) return reject(err)
        resolve(data)
      })
    })

    fs.writeFileSync(sessionFile, buffer)
    console.log('✅ Session downloaded successfully')
    return true
  } catch (error) {
    console.error('❌ Session error:', error.message)
    return false
  }
}

//===================BOT CONNECTION============================
async function startBot() {
  let retryCount = 0
  const MAX_RETRIES = 3

  const connect = async () => {
    try {
      console.log(`\n🔗 Connection Attempt: ${retryCount + 1}/${MAX_RETRIES}`)

      // Setup session (ARSL~ or new)
      if (config.SESSION_ID?.startsWith('ARSL~')) {
        await setupSession()
      }

      // Initialize connection
      const { state, saveCreds } = await useMultiFileAuthState('sessions')
      const { version } = await fetchLatestBaileysVersion()

      const bot = makeWASocket({
        logger: P({ level: 'silent' }),
        printQRInTerminal: true,
        browser: Browsers.macOS('Chrome'),
        auth: state,
        version,
        getMessage: async () => ({})
      })

      // Event handlers
      bot.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update

        if (qr) {
          console.log('📳 Scan QR Code:')
          qrcode.generate(qr, { small: true })
        }

        if (connection === 'close') {
          const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
          if (shouldReconnect && retryCount < MAX_RETRIES) {
            retryCount++
            console.log(`♻️ Reconnecting in 5s...`)
            setTimeout(connect, 5000)
          } else {
            console.log('❌ Connection closed permanently')
            process.exit(1)
          }
        }

        if (connection === 'open') {
          console.log('\n✅ Arslan-XD Connected Successfully!')
          retryCount = 0

          // Load plugins
          loadPlugins(bot)

          // Send startup message
          bot.sendMessage(
            bot.user.id, 
            { 
              text: `🤖 *${config.SESSION_NAME || 'Arslan-XD'} Activated!*\n` +
                    `📌 Prefix: ${config.PREFIX || '.'}\n` +
                    `👑 Owner: ${config.OWNER_NUMBER || 'Not set'}`
            }
          )
        }
      })

      bot.ev.on('creds.update', saveCreds)

      return bot
    } catch (error) {
      console.error('⚠️ Connection Error:', error.message)
      if (retryCount < MAX_RETRIES) {
        retryCount++
        setTimeout(connect, 5000)
      } else {
        console.log('❌ Max retries reached')
        process.exit(1)
      }
    }
  }

  return await connect()
}

//===================PLUGIN LOADER============================
function loadPlugins(bot) {
  const pluginsDir = path.join(__dirname, 'plugins')
  
  if (!fs.existsSync(pluginsDir)) {
    console.log('⚠️ No plugins directory found')
    return
  }

  console.log('\n🔌 Loading Plugins:')
  fs.readdirSync(pluginsDir).forEach(file => {
    if (file.endsWith('.js')) {
      try {
        require(path.join(pluginsDir, file))
        console.log(`✅ ${file}`)
      } catch (error) {
        console.log(`❌ ${file} - ${error.message}`)
      }
    }
  })
}

//===================START BOT============================
startBot()
  .then(() => console.log('\n🚀 Bot is now running!'))
  .catch(err => console.error('❌ Fatal Error:', err))
