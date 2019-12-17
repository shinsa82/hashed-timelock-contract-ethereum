const chalk = require('chalk')
const m = mes => debug(chalk.magentaBright(mes))
const y = mes => debug(chalk.yellowBright(mes))
const debug = require('debug')('js-wrapper-actions')
const {
    nowSeconds,
    txContractId,
} = require('../test-old/helper/utils');

const { END } = require('./state-machine')
const oneFinney = web3.utils.toWei(web3.utils.toBN(1), 'finney')
const debugGasUsed = (tx) => debug('gas used:', tx.receipt.gasUsed)

const sec_newContract = async ({ machine, Buyer, Seller, Security, hashPair, secDelta }) => {
    machine.send('Sec.newContract')

    const timeLockSeconds = nowSeconds() + secDelta
    debug('invoking Sec.newContract')
    const newContractTx = await Security.newContract(
        Buyer,
        hashPair.hash,
        timeLockSeconds,
        {
            from: Seller,
            value: oneFinney,
        }
    )
    debugGasUsed(newContractTx)

    a2bSwapId = txContractId(newContractTx)
    return a2bSwapId
}

const cash_newContract = async ({ machine, Buyer, Seller, Cash, hashPair, cashDelta }) => {
    machine.send('Cash.newContract')

    const timeLockSeconds = nowSeconds() + cashDelta
    // const newSwapTx = await newSwap(BobERC20, htlc, { hashlock: hashPair.hash, timelock: timeLockSeconds }, Bob, Alice)
    debug('invoking Cash.newContract')
    const newContractTx = await Cash.newContract(
        Seller,
        hashPair.hash,
        timeLockSeconds,
        {
            from: Buyer,
            value: oneFinney,
        }
    )
    debugGasUsed(newContractTx)

    b2aSwapId = txContractId(newContractTx)
    return b2aSwapId
}

const cash_withdraw = async ({ machine, Seller, b2aSwapId, hashPair, Cash }) => {
    machine.send('Cash.withdraw')

    try {
        debug('invoking Cash.withdraw')
        const withdrawTx = await Cash.withdraw(b2aSwapId, hashPair.secret, {
            from: Seller,
        })
        debugGasUsed(withdrawTx)
        if (machine)
            machine.send('Cash.withdraw_end')
    } catch (err) {
        m('TX failed')
        machine.send('Cash.withdraw_err_expired')
    }
}

const sec_withdraw = async ({ machine, Buyer, a2bSwapId, hashPair, Security }) => {
    machine.send('Sec.withdraw')

    try {
        debug('invoking Sec.withdraw')
        const withdrawTx = await Security.withdraw(a2bSwapId, hashPair.secret, {
            from: Buyer,
        })
        debugGasUsed(withdrawTx)

        machine.send('Sec.withdraw_end')
    } catch (err) {
        m('TX failed')
        machine.send('Sec.withdraw_err_expired')
    }
}

const cash_refund = async ({ machine, Buyer, b2aSwapId, Cash }) => {
    try {
        machine.send('Cash.refund')

        try {
            debug('invoking Cash.refund')
            const refundTx = await Cash.refund(b2aSwapId, {
                from: Buyer,
            })
            debugGasUsed(refundTx)

            machine.send('Cash.refund_end')
        } catch (err) {
            m('TX failed')
            machine.send('Cash.refund_err_premature')
        }
    } catch (err) {
        m(`action failed: ${err}`)
    }
}

const sec_refund = async ({ machine, Seller, a2bSwapId, Security }) => {
    machine.send('Sec.refund')

    try {
        debug('invoking Sec.refund')
        const refundTx = await Security.refund(a2bSwapId, {
            from: Seller,
        })
        debugGasUsed(refundTx)

        machine.send('Sec.refund_end')
    } catch (err) {
        m('TX failed')
        machine.send('Sec.refund_err_premature')
    }
}

const end = async ({ machine }) => {
    machine.send(END)
}

module.exports = {
    cash_newContract,
    cash_refund,
    cash_withdraw,
    sec_newContract,
    sec_refund,
    sec_withdraw,
    end,
}