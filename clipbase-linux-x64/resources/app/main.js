const electron = require('electron')
const windowStateKeeper = require('electron-window-state')
// Module to control application life.
const {app, clipboard, Tray, Menu, globalShortcut, ipcMain} = electron;
// Module to create native browser window.
const BrowserWindow = electron.BrowserWindow

const path = require('path')
const url = require('url')

const STACK_SIZE = 9
const SHORTCUT_SIZE = 9
const ITEM_MAX_LENGTH = 20

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow

var stack = []
var recopied = false

function createWindow () {
  // Create the browser window.
  let winState = windowStateKeeper({
    defaultWidth: 400,
    defaultHeight: 800
  });
  mainWindow = new BrowserWindow({
    width: winState.width,
    height: winState.height,
    minWidth: 200,
    minHeight: 400,
    maxWidth: 800,
    x: winState.x,
    y: winState.y
  })

  // and load the index.html of the app.
  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  }))

  checkClipboardForChange(clipboard,text => {
    stack = addToStack(clipboard,stack)
    if (stack.length > 0) {
      mainWindow.webContents.send('clip-stack',stack[0])
      tray.setContextMenu(Menu.buildFromTemplate(formatMenuTemplateForStack(stack)))
      registerShortcuts(globalShortcut, clipboard, stack)
    }
  })

  // Open the DevTools.
  // mainWindow.webContents.openDevTools()
  mainWindow.on('close', () => {
      winState.saveState(mainWindow);
  });
  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null
  })
  const tray = new Tray( path.join('static','images', 'clipbase-16.png') )
  tray.setContextMenu(Menu.buildFromTemplate([{
    label: 'Open',
    click: function () {

    },
    enabled: true
  }]))
  ipcMain.on('load-recent', (event,clips) => {
    if (clips instanceof Array) {
      if (clips.length > 0) {
        if (tray) {
          stack = clips
          tray.setContextMenu(Menu.buildFromTemplate(formatMenuTemplateForStack(stack)))
          registerShortcuts(globalShortcut, clipboard, stack)
        }
      }
    }
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', function () {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', function () {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow()
  }
})

ipcMain.on('copy-text', (event,text) => {
  recopyClip(text,'text')
})


ipcMain.on('copy-html', (event,text) => {
  recopyClip(text,'html')
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

function recopyClip(text, type) {
  let currText = clipboard.readText()
  if (text !== currText) {
    recopied = true
    switch (type) {
      case 'html':
        clipboard.writeHTML(text)
        break
      default:
        clipboard.writeText(text)
        break
    }
    setTimeout(_ => {
      recopied = false
    }, 1000)
  }
}

function addToStack(clipboard, stack) {
  let format = clipboard.availableFormats().indexOf('text/html') >= -1? 'html' : 'text'
  let item = {
    text: clipboard.readText(),
    format: format
  }
  if (format === 'html') {
    let html = clipboard.readHTML();
    if (html !== item.text) {
      item.html = html
    } else {
      item.html = ''
    }
  }
  
  return [item].concat(stack.length >= STACK_SIZE ? stack.slice(0, stack.length-1) : stack)
}

function checkClipboardForChange(clipboard, onChange) {
  let cache = clipboard.readText()

  let latest = null
  setInterval(_ => {
    if (clipboard.availableFormats().indexOf('text/plain') >= -1) {
      latest = clipboard.readText().trim()
      if (latest !== cache && latest.length > 2) {
        cache = latest
        if (!recopied) {
          onChange(cache)
        }
      }
    }
  }, 1000)
}

function formatItem(item) {
  item = item.trim()
  return item && item.length > ITEM_MAX_LENGTH ? item.substr(0,ITEM_MAX_LENGTH) : item
}

function formatMenuTemplateForStack(stack) {
  return stack.map((item, i) => {
    return {
      label: `${formatItem(item.text)}`,
      click: _ => {
        mainWindow.webContents.send('recopied',true)
        clipboard.writeText(item.text.trim())
      }
    }
  })
}

function registerShortcuts(globalShortcut, clipboard, stack) {
  globalShortcut.unregisterAll()
  for (let i = 0; i < SHORTCUT_SIZE; ++i) {
    globalShortcut.register(`Ctrl+Alt+${i+1}`, _ => {
      clipboard.writeText(stack[i].text)
    })
  }
}