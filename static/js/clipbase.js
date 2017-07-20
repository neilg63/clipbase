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
    label: 'Plain HTML',
    enabled: true,
    click: (e) => {
      vue.copySimple(vue.currIndex)
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
    label: 'As lower case',
    click: (e) => {vue.copyText(vue.currIndex,'lower')
    }
  },
  {
    label: 'As UPPER CASE',
    click: (e) => {vue.copyText(vue.currIndex,'upper')
    }
  },
  {
    type: 'separator'
  },
  {
    label: 'Edit',
    click: (e) => {
     // remote.getCurrentWindow().inspectElement(rightClickPosition.x, rightClickPosition.y)
      vue.editItem(vue.currIndex)
    }
  },
  ,
  {
    label: 'Archive',
    click: (e) => {
     // remote.getCurrentWindow().inspectElement(rightClickPosition.x, rightClickPosition.y)
      vue.addToSnippets(vue.currIndex)
    }
  },
  {
    label: 'Delete',
    click: (e) => {
     // remote.getCurrentWindow().inspectElement(rightClickPosition.x, rightClickPosition.y)
      vue.deleteClip(vue.currIndex)
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

function storeItem(key,data) {
  var ts = Date.now() / 1000,sd = ts + ':';
  if (typeof data == 'object') {
    sd += 'obj:' + JSON.stringify(data);
  } else {
    sd += 'sca:' + data;
  }
  localStorage.setItem(key,sd);
  return ts;
}

function getItem(key,maxAge,unit) {
  var ts = Date.now() / 1000,obj={expired:true,valid:false},data=localStorage.getItem(key);
  if (data) {
    parts = data.split(':');
    if (parts.length>2) {
      if (!maxAge) {
        maxAge = (86400 * 7);
      }
      switch (unit) {
        case 'y':
          maxAge *= (86400 * 365.25);
          break;
        case 'w':
          maxAge *= (86400 * 7);
          break;
        case 'd':
          maxAge *= 86400;
          break;
        case 'h':
          maxAge *= 3600;
          break;
      }
      obj.ts = parts.shift();
      obj.ts = obj.ts - 0;
      obj.type = parts.shift();
      obj.data = parts.join(':');
      if (obj.type == 'obj') {
        obj.data = JSON.parse(obj.data); 
      }
      obj.valid = true;
      if (obj.ts > (ts - maxAge)) {
        obj.expired = false;
      }
    }
  }
  return obj;
}

function deleteItem(key) {
  if (localStorage.getItem(key) !== null) {
    localStorage.removeItem(key);
    return true;
  }
  return false;
}

const dbReq = indexedDB.open('clipbase')
var db, snippetsStore

dbReq.onsuccess = function(e) {
  db = e.target.result;
  console.log('connected to indexDB')
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

function storeSnippet(snippet) {
  if (db) {
    let transaction = db.transaction(['snippets'],"readwrite")
    let store = transaction.objectStore('snippets')
    let keys = Object.keys(snippet)
    let obj = {}, k
    for (let i = 0; i < keys.length; i++) {
      k = keys[i]
      obj[k] = snippet[k]
    }
    let req = store.add(obj)
  }
}

function getSnippets(filter) {


}

class Clip {
  constructor(first, format, html = '', index = 0) {
    if (typeof first == 'string' && typeof format == 'string') {
      this.text = text
      this.format = format
      this.html = html
      this.id = index
    } else if (typeof first === 'object') {
      if (first.text) {
        this.text = first.text
      }
      if (first.format) {
        this.text = first.format
      }
      if (first.html) {
        this.html = first.html
      } else {
        this.html = ''
      }
      if (first.id) {
        this.id = first.id
      }
    }
    this.hasHtml = this.validHtml()
    if (!this.hasHtml) {
      this.html = ''
    }
    if (tags instanceof Array) {
     this.tags = tags
    } else {
      this.tags = []
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

  addTag (tag) {
    this.tags.push(tag)
  }

  removeTag (tag) {
    var index = this.tags.indexOf(tag)
    if (index >= 0) {
      this.tags.splice(index,1)
    }
  }
}

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
    currIndex: 0,
    editIndex: -1,
    viewMenu: false,
    cMenuTop: 0,
    cMenuLeft: 0,
    textFilter: '',
    currItem: {
      index: 0,
      text: ''
    },
    editText: '',
    editFocus: false,
    editMode: 'clips',
    editClasses: ['hidden'],
    previewText: '',
    previewClasses: ['hidden'],
    dummy: {}
  },
  created: function() {
    this.config = config['en']
    if (typeof config.core == 'object') {
      for (let k in config.core) {
        this.config[k] = config.core[k]
      }
    }
    let stored = getItem('clips')
    if (stored.valid) {
      if (stored.data instanceof Array) {
        this.clips = stored.data
        this.updateClipClasses()
        this.numClips = this.clips.length
      }
    }
    stored = getItem(this.snippetsLib)
    if (stored.valid) {
      if (stored.data instanceof Array) {
        this.snippets = stored.data
        this.updateClipClasses('snippets')
        this.numSnippets = this.snippets.length
      }
    }
    ipcRenderer.on('clip-stack', (event, clip) => {
      if (clip instanceof Object && clip.hasOwnProperty('text')) {
        clip.hasHtml = this.validHtml(clip)
        clip.classes = clip.hasHtml? ['html'] : ['text']
        let firstClip = {text: ''}
        if (this.clips.length) {
          firstClip = this.clips[0]
        }
        if (this.clips.text !== firstClip.text) {
          if (this.numClips >= this.config.maxClips) {
            this.clips.pop()
          }
          this.clips.unshift(clip)
          storeItem('clips', this.clips)
          this.numClips = this.clips.length
        }
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
          } else {
            menu.items[1].enabled = true
            menu.items[2].enabled = true
          }
          menu.popup(remote.getCurrentWindow())
        }
      }
      
    }, false)
    let recentClips = []
    if (this.clips.length < 10) {
      recentClips = this.clips
    } else {
      recentClips = this.clips.slice(0,9)
    }
    if (recentClips.length > 0) {
      ipcRenderer.send('load-recent',recentClips)
    }
    setTimeout(_ => {
      let sn = new Clip('some text','html',"<strong>some text</strong>")
      storeSnippet(sn)
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
    copyText: function(index, transform = '') {
      this.copyItem(index,'text',transform)
    },
    copyHtml: function(index) {
      this.copyItem(index,'html')
    },
    copySimple: function(index) {
      this.copyItem(index,'html','simple')
    },
    copyItem: function(index,format, transform) {
      if (this.clips.length > index && index >= 0) {
        let clip = this.clips[index]
        if (transform) {
          switch (transform) {
            case 'lower':
              clip.text = clip.text.trim().toLowerCase()
              break;
            case 'upper':
              clip.text = clip.text.trim().toUpperCase()
              break;
          }
        }
        if (transform === 'simple') {
          clip.html = this.cleanHtmlString(clip.html)
        }
        ipcRenderer.send('copy-' + format, clip)
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
        items.splice(this.currIndex,1)
        let lib = 'clips'
        if (mode === 'snippets') {
          lib = this.snippetsLib
        } 
        storeItem(lib,items)
        if (mode === 'snippets') {
          this.numSnippets = items.length
        } else {
          this.numClips = items.length
        }
      }
    },
    addActive: function(index,mode) {
      this.currIndex = index
      let items = mode == 'snippets'? this.snippets : this.clips
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
      if (clip.text.length > 64) {
        let words = clip.text.trim().substring(0,70).split(' ')
        if (words.length > 1) {
          words.pop()
        }
        return words.join(' ')
      } else {
        return clip.text.trim()
      }
    },
    clipLong: function(clip) {
      if (this.validHtml(clip)) {
        return clip.html
      } else {
        return clip.text
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
      var wrapper= document.createElement('section');
      wrapper.innerHTML = html;
      let els = wrapper.querySelectorAll('*')
      if (els.length > 0) {
        let i =0, remove = false, tn;
        for (i = 0; i < els.length; i++) {
          if (els[i].tagName) {
            tn = els[i].tagName.toLowerCase()
            switch (tn) {
              case 'meta':
              case 'script':
              case 'style':
              case 'span':
                remove = true
                if (tn == 'span') {
                  remove = (
                    els[i].hasAttribute('class')
                    || els[i].hasAttribute('title')
                    || els[i].hasAttribute('id')
                    || els[i].hasAttribute('name')
                  ) 
                }
                if (remove) {
                  els[i].parentNode.removeElement(els[i])
                }
                break;
            }
            els[i].removeAttribute('style')
          }
        }
      }
      return wrapper.innerHTML;
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
          if (typeof this.snippetsLib == 'string') {
            storeItem(this.snippetsLib, this.snippets)
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
          this.currItem = item
          this.editIndex = index
          this.editMode = mode
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
          item.text = this.editText
          this.editClasses = ['hidden']
          this.editFocus = false
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