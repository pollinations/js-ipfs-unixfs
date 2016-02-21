/* globals describe, it */

const FixedSizeChunker = require('./../src/chunker-fixed-size')
const fs = require('fs')
const expect = require('chai').expect
const stringToStream = require('string-to-stream')
const through = require('through2')
const path = require('path')
var isNode = !global.window

var fileStream
if (isNode) {
  fileStream = function () {
    return fs.createReadStream(path.join(__dirname, '/test-data/1MiB.txt'))
  }
} else {
  var myFile = require('buffer!./test-data/1MiB.txt')
  fileStream = function () {
    return stringToStream(myFile)
  }
}

describe('chunker: fixed size', function () {
  it('256 Bytes chunks', function (done) {
    fileStream()
      .pipe(FixedSizeChunker(256))
      .pipe(through((chunk, enc, cb) => {
        expect(chunk.length).to.equal(256)
        cb()
      }, () => {
        done()
      }))
  })

  it('256 KiB chunks', function (done) {
    var KiB256 = 262144
    fileStream()
      .pipe(FixedSizeChunker(KiB256))
      .pipe(through((chunk, enc, cb) => {
        expect(chunk.length).to.equal(KiB256)
        cb()
      }, () => {
        done()
      }))
  })

  it('256 KiB chunks of non scalar filesize', function (done) {
    var counter = 0
    var KiB256 = 262144
    fileStream()
      .pipe(FixedSizeChunker(KiB256))
      .pipe(through((chunk, enc, cb) => {
        if (chunk.length < KiB256) {
          expect(counter).to.be.below(2)
          counter += 1
          return cb()
        }
        expect(chunk.length).to.equal(KiB256)
        cb()
      }, () => {
        done()
      }))
  })
})
