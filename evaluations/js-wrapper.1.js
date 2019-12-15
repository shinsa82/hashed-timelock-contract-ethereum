const debug = require('debug')('js-wrapper')
const delay = require('delay') // promisified setTimeout
const {
    bufToStr,
    htlcERC20ArrayToObj,
    isSha256Hash,
    newSecretHashPair,
    nowSeconds,
    random32,
    txContractId,
    txLoggedArgs,
} = require('../test/helper/utils');

const { model } = require('./htlc-model')
const { END } = require('./state-machine')
const oneFinney = web3.utils.toWei(web3.utils.toBN(1), 'finney')
const debugGasUsed = (tx) => debug('gas used:', tx.receipt.gasUsed)

const sec_newContract = async ({ machine, Buyer, Seller, Security, hashPair, secDelta }) => {
    machine.send('Sec.newContract')

    const timeLockSeconds = nowSeconds() + secDelta
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
        const withdrawTx = await Cash.withdraw(b2aSwapId, hashPair.secret, {
            from: Seller,
        })
        debugGasUsed(withdrawTx)
        if (machine)
            machine.send('Cash.withdraw_end')
    } catch (err) {
        machine.send('Cash.withdraw_err_expired')
    }
}

const sec_withdraw = async ({ machine, Buyer, a2bSwapId, hashPair, Security }) => {
    machine.send('Sec.withdraw')

    try {
        const withdrawTx = await Security.withdraw(a2bSwapId, hashPair.secret, {
            from: Buyer,
        })
        debugGasUsed(withdrawTx)

        machine.send('Sec.withdraw_end')
    } catch (err) {
        machine.send('Sec.withdraw_err_expired')
    }
}

const cash_refund = async ({ machine, Buyer, b2aSwapId, Cash }) => {
    machine.send('Cash.refund')

    try {
        const refundTx = await Cash.refund(b2aSwapId, {
            from: Buyer,
        })
        debugGasUsed(refundTx)

        machine.send('Cash.refund_end')
    } catch (err) {
        machine.send('Cash.refund_err_premature')
    }
}

const sec_refund = async ({ machine, Seller, a2bSwapId, Security }) => {
    machine.send('Sec.refund')

    try {
        const refundTx = await Security.refund(a2bSwapId, {
            from: Seller,
        })
        debugGasUsed(refundTx)

        machine.send('Sec.refund_end')
    } catch (err) {
        machine.send('Sec.refund_err_premature')
    }
}

const end = async ({ machine }) => {
    machine.send(END)
}

contract('HashedTimelock DvP with JS wrapper', accounts => {
    const Seller = accounts[1] // owner of AliceERC20 and wants swap for BobERC20
    const Buyer = accounts[2] // owner of BobERC20 and wants to swap for AliceERC20
    const HashedTimelock = artifacts.require('./HashedTimelock.sol')
    const { stateMachine } = require('./state-machine')

    it('normal scenario (both seller and buyer withdraw)', async () => {
        const machine = stateMachine(model)

        const Security = await HashedTimelock.new()
        const Cash = await HashedTimelock.new()
        const hashPair = newSecretHashPair()

        const context = { hashPair, machine, Security, Cash, Seller, Buyer, secDelta: 2, cashDelta: 1 }

        context.a2bSwapId = await sec_newContract(context)
        context.b2aSwapId = await cash_newContract(context)
        await cash_withdraw(context)
        await sec_withdraw(context)
        await end(context)
    })

    it('fail scenario (buyer fails to withdraw)', async () => {
        const machine = stateMachine(model)

        const Security = await HashedTimelock.new()
        const Cash = await HashedTimelock.new()
        const hashPair = newSecretHashPair()

        const context = { hashPair, machine, Security, Cash, Seller, Buyer, secDelta: 2, cashDelta: 1 }

        context.a2bSwapId = await sec_newContract(context)
        context.b2aSwapId = await cash_newContract(context)
        await cash_withdraw(context)
        await delay(2000)
        await sec_withdraw(context)
        await end(context)
    })

    it('normal scenario (both seller and buyer refund)', async () => {
        const machine = stateMachine(model)

        const Security = await HashedTimelock.new()
        const Cash = await HashedTimelock.new()
        const hashPair = newSecretHashPair()

        const context = { hashPair, machine, Security, Cash, Seller, Buyer, secDelta: 2, cashDelta: 1 }

        context.a2bSwapId = await sec_newContract(context)
        context.b2aSwapId = await cash_newContract(context)

        await delay(3000)
        await cash_withdraw(context)
        await cash_refund(context)
        await sec_refund(context)
        await end(context)
    })

    it('normal scenario (seller refund retry)', async () => {
        const machine = stateMachine(model)

        const Security = await HashedTimelock.new()
        const Cash = await HashedTimelock.new()
        const hashPair = newSecretHashPair()

        const context = { hashPair, machine, Security, Cash, Seller, Buyer, secDelta: 3, cashDelta: 1 }

        context.a2bSwapId = await sec_newContract(context)
        context.b2aSwapId = await cash_newContract(context)

        await delay(1500)
        await cash_withdraw(context)
        await cash_refund(context)
        await sec_refund(context)
        await sec_refund(context) // retry
        await delay(1500)
        await sec_refund(context) // retry again
        await end(context)
    })
})

contract('HashedTimelock DvP original', accounts => {
    const Seller = accounts[1] // owner of AliceERC20 and wants swap for BobERC20
    const Buyer = accounts[2] // owner of BobERC20 and wants to swap for AliceERC20
    const HashedTimelock = artifacts.require('./HashedTimelock.sol')
    const stateMachine = () => {
        return {
            send: () => { }
        }
    }

    it('normal scenario (both seller and buyer withdraw)', async () => {
        const machine = stateMachine(model)

        const Security = await HashedTimelock.new()
        const Cash = await HashedTimelock.new()
        const hashPair = newSecretHashPair()

        const context = { hashPair, machine, Security, Cash, Seller, Buyer, secDelta: 2, cashDelta: 1 }

        context.a2bSwapId = await sec_newContract(context)
        context.b2aSwapId = await cash_newContract(context)
        await cash_withdraw(context)
        await sec_withdraw(context)
        await end(context)
    })

    it('fail scenario (buyer fails to withdraw)', async () => {
        const machine = stateMachine(model)

        const Security = await HashedTimelock.new()
        const Cash = await HashedTimelock.new()
        const hashPair = newSecretHashPair()

        const context = { hashPair, machine, Security, Cash, Seller, Buyer, secDelta: 2, cashDelta: 1 }

        context.a2bSwapId = await sec_newContract(context)
        context.b2aSwapId = await cash_newContract(context)
        await cash_withdraw(context)
        await delay(2000)
        await sec_withdraw(context)
        await end(context)
    })

    it('normal scenario (both seller and buyer refund)', async () => {
        const machine = stateMachine(model)

        const Security = await HashedTimelock.new()
        const Cash = await HashedTimelock.new()
        const hashPair = newSecretHashPair()

        const context = { hashPair, machine, Security, Cash, Seller, Buyer, secDelta: 2, cashDelta: 1 }

        context.a2bSwapId = await sec_newContract(context)
        context.b2aSwapId = await cash_newContract(context)

        await delay(3000)
        await cash_withdraw(context)
        await cash_refund(context)
        await sec_refund(context)
        await end(context)
    })

    it('normal scenario (seller refund retry)', async () => {
        const machine = stateMachine(model)

        const Security = await HashedTimelock.new()
        const Cash = await HashedTimelock.new()
        const hashPair = newSecretHashPair()

        const context = { hashPair, machine, Security, Cash, Seller, Buyer, secDelta: 3, cashDelta: 1 }

        context.a2bSwapId = await sec_newContract(context)
        context.b2aSwapId = await cash_newContract(context)

        await delay(1500)
        await cash_withdraw(context)
        await cash_refund(context)
        await sec_refund(context)
        await sec_refund(context) // retry
        await delay(1500)
        await sec_refund(context) // retry again
        await end(context)
    })
})