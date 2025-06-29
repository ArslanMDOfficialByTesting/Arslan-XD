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
const config = require('./config')

// Session Downloader (Improved)
async function downloadSession() {
  const sessionDir = path.join(__dirname, 'sessions')
  const credsPath = path.join(sessionDir, 'creds.json')
  
  try {
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true })
    }

    // Skip if session exists
    if (fs.existsSync(credsPath)) return true

    if (!config.SESSION_ID || !config.SESSION_ID.startsWith('ARSL~')) {
      console.log('❌ Invalid ARSL~ session format in config.js')
      return false
    }

    console.log('⬇️ Downloading ARSL session...')
    const fileId = config.SESSION_ID.replace('ARSL~', '')
    const file = File.fromURL(`https://mega.nz/file/${fileId}`)
    
    const buffer = await new Promise((resolve, reject) => {
      file.download({ maxRetries: 3 }, (err, data) => {
        err ? reject(err) : resolve(data)
      })
    })

    fs.writeFileSync(credsPath, buffer)
    console.log('✅ Session downloaded successfully!')
    return true
  } catch (error) {
    console.error('❌ Session download failed:', error.message)
    return false
  }
}

// Main Connection Handler
async function connectToWhatsApp() {
  let retryCount = 0
  const MAX_RETRIES = 3

  const connect = async () => {
    try {
      console.log(`♻️ Connection Attempt: ${retryCount + 1}/${MAX_RETRIES}`)

      // Try ARSL~ session first
      if (config.SESSION_ID?.startsWith('ARSL~')) {
        await downloadSession()
      }

      const { state, saveCreds } = await useMultiFileAuthState('sessions')
      const { version } = await fetchLatestBaileysVersion()

      const bot = makeWASocket({
        auth: state,
        version,
        printQRInTerminal: true,
        logger: P({ level: 'silent' }),
        browser: ["Chrome (Linux)", "", ""]
      })

      bot.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update

        if (connection === 'close') {
          const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
          
          if (shouldReconnect && retryCount < MAX_RETRIES) {
            retryCount++
            console.log(`⌛ Reconnecting in 5s...`)
            setTimeout(connect, 5000)
          } else {
            console.log('❌ Permanent disconnection')
            process.exit(1)
          }
        }

        if (connection === 'open') {
          console.log('\n✅ Arslan-XD Connected!')
          retryCount = 0

          // Load plugins
          fs.readdirSync('./plugins').forEach(file => {
            if (file.endsWith('.js')) {
              try {
                require(`./plugins/${file}`)
                console.log(`✅ Plugin: ${file}`)
              } catch (e) {
                console.log(`❌ Failed: ${file} - ${e.message}`)
              }
            }
          })

          // Send connection message
          bot.sendMessage(
            bot.user.id, 
            { 
              text: `*Arslan-XD Activated!*\n` +
                    `➤ Prefix: ${config.PREFIX || '.'}\n` +
                    `➤ Mode: ${config.MODE || 'public'}\n` +
                    `➤ Owner: ${config.OWNER_NUMBER || 'Not set'}`
            }
          )
        }
      })

      bot.ev.on('creds.update', saveCreds)

      // Message handler (your existing logic)
      bot.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0]
        if (!m.message) return
        
        // Your existing message processing logic here...
        // Auto-react, commands handling etc.
      })

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

// Start the bot
connectToWhatsApp()
  .then(() => console.log('\n🚀 Bot is running!'))
  .catch(err => console.error('❌ Startup failed:', err))

// Keep alive for Render
const express = require('express')
const app = express()
const port = process.env.PORT || 3000
app.get('/', (req, res) => res.send('Arslan-XD is active!'))
app.listen(port, () => console.log(`🌐 Server running on port ${port}`))
