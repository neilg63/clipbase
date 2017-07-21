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

function storeItem(key,data) {
  var ts = Date.now() / 1000,sd = ts + ':';
  if (typeof data == 'object') {
    sd += 'obj:' + JSON.stringify(data);
  } else {
    sd += 'sca:' + data;
  }
  localStorage.setItem(key,sd);
  return sd.length;
}

function getItem(key,maxAge,unit) {
  var ts = Date.now() / 1000,obj={expired:true,valid:false,size:0},data=localStorage.getItem(key);
  if (data) {
    obj.size = data.length;
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
      this.text = first
      this.format = format
      this.html = html
      this.id = index
      this.title = ''
    } else if (typeof first === 'object') {
      if (first.text) {
        this.text = first.text
      }
      if (first.format) {
        this.format = first.format
      }
      if (first.html) {
        this.html = first.html
      } else {
        this.html = ''
      }
      if (first.id) {
        this.id = first.id
      }
      if (first.hasOwnProperty('tags') && first.tags instanceof Array) {
        this.tags = first.tags
      } else {
        this.tags = []
      }
      if (first.title) {
        this.title = first.title
      }
    }
    this.hasHtml = this.validHtml()
    if (!this.hasHtml) {
      this.html = ''
    }
    this.isLink = this.validUrl()
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
    return /^https?:\/\/\w+[a-z0-9_-]+(\.[a-z0-9_-]+)+\/?.*?\b$/i.test(this.text.trim())
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
      text: ''
    },
    editText: '',
    editFocus: false,
    editMode: 'clips',
    editClasses: ['hidden'],
    previewText: '',
    previewClasses: ['hidden'],
    baseSize: 0,
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
        this.baseSize = stored.size
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
          setTimeout(_ => {
            console.log(clip)
          },3000)
          vue.baseSize = storeItem('clips', this.clips)
          vue.numClips = vue.clips.length  
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
      let sn = new Clip('some text','html',"<strong>some text</strong>")
      storeSnippet(sn)
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
        items.splice(this.currIndex,1)
        let lib = 'clips'
        if (mode === 'snippets') {
          lib = this.snippetsLib
        } 
        let size = storeItem(lib,items)
        if (lib === 'clips') {
          this.baseSize = size
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