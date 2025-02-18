import DirFlat from './dir-flat.js'
import Dir from './dir.js'
import flatToShard from './flat-to-shard.js'
import toPathComponents from './utils/to-path-components.js'

/**
 * @typedef {import('./types').ImportResult} ImportResult
 * @typedef {import('./types').InProgressImportResult} InProgressImportResult
 * @typedef {import('./types').ImporterOptions} ImporterOptions
 * @typedef {import('interface-blockstore').Blockstore} Blockstore
 * @typedef {(source: AsyncIterable<InProgressImportResult>, blockstore: Blockstore, options: ImporterOptions) => AsyncIterable<ImportResult>} TreeBuilder
 */

/**
 * @param {InProgressImportResult} elem
 * @param {Dir} tree
 * @param {ImporterOptions} options
 */
async function addToTree (elem, tree, options) {
  const pathElems = toPathComponents(elem.path || '')
  const lastIndex = pathElems.length - 1
  let parent = tree
  let currentPath = ''

  for (let i = 0; i < pathElems.length; i++) {
    const pathElem = pathElems[i]

    currentPath += `${currentPath ? '/' : ''}${pathElem}`

    const last = (i === lastIndex)
    parent.dirty = true
    parent.cid = undefined
    parent.size = undefined

    if (last) {
      await parent.put(pathElem, elem)
      tree = await flatToShard(null, parent, options.shardSplitThreshold, options)
    } else {
      let dir = await parent.get(pathElem)

      if (!dir || !(dir instanceof Dir)) {
        dir = new DirFlat({
          root: false,
          dir: true,
          parent: parent,
          parentKey: pathElem,
          path: currentPath,
          dirty: true,
          flat: true,
          mtime: dir && dir.unixfs && dir.unixfs.mtime,
          mode: dir && dir.unixfs && dir.unixfs.mode
        }, options)
      }

      await parent.put(pathElem, dir)

      parent = dir
    }
  }

  return tree
}

/**
 * @param {Dir | InProgressImportResult} tree
 * @param {Blockstore} blockstore
 */
async function * flushAndYield (tree, blockstore) {
  if (!(tree instanceof Dir)) {
    if (tree && tree.unixfs && tree.unixfs.isDirectory()) {
      yield tree
    }

    return
  }

  for await (const item of tree.flush(blockstore)) {
    yield [item,tree]
  }
}

/**
 * @type {TreeBuilder}
 */
async function * treeBuilder (source, block, options) {
  /** @type {Dir} */
  let tree = options?.tree || emptyTree(options)

  for await (const entry of source) {
    if (!entry) {
      continue
    }

    tree = await addToTree(entry, tree, options)

    if (!entry.unixfs || !entry.unixfs.isDirectory()) {
      yield [entry, tree]
    }
  }

  if (options.wrapWithDirectory) {
    yield * flushAndYield(tree, block)
  } else {
    for await (const unwrapped of tree.eachChildSeries()) {
      if (!unwrapped) {
        continue
      }

      yield * flushAndYield(unwrapped.child, block)
    }
  }
}



export default treeBuilder

export function emptyTree(options) {
  return new DirFlat({
    root: true,
    dir: true,
    path: '',
    dirty: true,
    flat: true
  }, options)
}

