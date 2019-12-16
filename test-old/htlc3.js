const { assertEqualBN } = require('./helper/assert');
const truffleAssert = require('truffle-assertions');

const {
  bufToStr,
  getBalance,
  htlcArrayToObj,
  isSha256Hash,
  newSecretHashPair,
  nowSeconds,
  random32,
  txContractId,
  txGas,
  txLoggedArgs,
} = require('./helper/utils')

// const HashedTimelock = artifacts.require('./HashedTimelock.sol')
const HashedTimelockEps = artifacts.require('./HashedTimelockEps.sol')

const REQUIRE_FAILED_MSG = 'Returned error: VM Exception while processing transaction: revert'

const hourSeconds = 3600
const timeLock1Hour = nowSeconds() + hourSeconds
const oneFinney = web3.utils.toWei(web3.utils.toBN(1), 'finney')

contract('HashedTimelock (both EPS-converted)', accounts => {
  const sender = accounts[1]
  const receiver = accounts[2]

  it('withdraw() success case', async () => {
    const { StateMachine } = require('./StateMachine.js')
    const hashPair = newSecretHashPair()
    const htlc = await HashedTimelockEps.deployed()

    let newContractTx
    let contractId
    let receiverBalBefore
    let withdrawTx

    class Client extends StateMachine {
      constructor() {
        super()
      }

      async newContract() {
        console.log('newContract')
        newContractTx = await htlc.newContract(
          receiver,
          hashPair.hash,
          timeLock1Hour,
          {
            from: sender,
            value: oneFinney,
          }
        )
        contractId = txContractId(newContractTx)
        receiverBalBefore = await getBalance(receiver)
        this.raise('withdraw')
      }

      async withdraw() {
        console.log('withdraw')
        try {
          // receiver calls withdraw with the secret to get the funds
          withdrawTx = await htlc.withdraw(contractId, hashPair.secret, {
            from: receiver,
          })
          this.raise('withdraw_end')
        } catch (e) {
          this.raise('withdraw_err')
        }
      }

      async withdraw_end() {
        console.log('withdraw_end')
        const tx = await web3.eth.getTransaction(withdrawTx.tx)
        // Check contract funds are now at the receiver address
        const expectedBal = receiverBalBefore
          .add(oneFinney)
          .sub(txGas(withdrawTx, tx.gasPrice))
        assertEqualBN(
          await getBalance(receiver),
          expectedBal,
          "receiver balance doesn't match"
        )
        const contractArr = await htlc.getContract.call(contractId)
        const contract = htlcArrayToObj(contractArr)
        assert.isTrue(contract.withdrawn) // withdrawn set
        assert.isFalse(contract.refunded) // refunded still false
        assert.equal(contract.preimage, hashPair.secret)
      }
    }

    const client = new Client()
    client.raise('newContract')
    await client.loop()
  })

  it('withdraw() fail case', async () => {
    const { StateMachine } = require('./StateMachine.js')
    const hashPair = newSecretHashPair()
    const htlc = await HashedTimelockEps.new()
    const timelock1Second = nowSeconds() + 1

    let newContractTx
    let contractId
    let receiverBalBefore
    let withdrawTx

    class Client extends StateMachine {
      constructor() {
        super()
      }

      async newContract() {
        console.log('newContract')
        newContractTx = await htlc.newContract(
          receiver,
          hashPair.hash,
          timelock1Second,
          {
            from: sender,
            value: oneFinney,
          }
        )
        contractId = txContractId(newContractTx)
        // receiverBalBefore = await getBalance(receiver)
        this.raise('withdraw')
      }

      async withdraw() {
        await require('delay')(1000)
        console.log('withdraw')

        // receiver calls withdraw with the secret to get the funds
        withdrawTx = await htlc.withdraw(contractId, hashPair.secret, { from: receiver })
        const evName = withdrawTx.logs[0].event
        if (evName === 'LogHTLCWithdraw') {
          this.raise('withdraw_end')
        } else if (evName === 'LogHTLCWithdrawError') {
          this.raise('withdraw_err', null)
        }
        // truffleAssert.eventEmitted(withdrawTx, 'LogHTLCWithdraw')
      }

      async withdraw_end() {
        console.log('withdraw_end')
        throw new Error('expected failure due to withdraw after timelock expired')
      }

      async withdraw_err(err) {
        console.log('withdraw_err')
        // assert.isTrue(err.message.startsWith(REQUIRE_FAILED_MSG))
      }
    }

    const client = new Client()
    client.raise('newContract')
    await client.loop()
  })

  it('refund() success case', async () => {
    const { StateMachine } = require('./StateMachine.js')
    const hashPair = newSecretHashPair()
    const htlc = await HashedTimelockEps.new()
    const timelock1Second = nowSeconds() + 1

    let newContractTx
    let contractId
    let receiverBalBefore
    let withdrawTx
    let balBefore
    let refundTx

    class Client extends StateMachine {
      constructor() {
        super()
      }

      async newContract() {
        console.log('newContract')
        newContractTx = await htlc.newContract(
          receiver,
          hashPair.hash,
          timelock1Second,
          {
            from: sender,
            value: oneFinney,
          }
        )
        contractId = txContractId(newContractTx)
        balBefore = await getBalance(sender)
        this.raise('refund')
      }

      async withdraw() {
        await require('delay')(1000)
        console.log('withdraw')
        try {
          // receiver calls withdraw with the secret to get the funds
          withdrawTx = await htlc.withdraw(contractId, hashPair.secret, {
            from: receiver,
          })
          this.raise('withdraw_end')
        } catch (e) {
          this.raise('withdraw_err')
        }
      }

      async withdraw_end() {
        console.log('withdraw_end')
        const tx = await web3.eth.getTransaction(withdrawTx.tx)
        // Check contract funds are now at the receiver address
        const expectedBal = receiverBalBefore
          .add(oneFinney)
          .sub(txGas(withdrawTx, tx.gasPrice))
        assertEqualBN(
          await getBalance(receiver),
          expectedBal,
          "receiver balance doesn't match"
        )
        const contractArr = await htlc.getContract.call(contractId)
        const contract = htlcArrayToObj(contractArr)
        assert.isTrue(contract.withdrawn) // withdrawn set
        assert.isFalse(contract.refunded) // refunded still false
        assert.equal(contract.preimage, hashPair.secret)
      }

      async refund() {
        await require('delay')(1000)
        console.log('refund')

        // receiver calls withdraw with the secret to get the funds
        refundTx = await htlc.refund(contractId, { from: sender })

        const evName = refundTx.logs[0].event
        if (evName === 'LogHTLCRefund') {
          this.raise('refund_end')
        } else if (evName === 'LogHTLCRefundError') {
          this.raise('refund_err', null)
        }
      }

      async refund_end() {
        console.log('refund_end')
        const tx = await web3.eth.getTransaction(refundTx.tx)
        // Check contract funds are now at the senders address
        const expectedBal = balBefore.add(oneFinney).sub(txGas(refundTx, tx.gasPrice))
        assertEqualBN(
          await getBalance(sender),
          expectedBal,
          "sender balance doesn't match"
        )
        const contract = await htlc.getContract.call(contractId)
        assert.isTrue(contract[6]) // refunded set
        assert.isFalse(contract[5]) // withdrawn still false
      }

      async refund_err(err) {
      }
    }

    const client = new Client()
    client.raise('newContract')
    await client.loop()
  })

  it('refund() fail case', async () => {
    const { StateMachine } = require('./StateMachine.js')
    const hashPair = newSecretHashPair()
    const htlc = await HashedTimelockEps.new()
    // const htlc = await HashedTimelockEps.deployed()
    // const timelock1Second = nowSeconds() + 1

    let newContractTx
    let contractId
    let receiverBalBefore
    let withdrawTx
    let balBefore
    let refundTx

    class Client extends StateMachine {
      constructor() {
        super()
      }

      async newContract() {
        console.log('newContract')
        newContractTx = await htlc.newContract(
          receiver,
          hashPair.hash,
          timeLock1Hour,
          {
            from: sender,
            value: oneFinney,
          }
        )
        contractId = txContractId(newContractTx)
        balBefore = await getBalance(sender)
        this.raise('refund')
      }

      async withdraw() {
        await require('delay')(1000)
        console.log('withdraw')
        try {
          // receiver calls withdraw with the secret to get the funds
          withdrawTx = await htlc.withdraw(contractId, hashPair.secret, {
            from: receiver,
          })
          this.raise('withdraw_end')
        } catch (e) {
          this.raise('withdraw_err')
        }
      }

      async withdraw_end() {
        console.log('withdraw_end')
        const tx = await web3.eth.getTransaction(withdrawTx.tx)
        // Check contract funds are now at the receiver address
        const expectedBal = receiverBalBefore
          .add(oneFinney)
          .sub(txGas(withdrawTx, tx.gasPrice))
        assertEqualBN(
          await getBalance(receiver),
          expectedBal,
          "receiver balance doesn't match"
        )
        const contractArr = await htlc.getContract.call(contractId)
        const contract = htlcArrayToObj(contractArr)
        assert.isTrue(contract.withdrawn) // withdrawn set
        assert.isFalse(contract.refunded) // refunded still false
        assert.equal(contract.preimage, hashPair.secret)
      }

      async refund() {
        console.log('refund')
        // receiver calls withdraw with the secret to get the funds
        refundTx = await htlc.refund(contractId, { from: sender })

        const evName = refundTx.logs[0].event
        if (evName === 'LogHTLCRefund') {
          this.raise('refund_end')
        } else if (evName === 'LogHTLCRefundError') {
          this.raise('refund_err', null)
        }
      }

      async refund_end() {
        console.log('refund_end')
        assert.fail('expected failure due to timelock')
      }

      async refund_err(err) {
        console.log('refund_err')
        // assert.isTrue(err.message.startsWith(REQUIRE_FAILED_MSG))
      }
    }

    const client = new Client()
    client.raise('newContract')
    await client.loop()
  })
})
