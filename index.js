const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers
} = require('@whiskeysockets/baileys')
const fs = require('fs')
const path = require('path')
const P = require('pino')
const config = require('./config')
const { File } = require('megajs')
const { getBuffer } = require('./lib/functions')
const qrcode = require('qrcode-terminal')

//===================CONFIGURATION============================
const prefix = config.PREFIX || '.'
const ownerNumber = config.OWNER_NUMBER || ['923237045919']
const MENU_IMG = config.MENU_IMG || 'https://i.imgur.com/example.jpg'

//===================SESSION DOWNLOADER============================
async function downloadSession() {
  const sessionPath = path.join(__dirname, 'sessions', 'creds.json')
  
  try {
    // Create sessions directory if not exists
    if (!fs.existsSync(path.dirname(sessionPath))) {
      fs.mkdirSync(path.dirname(sessionPath), { recursive: true })
    }

    // Skip if session already exists
    if (fs.existsSync(sessionPath)) return true

    if (!config.SESSION_ID) {
      console.error('❌ SESSION_ID missing in config.js')
      process.exit(1)
    }

    // Extract MEGA file ID (remove ARSL~ prefix if exists)
    const sessdata = config.SESSION_ID.replace(/^ARSL~/, '')
    
    console.log('📥 Downloading session from MEGA...')
    const filer = File.fromURL(`https://mega.nz/file/${sessdata}`)
    
    const buffer = await new Promise((resolve, reject) => {
      filer.download({ maxRetries: 3 }, (err, data) => {
        if (err) return reject(err)
        resolve(data)
      })
    })

    fs.writeFileSync(sessionPath, buffer)
    console.log('✅ Session downloaded successfully')
    return true
  } catch (error) {
    console.error('❌ Session download failed:', error.message)
    process.exit(1)
  }
}

//===================WHATSAPP CONNECTION============================
let retryCount = 0
const MAX_RETRIES = 5

async function connectToWhatsApp() {
  try {
    console.log(`♻️ Connecting Arslan-XD (Attempt ${retryCount + 1}/${MAX_RETRIES})`)

    // Download session if using ARSL~ session
    if (config.SESSION_ID && config.SESSION_ID.startsWith('ARSL~')) {
      await downloadSession()
    }

    const { state, saveCreds } = await useMultiFileAuthState(
      path.join(__dirname, 'sessions')
    )

    const { version } = await fetchLatestBaileysVersion()

    const conn = makeWASocket({
      logger: P({ level: 'silent' }),
      printQRInTerminal: true,
      browser: Browsers.macOS('Safari'),
      auth: state,
      version,
      markOnlineOnConnect: true,
      getMessage: async () => ({})
    })

    // Connection event handlers
    conn.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update

      if (qr) {
        qrcode.generate(qr, { small: true })
      }

      if (connection === 'close') {
        const reason = lastDisconnect?.error?.output?.statusCode || 
                      lastDisconnect?.error?.output?.payload?.statusCode
        
        console.log(`❌ Disconnected (Reason: ${reason || 'unknown'})`)

        if (reason !== DisconnectReason.loggedOut && retryCount < MAX_RETRIES) {
          retryCount++
          const delay = Math.min(3000 * retryCount, 30000) // Max 30 sec delay
          console.log(`⌛ Retrying in ${delay/1000} seconds...`)
          setTimeout(connectToWhatsApp, delay)
        } else {
          console.log('❌ Max retries reached or logged out')
          process.exit(1)
        }
      }

      if (connection === 'open') {
        retryCount = 0
        console.log('✅ Arslan-XD Connected Successfully')

        // Load plugins
        loadPlugins(conn)

        // Send connection message
        sendConnectionMessage(conn)
      }
    })

    // Save credentials when updated
    conn.ev.on('creds.update', saveCreds)

    // Message handler
    conn.ev.on('messages.upsert', async ({ messages }) => {
      await handleMessages(conn, messages[0])
    })

    return conn
  } catch (error) {
    console.error('❌ Connection error:', error.message)
    if (retryCount < MAX_RETRIES) {
      retryCount++
      setTimeout(connectToWhatsApp, 5000)
    } else {
      console.log('❌ Max connection attempts reached')
      process.exit(1)
    }
  }
}

//===================PLUGIN LOADER============================
function loadPlugins(conn) {
  console.log('♻️ Loading plugins...')
  
  const pluginsDir = path.join(__dirname, 'plugins')
  if (!fs.existsSync(pluginsDir)) {
    console.log('❌ Plugins directory not found')
    return
  }

  fs.readdirSync(pluginsDir).forEach(file => {
    if (path.extname(file).toLowerCase() === '.js') {
      try {
        require(path.join(pluginsDir, file))
        console.log(`✅ Loaded plugin: ${file}`)
      } catch (error) {
        console.error(`❌ Failed to load plugin ${file}:`, error.message)
      }
    }
  })
}

//===================CONNECTION MESSAGE============================
async function sendConnectionMessage(conn) {
  try {
    const connectionMsg = `*╭──────────────●●►*
> *➺ Arslan-XD ᴄᴏɴɴᴇᴄᴛᴇᴅ sᴜᴄᴄᴇssғᴜʟʟʏ!*
> *❁ ᴛʏᴘᴇ ${prefix}ᴍᴇɴᴜ ғᴏʀ ᴄᴏᴍᴍᴀɴᴅs*
> *❁ ᴊᴏɪɴ �ᴏᴜʀ ᴄʜᴀɴɴᴇʟ:*
*https://whatsapp.com/channel/0029VarfjW04tRrmwfb8x306*
*╰──────────────●●►*`

    await conn.sendMessage(
      conn.user.id,
      { 
        image: { url: MENU_IMG },
        caption: connectionMsg 
      }
    )
  } catch (error) {
    console.error('❌ Failed to send connection message:', error.message)
  }
}

//===================MESSAGE HANDLER============================
async function handleMessages(conn, message) {
  if (!message.message) return

  // Your existing message handling logic here
  // Add your command processing, auto-react, etc.
}

//===================START THE BOT============================
connectToWhatsApp().then(() => {
  console.log('🤖 Arslan-XD is initializing...')
}).catch(error => {
  console.error('❌ Bot failed to start:', error)
  process.exit(1)
})
