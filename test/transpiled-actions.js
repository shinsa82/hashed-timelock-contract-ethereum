const _ = require('lodash')
const chalk = require('chalk')
const m = mes => debug(chalk.magentaBright(mes))
const y = mes => debug(chalk.yellowBright(mes))
const debug = require('debug')('transpiled:actions')
const main = require('debug')('transpiled:actions:main')
const sub = require('debug')('transpiled:actions:sub')
const {
    nowSeconds,
    txContractId,
} = require('../test-old/helper/utils');

const { END } = require('./state-machine')
const oneFinney = web3.utils.toWei(web3.utils.toBN(1), 'finney')
let _totalGasUsed = 0
const showGasUsed = (logger, tx) => {
    logger('gas used:', tx.receipt.gasUsed)
    _totalGasUsed += tx.receipt.gasUsed
}
// const debugGasUsed = (tx) => debug('gas used:', tx.receipt.gasUsed)
// const subGasUsed = (tx) => sub('gas used:', tx.receipt.gasUsed)

const sec_newContract = async ({ machine, Buyer, Seller, Security, Cash, hashPair, secDelta }) => {
    machine.send('Sec.newContract')
    debug('Sec.newContract')

    const timeLockSeconds = nowSeconds() + secDelta
    main('invoking Sec.sec_newContract')
    const newContractTx = await Security.sec_newContract(
        Buyer,
        hashPair.hash,
        timeLockSeconds,
        {
            from: Seller,
            value: oneFinney,
        }
    )
    showGasUsed(main, newContractTx)

    a2bSwapId = txContractId(newContractTx)

    sub('invoking Cash.sec_newContract')
    showGasUsed(sub, await Cash.sec_newContract())

    return a2bSwapId
}

const cash_newContract = async ({ machine, Buyer, Seller, Security, Cash, hashPair, cashDelta }) => {
    machine.send('Cash.newContract')
    debug('Cash.newContract')

    const timeLockSeconds = nowSeconds() + cashDelta
    // const newSwapTx = await newSwap(BobERC20, htlc, { hashlock: hashPair.hash, timelock: timeLockSeconds }, Bob, Alice)
    main('invoking Cash.cash_newContract')
    const newContractTx = await Cash.cash_newContract(
        Seller,
        hashPair.hash,
        timeLockSeconds,
        {
            from: Buyer,
            value: oneFinney,
        }
    )
    showGasUsed(main, newContractTx)

    b2aSwapId = txContractId(newContractTx)

    sub('invoking Security.cash_newContract')
    showGasUsed(sub, await Security.cash_newContract())

    return b2aSwapId
}

const cash_withdraw = async ({ machine, Seller, b2aSwapId, hashPair, Cash, Security }) => {
    debug('Cash.withdraw')

    try {
        main('invoking Cash.cash_withdraw')
        const withdrawTx = await Cash.cash_withdraw(b2aSwapId, hashPair.secret, {
            from: Seller,
        })
        showGasUsed(main, withdrawTx)
        // main(withdrawTx.logs)
        if (_.find(withdrawTx.logs, ['event', 'withdraw_end'])) {
            main('-- withdraw_end found')
            sub('invoking Security.cash_withdraw')
            showGasUsed(sub,
                await Security.cash_withdraw(b2aSwapId, hashPair.secret, {
                    from: Seller,
                })
            )
            sub('invoking Security.cash_withdraw_end')
            showGasUsed(sub,
                await Security.cash_withdraw_end()
            )
        } else if (_.find(withdrawTx.logs, ['event', 'withdraw_err'])) {
            main('-- withdraw_err found')
            sub('invoking Security.cash_withdraw')
            showGasUsed(sub,
                await Security.cash_withdraw()
            )
            sub('invoking Security.cash_withdraw_err')
            showGasUsed(sub,
                await Security.cash_withdraw_err()
            )
        }
    } catch (err) {
        m(`TX failed: ${err}`)
    }
}

const sec_withdraw = async ({ machine, Buyer, a2bSwapId, hashPair, Cash, Security }) => {
    machine.send('Sec.withdraw')
    debug('Sec.withdraw')

    try {
        main('invoking Sec.sec_withdraw')
        const withdrawTx = await Security.sec_withdraw(a2bSwapId, hashPair.secret, {
            from: Buyer,
        })
        showGasUsed(main, withdrawTx)

        sub('invoking Cash.sec_withdraw')
        showGasUsed(sub, await Cash.sec_withdraw())
        sub('invoking Cash.sec_withdraw_end')
        showGasUsed(sub, await Cash.sec_withdraw_end())
    } catch (err) {
        m(`TX failed: ${err}`)
        machine.send('Sec.withdraw_err_expired')
    }
}

const cash_refund = async ({ Buyer, b2aSwapId, Security, Cash }) => {
    debug('Cash.refund')
    main('invoking Cash.cash_refund')
    const refundTx = await Cash.cash_refund(b2aSwapId, {
        from: Buyer,
    })
    showGasUsed(main, refundTx)

    if (_.find(refundTx.logs, ['event', 'refund_end'])) {
        main('-- refund_end found')
        sub('invoking Security.cash_refund')
        showGasUsed(sub, await Security.cash_refund())
        sub('invoking Security.cash_refund_end')
        showGasUsed(sub, await Security.cash_refund_end())
    } else if (_.find(refundTx.logs, ['event', 'refund_err'])) {
        main('-- refund_err found')
        sub('invoking Security.cash_refund')
        showGasUsed(sub, await Security.cash_refund())
        sub('invoking Security.cash_refund_err')
        showGasUsed(sub, await Security.cash_refund_err())
    }
}

const sec_refund = async ({ machine, Seller, a2bSwapId, Security, Cash }) => {
    debug('Sec.refund')

    main('invoking Sec.sec_refund')
    const refundTx = await Security.sec_refund(a2bSwapId, {
        from: Seller,
    })
    showGasUsed(main, refundTx)

    if (_.find(refundTx.logs, ['event', 'refund_end'])) {
        main('-- refund_end found')
        sub('invoking Cash.sec_refund')
        showGasUsed(sub, await Cash.sec_refund())
        sub('invoking Cash.sec_refund_end')
        showGasUsed(sub, await Cash.sec_refund_end())
    } else if (_.find(refundTx.logs, ['event', 'refund_err'])) {
        main('-- refund_err found')
        sub('invoking Cash.sec_refund')
        showGasUsed(sub, await Cash.sec_refund())
        sub('invoking Cash.sec_refund_err')
        showGasUsed(sub, await Cash.sec_refund_err())
    }
}

const end = async ({ machine }) => {
    machine.send(END)
}

const totalGasUsed = () => _totalGasUsed

module.exports = {
    cash_newContract,
    cash_refund,
    cash_withdraw,
    sec_newContract,
    sec_refund,
    sec_withdraw,
    end,
    totalGasUsed,
}