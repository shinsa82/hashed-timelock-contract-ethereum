const assign = require('assign-deep')
const debug = require('debug')('state-machine')

class StateMachine {
  constructor(model) {
    debug('initializing...')
    this.events = [] // event queue
    this.model = model // statemachine model
    this.transitions = this.model.transitions // variable shortcut
    this.state = model.init // current state
  }

  set state(next) {
    this._state = next
    debug(`set state to ${next}`)
  }

  get state() {
    return this._state
  }

  async send(ev, arg) {
    debug(`adding event ${ev} to queue...`)
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
  makeModel: ({ init, transitions, handler }) => {
    const mk_transitions = (transitions) => {
      const transition = ([current, event, next]) => {
        return { [current]: { [event]: next } }
      }
      return assign.apply(null, transitions.map(transition))
    }

    return { init, transitions: mk_transitions(transitions), handler }
  },
  stateMachine: (model) => new StateMachine(model),
  END: '_end',
  StateMachine
}