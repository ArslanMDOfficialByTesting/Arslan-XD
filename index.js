const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion // Yeh add karna zaroori tha
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
    if (!fs.existsSync(path.dirname(sessionPath))) {
      fs.mkdirSync(path.dirname(sessionPath), { recursive: true })
    }

    if (fs.existsSync(sessionPath)) return true

    if (!config.SESSION_ID) {
      console.error('❌ SESSION_ID missing in config.js')
      process.exit(1)
    }

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

    if (config.SESSION_ID && config.SESSION_ID.startsWith('ARSL~')) {
      await downloadSession()
    }

    const { state, saveCreds } = await useMultiFileAuthState(
      path.join(__dirname, 'sessions')
    )

    // Yahan se fix shuru hota hai
    const { version, isLatest } = await fetchLatestBaileysVersion()
    if (!isLatest) {
      console.log('⚠️ Using outdated Baileys version, consider updating')
    }

    const conn = makeWASocket({
      logger: P({ level: 'silent' }),
      printQRInTerminal: true,
      browser: Browsers.macOS('Safari'),
      auth: state,
      version: version, // Yahan version use hua hai
      markOnlineOnConnect: true,
      getMessage: async () => ({})
    })

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
          const delay = Math.min(3000 * retryCount, 30000)
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
        fs.readdirSync("./plugins/").forEach((plugin) => {
          if (path.extname(plugin).toLowerCase() === ".js") {
            try {
              require("./plugins/" + plugin)
              console.log(`✅ Loaded plugin: ${plugin}`)
            } catch (pluginError) {
              console.error(`❌ Failed to load plugin ${plugin}:`, pluginError.message)
            }
          }
        })

        // Send connection message
        try {
          const up = `*╭──────────────●●►*
> *➺ Arslan-XD ᴄᴏɴɴᴇᴄᴛᴇᴅ sᴜᴄᴄᴇssғᴜʟʟʏ! ᴛʏᴘᴇ .ᴍᴇɴᴜ ᴛᴏ ᴄᴏᴍᴍᴀɴᴅ*
> *❁ ᴊᴏɪɴ ᴏᴜʀ ᴡʜᴀᴛsᴀᴘᴘ ᴄʜᴀɴɴᴇʟ ғᴏʀ ᴜᴘᴅᴀᴛᴇs:*
*https://whatsapp.com/channel/0029VarfjW04tRrmwfb8x306*
*BOT ACTIVE NOW ENJOY♥️🪄*\n\n*PREFIX: ${prefix}*
*╰──────────────●●►*`
          
          await conn.sendMessage(
            conn.user.id, 
            { 
              image: { url: MENU_IMG }, 
              caption: up 
            }
          )
        } catch (sendError) {
          console.error("❌ Failed to send connection message:", sendError.message)
        }
      }
    })

    conn.ev.on('creds.update', saveCreds)

    // Message handler
    conn.ev.on('messages.upsert', async ({ messages }) => {
      const m = messages[0]
      if (!m.message) return
      
      // Yahan tumhara message handling logic aayega
      // Jaise commands process karna, auto-react, etc.
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

//===================START THE BOT============================
connectToWhatsApp()
  .then(() => console.log('🤖 Arslan-XD is running...'))
  .catch(err => console.error('❌ Bot failed to start:', err))
