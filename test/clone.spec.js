/* eslint-env mocha */
'use strict'

const mock = require('mock-require')
const sinon = require('sinon')
const config = require('../src/core/config')
const createModuleUpdate = require('./fixtures/create-module-update')
const createBlobStore = require('./fixtures/create-blob-store')
const {
  createTestServer,
  destroyTestServers
} = require('./fixtures/test-server')
const invoke = require('./fixtures/invoke')
const expect = require('chai')
  .use(require('dirty-chai'))
  .expect

describe('clone', () => {
  let clone
  let follow
  let blobStore

  beforeEach(() => {
    blobStore = createBlobStore()
    follow = sinon.stub()
    mock('follow-registry', follow)
    clone = mock.reRequire('../src/core/clone')
  })

  afterEach(async () => {
    mock.stopAll()

    await destroyTestServers()
  })

  it('should eagerly download a new module', async () => {
    const tarballPath = '/new-module/-/1.0.0/new-module-1.0.0.tar.gz'
    const tarballContent = 'I am some binary'

    const server = await createTestServer({
      [tarballPath]: tarballContent
    })

    const cloner = clone(config({
      eagerDownload: true
    }), blobStore)

    const handler = follow.getCall(0).args[0].handler
    const versions = [{
      tarball: `http://127.0.0.1:${server.address().port}${tarballPath}`,
      shasum: '123'
    }]
    const data = createModuleUpdate('new-module', versions)

    invoke(handler, data)

    return new Promise((resolve, reject) => {
      cloner.once('processed', (event) => {
        try {
          expect(event.json.name).to.equal('new-module')
          expect(event.downloaded.length).to.equal(1)
          expect(event.downloaded[0].tarball).to.equal(`http://127.0.0.1:${server.address().port}${tarballPath}`)
          expect(blobStore.createWriteStream.calledWith('/new-module/index.json')).to.be.ok()
          expect(blobStore.exists.calledWith(tarballPath)).to.be.ok()
          expect(blobStore.createWriteStream.calledWith(tarballPath)).to.be.ok()
        } catch (error) {
          return reject(error)
        }

        resolve()
      })
    })
  })

  it('should not eagerly download a new module', async () => {
    const tarballPath = '/new-module/-/1.0.0/new-module-1.0.0.tar.gz'
    const tarballContent = 'I am some binary'

    const server = await createTestServer({
      [tarballPath]: tarballContent
    })

    const cloner = clone(config({
      eagerDownload: false
    }), blobStore)

    const handler = follow.getCall(0).args[0].handler
    const versions = [{
      tarball: `http://127.0.0.1:${server.address().port}${tarballPath}`,
      shasum: '123'
    }]
    const data = createModuleUpdate('new-module', versions)

    invoke(handler, data)

    return new Promise((resolve, reject) => {
      cloner.once('processed', (event) => {
        try {
          expect(event.json.name).to.equal('new-module')
          expect(event.downloaded.length).to.equal(0)
          expect(blobStore.createWriteStream.calledWith('/new-module/index.json')).to.be.ok()
          expect(blobStore.exists.calledWith(tarballPath)).to.not.be.ok()
          expect(blobStore.createWriteStream.calledWith(tarballPath)).to.not.be.ok()
        } catch (error) {
          return reject(error)
        }

        resolve()
      })
    })
  })

  it('should survive an invalid update', (done) => {
    clone(config({
      eagerDownload: true
    }), blobStore)

    const handler = follow.getCall(0).args[0].handler
    const data = {}

    handler(data, () => {
      done()
    })
  })

  it('should not download a tarball that already exists', (done) => {
    const tarballPath = '/new-module/-/1.0.0/new-module-1.0.0.tar.gz'

    clone(config({
      eagerDownload: true
    }), blobStore)

    const handler = follow.getCall(0).args[0].handler
    const versions = [{
      tarball: `http://127.0.0.1:5${tarballPath}`,
      shasum: '123'
    }]
    const data = createModuleUpdate('new-module', versions)

    const stream = blobStore.createWriteStream(tarballPath)
    stream.end('tarball content')

    blobStore.createWriteStream.resetHistory()

    handler(data, () => {
      setTimeout(() => {
        expect(blobStore.exists.calledWith(tarballPath)).to.be.ok()

        blobStore.createWriteStream.getCalls().forEach(call => {
          expect(call.args[0]).to.not.equal(tarballPath)
        })

        done()
      }, 500)
    })
  })
})