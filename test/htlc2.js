const { assertEqualBN } = require('./helper/assert');
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

const HashedTimelock = artifacts.require('./HashedTimelock.sol')

const REQUIRE_FAILED_MSG = 'Returned error: VM Exception while processing transaction: revert'

const hourSeconds = 3600
const timeLock1Hour = nowSeconds() + hourSeconds
const oneFinney = web3.utils.toWei(web3.utils.toBN(1), 'finney')

contract('HashedTimelock (client EPS-converted)', accounts => {
  const sender = accounts[1]
  const receiver = accounts[2]

  it.skip('newContract() should create new contract and store correct details', async () => {
    const hashPair = newSecretHashPair()
    const htlc = await HashedTimelock.deployed()
    const txReceipt = await htlc.newContract(
      receiver,
      hashPair.hash,
      timeLock1Hour,
      {
        from: sender,
        value: oneFinney,
      }
    )
    const logArgs = txLoggedArgs(txReceipt)

    const contractId = logArgs.contractId
    assert(isSha256Hash(contractId))

    assert.equal(logArgs.sender, sender)
    assert.equal(logArgs.receiver, receiver)
    assertEqualBN(logArgs.amount, oneFinney)
    assert.equal(logArgs.hashlock, hashPair.hash)
    assert.equal(logArgs.timelock, timeLock1Hour)

    const contractArr = await htlc.getContract.call(contractId)
    const contract = htlcArrayToObj(contractArr)
    assert.equal(contract.sender, sender)
    assert.equal(contract.receiver, receiver)
    assertEqualBN(contract.amount, oneFinney)
    assert.equal(contract.hashlock, hashPair.hash)
    assert.equal(contract.timelock.toNumber(), timeLock1Hour)
    assert.isFalse(contract.withdrawn)
    assert.isFalse(contract.refunded)
    assert.equal(
      contract.preimage,
      '0x0000000000000000000000000000000000000000000000000000000000000000'
    )
  })

  it.skip('newContract() should fail when no ETH sent', async () => {
    const hashPair = newSecretHashPair()
    const htlc = await HashedTimelock.deployed()
    try {
      await htlc.newContract(receiver, hashPair.hash, timeLock1Hour, {
        from: sender,
        value: 0,
      })
      assert.fail('expected failure due to 0 value transferred')
    } catch (err) {
      assert.isTrue(err.message.startsWith(REQUIRE_FAILED_MSG))
    }
  })

  it.skip('newContract() should fail with timelocks in the past', async () => {
    const hashPair = newSecretHashPair()
    const pastTimelock = nowSeconds() - 1
    const htlc = await HashedTimelock.deployed()
    try {
      await htlc.newContract(receiver, hashPair.hash, pastTimelock, {
        from: sender,
        value: oneFinney,
      })

      assert.fail('expected failure due past timelock')
    } catch (err) {
      assert.isTrue(err.message.startsWith(REQUIRE_FAILED_MSG))
    }
  })

  it.skip('newContract() should reject a duplicate contract request', async () => {
    const hashPair = newSecretHashPair()
    const htlc = await HashedTimelock.deployed()
    await htlc.newContract(receiver, hashPair.hash, timeLock1Hour, {
      from: sender,
      value: oneFinney,
    })

    // now call again with the exact same parameters
    try {
      await htlc.newContract(receiver, hashPair.hash, timeLock1Hour, {
        from: sender,
        value: oneFinney,
      })
      assert.fail('expected failure due to duplicate request')
    } catch (err) {
      assert.isTrue(err.message.startsWith(REQUIRE_FAILED_MSG))
    }
  })

  it('withdraw() success case', async () => {
    const { StateMachine } = require('./StateMachine.js')
    const hashPair = newSecretHashPair()
    const htlc = await HashedTimelock.deployed()

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
    // await client.withdraw()
  })

  it.skip('withdraw() should fail if preimage does not hash to hashX', async () => {
    const hashPair = newSecretHashPair()
    const htlc = await HashedTimelock.deployed()
    const newContractTx = await htlc.newContract(
      receiver,
      hashPair.hash,
      timeLock1Hour,
      {
        from: sender,
        value: oneFinney,
      }
    )
    const contractId = txContractId(newContractTx)

    // receiver calls withdraw with an invalid secret
    const wrongSecret = bufToStr(random32())
    try {
      await htlc.withdraw(contractId, wrongSecret, { from: receiver })
      assert.fail('expected failure due to 0 value transferred')
    } catch (err) {
      assert.isTrue(err.message.startsWith(REQUIRE_FAILED_MSG))
    }
  })

  it.skip('withdraw() should fail if caller is not the receiver', async () => {
    const hashPair = newSecretHashPair()
    const htlc = await HashedTimelock.deployed()
    const newContractTx = await htlc.newContract(
      receiver,
      hashPair.hash,
      timeLock1Hour,
      {
        from: sender,
        value: oneFinney,
      }
    )
    const contractId = txContractId(newContractTx)
    const someGuy = accounts[4]
    try {
      await htlc.withdraw(contractId, hashPair.secret, { from: someGuy })
      assert.fail('expected failure due to wrong receiver')
    } catch (err) {
      assert.isTrue(err.message.startsWith(REQUIRE_FAILED_MSG))
    }
  })

  it('withdraw() fail case', async () => {
    const { StateMachine } = require('./StateMachine.js')
    const hashPair = newSecretHashPair()
    const htlc = await HashedTimelock.new()
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
        try {
          // receiver calls withdraw with the secret to get the funds
          withdrawTx = await htlc.withdraw(contractId, hashPair.secret, { from: receiver })
          this.raise('withdraw_end')
        } catch (err) {
          this.raise('withdraw_err', err)
        }
      }

      async withdraw_end() {
        console.log('withdraw_end')
        throw new Error('expected failure due to withdraw after timelock expired')
      }

      async withdraw_err(err) {
        console.log('withdraw_err')
        assert.isTrue(err.message.startsWith(REQUIRE_FAILED_MSG))
      }
    }

    const client = new Client()
    client.raise('newContract')
    await client.loop()
  })

  it.skip('refund() should pass after timelock expiry', async () => {
    const hashPair = newSecretHashPair()
    const htlc = await HashedTimelock.new()
    const timelock1Second = nowSeconds() + 1

    const newContractTx = await htlc.newContract(
      receiver,
      hashPair.hash,
      timelock1Second,
      {
        from: sender,
        value: oneFinney,
      }
    )
    const contractId = txContractId(newContractTx)

    // wait one second so we move past the timelock time
    return new Promise((resolve, reject) =>
      setTimeout(async () => {
        try {
          const balBefore = await getBalance(sender)
          const refundTx = await htlc.refund(contractId, { from: sender })
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
          resolve()
        } catch (err) {
          reject(err)
        }
      }, 1000)
    )
  })

  it.skip('refund() should fail before the timelock expiry', async () => {
    const hashPair = newSecretHashPair()
    const htlc = await HashedTimelock.deployed()
    const newContractTx = await htlc.newContract(
      receiver,
      hashPair.hash,
      timeLock1Hour,
      {
        from: sender,
        value: oneFinney,
      }
    )
    const contractId = txContractId(newContractTx)
    try {
      await htlc.refund(contractId, { from: sender })
      assert.fail('expected failure due to timelock')
    } catch (err) {
      assert.isTrue(err.message.startsWith(REQUIRE_FAILED_MSG))
    }
  })

  it.skip("getContract() returns empty record when contract doesn't exist", async () => {
    const htlc = await HashedTimelock.deployed()
    const contract = await htlc.getContract.call('0xabcdef')
    const sender = contract[0]
    assert.equal(Number(sender), 0)
  })
})
