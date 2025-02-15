<template>
  <Window :title="title" :help="help" :height="height"
    :maximize="maximize" :isMaximized="isMaximized" :isMinimized="isMinimized"
    @reload="onReload"
    @restored="onRestore" @maximized="onMaximize">
    <slot class="layersp5-top-slot"></slot>
    <div class="layersp5-layers-wrap-outer" :style="{height: `${height}px`}">
      <div class="layersp5-layers-wrap" ref="target"></div>
    </div>
  </Window>
</template>

<script>
import Window from './Window.vue'

export default {
  components: {Window},

  // List of paths to sketch scripts to load
  // Prefix with @username/001/path to load /sketch/username/001/path.js
  props: {
    layers: Object,
    presets: Object,
    height: {
      type: [Number, String],
      default: 350
    },
    title: String,
    maximize: {
      type: Boolean,
      default: true
    },
    minimize: Boolean,
    isMaximized: Boolean,
    isMinimized: Boolean,
    help: String,
    stack: null
  },

  /**
   * Create an empty array to hold the layer modules
   * Once they are all loaded, we'll run them sequentially
   */
  data() {
    return {
      loadedLayers: Array(this.layers.length).fill(null),
      numLoadedLayers: 0,
    }
  },

  mounted () {
    this.$nextTick(() => {
      this.loadLayers()
      this.stackId = this.stack || `stack${~~(Math.random() * 999999)}`
    })
  },
  beforeUnmount () {
    Layers.dispose()
  },

  methods: {
    loadLayers () {
      const $this = this
      $this.layers && $this.layers.forEach((layer, i) => {
        // Convert to array
        if (typeof layer === 'string') {
          layer = [layer]
        }

        if (layer[0][0] === '@') {
          layer[0] = layer[0].substr(1)
        }
        $this.maybeLoadScript(layer, i)
      })
    },
    
    maybeLoadScript (layer, i) {
      if (!window.Layers) {
        setTimeout(() => this.maybeLoadScript(layer, i), 0)
      } else {
        this.loadScript(layer, i)
      }
    },
    
    async loadScript (layer, i) {
      let path = layer[0]
      let data = layer[1] || {}
      
      // Loop until target is not null
      if (!this.$refs.target) {
        setTimeout(() => this.loadScript(layer, i), 0)
        return
      }

      // Unfortunately we have to split this out with vite
      // @see https://github.com/vitejs/vite/issues/4945#issuecomment-951770052
      const splitName = path.split('/')
      let sketch

      if (this.$theme.env.NODE_ENV === 'development') {
        if (splitName.length === 1) {
          sketch = await import(/* @vite-ignore */`./../public/sketch/${splitName[0]}.js?raw`)
        } else if (splitName.length === 2) {
          sketch = await import(/* @vite-ignore */`./../public/sketch/${splitName[0]}/${splitName[1]}.js?raw`)
        } else if (splitName.length === 3) {
          sketch = await import(/* @vite-ignore */`./../public/sketch/${splitName[0]}/${splitName[1]}/${splitName[2]}.js?raw`)
        } else if (splitName.length === 4) {
          sketch = await import(/* @vite-ignore */`./../public/sketch/${splitName[0]}/${splitName[1]}/${splitName[2]}/${splitName[3]}.js?raw`)
        } else if (splitName.length === 5) {
          sketch = await import(/* @vite-ignore */`./../public/sketch/${splitName[0]}/${splitName[1]}/${splitName[2]}/${splitName[3]}/${splitName[4]}.js?raw`)
        } else if (splitName.length === 6) {
          sketch = await import(/* @vite-ignore */`./../public/sketch/${splitName[0]}/${splitName[1]}/${splitName[2]}/${splitName[3]}/${splitName[4]}/${splitName[5]}.js?raw`)
        } else if (splitName.length === 7) {
          sketch = await import(/* @vite-ignore */`./../public/sketch/${splitName[0]}/${splitName[1]}/${splitName[2]}/${splitName[3]}/${splitName[4]}/${splitName[5]}/${splitName[6]}.js?raw`)
        }
        sketch = sketch.default
      } else {
        if (splitName.length === 1) {
          sketch = await fetch(/* @vite-ignore */`/sketch/${splitName[0]}.js?raw`)
        } else if (splitName.length === 2) {
          sketch = await fetch(/* @vite-ignore */`/sketch/${splitName[0]}/${splitName[1]}.js?raw`)
        } else if (splitName.length === 3) {
          sketch = await fetch(/* @vite-ignore */`/sketch/${splitName[0]}/${splitName[1]}/${splitName[2]}.js?raw`)
        } else if (splitName.length === 4) {
          sketch = await fetch(/* @vite-ignore */`/sketch/${splitName[0]}/${splitName[1]}/${splitName[2]}/${splitName[3]}.js?raw`)
        } else if (splitName.length === 5) {
          sketch = await fetch(/* @vite-ignore */`/sketch/${splitName[0]}/${splitName[1]}/${splitName[2]}/${splitName[3]}/${splitName[4]}.js?raw`)
        } else if (splitName.length === 6) {
          sketch = await fetch(/* @vite-ignore */`/sketch/${splitName[0]}/${splitName[1]}/${splitName[2]}/${splitName[3]}/${splitName[4]}/${splitName[5]}.js?raw`)
        } else if (splitName.length === 7) {
          sketch = await fetch(/* @vite-ignore */`/sketch/${splitName[0]}/${splitName[1]}/${splitName[2]}/${splitName[3]}/${splitName[4]}/${splitName[5]}/${splitName[6]}.js?raw`)
        }
        sketch = await sketch.text()
        await Layer // Not sure why this is needed, but it's null otherwise
      }

      let presets = {
        target: this.$refs.target,
        curStack: this.stackId,
      }
      if (this.presets) {
        Object.keys(this.presets).forEach(key => {
          Object.defineProperty(presets, key, {
            value: this.presets[key],
          })
        })
      }
      
      layer.sketch = sketch
      layer.path = path
      layer.config = data
      this.loadedLayers[i] = layer

      if (++this.numLoadedLayers === this.layers.length) {
        this.loadedLayers.forEach((layer, n) => {
          try {
            ;eval(`Layers.presets = presets;
              ;${layer.sketch};
            `);
          } catch (err) {
            console.error(`Errors with ${layer.path}`, err)
          }
        })
      }
    },

    /**
     * Handle window resize
     */
    // @todo Stop looping
    onMinimize () {},
    onMaximize () {
      setTimeout(() => Layers.trigger('resize'), 0)
    },
    onRestore () {
      setTimeout(() => Layers.trigger('resize'), 0)
    },
    onReload () {
      setTimeout(() => Layers.trigger('resize'), 0)
    },
  }
}
</script>