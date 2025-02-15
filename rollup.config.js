import replace from '@rollup/plugin-replace'
// import externalGlobals from "rollup-plugin-external-globals"
import pkg from './package.json'

export default {
  input: 'src/rollup.js',
  context: 'window',
  output: {
    name: 'layers.p5',
    file: 'dist/layers.p5.js',
    format: 'umd',
    banner: `/**
 * layers.p5.js
 * ---
 * https://twitter.com/heyozramos
 * https://github.com/ozramos/layers.p5
 * ---
 * @version ${pkg.version}
 * @license "Apache 2.0"
 * ---
 * This file was bundled with Rollup
 */`
  },
  plugins: [
    replace({
      preventAssignment: true,
      values: {
        'NPM_PACKAGE_VERSION': pkg.version,
        // @FIXME This is to remove the annoying warning about poly-decomp
        'isConcave && !canDecomp': 'false',
      }
    }),

    // externalGlobals({
    //   'tweakpane': 'Tweakpane',
    //   '@tweakpane/plugin-essentials': 'EssentialsPlugin',
    // })
  ],
  // external: ['tweakpane', '@tweakpane/plugin-essentials'],
}