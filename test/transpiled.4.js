const chalk = require('chalk')
const m = str => debug(chalk.magentaBright(str))
const debug = require('debug')('transpiled:main')
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
} = require('../test-old/helper/utils');

const { model } = require('./htlc-model')
const { END } = require('./state-machine')
const oneFinney = web3.utils.toWei(web3.utils.toBN(1), 'finney')
const debugGasUsed = (tx) => debug('gas used:', tx.receipt.gasUsed)

const {
    cash_newContract,
    cash_refund,
    cash_withdraw,
    sec_newContract,
    sec_refund,
    sec_withdraw,
    end,
    totalGasUsed
} = require('./transpiled-actions')

contract('HashedTimelock DvP transpiled contracts', accounts => {
    const Seller = accounts[1] // owner of AliceERC20 and wants swap for BobERC20
    const Buyer = accounts[2] // owner of BobERC20 and wants to swap for AliceERC20
    const SecHashedTimelock = artifacts.require('./Sec_HashedTimelock.sol')
    const CashHashedTimelock = artifacts.require('./Cash_HashedTimelock.sol')
    const stateMachine = () => {
        return {
            send: () => { }
        }
    }

    it('fail scenario 1 (non-termination)', async () => {
        try {
            const machine = stateMachine(model)

            const Security = await SecHashedTimelock.new()
            const Cash = await CashHashedTimelock.new()
            const hashPair = newSecretHashPair()

            const context = { hashPair, machine, Security, Cash, Seller, Buyer, secDelta: 3, cashDelta: 2 }

            context.a2bSwapId = await sec_newContract(context)
            context.b2aSwapId = await cash_newContract(context)
            await cash_withdraw(context)
            await delay(3500)
            await sec_withdraw(context)
            await end(context)
        } catch (err) {
            m(err)
        }
        debug(totalGasUsed())
    })
})