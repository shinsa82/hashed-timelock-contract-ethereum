const assign = require('assign-deep')
const debug = require('debug')('state-machine')
const chalk = require('chalk')
const y = mes => debug(chalk.yellowBright(mes))

class StateMachine {
  constructor(model) {
    debug('initializing...')
    this.events = [] // event queue
    this.model = model // statemachine model
    this.transitions = this.model.transitions // variable shortcut
    this.state = model.init // current state
    this.badStates = [].concat(this.model.badStates)
  }

  set state(next) {
    this._state = next
    debug(`set state to ${next}`)
  }

  get state() {
    return this._state
  }

  send(ev, arg) {
    // debug(`adding event ${ev} to queue...`)
    this.events.push({ ev, arg })
    this._handle()
  }

  _handle() {
    const { ev, arg } = this.events.shift()
    debug(`processing event ${ev} with arg %O`, arg)
    const next = this.transitions[this.state][ev]
    if (!next) {
      throw Error(`event ${ev} is not allowed at state ${this.state}`)
    }
    this.state = next
    if (this.badStates.includes(this.state)) {
      y(`warning: contract is at errornous state: ${this.state}`)
    }
  }

  async loop() {
    while (this.events.length > 0) {
      const { ev, arg } = this.events.shift()
      // console.log(ev)
      await this[ev](arg)
    }
  }
}

module.exports = {
  makeModel: ({ init, transitions, handler, badStates }) => {
    const mk_transitions = (transitions) => {
      const transition = ([current, event, next]) => {
        return { [current]: { [event]: next } }
      }
      return assign.apply(null, transitions.map(transition))
    }
    const mk_transByEvent = (transitions) => {
      const transition = ([current, event, next]) => {
        return { [event]: { [current]: next } }
      }
      return assign.apply(null, transitions.map(transition))
    }

    return {
      init,
      transitions: mk_transitions(transitions),
      transByEvent: mk_transByEvent(transitions),
      handler,
      badStates,
    }
  },
  stateMachine: (model) => new StateMachine(model),
  END: '_end',
  StateMachine
}