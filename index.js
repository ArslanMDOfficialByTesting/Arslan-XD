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

// Configurations
const config = {
  SESSION_ID: "ARSL~5qUSGDST#wzzflTO7fxJr4JbX8A_0Q7jKXefpdzF_E9jKH2ucAGA",
  PREFIX: ".",
  OWNER_NUMBER: ["923237045919"],
  MENU_IMG: "https://telegra.ph/file/example.jpg"
}

// Session Downloader
async function downloadSession() {
  const sessionPath = path.join(__dirname, 'sessions', 'creds.json')
  
  try {
    if (!fs.existsSync(path.dirname(sessionPath))) {
      fs.mkdirSync(path.dirname(sessionPath), { recursive: true })
    }

    if (fs.existsSync(sessionPath)) {
      console.log('✅ Using existing session')
      return true
    }

    if (!config.SESSION_ID) {
      throw new Error('SESSION_ID missing in config')
    }

    const sessdata = config.SESSION_ID.replace(/^ARSL~/, '')
    console.log('📥 Downloading session from MEGA...')
    
    const filer = File.fromURL(`https://mega.nz/file/${sessdata}`)
    const buffer = await new Promise((resolve, reject) => {
      filer.download({ maxRetries: 3 }, (err, data) => {
        err ? reject(err) : resolve(data)
      })
    })

    fs.writeFileSync(sessionPath, buffer)
    console.log('✅ Session downloaded successfully')
    return true
  } catch (error) {
    console.error('❌ Session error:', error.message)
    process.exit(1)
  }
}

// WhatsApp Connection
async function connectToWhatsApp() {
  let retryCount = 0
  const MAX_RETRIES = 5

  const connect = async () => {
    try {
      console.log(`♻️ Connecting (Attempt ${retryCount + 1}/${MAX_RETRIES})`)
      
      await downloadSession()

      const { state, saveCreds } = await useMultiFileAuthState(
        path.join(__dirname, 'sessions')
      )

      const { version } = await fetchLatestBaileysVersion()
      
      const sock = makeWASocket({
        logger: P({ level: 'silent' }),
        printQRInTerminal: true,
        browser: Browsers.macOS('Safari'),
        auth: state,
        version,
        getMessage: async () => ({})
      })

      sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update
        
        if (qr) qrcode.generate(qr, { small: true })

        if (connection === 'close') {
          const reason = lastDisconnect?.error?.output?.statusCode || DisconnectReason.connectionClosed
          console.log(`❌ Disconnected (${reason})`)
          
          if (reason !== DisconnectReason.loggedOut && retryCount < MAX_RETRIES) {
            retryCount++
            setTimeout(connect, 3000 * retryCount)
          } else {
            console.log('❌ Max retries reached')
            process.exit(1)
          }
        }

        if (connection === 'open') {
          console.log('✅ Connected to WhatsApp!')
          
          // Load plugins
          fs.readdirSync('./plugins').forEach(plugin => {
            if (path.extname(plugin) === '.js') {
              try {
                require(`./plugins/${plugin}`)
                console.log(`✅ Loaded: ${plugin}`)
              } catch (e) {
                console.log(`❌ Failed: ${plugin}`, e.message)
              }
            }
          })

          // Send connection message
          sock.sendMessage(
            sock.user.id, 
            { 
              text: `*Arslan-XD Activated!*\nPrefix: ${config.PREFIX}\nOwner: ${config.OWNER_NUMBER}`
            }
          )
        }
      })

      sock.ev.on('creds.update', saveCreds)

      return sock
    } catch (error) {
      console.error('❌ Connection failed:', error.message)
      if (retryCount < MAX_RETRIES) {
        retryCount++
        setTimeout(connect, 5000)
      } else {
        console.log('❌ Max connection attempts reached')
        process.exit(1)
      }
    }
  }

  return await connect()
}

// Start the bot
connectToWhatsApp()
  .then(() => console.log('🤖 Arslan-XD is running!'))
  .catch(err => console.error('❌ Startup error:', err))
