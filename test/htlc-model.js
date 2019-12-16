const debug = require('debug')('HTLC-model')
const { END, makeModel } = require('./state-machine')

const theModel = makeModel({
  init: 'q2',
  transitions: [
    ['q2', 'Sec.newContract', 'q4'],
    ['q4', 'Cash.newContract', 'q5'],
    ['q5', 'Cash.withdraw', 'q6'],
    // right route
    ['q6', 'Cash.withdraw_end', 'q8'],
    ['q8', 'Sec.withdraw', 'q10'],
    ['q10', 'Sec.withdraw_end', 'q12'],
    ['q10', 'Sec.withdraw_err_expired', "q12'"],
    ['q12', END, 'last'],
    ["q12'", END, 'last'],
    // left route
    ['q6', 'Cash.withdraw_err_expired', 'q7'],
    ['q7', 'Cash.refund', 'q9'],
    ['q9', 'Cash.refund_end', 'q11'],
    ['q11', 'Sec.refund', 'q13'],
    ['q13', 'Sec.refund_end', 'q12'],
    ['q13', 'Sec.refund_err_premature', "q11'"],
    ["q11'", 'Sec.refund', "q13'"],
    ["q13'", 'Sec.refund_err_premature', "q11'"],
    ["q13'", 'Sec.refund_end', 'q12'],
  ],
  badStates: ['q7', 'q9', "q11'", "q12'", "q13'"],
})

module.exports = { model: theModel }

// if directly called from Node.js
if (require.main == module) {
  console.log('%j', module.exports)
}
