import contextMenu from './context-menu.js'
import p5Overrides from '../p5-overrides/list.js'
import applyP5Overrides from '../p5-overrides/methods.js'
import midiMenu from './midi-menu.js'

export default class Layer {
  constructor (opts = {}) {
    // Helper to allow for naked Layer() calls
    if (!Layers.isCreatingLayer) {
      Layers.create(() => {
        new Layer(opts)
      }, [], clone(Layers.presets))
      return
    }

    // Wait for other layers in .wait
    opts.wait = opts.wait || Layers.presets?.wait || false
    if (opts.wait) {
      const w = opts.wait
      delete opts.wait
      Layers.ready(() => {
        new Layer(opts)
      }, w, clone(Layers.presets))
      return
    }
    
    this.presets = Layers.presets || {}
    this.maybeInit(opts)
  }

  // Wait until p5 is ready
  maybeInit (opts) {
    if (typeof globalThis.P2D === 'undefined') {
      setTimeout(() => this.maybeInit(opts), 0)
    } else {
      this.init(opts)
    }
  }
  init (opts) {
    // Methods
    // @todo Let's clean this up
    this.showContextMenu = contextMenu.showContextMenu
    this.parseMenu = contextMenu.parseMenu
    this.checkThingsContextMenu = contextMenu.checkThingsContextMenu
    this.addMIDIButtons = midiMenu.addMIDIButtons
    this.connectMIDI = midiMenu.connectMIDI
    
    // Default dimensions: parent size or fullscreen
    let w = Layers.target?.clientWidth || opts.target?.clientWidth || globalThis.width
    let h = Layers.target?.clientHeight || opts.target?.clientWidth || globalThis.height

    // Last moved target
    this._hasMovedTarget = null
    this.requestAnimationFrameID = null

    // things
    this.curThingId = 0

    // Defaults
    this.opts = globalThis.defaults(opts, this.presets, {
      id: Layers.curId,
      disabled: false,
      menuDisabled: false,
      type: 'layer',
      target: Layers.target || document.body,
      stack: Layers.curStack || null,
      renderer: P2D,
      offscreenRenderer: opts.offscreenRenderer || opts.renderer || P2D,
      colors: Layers.default.colors,
      colorMode: Layers.default.colorMode,
      
      fps: 30,
      noLoop: false,
      // 0 for system default
      pixelDensity: 0,
      frameCount: 0,

      // Things
      things: [],

      // Dependencies
      wait: null,

      // Dimensions
      width: w,
      height: h,
      x: 0,
      y: 0,

      // Canvas
      canvas: null,
      offscreen: null,

      // Listeners
      onClick: null,
      beforeGenerate: null,
      afterGenerate: null,
      onDispose: null,
      
      // Custom methods
      methods: {},

      // Drawing
      stamp: {},

      // Custom $
      $: {},
      menu: {}
    })
    
    // Setup canvas
    this.generate()

    // Apply session data
    if (Layers.sessionData && this.id in Layers.sessionData) {
      this.disabled = Layers.sessionData[this.id].disabled
    }
    
    // $ references
    // Generate unique ID
    const origId = this.id
    Layers.curId++
    
    if (Layers[origId]) {
      this.id = origId.toString() + '_' + Layers.curId
    }
    // $ by stack
    if (!Layers.stack[this.stack]) {
      Layers.stack[this.stack] = {}
    }
    Layers.stack[this.stack][origId] = this
    // Update Layers getter to pick the correct reference
    if (!Layers[origId]) {
      Object.defineProperty(Layers, origId, {
        get: () => {
          return Layers.stack[Layers.curStack]?.[origId]
        },
        set: (val) => {
          Layers.stack[Layers.curStack][origId] = val
        }
      })
    }

    // Methods
    Object.keys(this.opts.methods).forEach(key => {
      if (this[key]) {
        console.error('Trying to create method "' + key + '" but it already exists in the Layer as a property or method.')
      } else {
        this[key] = this.opts.methods[key]
      }
    })

    // Wait a frame for other layers to be created
    setTimeout(() => {
      this.callSetup()
  
      // Add a slight delay to draw to allow other setups() to finish
      // Add an extra delay to filters to allow for faster render on load
      if (this.type === 'filter' && !this.disabled) {
        Layers.mergeLayers(this)
        this.throttledDraw()
      } else if (!this.disabled) {
        this.throttledDraw()
      }
    }, 0)
  }

  /**
   * Sets up or restores the layer to its default state
   */
  generate (callSetup) {
    // @fixme clean this up
    // Aliases
    if (!this.id) this.id = this.opts.id
    if (!this.canvas) this.canvas = this.opts.canvas
    if (!this.offscreen) this.offscreen = this.opts.offscreen
    if (!this.x) this.x = this.opts.x
    if (!this.y) this.y = this.opts.y
    if (!this.width) this.width = this.opts.width
    if (!this.height) this.height = this.opts.height
    if (!this.disabled) this.disabled = this.opts.disabled
    if (!this.menuDisabled) this.menuDisabled = this.opts.menuDisabled
    if (!this.colorMode) this.colorMode = this.opts.colorMode
    if (!this.beforeGenerate) this.beforeGenerate = this.opts.beforeGenerate
    if (!this.afterGenerate) this.afterGenerate = this.opts.afterGenerate
    if (!this.onDispose) this.onDispose = this.opts.onDispose
    if (!this.setup) this.setup = this.opts.setup
    if (!this.type) this.type = this.opts.type
    if (!this.pixelDensity) {
      this.pixelDensity = this.opts.pixelDensity || 1
    }
    if (!this.fps) this.fps = this.opts.fps
    if (!this.target) this.target = this.opts.target
    if (!this.renderer) this.renderer = this.opts.renderer
    if (!this.offscreenRenderer) this.offscreenRenderer = this.opts.offscreenRenderer
    if (!this.stack) this.stack = this.opts.stack
    if (!this.things) this.things = this.opts.things
    
    // Always reset
    this.noLoop = this.opts.noLoop

    // Canvas
    if (!this.canvas) {
      this.canvas = createGraphics(this.width, this.height, this.renderer) // Main layer
    }
    if (!this.offscreen) {
      this.offscreen = createGraphics(this.width, this.height, this.offscreenRenderer) // Buffer for individual things
    }
    if (this.pixelDensity) {
      this.canvas.pixelDensity(this.pixelDensity)
      this.offscreen.pixelDensity(this.pixelDensity)
    }
    this.canvas.elt.classList.add('layersp5-layer', `layersp5-layer-${this.id}`)
    this.offscreen.elt.classList.add('layersp5-offscreen', `layersp5-layer-${this.id}`)
    globalThis.minSize = min(this.width, this.height)
    globalThis.maxSize = max(this.width, this.height)

    this.canvas.frameRate(this.fps)
    this.offscreen.frameRate(this.fps)

    // Setup the target to receive the canvases
    if (this.target && !this._hasMovedTarget) {
      const $target = this.getTarget()
      this._hasMovedTarget = true
      this.canvas.elt.style.width = '100%'
      this.canvas.elt.style.height = '100%'

      $target.appendChild(this.canvas.elt)
      $target.appendChild(this.offscreen.elt)
      
      if (!$target.style.position) {
        $target.style.position = 'relative'
      }
    }
    this.canvas.elt.style.position = `absolute`
    this.canvas.elt.style.display = 'block'
    this.canvas.elt.style.left = `${this.x}px`
    this.canvas.elt.style.top = `${this.y}px`
    this.canvas.elt.parentElement.classList.add('layersp5-layers-wrap')

    // Explode with delay so that it gets animated
    setTimeout(() => {
      Layers.toggleExplodeClassForLayerTarget(this, Layers.areLayersExploded['Visualize layers in 3D'])
    }, 0)

    this.canvas.colorMode(...this.colorMode)
    this.offscreen.colorMode(...this.colorMode)
    this.canvas.clear()
    this.offscreen.clear()

    // Handle colors
    if (!this.opts.colors) {
      this.opts.colors = Layers.default.colors
    }
    // Convert colors to arrays
    this.opts.colors.forEach((col, n) => {
      this.opts.colors[n] = this.canvas.color(col).levels
    })
    this.colors = this.opts.colors
    
    // Throttled functions
    this.throttledDraw = throttle(this.draw.bind(this), 1000/this.opts.fps)

    // Menu
    this.menu = globalThis.clone(this.opts.menu)
    this.$ = globalThis.clone(this.opts.$)

    let bgMenu
    if (typeof this.presets.bg === 'number') {
      bgMenu = this.presets.bg
    } else if (this.opts.bg) {
      bgMenu = this.opts.bg
    } else {
      bgMenu = ~~random(this.colors.length)
    }
    
    // Add bg color to menu
    if (!this.menu.bg) {
      this.menu.bg = {
        type: 'slider',
        options: this.colors,
        default: bgMenu,
      }
      this.parseMenu()
    } else {
      this.parseMenu()
    }

    this.beforeGenerate && this.beforeGenerate()

    // Misc
    this.frameCount = 0
    
    // Setup
    if (this.setup && !this._hasSetContextOnSetup) {
      this._hasSetContextOnSetup = true
      const _setup = this.setup
      this.setup = function () {
        this.useGlobalContext()
        _setup.call(this, this.canvas, this.offscreen)
        this.restoreGlobalContext()
      }
    }
    callSetup && this.callSetup()
    
    this.afterGenerate && this.afterGenerate()
  }

  /**
   * Calls the setup method if it exists
   * - Temporarily changes the _renderer target
   */
  callSetup () {
    // Call the setup
    this.setup && this.setup.call(this, this.offscreen)
  }

  /**
   * Toggle the layer on/off
   */
  disable () {this.hide()}
  hide () {
    this.disabled = true
    this.canvas.elt.style.display = 'none'
  }
  enable () {this.show()}
  show () {
    this.disabled = false
    this.canvas.elt.style.display = 'block'
    this.throttledDraw()
  }
  toggle () {
    if (this.disabled) this.show()
    else this.hide()
  }
  
  /**
   * Trigger an event
   */
  trigger (evName) {
    switch (evName) {
      case 'resize':
        this.resize()
      break
    }
  }

  /**
   * Reset the sketch with current $
   */
  reset () {
    this.setup && this.setup()
  }

  getTarget () {
    let target = this.target || document.body
    if (typeof target === 'string') {
      target = document.querySelector(target)
    }
    return target
  }
  
  /**
   * Resize the canvas
   */
  resize (targetWidth = null, targetHeight = null, shouldRegenerate = true) {
    let width, height
    
    if (targetWidth && targetHeight) {
      width = targetWidth
      height = targetHeight
    } else {
      const $target = this.getTarget()
      width = $target.clientWidth
      height = $target.clientHeight
    }
    
    this.width = width
    this.height = height
    this.canvas.resizeCanvas(width, height)
    this.offscreen.resizeCanvas(width, height)

    if (shouldRegenerate) {
      this.generate(true)
 
      if (this.type === 'filter' && !this.disabled) {
        Layers.mergeLayers(this)
        this.noLoop && this.throttledDraw()
      } else if (!this.disabled) {
        this.noLoop && this.throttledDraw()
      }
    }
  }

  /**
   * Batch a draw bunch of draws together, incrementing a batch counter
   * - Once the trigger is met, the stamp function is called
   * - If stamp method returns null or true, the draw is called
   * - If stamp method returns false, the draw is skipped
   * 
   * @param opts.id The id of the stamp counter to incremenet
   * @param opts.trigger {Boolean|Function} True to trigger the stamp, False to skip
   * @param opts.stamp {function} The stamp function to be called the trigger is true
   * 
   * @returns {number} The stamp counter
   */
  batchDraw (opts) {
    const {id, trigger=false, draw=()=>true} = opts

    // Exit but don't run the trigger
    if (typeof trigger === 'function') trigger = trigger()
    if (!trigger) return false
    if (!typeof $batch[id]) $batch[id] = 0
    
    let resp = draw()
    if (typeof resp === 'undefined') resp = true
    if (typeof resp !== 'number') resp = +resp
    $batch[id] += resp

    return $batch[id]
  }


  /**
   * Draw loop
   * @param skipLoop Set to true to skip the loop (like when recording)
   */
  draw (skipLoop) {
    cancelAnimationFrame(this.requestAnimationFrameID)
    
    if (!this.disabled) {
      // Update position
      if (!this._lastX !== this.x || !this._lastY !== this.y) {
        this.canvas.elt.style.left = `${this.x}px`
        this.canvas.elt.style.top = `${this.y}px`
      }

      // Draw
      this.useGlobalContext()
      this.opts.draw && this.opts.draw.call(this, this.offscreen)
      this.things.forEach(thing => {
        if (!thing.autodraw) return
        
        if (!thing.hidden && thing.scale.size < 1) {
          thing.scale.size += thing.scale.growRate
        }
        
        thing.autodraw && thing.draw()
      })
      this.restoreGlobalContext()
      this.frameCount++
  
      this._lastX = this.x
      this._lastY = this.y
    }

    // Loop drawing
    this.requestAnimationFrameID = requestAnimationFrame(() => !Layers.noLoop && !this.noLoop && this.throttledDraw())
  }

  /**
   * Updates the global context so that all renders happen on current layer
   * (eg rect, circle, etc without having to type canvas.rect())
   */
  useGlobalContext () {
    if (Layers._globalContextLayer === this.id) return
    // Layers updates
    Layers._globalContextLayer = this.id
    Layers.curStack = this.stack

    // Save the current context
    this._context = {}
    this.__$CONTEXT = {}
    p5Overrides.forEach(key => {
      this._context[key] = globalThis[key]
      globalThis[key] = key === 'canvas' ? this.canvas.elt : this.canvas[key]
    })

    // Manual overrides
    applyP5Overrides.call(this)

    // Helpers
    globalThis.minSize = min(this.canvas.width, this.canvas.height)
    globalThis.maxSize = max(this.canvas.width, this.canvas.height)

    // Add this.$ variables
    Object.keys(this.$).forEach(key => {
      if (globalThis[`$${key}`]) {
        // @todo I think this is ok, but it should really be a warning
        // console.warn(globalThis[`$${key}`], `$${key} is already defined and cannot be used as a $ key for Layer: ${this.id}`)
      } else {
        globalThis[`$${key}`] = this.$[key]
        this.__$CONTEXT[key] = true
      }
    })
  }
  restoreGlobalContext () {
    Layers._globalContextLayer = null

    p5Overrides.forEach(key => {
      globalThis[key] = this._context[key]
    })

    // Remove this.$ variables
    Object.keys(this.__$CONTEXT).forEach(key => {
      this.$[key] = globalThis[`$${key}`]
      delete globalThis[`$${key}`]
    })
  }

  /**
   * Add a new thing to this Layer
   * @param {*} x 
   * @param {*} y 
   * @param {*} size
   * @param {*} params 
   */
   // @todo make this a plugin
  addEye (x, y, size, params) {
    if (typeof x === 'object') {
      params = x
      x = params.x
      y = params.y
      size = params.size      
      
      delete x.x
      delete x.y
      delete x.size
    }
    
    const thing = new Thing.Eye(this, x, y, size, clone(params))
    this.things.push(thing)
    return thing
  }

  /**
   * Free memory and delete reference from Layers
   */
  dispose () {
    globalThis.cancelAnimationFrame(this.requestAnimationFrameID)
    this.requestAnimationFrameID = null
    this.onDispose && this.onDispose()
    this.canvas.remove()
    this.offscreen.remove()

    // Delete from stack
    delete Layers.stack[this.stack][this.opts.id]
  }

  /**
   * Uses frameCount to return the progress within a loop of the passed number of seconds
   * @param {Number} frames Number of frames in the loop
   * @param {Number} frameCount Current frameCount
   * @param {Number} fps Current fps
   * @returns {Number} Progress between 0 and 1
   */
  getProgress (frames = 120, frameCount, fps) {
    frameCount = typeof frameCount !== 'undefined' ? frameCount : this.frameCount
    fps = typeof fps !== 'undefined' ? fps : this.fps
    const period = +fps * (frames/30) / 2 // (frames/30) is a conversion constant representing number of frames per second
    return (frameCount % period) / period
  }

  /**
   * Core Event listeners
   */
  listeners = {
    menu: {
      regenerate: ev => {
        // this.noLoop always gets reset to initial state, so we remember what it was
        // before generate and use that to determine if we should redraw or not
        const _noLoop = this.noLoop
        this.generate(true)
        _noLoop && this.throttledDraw(true)
        this._showContextMenuEvent && this.showContextMenu(this._showContextMenuEvent)
        this._showContextMenuEvent = null
      }
    }
  }
}