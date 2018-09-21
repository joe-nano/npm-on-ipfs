'use strict'

const INDEX_JSON = 'index.json'
const log = require('debug')('ipfs:registry-mirror:handlers:json')

module.exports = (request, response, next) => {
  log(`Requested ${request.url}`)

  let file = request.url

  if (!file.endsWith(INDEX_JSON)) {
    file = `${file}/${INDEX_JSON}`
  }

  log(`Loading ${file}`)
  const readStream = request.app.locals.store.createReadStream(file)

  readStream.once('error', (error) => {
    log(`Error loading ${file} - ${error}`)

    if (error.code === 'ECONNREFUSED') {
      response.statusCode = 504
    } else if (error.code === 'ECONNRESET') {
      // will trigger a retry from the npm client
      response.statusCode = 500
    } else {
      response.statusCode = 404
    }

    readStream.unpipe(response)

    next(error)
  })
    .once('data', () => {
      log(`Loaded ${file}`)

      response.statusCode = 200
      response.setHeader('Content-type', 'application/json; charset=utf-8')
      response.setHeader('Content-Disposition', `attachment; filename="${INDEX_JSON}"`)
    })
    .pipe(response)
}