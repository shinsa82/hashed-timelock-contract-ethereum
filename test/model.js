const assign = require('assign-deep')

module.exports = {
  makeModel: ({ init, transitions }) => {
    const mk_transitions = (transitions) => {
      const transition = ([current, event, next]) => {
        return { [current]: { [event]: next } }
      }
      return assign.apply(null, transitions.map(transition))
    }

    return { init, transitions: mk_transitions(transitions) }
  }
}