const {remote,ipcRenderer} = require('electron')
const {Menu,MenuItem} = remote

const menuTpl = [
  {
    label: 'Copy Text',
    enabled: true,
    click: (e) => {
      //remote.getCurrentWindow().inspectElement(rightClickPosition.x, rightClickPosition.y)
      vue.copyText(vue.currIndex)
    }
  },
  {
    label: 'Simple HTML',
    enabled: true,
    click: (e) => {
      vue.copySimple(vue.currIndex)
    }
  },
  {
    label: 'HTML Source Code',
    enabled: true,
    click: (e) => {
      vue.copySource(vue.currIndex)
    }
  },
  {
    label: 'Full HTML',
    enabled: true,
    click: (e) => {
      vue.copyHtml(vue.currIndex)
    }
  },
  {
    label: 'As Markdown link',
    enabled: true,
    click: (e) => {
      vue.copyMD(vue.currIndex)
    }
  },
  {
    label: 'As lower case',
    click: (e) => {
      vue.copyText(vue.currIndex,'lower')
    }
  },
  {
    label: 'As UPPER CASE',
    click: (e) => {
      vue.copyText(vue.currIndex,'upper')
    }
  },
  {
    type: 'separator'
  },
  {
    label: 'Edit',
    click: (e) => {
      vue.editItem(vue.currIndex)
    }
  },
  ,
  {
    label: 'Archive',
    click: (e) => {
      vue.addToSnippets(vue.currIndex)
    }
  },
  {
    label: 'Delete',
    click: (e) => {vue.deleteClip(vue.currIndex)
    }
  }
];

const config = {
  core: {
    maxClips: 200
  },
  en: {
    appName: 'Clip Base',
    clipsSingular: 'clip',
    clipsPlural: 'clips',
    clipsEmpty: 'Your clip base is empty',
    clipHint: 'Click to copy / Double-click to edit'
  }
}

const menu = Menu.buildFromTemplate(menuTpl)

String.prototype.captureBetweenTags = function(tagName = '') {
  let rgxStart = new RegExp('<'+tagName+'[^>]*?>','i')
  let rgxEnd = new RegExp('</'+tagName+'>','i')
  let parts = this.split(rgxStart)
  return parts.pop().split(rgxEnd).shift();
}

const dbReq = indexedDB.open('clipbase')
var db, snippetsStore

dbReq.onsuccess = function(e) {
  db = e.target.result;
  let ev = new CustomEvent('index-db')
  window.dispatchEvent(ev)
  ipcRenderer.send('index-db', true)
}

dbReq.onerror = function(e) {
  console.log('could not connect to indexDB')
}

dbReq.onupgradeneeded = function(e) {
  db = e.target.result;
  if (!db.objectStoreNames.contains('snippets')) {
    snippetsStore = db.createObjectStore('snippets', {keyPath: 'id', autoIncrement: true});
  }
}

function getObjectStore() {
  if (db) {
    let transaction = db.transaction(['snippets'],"readwrite")
    return transaction.objectStore('snippets')
  }
}

function matchFilter(obj, filter) {
  let valid = true
  if (typeof filter === 'object') {
    let keys = Object.keys(filter), k
    for (let i = 0; i < keys.length; i++) {
      k = keys[i]
      valid = false
      if (obj.hasOwnProperty(k)) {
        valid = obj[k] == filter[k] 
      }
    }
  }
  return valid
}

function fetch(filter, fetchItems) {
  let store = getObjectStore()

  if (store) {
    store.openCursor().onsuccess = function(event) {
      if (event.target.result) {
        let count = 0
        let cursor = event.target.result
        if (typeof cursor.value === 'object') {
          if (cursor.value.text) {
            if (matchFilter(cursor.value, filter)) {
              let c = new Clip(cursor.value)
              if (fetchItems instanceof Array) {
                fetchItems.unshift(cursor.value)
                if (fetchItems.length > 2) {
                  fetchItems.sort( (a, b) => a.ts < b.ts)
                }
              }
            }
          }
        }
        cursor.continue()
      }
    }
  }
}

function storeSnippet(snippet) {
  let store = getObjectStore()
  if (store) {
    let keys = Object.keys(snippet)
    let obj = {}, k
    for (let i = 0; i < keys.length; i++) {
      k = keys[i]
      obj[k] = snippet[k]
    }
    let req = store.add(obj)
  }
}

function deleteSnippet(snippet) {
  let store = getObjectStore()
  if (store) {
    let req = store.get(snippet.id)
    req.onsuccess = (e) => {
      store.delete(snippet.id)
    }  
  }
}

function updateSnippet(snippet) {
  let store = getObjectStore()
  if (store) {
    let req = store.get(snippet.id)
    req.onsuccess = (e) => {
      store.put(snippet)
    }  
  }
}

class Clip {
  constructor(obj) {
    if (typeof obj !== 'object') {
      obj = {}
    }
    if (obj.text) {
      this.text = obj.text
    } else {
      this.text = ''
    }
    if (obj.lib) {
      this.lib = obj.lib
    } else {
      this.lib = 'clips'
    }
    if (obj.format) {
      this.format = obj.format
    } else {
      this.format = 'text'
    }
    if (obj.html) {
      this.html = obj.html
    } else {
      this.html = ''
    }
    if (obj.id) {
      this.id = obj.id
    }
    if (obj.hasOwnProperty('tags') && obj.tags instanceof Array) {
      this.tags = obj.tags
    } else {
      this.tags = []
    }
    if (obj.title) {
      this.title = obj.title
    }
    this.hasHtml = this.validHtml()
    if (!this.hasHtml) {
      this.html = ''
      this.format = 'text'
    }
    this.classes = [this.format]
    this.isLink = this.validUrl()
    if (obj.ts instanceof Date) {
      this.ts = obj.ts
    } else {
      this.ts = new Date()
    }
  }

  validHtml () {
    if (typeof this.html == 'string' && this.html.length > 10) {
      if (/<\w+[^>]*?>/.test(this.html) && /<\/\w+>/.test(this.html)) {
        return this.html.replace(/<\/?\w+[^>]*?>/g,'').trim().length > 0
      }
    }
    return false
  }

  validUrl () {
    return /^https?:\/\/\w+[a-z0-9_-]+(\.[a-z0-9_-]+)+\/?.*?$/i.test(this.text.trim())
  }

  addTag (tag) {
    var index = this.tags.indexOf(tag)
    if (index < 0) {
      this.tags.push(tag)
    }
  }

  hasTitle () {
    if (this.title) {
      if (typeof this.title == 'string') {
        return this.title.trim().length > 1
      }
    }
    return false
  }

  removeTag (tag) {
    var index = this.tags.indexOf(tag)
    if (index >= 0) {
      this.tags.splice(index,1)
    }
  }

  addClass (cn) {
    var index = this.classes.indexOf(cn)
    if (index < 0) {
      this.classes.push(cn)
    }
  }

  removeClass (cn) {
    var index = this.classes.indexOf(cn)
    if (index >= 0) {
      this.classes.splice(index,1)
    }
  }
  setLib (lib) {
    if (typeof lib === 'string') {
      this.lib = lib
    }
  }
}

Vue.filter('fileSize', function (value) {
    if (typeof value === 'string' && /^\d+(\.)\d+$/.test(value)) {
      value = parseFloat(value)
    }
    if (typeof value === 'number') {
      if (value >= (1024 * 1024)) {
        value = (value / (1024 * 1024)).toFixed(2) + 'MB'
      } else if (value >= (1024 * 100)) {
        value = Math.ceil(value / 1024) + 'KB'
      } else if (value >= (1024 * 20)) {
        value = (value / 1024).toFixed(1) + 'KB'
      } else if (value >= 1024) {
        value = (value / 1024).toFixed(2) + 'KB'
      } else {
        value = Math.ceil(value) + ' bytes'
      }
    }
    return value
})

Vue.filter('dmy', function (value) {
  if (value instanceof Date) {
    let m = moment(value)
    return m.format('HH:mm:ss DD/MM/YYYY')
  }
})

const vue = new Vue({
  el: '#app',
  mixins: [ VueFocus.mixin ],
  data: {
    title: '',
    config: {},
    clips: [],
    numClips: 0,
    snippets: [],
    mode: 'clips',
    snippetsLib: 'snippets',
    snippetsLibs: [],
    numSnippets: 0,
    numClipsLabel: '',
    recopied: false,
    currIndex: 0,
    editIndex: -1,
    viewMenu: false,
    cMenuTop: 0,
    cMenuLeft: 0,
    textFilter: '',
    currItem: {
      index: 0,
      text: '',
      format: 'text'
    },
    editText: '',
    editFocus: false,
    editMode: 'clips',
    editFormat: 'text',
    editClasses: ['hidden'],
    previewText: '',
    previewClasses: ['hidden']
  },
  created: function() {
    this.config = config['en']
    if (typeof config.core == 'object') {
      for (let k in config.core) {
        this.config[k] = config.core[k]
      }
    }
    window.addEventListener('index-db',(e) => {
      vue.fetchClips()
      vue.fetchSnippets()
      setTimeout(_ => {
        console.log(this.clips[0])
      },2000)
    })

    this.currItem = new Clip(this.currItem)
    //this.loadLib('clips')
    //this.loadLib('snippets')

    ipcRenderer.on('clip-stack', (event, clip) => {
      if (vue.recopied === false && clip instanceof Object && clip.hasOwnProperty('text')) {
        clip.hasHtml = vue.validHtml(clip)
        clip.classes = clip.hasHtml? ['html'] : ['text']
        let firstClip = {text: ''}
        if (vue.clips.length) {
          firstClip = vue.clips[0]
        }
        if (vue.clips.text !== firstClip.text) {
          if (vue.numClips >= vue.config.maxClips) {
            vue.clips.pop()
          }
          let replace = (vue.numClips > 0 && clip.text === vue.clips[0].text)
          clip.id = replace? vue.clips.length : vue.clips.length + 1
          clip = new Clip(clip)
          console.log(clip.isLink)
          if (clip.isLink) {
            axios.get(clip.text)
            .then(function (response) {
              if (response.headers['content-type']) {
                if (response.headers['content-type'].indexOf('text/html') >= 0) {
                  let str = response.data
                  if (typeof str== 'string' && (str.indexOf('<html') >= 0 || str.indexOf('<HTML') >= 0)) {
                    let title = str.captureBetweenTags('title')
                    if (typeof title == 'string' && title.trim().length > 1) {
                      clip.title = title.trim()
                      console.log(clip)
                      updateSnippet(clip)
                    }
                  }
                }
              }
            })
            .catch(function (error) {
              console.log(error);
            });
          }
          if (replace) {
            vue.clips[0] = clip
          } else {
            vue.clips.unshift(clip)
          }
          //vue.baseSize = storeItem('clips', this.clips)
          vue.numClips = vue.clips.length
          storeSnippet(clip)
        }
      }
    })
    ipcRenderer.on('recopied',(status) => {
      if (status) {
        vue.recopied = true
        setTimeout(_ => {
          vue.recopied = false
        }, 500)
      }
    })
    window.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      rightClickPosition = {x: e.x, y: e.y}
      let len = 0, items = []
      if (this.mode == 'clips') {
        len = vue.clips.length;
        items = vue.clips
      } else {
        len = vue.snippets.length
        items = vue.snippets
      }
      if (vue.currIndex < len) {
        let clip = items[vue.currIndex]
        if (clip.text) {
          clip.hasHtml = this.validHtml(clip)
          if (clip.hasHtml === false) {
            menu.items[1].enabled = false
            menu.items[2].enabled = false
            menu.items[3].enabled = false
          } else {
            menu.items[1].enabled = true
            menu.items[2].enabled = true
            menu.items[3].enabled = true
          }
          menu.items[4].enabled = false
          if (clip.hasOwnProperty('title')) {
            if (clip.title.length >2) {
              menu.items[4].enabled = true
            }
          }
          menu.popup(remote.getCurrentWindow())
        }
      }
      
    }, false)

    addEventListener('keydown', (e) => {
      let cName = e.code.toLowerCase()
      switch (cName) {
        case 'escape':
          vue.closeOverlay()
          break;
      }
    })
    setTimeout(_ => {
      let rn = Math.ceil(Math.random() * 1000);
      let recentClips = []
      if (vue.clips.length < 10) {
        recentClips = vue.clips
      } else {
        recentClips = vue.clips.slice(0,9)
      }
      if (recentClips.length > 0) {
        ipcRenderer.send('load-recent',recentClips)
      }
    }, 1000)
  },
  watch: {
    currIndex: function() {
      this.updateClipClasses(this.mode)
    },
    numClips: function() {
      if (this.numClips >0 ) {
        let word = this.numClips > 1 ? this.config.clipsPlural : this.config.clipsSingular
         this.numClipsLabel = `${this.numClips} ${word}`
      } else {
        this.numClipsLabel = config.clipsEmpty
      }
      document.title = this.config.appName + ': ' + this.numClipsLabel
    },
    textFilter: function() {
      this.textFilter = this.textFilter.trim()
      let empty = this.textFilter.length < 1
      let rgx = new RegExp(this.textFilter, 'i'), index = -1
      this.filterItems(rgx,empty,'clips')
      this.filterItems(rgx,empty,'snippets')
    }
  },
  methods: {
    fetchClips: function() {
      fetch({lib: 'clips'},this.clips)
    },
    fetchSnippets: function() {
      fetch({lib: this.snippetsLib},this.snippets)
    },
    copyText: function(index, transform = '') {
      this.copyItem(index,'text',transform)
    },
    copyHtml: function(index) {
      this.copyItem(index,'html')
    },
    copySource: function(index) {
      this.copyItem(index,'html','source')
    },
    copySimple: function(index) {
      this.copyItem(index,'html','simple')
    },
    copyMD: function(index) {
      this.copyItem(index,'text','md')
    },
    copyItem: function(index,format, transform) {
      let items = this.mode === 'snippets'? this.snippets : this.clips
      if (items.length > index && index >= 0) {
        let clip = items[index]
        let text = ''
        if (transform) {
          switch (transform) {
            case 'lower':
              text = clip.text.trim().toLowerCase()
              break;
            case 'upper':
              text = clip.text.trim().toUpperCase()
              break;
            case 'md':
              let title = clip.title? clip.title : clip.text
              text = `[${title}](${clip.text})`
              break;
          }
        }
        if (format === 'html') {
          switch (transform) {
            case 'source':
              text = this.cleanHtmlString(clip.html)
              format = 'text'
              break
            case 'simple':
              text = this.cleanHtmlString(clip.html)
              break
          }
        }
        if (text.length < 1) {
          switch (format) {
            case 'html':
              text = clip.html
              break
            default:
              text = clip.text
              break
          }
        }
        ipcRenderer.send('copy-' + format, text)
        clip.classes.push('copying')
        var copiedClip = clip
        setTimeout(_  => {
          var index = copiedClip.classes.indexOf('copying'); 
          copiedClip.classes.splice(index,1)
        },1000)
        if (this.editClasses.indexOf('overlay') > -1) {
          this.closeOverlay()
        }
      }
    },
    editHtml: function() {
      if (this.currItem) {
        if (this.currItem.hasHtml) {
          this.editText = this.cleanHtmlString(this.currItem.html)
          this.editFormat = 'html'
        }
      }
    },
    deleteClip: function(index) {
      this.deleteItem(index,'clips')
    },
    deleteSnippet: function(index) {
      this.deleteItem(index,'snippets')
    },
    deleteItem: function(index, mode) {
      let items = mode === 'snippets'? this.snippets : this.clips
      if (index < items.length) {
        deleteSnippet(items[index])
        items.splice(this.currIndex,1)
        let lib = 'clips'
        if (mode === 'snippets') {
          lib = this.snippetsLib
        }
        if (mode === 'snippets') {
          this.numSnippets = items.length
        } else {
          this.numClips = items.length
        }
      }
      this.closeOverlay()
    },
    addActive: function(index,mode) {
      this.currIndex = index
      let items = mode == 'snippets'? this.snippets : this.clips
      this.mode = mode
      if (index < items.length) {
        let item = items[index]
        this.previewText = this.clipLong(item)
        this.previewClasses = ['show']
        if (!item.hasHtml) {
          this.previewClasses.push('pre')
        }
      }
    },
    updateClipClasses: function(mode) {
      let items = mode === 'snippets'? this.snippets : this.clips
      if (this.currIndex < items.length) {
        for (let i=0; i < items.length; i++) {
          if (!items[i].classes) {
            items[i].classes = []
          } else if (typeof items[i].classes == 'string') {
            items[i].classes = [items[i].classes]
          }
          index = items[i].classes.indexOf('active')
          if (i === this.currIndex) {
            if (index < 0) {
              items[i].classes.push('active')
            }
          } else if (index >= 0) {
            items[i].classes.splice(index, 1)
          }
        }
      }
    },
    clipShort: function(clip) {
      if (typeof clip == 'object' && typeof clip.text == 'string') {
          if (clip.text.length > 64) {
          let words = clip.text.trim().substring(0,70).split(' ')
          if (words.length > 1) {
            words.pop()
          }
          return words.join(' ')
        } else {
          return clip.text.trim()
        }
      }
    },
    clipLong: function(clip) {
      if (typeof clip == 'object') {
        if (this.validHtml(clip)) {
          return clip.html
        } else {
          return clip.text
        }
      }
    },
    filterItems: function(rgx, empty, mode) {
      let items = mode === 'snippets'? this.snippets : this.clips
      let index = -1
      for (let i = 0; i < items.length; i++) {
        index = items[i].classes.indexOf('hidden')
        if (empty || rgx.test(items[i].text)) {
          if (index > -1) {
            items[i].classes.splice(index, 1)
          }
        } else {
          if (index < 0) {
            items[i].classes.push('hidden')
          }
        }
      }
    },
    validHtml: function(clip) {
      if (typeof clip.html == 'string' && clip.html.length > 10) {
        if (/<\w+[^>]*?>/.test(clip.html) && /<\/\w+>/.test(clip.html)) {
          return clip.html.replace(/<\/?\w+[^>]*?>/g,'').trim().length > 0
        }
      }
      return false
    },
    cleanHtmlString: function(html) {
      if (typeof html == 'string') {
        var z = Zepto('<section>'+html+'</section>')
        z.find('meta, script, style').remove()
        z.find('font > *').unwrap();
        z.find('*').removeAttr('style');
        let spans = z.find('span');
        if (spans.length > 0) {
          for (let i = 0; i < spans.length; i++) {
            if (spans.eq(i).attr().length < 1) {
              spans.eq(i).unwrap()
            } else if (spans.eq(i).text().trim().length < 1) {
              spans.eq(i).remove();
            }
          }
        }
        html = z.html()
      }
      return html
    },
    toggleMode: function(mode, lib) {
      this.mode = mode
      if (lib) {
        this.snippetsLib = lib
      }
    },
    addToSnippets: function(index) {
      if (index < this.clips.length) {
        let clip = this.clips[index]
        if (clip) {
          this.snippets.unshift(clip)
          this.numSnippets = this.snippets.length
          if (clip.id) {
            clip.lib = this.snippetsLib
            updateSnippet(clip)
          }
          this.clips.splice(index,1)
        }
      }
    },
    editClip: function (index) {
      this.editItem(index, 'clips')
    },
    editSnippet: function (index) {
      this.editItem(index, 'snippets')
    },
    editItem: function(index, mode) {
      if (!mode) {
        mode = this.mode
      }
      let items = mode === 'snippets'? this.snippets : this.clips
      if (index < items.length) {
        let item = items[index]
        if (item instanceof Object) {
          this.currItem = new Clip(item)
          this.editIndex = index
          this.editMode = mode
          this.editFormat = 'text'
          this.editText = this.currItem.text
          this.editClasses = ['overlay']
          this.editFocus = true
          
        }
      } 
    },
    saveItem: function() {
      let items = this.editMode === 'snippets'? this.snippets : this.clips
      if (this.editIndex < items.length) {
        let item = items[this.editIndex]
        if (item instanceof Object) {
          if (this.editFormat === 'html') {
            item.html = this.editText
          } else {
            item.text = this.editText
          }
          this.editClasses = ['hidden']
          this.editFocus = false
          item.lib = this.editMode == 'snippets'? this.snippetsLib : 'clips'
          updateSnippet(item)
        }
      }
    },
    closeOverlay: function() {
      this.editClasses = ['hidden']
      this.editFocus = false
    },
    clearFilter: function() {
      this.textFilter = ''
    },
    hidePreview: function() {
      this.previewClasses = ['hidden']
    }
  }
})