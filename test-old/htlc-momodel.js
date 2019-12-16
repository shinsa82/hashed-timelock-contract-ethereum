const { makeModel } = require('./model')

module.exports = makeModel({
  init: 'q2',
  transitions: [
    ['q2', 'Sec.newContract', 'q4'],
    ['q4', 'Cash.newContract', 'q5'],
    ['q5', 'Cash.withdraw', 'q6'],
    ['q6', 'Cash.withdraw_end', 'q8'],
    ['q8', 'Sec.withdraw', 'q10'],
    ['q10', 'Sec.withdraw_end', 'q12'],
    ['q10', 'Sec.withdraw_err_expired', "q12'"],
    ['q12', 'END', 'last'],
    ["q12'", 'END', 'last'],
  ],
})

console.log('%j', module.exports)