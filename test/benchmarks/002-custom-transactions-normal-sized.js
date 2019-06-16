'use strict'

process.on('SIGUSR2', end)

let agent
if (process.env.AGENT) {
  agent = require('../../').start({
    serviceName: '002-custom-transactions-normal-sized',
    captureExceptions: false
  })
}

const callstack = require('./utils/callstack')

let start
let stop = false
const pid = process.argv[2]
const warmup = 1e4
const runtime = 20
const metrics = {
  transactions: 0
}

// To avoid randomness, but still generate what appears to be natural random
// call stacks, number of spans etc, use a pre-defined set of numbers
const numbers = [2, 5, 10, 1, 2, 21, 2, 5, 6, 9, 1, 11, 9, 8, 12]
let numbersSpanIndex = 5
let numbersStackLevelIndex = 0

// warmup
console.error('Warming up for %d transactions...', warmup)
addTransaction('warmup', function runAgain () {
  if (metrics.transactions < warmup) return addTransaction('warmup', runAgain)

  console.error('Running benchmark for %d seconds...', runtime)

  setTimeout(end, runtime * 1000)

  process.kill(pid, 'SIGUSR2')
  metrics.transactions = 0
  start = process.hrtime()

  // actual benchmark
  addTransaction('benchmark', function runAgain () {
    addTransaction('benchmark', runAgain)
  })
})

function addTransaction (name, cb) {
  if (stop) return
  if (agent) agent.startTransaction(name)
  const amount = numbers[numbersStackLevelIndex++ % numbers.length]
  callstack(amount, () => {
    const amount = numbers[numbersSpanIndex++ % numbers.length]
    addSpan(name, amount, () => {
      if (agent) agent.endTransaction()
      metrics.transactions++
      setImmediate(cb)
    })
  })
}

function addSpan (prefix, amount, cb) {
  if (typeof amount === 'function') return addSpan(prefix, 1, amount)
  setImmediate(() => {
    const span = agent && agent.startSpan(prefix + 'my-span', 'my-span-type')
    setImmediate(() => {
      if (agent) span.end()
      if (--amount === 0) cb()
      else addSpan(prefix, amount, cb)
    })
  })
}

function end () {
  const hrtime = process.hrtime(start)
  stop = true
  if (agent) {
    console.error('Flushing...')
    agent.flush(function () {
      setTimeout(shutdown.bind(null, hrtime), 100)
    })
  } else {
    shutdown(hrtime)
  }
}

function shutdown (hrtime) {
  process.kill(pid, 'SIGUSR2')
  process.stdout.write(JSON.stringify({hrtime, metrics}))
  process.exit()
}
